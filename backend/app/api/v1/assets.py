"""User assets API — personal creation library."""

import uuid
import json as json_lib
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, or_
from app.core.database import get_db
from app.schemas.auth import UserOut
from app.api.v1.auth import get_current_user
from app.models.creation import Favorite
from datetime import datetime
from app.services.redis_helper import get_redis

logger = logging.getLogger(__name__)


class AssetCreate(BaseModel):
    title: str = Field(default="未命名作品", max_length=255)
    type: str = Field(default="image", pattern="^(image|video)$")
    media_url: Optional[str] = None
    cover_url: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    prompt: Optional[str] = None


router = APIRouter(prefix="/user", tags=["user"])


@router.post("/assets", status_code=status.HTTP_201_CREATED)
async def create_asset(
    data: AssetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Save an image/video to the user's asset library."""
    uid = str(current_user.id)
    now = datetime.utcnow()

    await db.execute(
        text("""
            INSERT INTO creations (id, user_id, type, title, prompt, media_url, thumbnail_url,
                                   width, height, status, is_public, created_at, updated_at, params)
            VALUES (:id, :uid, CAST(:ctype AS creationtype), :title, :prompt, :media_url, :thumbnail_url,
                    :width, :height, 'completed'::creationstatus, false, :now, :now, '{}'::jsonb)
        """),
        {
            "id": str(uuid.uuid4()),
            "uid": uid,
            "ctype": data.type.upper() if data.type.upper() in ("IMAGE", "VIDEO") else "IMAGE",
            "title": data.title,
            "prompt": data.prompt or "",
            "media_url": data.media_url or data.cover_url,
            "thumbnail_url": data.cover_url,
            "width": data.width,
            "height": data.height,
            "now": now,
        },
    )
    await db.commit()
    return {"ok": True}


class BatchPublish(BaseModel):
    ids: list[str]


@router.post("/assets/batch/publish", status_code=status.HTTP_201_CREATED)
async def batch_publish(
    data: BatchPublish,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Publish multiple assets to the community."""
    uid = str(current_user.id)
    published = 0
    now = datetime.utcnow()
    for aid in data.ids:
        row = await db.execute(
            text("SELECT prompt, media_url, thumbnail_url, width, height, params FROM creations WHERE id = CAST(:aid AS uuid) AND user_id = :uid"),
            {"aid": aid, "uid": uid},
        )
        asset = row.one_or_none()
        if not asset:
            continue

        # Try to get real image URL from Redis (params.task_id)
        cover = asset.media_url or asset.thumbnail_url
        if not cover and asset.params:
            task_id = asset.params.get("task_id")
            if task_id:
                try:
                    rr = get_redis(db=1)
                    raw = rr.get(f"spiritlens:result:{task_id}")
                    if raw:
                        res = json_lib.loads(raw)
                        urls = res.get("image_urls", []) or ([res.get("video_url")] if res.get("video_url") else [])
                        if urls:
                            cover = urls[0]
                    rr.close()
                except Exception:
                    pass

        await db.execute(
            text("""
                INSERT INTO posts (id, user_id, creation_id, title, description, cover_url, cover_width, cover_height,
                               view_count, like_count, comment_count, is_featured, created_at, updated_at)
                VALUES (:id, :uid, :cid, :title, :desc, :cover, :cw, :ch,
                        0, 0, 0, false, :now, :now)
            """),
            {
                "id": str(uuid.uuid4()),
                "uid": uid,
                "cid": uuid.UUID(aid),
                "title": (asset.prompt or "未命名作品")[:100],
                "desc": "",
                "cover": cover,
                "cw": asset.width,
                "ch": asset.height,
                "now": now,
            },
        )
        published += 1
    await db.commit()
    return {"published": published}


@router.delete("/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Delete a single asset from the user's library."""
    uid = str(current_user.id)
    result = await db.execute(
        text("DELETE FROM creations WHERE id = CAST(:aid AS uuid) AND user_id = :uid"),
        {"aid": asset_id, "uid": uid},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Asset not found")
    await db.commit()


@router.get("/assets/favorites")
async def list_favorites(
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """List current user's favorited creations."""
    uid = str(current_user.id)
    offset = (page - 1) * page_size

    count = await db.execute(
        text("SELECT COUNT(*) FROM favorites WHERE user_id = :uid"),
        {"uid": uid},
    )
    total = count.scalar() or 0

    rows = await db.execute(
        text("""
            SELECT c.id, c.type, c.status, c.media_url, c.thumbnail_url,
                   c.prompt, c.width, c.height, c.params, c.created_at
            FROM creations c
            INNER JOIN favorites f ON f.creation_id = c.id AND f.user_id = :uid
            ORDER BY f.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"uid": uid, "limit": page_size, "offset": offset},
    )

    items = []
    for r in rows:
        image_urls = []
        task_id = None
        media_url = r.media_url  # local copy (Row is immutable)
        status_str = r.status

        if r.params:
            image_urls = r.params.get("image_urls", [])
            task_id = r.params.get("task_id")

        # Redis fallback + DB persistence for favorited items too
        if (not image_urls or status_str == "processing") and task_id:
            try:
                rr = get_redis(db=1)
                raw = rr.get(f"spiritlens:result:{task_id}")
                if raw:
                    res = json_lib.loads(raw)
                    if res.get("image_urls"):
                        image_urls = res["image_urls"]
                    if res.get("video_url"):
                        media_url = media_url or res["video_url"]

                    # Persist to DB so it survives Redis restart/expiry
                    if image_urls:
                        first_url = image_urls[0]
                        new_params = dict(r.params) if r.params else {}
                        new_params["image_urls"] = image_urls
                        await db.execute(
                            text("""
                                UPDATE creations
                                SET status = 'COMPLETED',
                                    media_url = :media,
                                    params = CAST(:params AS jsonb),
                                    updated_at = :now
                                WHERE id = CAST(:aid AS uuid)
                            """),
                            {
                                "media": first_url,
                                "params": json_lib.dumps(new_params),
                                "now": datetime.utcnow(),
                                "aid": str(r.id),
                            },
                        )
                        await db.commit()
                        status_str = "completed"
                        logger.info("Persisted Redis result to DB (favorites): task=%s asset=%s", task_id, r.id)
                    elif media_url:
                        # Video case — only media_url was in the Redis result
                        new_params = dict(r.params) if r.params else {}
                        await db.execute(
                            text("""
                                UPDATE creations
                                SET status = 'COMPLETED',
                                    media_url = :media,
                                    params = CAST(:params AS jsonb),
                                    updated_at = :now
                                WHERE id = CAST(:aid AS uuid)
                            """),
                            {
                                "media": media_url,
                                "params": json_lib.dumps(new_params),
                                "now": datetime.utcnow(),
                                "aid": str(r.id),
                            },
                        )
                        await db.commit()
                        status_str = "completed"
                        logger.info("Persisted Redis video to DB (favorites): task=%s asset=%s", task_id, r.id)
                rr.close()
            except Exception:
                pass

        items.append({
            "id": str(r.id),
            "type": (r.type or "").lower(),
            "status": status_str,
            "media_url": media_url,
            "thumbnail_url": r.thumbnail_url,
            "prompt": r.prompt or "",
            "width": r.width,
            "height": r.height,
            "image_urls": image_urls or ([media_url] if media_url else []),
            "is_favorited": True,
            "created_at": r.created_at.isoformat() if r.created_at else "",
        })

    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.post("/assets/{asset_id}/favorite")
async def toggle_favorite(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Toggle favorite status for an asset."""
    uid = uuid.UUID(current_user.id)
    cid = uuid.UUID(asset_id)

    # Check asset exists
    result = await db.execute(
        text("SELECT id FROM creations WHERE id = CAST(:aid AS uuid)"),
        {"aid": asset_id},
    )
    if not result.one_or_none():
        raise HTTPException(status_code=404, detail="Asset not found")

    # Check if already favorited
    existing = await db.execute(
        text("SELECT id FROM favorites WHERE user_id = :uid AND creation_id = :cid"),
        {"uid": str(uid), "cid": asset_id},
    )
    fav = existing.one_or_none()

    if fav:
        await db.execute(
            text("DELETE FROM favorites WHERE id = CAST(:fid AS uuid)"),
            {"fid": str(fav.id)},
        )
        await db.commit()
        return {"favorited": False}
    else:
        await db.execute(
            text("""
                INSERT INTO favorites (id, user_id, creation_id, created_at)
                VALUES (:id, :uid, :cid, :now)
            """),
            {"id": str(uuid.uuid4()), "uid": str(uid), "cid": asset_id, "now": datetime.utcnow()},
        )
        await db.commit()
        return {"favorited": True}


@router.get("/assets/recover")
async def recover_assets(
    include_project: bool = False,
    project_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """恢复接口：返回创作记录，含完整参数，无分页限制。

    前端 IndexedDB 为空时调用此接口重建会话历史。
    默认排除项目管理来源（source=project）——AI 工具页历史只含 AI 工具页
    生成的记录；导演工作台恢复传入 include_project=1 以按 prompt 找回
    丢失状态的 project 生成（2026-08-10）。

    project_id（2026-08-11）：导演工作台恢复传项目 id 时，查该项目
    **全部成员**的 project 来源记录——项目协作场景下，他人生成的视频
    丢失状态也能被找回（原来只查当前用户，别人永远匹配不到）。
    安全：先校验当前用户是项目成员，且只返回该项目 config 引用的 URL。
    """
    uid = str(current_user.id)

    if project_id:
        # ── 项目级恢复：校验成员 + 只返回该项目 config 引用的视频 ──
        try:
            pid = uuid.UUID(project_id)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="无效的项目 ID")
        member = await db.execute(
            text("SELECT 1 FROM project_members WHERE project_id = :pid AND user_id = :uid"),
            {"pid": str(pid), "uid": uid},
        )
        if not member.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Project not found")
        # 收集该项目所有集 config 引用的视频 URL（嵌套在 structureData.shots[].videos[]）
        ep_rows = await db.execute(
            text("SELECT config FROM episodes WHERE project_id = :pid"),
            {"pid": str(pid)},
        )
        refs: set[str] = set()
        for (cfg,) in ep_rows:
            data = cfg if isinstance(cfg, dict) else (json_lib.loads(cfg) if cfg else {})
            sd = (data or {}).get("structureData") or {}
            for shot in sd.get("shots") or []:
                for v in shot.get("videos") or []:
                    if v.get("videoUrl"):
                        refs.add(v["videoUrl"])
                if (shot.get("interval") or {}).get("videoUrl"):
                    refs.add(shot["interval"]["videoUrl"])
        if not refs:
            return {"items": []}
        rows = await db.execute(
            text("""
                SELECT c.id, c.type, c.status, c.media_url, c.thumbnail_url,
                       c.prompt, c.width, c.height, c.params, c.created_at,
                       c.error_message
                FROM creations c
                WHERE c.status = 'COMPLETED'
                  AND c.params->>'source' = 'project'
                  AND c.media_url = ANY(:refs)
                ORDER BY c.created_at DESC
                LIMIT 500
            """),
            {"refs": list(refs)},
        )
        rows = rows.all()
    else:
        source_filter = "" if include_project else (
            "  AND (c.params->>'source' IS NULL OR c.params->>'source' != 'project')"
        )

        rows = await db.execute(
            text(f"""
                SELECT c.id, c.type, c.status, c.media_url, c.thumbnail_url,
                       c.prompt, c.width, c.height, c.params, c.created_at,
                       c.error_message
                FROM creations c
                WHERE c.user_id = :uid{source_filter}
                ORDER BY c.created_at DESC
                LIMIT 500
            """),
            {"uid": uid},
        )

    items = []
    for r in rows:
        task_id = None
        image_urls = []
        media_url = r.media_url
        status_str = r.status

        params_dict = r.params if isinstance(r.params, dict) else {}

        if params_dict:
            task_id = params_dict.get("task_id")
            image_urls = params_dict.get("image_urls", [])

        # Redis fallback for stuck PROCESSING records
        if (not image_urls or status_str == "PROCESSING") and task_id:
            try:
                rr = get_redis(db=1)
                raw = rr.get(f"spiritlens:result:{task_id}")
                if raw:
                    res = json_lib.loads(raw)
                    if res.get("image_urls"):
                        image_urls = res["image_urls"]
                    if res.get("video_url"):
                        media_url = media_url or res["video_url"]
                        # 视频没有独立的 image_urls 字段，构造之
                        if not image_urls:
                            image_urls = [res["video_url"]]

                    # 持久化到 DB
                    first_url = image_urls[0] if image_urls else (media_url or "")
                    if first_url:
                        new_params = dict(params_dict)
                        if image_urls:
                            new_params["image_urls"] = image_urls
                        await db.execute(
                            text("""
                                UPDATE creations
                                SET status = 'COMPLETED',
                                    media_url = :media,
                                    params = CAST(:params AS jsonb),
                                    updated_at = NOW()
                                WHERE id = CAST(:aid AS uuid)
                            """),
                            {
                                "media": first_url,
                                "params": json_lib.dumps(new_params),
                                "aid": str(r.id),
                            },
                        )
                        await db.commit()
                        status_str = "completed"
                rr.close()
            except Exception:
                pass

        # 修复卡在 PROCESSING 但实际已有 media_url 的记录（之前 raw SQL 与 ORM 枚举名不一致）
        if status_str == "PROCESSING" and media_url:
            try:
                await db.execute(
                    text("UPDATE creations SET status = 'COMPLETED', updated_at = NOW() WHERE id = CAST(:aid AS uuid)"),
                    {"aid": str(r.id)},
                )
                await db.commit()
                status_str = "completed"
            except Exception:
                pass

        # 提取 params 中的模型和生成参数
        model_id = params_dict.get("model_id", "")
        duration = params_dict.get("duration")
        resolution = params_dict.get("resolution", "")
        batch = params_dict.get("batch", 1)
        negative_prompt = params_dict.get("negative_prompt", "")
        seed = params_dict.get("seed")

        items.append({
            "id": str(r.id),
            "type": (r.type or "").lower(),
            "status": status_str.lower(),  # 统一小写
            "media_url": media_url,
            "prompt": r.prompt or "",
            "model_id": model_id,
            "image_urls": image_urls or ([media_url] if media_url else []),
            "task_id": task_id,
            "created_at": r.created_at.isoformat() if r.created_at else "",
            "generation_params": {
                "size": resolution,
                "duration": duration,
                "batch": batch,
                "negative_prompt": negative_prompt,
                "seed": seed,
            },
        })

    return {"items": items}


@router.get("/assets")
async def list_assets(
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """List current user's creations (personal asset library)."""
    uid = str(current_user.id)  # uuid hex string
    offset = (page - 1) * page_size

    count = await db.execute(
        text("SELECT COUNT(*) FROM creations WHERE user_id = :uid"),
        {"uid": uid},
    )
    total = count.scalar() or 0

    rows = await db.execute(
        text("""
            SELECT c.id, c.type, c.status, c.media_url, c.thumbnail_url,
                   c.prompt, c.width, c.height, c.params, c.created_at,
                   CASE WHEN f.id IS NOT NULL THEN true ELSE false END AS is_favorited
            FROM creations c
            LEFT JOIN favorites f ON f.creation_id = c.id AND f.user_id = :uid
            WHERE c.user_id = :uid
            ORDER BY c.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"uid": uid, "limit": page_size, "offset": offset},
    )

    items = []
    for r in rows:
        task_id = None
        image_urls = []
        media_url = r.media_url  # local copy (Row is immutable)
        status_str = r.status

        if r.params:
            task_id = r.params.get("task_id")
            image_urls = r.params.get("image_urls", [])

        # If not yet completed, try Redis fallback and persist to DB
        if (not image_urls or status_str == "processing") and task_id:
            try:
                rr = get_redis(db=1)
                raw = rr.get(f"spiritlens:result:{task_id}")
                if raw:
                    res = json_lib.loads(raw)
                    if res.get("image_urls"):
                        image_urls = res["image_urls"]
                    if res.get("video_url"):
                        media_url = media_url or res["video_url"]

                    # Persist to DB so it survives Redis restart/expiry
                    if image_urls:
                        first_url = image_urls[0]
                        new_params = dict(r.params) if r.params else {}
                        new_params["image_urls"] = image_urls
                        await db.execute(
                            text("""
                                UPDATE creations
                                SET status = 'COMPLETED',
                                    media_url = :media,
                                    params = CAST(:params AS jsonb),
                                    updated_at = :now
                                WHERE id = CAST(:aid AS uuid)
                            """),
                            {
                                "media": first_url,
                                "params": json_lib.dumps(new_params),
                                "now": datetime.utcnow(),
                                "aid": str(r.id),
                            },
                        )
                        await db.commit()
                        status_str = "completed"
                        logger.info("Persisted Redis result to DB: task=%s asset=%s", task_id, r.id)
                    elif media_url:
                        # Video case — only media_url was in the Redis result
                        new_params = dict(r.params) if r.params else {}
                        await db.execute(
                            text("""
                                UPDATE creations
                                SET status = 'COMPLETED',
                                    media_url = :media,
                                    params = CAST(:params AS jsonb),
                                    updated_at = :now
                                WHERE id = CAST(:aid AS uuid)
                            """),
                            {
                                "media": media_url,
                                "params": json_lib.dumps(new_params),
                                "now": datetime.utcnow(),
                                "aid": str(r.id),
                            },
                        )
                        await db.commit()
                        status_str = "completed"
                        logger.info("Persisted Redis video to DB: task=%s asset=%s", task_id, r.id)
                rr.close()
            except Exception:
                pass

        items.append({
            "id": str(r.id),
            "type": (r.type or "").lower(),
            "status": status_str,
            "media_url": media_url,
            "thumbnail_url": r.thumbnail_url,
            "prompt": r.prompt or "",
            "width": r.width,
            "height": r.height,
            "task_id": task_id,
            "image_urls": image_urls or ([media_url] if media_url else []),
            "is_favorited": r.is_favorited,
            "created_at": r.created_at.isoformat() if r.created_at else "",
        })

    return {"total": total, "page": page, "page_size": page_size, "items": items}
