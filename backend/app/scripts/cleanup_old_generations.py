"""定时清理过期生成记录与媒体文件（2026-08-10 用户拍板）。

规则：
- 视频超过 30 天、图片超过 30 天（按每条记录自己的 created_at，天然按用户）→ 删（2026-08-11 由 7/14 天放宽到 30 天）
- 任何状态都按超期判断：COMPLETED / FAILED / PENDING 超期一律删；
  PROCESSING（生成中）永不删
- 已发布到社区的生成（有 posts 引用）保留
- 被项目引用的媒体文件跳过（文件按内容哈希去重，可能与项目共用同一个对象）
- 仅删 creations 表；项目管理数据（projects/episodes/assets）不参与

用法（服务器 cron 每天一次）：
    docker exec spiritlens-backend-1 python -m app.scripts.cleanup_old_generations
"""

import argparse
import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import text

from app.core.database import async_session_factory
from app.services.file_storage import collect_media_urls, delete_media

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("cleanup")

VIDEO_RETENTION_DAYS = 30
IMAGE_RETENTION_DAYS = 30
BATCH_SIZE = 500


async def collect_project_referenced_urls(session) -> set[str]:
    """收集所有项目引用的媒体 URL：角色/场景/道具图 + 集封面 + 各集 config + storyboard。"""
    refs: set[str] = set()
    for table in ("characters", "scenes", "props"):
        rows = await session.execute(
            text(f"SELECT image_url FROM {table} WHERE image_url IS NOT NULL")
        )
        refs.update(r[0] for r in rows if r[0])
    rows = await session.execute(
        text("SELECT cover_url FROM episodes WHERE cover_url IS NOT NULL")
    )
    refs.update(r[0] for r in rows if r[0])
    rows = await session.execute(
        text("SELECT config FROM episodes WHERE config IS NOT NULL")
    )
    for (cfg,) in rows:
        if isinstance(cfg, dict):
            refs |= collect_media_urls(cfg)
    rows = await session.execute(
        text(
            "SELECT generated_scene_image_url, generated_character_image_url, "
            "generated_video_url FROM storyboards "
            "WHERE generated_scene_image_url IS NOT NULL "
            "OR generated_character_image_url IS NOT NULL "
            "OR generated_video_url IS NOT NULL"
        )
    )
    for r in rows:
        refs.update(x for x in r if x)
    return refs


async def run_cleanup(dry_run: bool = False) -> None:
    now_naive = datetime.utcnow()
    cut_video = now_naive - timedelta(days=VIDEO_RETENTION_DAYS)
    cut_image = now_naive - timedelta(days=IMAGE_RETENTION_DAYS)
    logger.info("清理开始%s：视频 < %s（%d 天），图片 < %s（%d 天）",
                "（dry-run，不实际删除）" if dry_run else "",
                cut_video, VIDEO_RETENTION_DAYS, cut_image, IMAGE_RETENTION_DAYS)

    deleted_rows = 0
    skipped_files = 0
    failed_files = 0

    async with async_session_factory() as session:
        # 项目引用的 URL（去重哈希共用保护）
        refs = await collect_project_referenced_urls(session)
        logger.info("项目引用 URL 数量：%d", len(refs))

        while True:
            rows = (await session.execute(text(
                """
                SELECT id, type, media_url, thumbnail_url
                FROM creations
                WHERE status != 'PROCESSING'
                  AND (
                    (type = 'VIDEO' AND created_at < :cut_video)
                    OR (type = 'IMAGE' AND created_at < :cut_image)
                  )
                  AND id NOT IN (SELECT creation_id FROM posts WHERE creation_id IS NOT NULL)
                  -- 2026-08-11 修复：被项目引用的记录不删（原来只保护文件不保护记录，
                  -- 导致项目里还能播、资产库条目却消失）。media_url/thumbnail 任一被
                  -- 项目引用即保留整条记录。
                  AND NOT (media_url = ANY(:refs) OR thumbnail_url = ANY(:refs))
                LIMIT :batch
                """
            ), {"cut_video": cut_video, "cut_image": cut_image, "batch": BATCH_SIZE, "refs": list(refs)})).all()

            if not rows:
                break

            ids = [r[0] for r in rows]
            for _id, _type, media_url, thumb_url in rows:
                for url in (media_url, thumb_url):
                    if not url:
                        continue
                    if url in refs:
                        skipped_files += 1  # 被项目共用，文件保留
                        continue
                    if dry_run:
                        continue
                    try:
                        ok = await delete_media(url)
                        if not ok:
                            failed_files += 1
                    except Exception as e:
                        logger.warning("删除媒体失败 %s: %s", url, e)
                        failed_files += 1

            if dry_run:
                # dry-run 不删数据，同样的批次会被反复查出 → 只统计第一轮后退出
                logger.info("（dry-run）将删除 %d 条记录", len(ids))
                deleted_rows += len(ids)
                break
            await session.execute(
                text("DELETE FROM creations WHERE id = ANY(:ids)"),
                {"ids": ids},
            )
            await session.commit()
            deleted_rows += len(ids)
            logger.info("本轮删除 %d 条（累计 %d）", len(ids), deleted_rows)

    logger.info("清理%s：记录 %d 条，跳过项目引用文件 %d 个，删除失败 %d 个",
                "预演" if dry_run else "完成", deleted_rows, skipped_files, failed_files)


def main() -> None:
    parser = argparse.ArgumentParser(description="清理过期生成记录与媒体文件")
    parser.add_argument("--dry-run", action="store_true", help="只统计将删除的内容，不实际删除")
    args = parser.parse_args()
    try:
        asyncio.run(run_cleanup(dry_run=args.dry_run))
    except Exception:
        logger.exception("清理任务异常")
        raise


if __name__ == "__main__":
    main()
