"""File storage service — handles upload, validation, and serving."""

import asyncio
import logging
import uuid
import hashlib
from pathlib import Path
from datetime import date
from typing import BinaryIO

from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()


def _warm_cdn_sync(url: str) -> bool:
    """CDN 预热：全量 GET 新上传的视频，让 CDN 边缘节点提前缓存。

    必须全量 GET：Range 请求只会让边缘缓存对应分片，播放器的首段
    请求仍会回源（表现为"视频生好了但第一次播不出来，刷新才好"）。
    返回是否预热成功，供调用方决定是否重试。
    """
    try:
        import httpx
        with httpx.Client(timeout=60.0) as client:
            resp = client.get(url)
            return resp.status_code == 200
    except Exception:
        return False

# Allowed file types (MIME)
ALLOWED_MIME_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "audio/mpeg": ".mp3",
}

MAX_FILE_SIZE = settings.MAX_UPLOAD_SIZE  # 50MB default


def is_oss_enabled() -> bool:
    """True when COS upload is configured (see object_storage.is_enabled)."""
    from app.services.object_storage import is_enabled
    return is_enabled()


def _upload_dir() -> Path:
    """Get today's upload directory, create if missing."""
    today = date.today().isoformat()  # "2026-06-26"
    dir_path = Path(settings.UPLOAD_DIR) / today
    dir_path.mkdir(parents=True, exist_ok=True)
    return dir_path


def validate_file(content_type: str, file_size: int) -> str | None:
    """Validate file type and size. Returns error message or None."""
    if content_type not in ALLOWED_MIME_TYPES:
        supported = ", ".join(ALLOWED_MIME_TYPES.keys())
        return f"不支持的文件类型: {content_type}，仅支持 {supported}"
    if file_size > MAX_FILE_SIZE:
        max_mb = MAX_FILE_SIZE / 1024 / 1024
        return f"文件过大 ({file_size / 1024 / 1024:.1f}MB)，最大 {max_mb:.0f}MB"
    return None


def delete_local_file(url_path: str) -> bool:
    """删除本地 /uploads/... 文件（best-effort），并清理空日期目录。"""
    if not url_path or not url_path.startswith("/uploads/"):
        return False
    rel = url_path[len("/uploads/"):]
    if ".." in rel or rel.startswith("/") or rel.startswith("\\"):
        return False
    try:
        p = Path(settings.UPLOAD_DIR) / rel
        p.unlink(missing_ok=True)
        try:
            p.parent.rmdir()  # 顺手清空日期目录
        except OSError:
            pass
        return True
    except Exception:
        return False


async def delete_media(url: str) -> bool:
    """按 URL 删除媒体：COS 对象或本地文件。统一入口，返回是否已删除。

    外部（提供商 CDN 等）URL 不属于我们管理，视为已处理（True）。
    """
    if not url:
        return True
    if url.startswith("/uploads/"):
        return delete_local_file(url)
    if url.startswith(("http://", "https://")):
        from app.services.object_storage import is_enabled, key_from_url, delete_object
        key = key_from_url(url)
        if key and is_enabled():
            return await delete_object(key)
    return True


def collect_media_urls(node) -> set[str]:
    """递归收集 dict/list/str 中所有像媒体 URL 的字符串（episode config 扫描用）。"""
    out: set[str] = set()

    def _walk(n):
        if isinstance(n, str):
            if n.startswith(("/uploads/", "http://", "https://")):
                out.add(n)
        elif isinstance(n, dict):
            for v in n.values():
                _walk(v)
        elif isinstance(n, list):
            for v in n:
                _walk(v)

    _walk(node)
    return out


async def save_upload(file_data: bytes, content_type: str) -> str:
    """Save uploaded file to disk and return its URL path.

    Returns URL path like: /uploads/2026-06-26/abc123.jpg
    """
    ext = ALLOWED_MIME_TYPES[content_type]
    # Generate unique filename: hash content to deduplicate
    file_hash = hashlib.sha256(file_data).hexdigest()[:16]
    unique_name = f"{file_hash}{ext}"

    dest = _upload_dir() / unique_name

    # Skip if already exists (dedup)
    if not dest.exists():
        dest.write_bytes(file_data)

    # Upload to COS when enabled; fall back to local on any failure
    today = date.today().isoformat()
    if is_oss_enabled():
        try:
            from app.services.object_storage import upload_file, build_key
            cos_url = await upload_file(dest, content_type, build_key(today, unique_name))
            dest.unlink(missing_ok=True)  # uploaded — drop the local copy
            if content_type == "video/mp4":
                asyncio.to_thread(_warm_cdn_sync, cos_url)  # CDN 预热，不阻塞保存
            return cos_url
        except Exception as e:
            logger.warning("COS upload failed, keeping local: %s", e)
    return f"/uploads/{today}/{unique_name}"


async def save_upload_stream(stream, content_type: str, cancel_event=None, cancel_check=None) -> str:
    """Stream a download to disk, hashing as it goes (keeps content dedup).

    ``stream`` is an async iterator of bytes chunks (httpx ``aiter_bytes()``).
    Writes to a ``.part`` temp file, then renames to the final hashed name —
    so a cancelled/failed download never leaves a partial file behind.
    Returns URL path like: /uploads/2026-06-26/abc123.mp4

    ``cancel_event`` (threading.Event) and/or ``cancel_check`` (async callable
    returning bool) are checked between chunks; either true aborts the write.
    """
    ext = ALLOWED_MIME_TYPES[content_type]
    today = date.today().isoformat()
    dir_path = Path(settings.UPLOAD_DIR) / today
    dir_path.mkdir(parents=True, exist_ok=True)

    tmp_path = dir_path / f".part-{uuid.uuid4().hex[:12]}{ext}"
    hasher = hashlib.sha256()
    try:
        with tmp_path.open("wb") as f:
            async for chunk in stream:
                if cancel_event and cancel_event.is_set():
                    raise RuntimeError("下载已取消")
                if cancel_check and await cancel_check():
                    raise RuntimeError("下载已取消")
                if not chunk:
                    continue
                hasher.update(chunk)
                f.write(chunk)

        unique_name = f"{hasher.hexdigest()[:16]}{ext}"
        dest = dir_path / unique_name
        if dest.exists():
            tmp_path.unlink(missing_ok=True)  # dedup: already stored
        else:
            tmp_path.rename(dest)
        # Upload to COS when enabled; fall back to local on any failure
        if is_oss_enabled():
            try:
                from app.services.object_storage import upload_file, build_key
                cos_url = await upload_file(dest, content_type, build_key(today, unique_name))
                dest.unlink(missing_ok=True)  # uploaded — drop the local copy
                if content_type == "video/mp4":
                    # 同步预热：任务标记完成前必须确保边缘已缓存，
                    # 否则前端首次播放会撞冷缓存失败（要刷新才出现）
                    for _ in range(3):
                        if await asyncio.to_thread(_warm_cdn_sync, cos_url):
                            break
                        await asyncio.sleep(1.0)
                    else:
                        logger.warning("CDN 预热失败（3 次），首次播放可能回源: %s", cos_url)
                return cos_url
            except Exception as e:
                logger.warning("COS upload failed, keeping local: %s", e)
        return f"/uploads/{today}/{unique_name}"
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise
