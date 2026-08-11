"""Xinghe Zhiyun API provider for image & video generation.

Images go through https://xinghezhiyun.com/api/v3.
Videos go through https://xinghezhiyun.com/v1/videos (different base path).
"""

import httpx
import json
import logging
import asyncio
import math
from app.core.config import get_settings
from app.services.file_storage import save_upload

logger = logging.getLogger(__name__)

# Retry settings for video API submission
VIDEO_SUBMIT_TIMEOUT = 120.0   # seconds per attempt
VIDEO_SUBMIT_MAX_RETRIES = 2   # retry count (3 total attempts)

settings = get_settings()

XINGHE_API_KEY = settings.XINGHE_API_KEY or settings.NOVAI_API_KEY
XINGHE_API_BASE = (settings.XINGHE_API_BASE or settings.NOVAI_API_BASE).rstrip("/")

# Video API uses a different base path (/v1/) than image (/api/v3/)
XINGHE_VIDEO_BASE = XINGHE_API_BASE.replace("/api/v3", "") + "/v1"

# Video models available through Xinghe Zhiyun
VIDEO_MODELS = {
    "doubao-seedance-2-0-260128": {
        "name": "Seedance 2.0",
        "vendor": "星河智云",
        "cost": 15,
    },
    "doubao-seedance-2-0-fast-260128": {
        "name": "Seedance 2.0 Fast",
        "vendor": "星河智云",
        "cost": 8,
    },
}


async def generate_video(
    prompt: str,
    *,
    model_id: str | None = None,
    duration: int = 5,
    resolution: str = "720p",
    camera: str = "static",
    reference_images: list[str] | None = None,
    reference_audio: str | None = None,  # 星河暂不支持音频参考，忽略（仅保持签名一致）
    progress_callback=None,
    cancel_event=None,
    cancel_check=None,
) -> dict:
    """Generate video via Xinghe Zhiyun /v1/videos API.

    Create → poll → download content from /v1/videos/{video_id}/content.
    """
    if not XINGHE_API_KEY:
        raise RuntimeError("Xinghe Zhiyun API key not configured")

    # Build video base URL (replace /api/v3 with /v1)
    XINGHE_VIDEO_BASE = XINGHE_API_BASE.replace("/api/v3", "") + "/v1"

    # Map aspect-ratio like "16:9" / "9:16" / "1:1" to pixel dimensions
    _ASPECT_MAP = {
        "16:9": "1280x720",
        "9:16": "720x1280",
        "1:1": "1024x1024",
        "4:3": "1024x768",
        "3:2": "1200x800",
    }
    video_size = _ASPECT_MAP.get(resolution, resolution)
    if "x" not in video_size:
        video_size = "1280x720"  # fallback to 720p 16:9
    seconds = max(duration, 5)

    if progress_callback:
        await progress_callback(5, "submitting")

    # Build request body per /v1/videos API
    body: dict = {
        "model": model_id or "doubao-seedance-2-0-260128",
        "prompt": prompt,
        "seconds": seconds,
        "size": video_size,
        "generate_audio": True,
        "return_last_frame": True,
        "watermark": False,
    }

    # Add reference images if provided
    if reference_images:
        content_parts = [
            {"type": "text", "text": prompt},
        ]
        for url in reference_images[:9]:
            if url.startswith("http"):
                full_url = url
            elif url.startswith("/spiritlens/"):
                # 前端相对化存储的 COS/CDN 路径 → 拼媒体域名
                base = settings.OSS_PUBLIC_URL or settings.PUBLIC_URL
                full_url = f"{base.rstrip('/')}{url}"
            else:
                full_url = f"{settings.PUBLIC_URL}{url}"
            content_parts.append({
                "type": "image_url",
                "image_url": {"url": full_url},
            })
        body["content"] = content_parts
        body.pop("prompt", None)

    logger.warning("Xinghe video request: model=%s seconds=%d size=%s refs=%d",
                    body["model"], seconds, video_size, len(reference_images or []))
    logger.warning("Xinghe video BODY: %s", json.dumps(body, ensure_ascii=False))

    # Submit with retry — the video API can be slow to respond
    last_error: Exception | None = None
    for attempt in range(1 + VIDEO_SUBMIT_MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=VIDEO_SUBMIT_TIMEOUT) as client:
                resp = await client.post(
                    f"{XINGHE_VIDEO_BASE}/videos",
                    headers={
                        "Authorization": f"Bearer {XINGHE_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
            last_error = None
            break  # success
        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            last_error = exc
            logger.warning("Xinghe video submit attempt %d/%d failed: %s",
                           attempt + 1, 1 + VIDEO_SUBMIT_MAX_RETRIES, exc)
            if attempt < VIDEO_SUBMIT_MAX_RETRIES:
                await asyncio.sleep(2.0 * (attempt + 1))  # 2s, 4s backoff

    if last_error is not None:
        raise RuntimeError(f"星河视频API提交失败（重试{VIDEO_SUBMIT_MAX_RETRIES}次后）: {last_error}")

    if resp.status_code != 200:
        error_detail = _extract_error(resp)
        raise RuntimeError(f"Xinghe Zhiyun video API error ({resp.status_code}): {error_detail}")

    data = resp.json()
    video_id = data.get("id")
    if not video_id:
        raise RuntimeError("Xinghe Zhiyun video API returned no id")

    if progress_callback:
        await progress_callback(10, "queued")

    # Poll until completion via GET /v1/videos/{video_id}
    max_polls = 7200
    poll_interval = 2

    for _ in range(max_polls):
        await asyncio.sleep(poll_interval)

        if cancel_event and cancel_event.is_set():
            raise RuntimeError(f"[星河任务ID:{video_id}] Task cancelled by user")

        async with httpx.AsyncClient(timeout=30.0) as client:
            poll_resp = await client.get(
                f"{XINGHE_VIDEO_BASE}/videos/{video_id}",
                headers={"Authorization": f"Bearer {XINGHE_API_KEY}"},
            )

        if poll_resp.status_code != 200:
            continue

        status_data = poll_resp.json()
        status = status_data.get("status", "queued")
        progress = status_data.get("progress", 0)

        if progress_callback:
            await progress_callback(progress, status)

        if status == "completed":
            if progress_callback:
                await progress_callback(95, "downloading")

            # Download MP4 from /v1/videos/{video_id}/content — streamed to disk
            # (chunked writes keep memory flat; cancel_check aborts mid-download)
            local_video_url = ""
            try:
                from app.services.file_storage import save_upload_stream
                async with httpx.AsyncClient(timeout=300.0, follow_redirects=True) as dl_client:
                    async with dl_client.stream(
                        "GET",
                        f"{XINGHE_VIDEO_BASE}/videos/{video_id}/content",
                        headers={"Authorization": f"Bearer {XINGHE_API_KEY}"},
                    ) as dl_resp:
                        if dl_resp.status_code == 200:
                            content_type = dl_resp.headers.get("content-type", "video/mp4")
                            local_video_url = await save_upload_stream(
                                dl_resp.aiter_bytes(), content_type,
                                cancel_event=cancel_event, cancel_check=cancel_check,
                            )
                            logger.info("Video saved locally: %s", local_video_url)
                        else:
                            logger.warning("Failed to download video content: HTTP %d", dl_resp.status_code)
            except Exception as e:
                logger.warning("Failed to download video: %s", e)

            if progress_callback:
                await progress_callback(100, "completed")

            if not local_video_url:
                raise RuntimeError(f"[星河任务ID:{video_id}] Video content download failed — no URL returned")

            return {
                "video_url": local_video_url,
                "video_poster_url": "",
                "provider": "xinghe",
                "model_id": model_id or "",
                "duration": seconds,
                "resolution": video_size,
                "camera": camera,
                "task_id": video_id,
            }

        if status in ("failed", "error"):
            error_msg = status_data.get("error") or status_data.get("message") or "Video generation failed"
            raise RuntimeError(f"[星河任务ID:{video_id}] {error_msg}")

    raise RuntimeError(f"[星河任务ID:{video_id}] Video generation timed out")


PUBLIC_URL = settings.PUBLIC_URL.rstrip("/")


def _to_public_url(path: str) -> str:
    """Convert local path to full public URL for the API to fetch."""
    if path.startswith("http://") or path.startswith("https://"):
        return path
    return f"{PUBLIC_URL}{path}"


def _ensure_min_size(size: str, model_id: str | None = None) -> str:
    """Scale up image size to meet model minimum pixel requirement.

    Preserves aspect ratio. Rounds dimensions to nearest 64px.
    Falls back to default size if model capability not found.
    """
    from app.services.model_capabilities import get_capability

    # Parse "WxH"
    try:
        w_str, h_str = size.split("x")
        w, h = int(w_str), int(h_str)
    except (ValueError, AttributeError):
        return size

    cap = get_capability(model_id) if model_id else None
    if not cap:
        return size

    min_pixels = cap.min_pixels
    if min_pixels is None:
        return size  # No minimum pixel requirement for this model

    step = cap.step_size or 64
    current_pixels = w * h

    if current_pixels >= min_pixels:
        return size  # Already meets requirement

    # Scale up to meet min_pixels while preserving aspect ratio
    ratio = math.sqrt(min_pixels / current_pixels)
    new_w = int(w * ratio)
    new_h = int(h * ratio)

    # Round to step_size
    new_w = round(new_w / step) * step
    new_h = round(new_h / step) * step

    return f"{new_w}x{new_h}"


async def generate_image(
    prompt: str,
    *,
    model_id: str | None = None,
    size: str = "1024x1024",
    batch: int = 1,
    negative_prompt: str | None = None,
    seed: int | None = None,
    reference_images: list[str] | None = None,
    reference_strength: int | None = None,
    reference_dimension: str | None = None,
    progress_callback=None,
) -> dict:
    """Generate image via Xinghe Zhiyun /v1/images/generations.

    Returns normalized dict with locally-saved image URLs:
        {"image_urls": [...], "provider": "xinghe", "model_id": "..."}
    """
    if not XINGHE_API_KEY:
        raise RuntimeError("Xinghe Zhiyun API key not configured")

    # Build /v1/ base URL (same as video)
    XINGHE_V1_BASE = XINGHE_API_BASE.replace("/api/v3", "") + "/v1"

    if progress_callback:
        await progress_callback(10, "submitting")

    # Auto-scale size if below model minimum pixel requirement
    scaled = _ensure_min_size(size, model_id)
    if scaled != size:
        logger.info("Auto-scaled image size: %s → %s (model=%s)", size, scaled, model_id)
    api_size = scaled

    body: dict = {
        "model": model_id or "doubao-seedream-5-0-260128",
        "prompt": prompt,
        "size": api_size,
        "response_format": "url",
        "output_format": "png",
        "stream": False,
        "watermark": False,
    }

    # Batch via sequential generation
    if batch > 1:
        body["sequential_image_generation"] = "auto"
        body["sequential_image_generation_options"] = {"max_images": min(batch, 4)}

    if negative_prompt:
        body["negative_prompt"] = negative_prompt
    if seed is not None and seed >= 0:
        body["seed"] = seed
    if reference_images:
        body["image"] = [_to_public_url(u) for u in reference_images]
    if reference_strength is not None:
        body["strength"] = reference_strength / 100.0
        body["guidance_scale"] = 2.5

    logger.info("Xinghe image request: model=%s size=%s batch=%d refs=%d prompt_len=%d",
                 body["model"], api_size, batch, len(reference_images or []), len(prompt))

    if progress_callback:
        await progress_callback(30, "generating")

    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(
            f"{XINGHE_V1_BASE}/images/generations",
            headers={
                "Authorization": f"Bearer {XINGHE_API_KEY}",
                "Content-Type": "application/json",
            },
            json=body,
        )

    if resp.status_code != 200:
        error_detail = _extract_error(resp)
        raise RuntimeError(f"Xinghe Zhiyun image API error ({resp.status_code}): {error_detail}")

    data = resp.json()
    remote_urls = []
    for item in data.get("data", []):
        url = item.get("url") or item.get("b64_json")
        if url:
            remote_urls.append(url)

    if not remote_urls:
        raise RuntimeError("Xinghe Zhiyun image API returned no data")

    if progress_callback:
        await progress_callback(85, "saving_images")

    # Download generated images and save locally
    local_urls: list[str] = []
    async with httpx.AsyncClient(timeout=60.0) as dl_client:
        for url in remote_urls:
            try:
                resp = await dl_client.get(url)
                if resp.status_code == 200:
                    content_type = resp.headers.get("content-type", "image/png")
                    local_path = await save_upload(resp.content, content_type)
                    local_urls.append(local_path)
                else:
                    local_urls.append(url)
            except Exception:
                local_urls.append(url)

    if progress_callback:
        await progress_callback(100, "completed")

    return {
        "image_urls": local_urls or remote_urls,
        "provider": "xinghe",
        "model_id": model_id or "",
    }


def _extract_error(resp: httpx.Response) -> str:
    """Extract error message from API response including param field."""
    try:
        err = resp.json()
        err_obj = err.get("error", {})
        msg = err_obj.get("message", str(err))
        param = err_obj.get("param", "")
        if param:
            msg = f"{msg} (param: {param})"
        code = err_obj.get("code", "")
        if code:
            msg = f"[{code}] {msg}"
        return msg
    except Exception:
        return resp.text[:200]
