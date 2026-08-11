"""Tianyi Cloud Edge AI Gateway provider for image & video generation.

天翼云边缘AI网关，独立于星河智云。
底层调用豆包模型（Seedream 文生图 + Seedance 视频生成）。

API Base: https://ai.ctaigw.cn/v1
Document: https://docs.qq.com/doc/DYU9HQnNST29tV0Z6

Images go through  {base}/images/generations  (OpenAI-compatible).
Videos go through {base}/contents/generations/tasks  (Volcengine-compatible).
"""

import asyncio
import base64
import httpx
import json
import logging
import math
import time
from app.core.config import get_settings
from app.services.file_storage import save_upload

logger = logging.getLogger(__name__)

settings = get_settings()

TIANYI_API_KEY = settings.TIANYI_API_KEY
TIANYI_API_BASE = settings.TIANYI_API_BASE.rstrip("/")
PUBLIC_URL = settings.PUBLIC_URL.rstrip("/")


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
    """Generate image via Tianyi Cloud /v1/images/generations.

    OpenAI-compatible endpoint. Supports batch, seed, reference images.
    Returns normalized dict with locally-saved image URLs:
        {"image_urls": [...], "provider": "tianyi", "model_id": "..."}
    """
    if not TIANYI_API_KEY:
        raise RuntimeError("天翼云API密钥未配置")

    if progress_callback:
        await progress_callback(10, "submitting")

    # Auto-scale size if below model minimum pixel requirement
    scaled = _ensure_min_size(size, model_id)
    if scaled != size:
        logger.info("Auto-scaled image size: %s → %s (model=%s)", size, scaled, model_id)
    api_size = scaled

    body: dict = {
        "model": model_id or "Doubao-seedream-5.0-lite",
        "prompt": prompt,
        "size": api_size,
        "response_format": "url",
        "watermark": False,
    }

    # Batch via sequential generation
    if batch > 1:
        body["sequential_image_generation"] = "auto"
        body["max_images"] = min(batch, 4)

    if negative_prompt:
        body["negative_prompt"] = negative_prompt
    if seed is not None and seed >= 0:
        body["seed"] = seed
    if reference_images:
        body["image"] = [_to_public_url(u) for u in reference_images]
    if reference_strength is not None:
        body["strength"] = reference_strength / 100.0
        body["guidance_scale"] = 2.5

    logger.info("Tianyi image request: model=%s size=%s batch=%d refs=%d prompt_len=%d",
                 body["model"], api_size, batch, len(reference_images or []), len(prompt))

    if progress_callback:
        await progress_callback(30, "generating")

    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(
            f"{TIANYI_API_BASE}/images/generations",
            headers={
                "Authorization": f"Bearer {TIANYI_API_KEY}",
                "Content-Type": "application/json",
            },
            json=body,
        )

    if resp.status_code != 200:
        error_detail = _extract_error(resp)
        raise RuntimeError(f"天翼云图片生成API错误 ({resp.status_code}): {error_detail}")

    data = resp.json()
    remote_urls = []
    for item in data.get("data", []):
        url = item.get("url") or item.get("b64_json")
        if url:
            remote_urls.append(url)

    if not remote_urls:
        raise RuntimeError("天翼云图片生成API返回为空")

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
        "provider": "tianyi",
        "model_id": model_id or "",
    }


async def generate_video(
    prompt: str,
    *,
    model_id: str | None = None,
    duration: int = 5,
    resolution: str = "720p",
    camera: str = "static",
    reference_images: list[str] | None = None,
    reference_audio: str | None = None,
    progress_callback=None,
    cancel_event=None,
    cancel_check=None,
) -> dict:
    """Generate video via Tianyi Cloud /v1/contents/generations/tasks.

    Volcengine-compatible API: create task → poll until succeeded → download.
    reference_audio: 音频参考（BGM/配音），下载后压缩为 mp3 mono data URI 内联。
    Returns normalized dict with locally-saved video URL.
    """
    if not TIANYI_API_KEY:
        raise RuntimeError("天翼云API密钥未配置")

    # Derive aspect ratio from pixel dimensions (e.g. "1280x720" → "16:9")
    # A simple dict lookup fails because the frontend sends pixel strings,
    # not bare ratio strings.
    ratio = _derive_aspect_ratio(resolution)

    # Derive resolution label from pixel dimensions (e.g. "1280x720" → "720p").
    # Uses min(w, h) so 9:16 portrait ("720x1280") correctly yields "720p".
    api_resolution = _extract_resolution_label(resolution) if "x" in resolution else resolution

    seconds = max(duration, 5)

    if progress_callback:
        await progress_callback(5, "submitting")

    # Build content array — Volcengine format
    content_parts = [
        {"type": "text", "text": prompt},
    ]

    # Add reference images if provided (Tianyi supports up to 9, or 12 with audio)
    # 天翼云后端无法抓取外部 URL（CDN 域名与腾讯云 COS 域名均报"素材无法访问"），
    # 其 API 明确支持 base64 —— 参考图下载后压缩并转 base64 data URI 内联传输。
    # 压缩保证 9 张图也能落在 20MB 请求体限制内。
    if reference_images:
        urls = [_to_public_url(u) for u in reference_images[:9]]

        def _detect_mime(data: bytes) -> str:
            """按字节魔数检测真实图片类型（不能信后缀/CDN header——存在「伪 jpg」）。"""
            if data[:8] == b"\x89PNG\r\n\x1a\n":
                return "image/png"
            if data[:3] == b"\xff\xd8\xff":
                return "image/jpeg"
            if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
                return "image/webp"
            return "image/png"

        async def _to_data_uri(url: str) -> str:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                resp = await client.get(url)
            if resp.status_code != 200:
                raise RuntimeError(f"参考图下载失败: HTTP {resp.status_code} {url[:120]}")
            try:
                from PIL import Image
                import io
                img = Image.open(io.BytesIO(resp.content))
                img.thumbnail((768, 768))
                if img.mode in ("RGBA", "LA", "P"):
                    img = img.convert("RGBA")
                    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
                    bg.alpha_composite(img)
                    img = bg.convert("RGB")
                else:
                    img = img.convert("RGB")
                buf = io.BytesIO()
                img.save(buf, "JPEG", quality=85)
                b64 = base64.b64encode(buf.getvalue()).decode("ascii")
                return f"data:image/jpeg;base64,{b64}"
            except Exception as e:
                # 压缩失败（损坏图片/解码异常）回退原图 —— MIME 前缀必须按
                # 实际字节魔数，否则天翼云报 "data URI MIME 类型与实际内容类型不一致"
                logger.warning("参考图压缩失败，回退原图: %s err=%s", url[:120], e)
                mime = _detect_mime(resp.content)
                b64 = base64.b64encode(resp.content).decode("ascii")
                return f"data:{mime};base64,{b64}"

        data_uris = await asyncio.gather(*[_to_data_uri(u) for u in urls])
        for uri in data_uris:
            content_parts.append({
                "type": "image_url",
                "image_url": {"url": uri},
                "role": "reference_image",
            })

    # 参考音频（2026-08-11 实测确认格式）：
    #   {"type": "audio_url", "audio_url": {"url": data_uri, "format": "mp3"}}
    # 天翼云不接受 input_audio（400 InvalidParameter），且音频不能单独作为参考
    # （VIDEO_REFERENCE_AUDIO_ONLY），必须搭配图片 —— 与产品流程天然一致。
    # 音频同样内联传输（天翼云无法抓外部 URL），mp3 原样透传 / 其他格式压缩。
    if reference_audio:
        audio_url = _to_public_url(reference_audio)
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            audio_resp = await client.get(audio_url)
        if audio_resp.status_code != 200:
            raise RuntimeError(f"参考音频下载失败: HTTP {audio_resp.status_code} {audio_url[:120]}")
        from app.services.audio_utils import audio_to_mp3_data_uri
        audio_uri = await audio_to_mp3_data_uri(audio_resp.content)
        content_parts.append({
            "type": "audio_url",
            "audio_url": {"url": audio_uri, "format": "mp3"},
        })

    body: dict = {
        "model": model_id or "cdance2.0-0611",
        "content": content_parts,
        "ratio": ratio,
        "duration": seconds,
        "generate_audio": True,
        "watermark": False,
    }

    # Tianyi API request body limit is 20MB (confirmed by vendor 2026-08-11);
    # keep 1MB headroom for JSON/URL overhead and reject oversized requests early.
    body_json = json.dumps(body, ensure_ascii=False)
    body_bytes = len(body_json.encode("utf-8"))
    if body_bytes > 19_000_000:
        raise RuntimeError(
            f"天翼云请求体过大 (约 {body_bytes/1024/1024:.1f}MB 超过 20MB 限制)。"
            f"参考图/音频以 base64 内联传输，请减少素材数量或压缩后重试。"
        )
    logger.warning("Tianyi video request: model=%s ratio=%s duration=%d refs=%d body=%.1fKB",
                    body["model"], ratio, seconds, len(reference_images or []), body_bytes / 1024)
    logger.warning("Tianyi video BODY: %s", body_json)

    # Retry up to 3 times with exponential backoff for transient errors
    last_error = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"{TIANYI_API_BASE}/contents/generations/tasks",
                    headers={
                        "Authorization": f"Bearer {TIANYI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
        except (httpx.ConnectError, httpx.TimeoutException) as e:
            last_error = e
            if attempt < 2:
                wait = 2 ** attempt
                logger.warning("天翼云连接失败 (attempt %d/3), %ds后重试: %s", attempt + 1, wait, e)
                await asyncio.sleep(wait)
                continue
            raise RuntimeError(f"天翼云连接失败 (已重试3次): {e}")
        else:
            break

    if resp.status_code != 200:
        error_detail = _extract_error(resp)
        raise RuntimeError(f"天翼云视频创建API错误 ({resp.status_code}): {error_detail}")

    data = resp.json()
    task_id = data.get("id")
    if not task_id:
        raise RuntimeError("天翼云视频创建API返回无任务ID")

    if progress_callback:
        await progress_callback(10, "queued")

    # 天翼云 API 只给粗粒度状态：生成期间按已用时间平滑爬升进度
    # （50 → 89），避免进度条长时间静止在 50%；完成时跳 90（下载）→ 100
    gen_started = time.monotonic()
    expected_gen_seconds = max(60.0, 60.0 + float(duration or 5) * 40.0)

    # Poll until completion via GET /v1/contents/generations/tasks/{id}
    max_polls = 7200
    poll_interval = 2

    for _ in range(max_polls):
        await asyncio.sleep(poll_interval)

        if cancel_event and cancel_event.is_set():
            raise RuntimeError(f"[天翼任务ID:{task_id}] 任务已被用户取消")

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                poll_resp = await client.get(
                    f"{TIANYI_API_BASE}/contents/generations/tasks/{task_id}",
                    headers={"Authorization": f"Bearer {TIANYI_API_KEY}"},
                )
            except (httpx.ConnectError, httpx.TimeoutException):
                continue  # Transient error, retry on next poll cycle

        if poll_resp.status_code != 200:
            continue

        status_data = poll_resp.json()
        status = status_data.get("status", "running")

        # Progress estimation: 10 (queued) → 50-89 (generating, 时间平滑) → 90 (下载) → 100 (完成)
        if status == "running":
            if progress_callback:
                elapsed = time.monotonic() - gen_started
                pct = min(89, 50 + int(39 * elapsed / expected_gen_seconds))
                await progress_callback(pct, "generating")
        elif status == "succeeded":
            if progress_callback:
                await progress_callback(90, "downloading")

            # Extract video URL from response
            content = status_data.get("content", {})
            video_remote_url = content.get("video_url", "")

            if not video_remote_url:
                raise RuntimeError(f"[天翼任务ID:{task_id}] 天翼云视频生成成功但无视频URL返回")

            # Download video and save locally — streamed to disk
            # (chunked writes keep memory flat; cancel_check aborts mid-download)
            local_video_url = ""
            try:
                from app.services.file_storage import save_upload_stream
                async with httpx.AsyncClient(timeout=300.0, follow_redirects=True) as dl_client:
                    async with dl_client.stream("GET", video_remote_url) as dl_resp:
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
                raise RuntimeError(f"[天翼任务ID:{task_id}] 视频内容下载失败")

            return {
                "video_url": local_video_url,
                "video_poster_url": "",
                "provider": "tianyi",
                "model_id": model_id or "",
                "duration": seconds,
                "resolution": api_resolution,
                "ratio": ratio,
                "camera": camera,
                "task_id": task_id,
            }

        if status == "failed":
            error_msg = status_data.get("error", {}).get("message", "") or \
                        str(status_data.get("error", "")) or "视频生成失败"
            raise RuntimeError(f"[天翼任务ID:{task_id}] {error_msg}")

    raise RuntimeError(f"[天翼任务ID:{task_id}] 视频生成超时")


def _to_public_url(path: str) -> str:
    """Convert local path to full public URL for the API to fetch.

    - Relative paths like /uploads/xxx → {PUBLIC_URL}/uploads/xxx
    - Paths already carrying the /spiritlens/ prefix (COS/CDN object path
      stored host-less by the frontend) → {OSS_PUBLIC_URL}/spiritlens/...
    - Localhost URLs (http://localhost:8085/xxx) → {PUBLIC_URL}/xxx
    - Already-public URLs (https://yhanm.cn/...) → pass through as-is
    """
    if path.startswith("http://") or path.startswith("https://"):
        # 完整公网 URL（如 media.yhanm.cn/...）原样返回，切勿改写
        if path.startswith(PUBLIC_URL):
            return path
        import re
        m = re.match(r'https?://[^/]+(/.*)', path)
        if m:
            # 仅 localhost 开发地址需要替换为 PUBLIC_URL
            if "localhost" in path or path.startswith("http://127.") or path.startswith("http://0.0.0.0"):
                return f"{PUBLIC_URL}{m.group(1)}"
            return path
        return path
    if path.startswith("/spiritlens/"):
        from app.core.config import get_settings
        s = get_settings()
        base = s.OSS_PUBLIC_URL or PUBLIC_URL
        return f"{base.rstrip('/')}{path}"
    return f"{PUBLIC_URL}{path}"


def _ensure_min_size(size: str, model_id: str | None = None) -> str:
    """Scale up image size to meet model minimum pixel requirement."""
    from app.services.model_capabilities import get_capability

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
        return size

    step = cap.step_size or 64
    current_pixels = w * h

    if current_pixels >= min_pixels:
        return size

    ratio = math.sqrt(min_pixels / current_pixels)
    new_w = int(w * ratio)
    new_h = int(h * ratio)

    new_w = round(new_w / step) * step
    new_h = round(new_h / step) * step

    return f"{new_w}x{new_h}"


def _extract_error(resp: httpx.Response) -> str:
    """Extract error message from API response."""
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


def _derive_aspect_ratio(pixel_size: str) -> str:
    """Derive aspect ratio string from pixel dimensions like '1280x720'.

    Returns one of: 16:9, 9:16, 1:1, 4:3, 3:2, 21:9 — or "16:9" as fallback.
    """
    try:
        w_str, h_str = pixel_size.split("x")
        w, h = int(w_str), int(h_str)
        if h == 0:
            return "16:9"
        ratio_val = w / h
        # Match against known ratios with 5% tolerance
        if abs(ratio_val - 16 / 9) < 0.05:
            return "16:9"
        elif abs(ratio_val - 9 / 16) < 0.05:
            return "9:16"
        elif abs(ratio_val - 1.0) < 0.05:
            return "1:1"
        elif abs(ratio_val - 4 / 3) < 0.05:
            return "4:3"
        elif abs(ratio_val - 3 / 2) < 0.05:
            return "3:2"
        elif abs(ratio_val - 21 / 9) < 0.05:
            return "21:9"
        return "16:9"
    except (ValueError, AttributeError, ZeroDivisionError):
        return "16:9"


def _extract_resolution_label(pixel_size: str) -> str:
    """Extract resolution label (480p, 720p, 1080p, 4k) from pixel dimensions.

    Uses min(w, h) so portrait ("720x1280") and square ("720x720")
    both correctly yield "720p".
    """
    try:
        w_str, h_str = pixel_size.split("x")
        w, h = int(w_str), int(h_str)
        min_dim = min(w, h)
        if min_dim <= 480:
            return "480p"
        elif min_dim <= 720:
            return "720p"
        elif min_dim <= 1080:
            return "1080p"
        else:
            return "4k"
    except (ValueError, AttributeError):
        return "720p"
