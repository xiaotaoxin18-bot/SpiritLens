"""File storage service — handles upload, validation, and serving."""

import uuid
import hashlib
from pathlib import Path
from datetime import date
from typing import BinaryIO

from app.core.config import get_settings

settings = get_settings()

# Allowed image types (MIME)
ALLOWED_MIME_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
}

MAX_FILE_SIZE = settings.MAX_UPLOAD_SIZE  # 50MB default


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

    # Return URL path
    today = date.today().isoformat()
    return f"/uploads/{today}/{unique_name}"
