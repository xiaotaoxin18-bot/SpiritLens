"""Video generation API endpoint.

POST /api/v1/video/generate  — submit video generation task
GET  /api/v1/video/status/{task_id}  — poll task status
POST /api/v1/video/tasks/{task_id}/cancel  — cancel a task
POST /api/v1/video/tasks/{task_id}/retry  — retry a cancelled/failed task

Generation runs in the Celery worker (queue: video), not in this process.
Progress/results are written to Redis by the worker; the frontend polls
GET /status/{task_id}, so the API contract is unchanged.
"""

# 维护说明：本模块承载对外 API 边界，注释重点说明权限校验、查询条件、事务提交和异常语义，避免后续改动破坏接口契约。

import json
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_app import celery_app
from app.core.database import get_db
from app.schemas.generation import VideoGenerationRequest, TaskStatusResponse
from app.services.generation import create_task, get_task, _save_task, update_progress
from app.tasks import generate_video as celery_generate_video
from app.models.creation import Creation, CreationType, CreationStatus
from app.models.user import User
from app.api.v1.auth import get_current_user

logger = logging.getLogger(__name__)


def _dispatch_video(task_id: str, params: dict):
    """Dispatch a video generation task to the Celery queue.

    Uses ``task_id=`` so Celery's task id equals the SpiritLens task id —
    ``revoke(task_id)`` then works directly. On dispatch failure the task is
    marked failed so the frontend never polls a forever-pending task.
    """
    try:
        celery_generate_video.apply_async(
            task_id=task_id,
            kwargs=params,
        )
    except Exception as exc:
        logger.exception("Failed to dispatch video task: %s", task_id)
        try:
            from app.services.redis_helper import get_redis
            r = get_redis(db=1)
            r.set(f"spiritlens:result:{task_id}", json.dumps({"error": f"任务提交失败: {exc}"[:500]}))
            r.hset(f"spiritlens:task:{task_id}", mapping={"status": "failed", "error_message": f"任务提交失败: {exc}"[:500]})
            r.close()
        except Exception:
            pass
        raise HTTPException(status_code=503, detail="生成任务提交失败，请稍后重试")


router = APIRouter(prefix="/video", tags=["video"])


@router.post("/generate", response_model=TaskStatusResponse)
async def create_video_generation(
    req: VideoGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a video generation task.

    Returns immediately with a task_id. Poll GET /status/{task_id}
    to check completion.
    """
    # 防自动化批量提交：同用户 60 秒内 > 10 次 → 429
    from app.services.redis_helper import check_generate_rate
    if not await check_generate_rate(str(current_user.id), "video"):
        raise HTTPException(status_code=429, detail="提交过于频繁，请稍后再试")

    # Convert aspect-ratio like "16:9" to pixel dimensions for the API
    _ASPECT_MAP = {
        "16:9": "1280x720",
        "9:16": "720x1280",
        "1:1": "1024x1024",
        "4:3": "1024x768",
        "3:2": "1200x800",
    }
    effective_resolution = _ASPECT_MAP.get(req.size, req.size) if req.size else req.resolution
    if "x" not in effective_resolution:
        effective_resolution = req.resolution or "1280x720"

    # Resolve provider from model_id
    from app.services.providers import resolve_provider
    provider = resolve_provider(req.model_id)

    # Create task record (stored in Redis via generation.py)
    task = create_task(
        provider=provider,
        model_id=req.model_id,
        prompt=req.prompt,
        params={
            "duration": req.duration,
            "resolution": effective_resolution,
            "camera": "",
            "reference_mode": req.reference_mode,
            "reference_images": req.reference_images,
            "reference_audio": req.reference_audio,
        },
    )

    # Explicitly save to Redis now
    try:
        await _save_task(task)
    except Exception:
        pass

    # Persist a creation record in PostgreSQL for dashboard stats
    creation = Creation(
        user_id=uuid.UUID(current_user.id),
        type=CreationType.VIDEO,
        title=req.prompt[:100] or "视频生成",
        prompt=req.prompt,
        status=CreationStatus.PROCESSING,
        params={
            "task_id": task.task_id,
            "model_id": req.model_id,
            "duration": req.duration,
            "resolution": effective_resolution,
            "camera": "",
            "source": req.source,  # ai-tool / project —— AI 工具页历史恢复时排除 project
        },
    )
    db.add(creation)
    await db.flush()

    # Dispatch to the Celery video worker
    _dispatch_video(task.task_id, {
        "task_id": task.task_id,
        "model_id": req.model_id,
        "prompt": req.prompt,
        "duration": req.duration,
        "resolution": effective_resolution,
        "camera": "",
        "reference_mode": req.reference_mode,
        "reference_images": req.reference_images,
        "reference_audio": req.reference_audio,
    })

    return TaskStatusResponse(
        task_id=task.task_id,
        status=task.status,
        progress=task.progress,
        error_message=task.error_message,
        creation_id=str(creation.id) if creation.id else None,
    )


@router.post("/tasks/{task_id}/cancel")
async def cancel_video_generation(task_id: str):
    """Cancel a running video generation task.

    Writes the Redis cancel flag (the worker's progress callback checks it and
    aborts via the provider's poll loop) and revokes the Celery task so queued
    tasks never start. Marks the task cancelled so the frontend sees it at once.
    """
    # 1. Revoke the Celery task (works for queued / prefetched-but-unstarted
    #    tasks; the Redis flag handles tasks already running)
    try:
        celery_app.control.revoke(task_id, terminate=False, timeout=1)
    except Exception as e:
        logger.warning("Celery revoke failed for %s: %s", task_id, e)

    # 2. Cancel flag consumed by the worker's progress callback
    try:
        from app.services.redis_helper import get_redis
        r = get_redis(db=1)
        r.set(f"spiritlens:cancel:{task_id}", "1", ex=24 * 3600)
        # 3. Mark as cancelled in Redis for the status endpoint
        r.hset(f"spiritlens:task:{task_id}", mapping={"status": "cancelled", "progress": "0"})
        r.set(f"spiritlens:result:{task_id}", '{"status":"cancelled"}')
        r.close()
    except Exception as e:
        logger.warning("Failed to mark video task %s as cancelled: %s", task_id, e)
    await update_progress(task_id, 0, "cancelled")
    return {"status": "cancelled"}


@router.post("/tasks/{task_id}/retry", response_model=TaskStatusResponse)
async def retry_video_generation(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retry a cancelled or failed video generation task.

    Creates a new task with the same parameters as the original.
    Returns the new task_id.
    """
    task = await get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="原任务不存在")

    if task.status not in ("cancelled", "failed"):
        raise HTTPException(status_code=400, detail=f"任务状态为 {task.status}，不可重跑（仅支持 cancelled/failed）")

    params = task.params or {}
    model_id = task.model_id
    prompt = task.prompt
    resolution = params.get("resolution", "1280x720")
    duration = params.get("duration", 5)
    reference_images = params.get("reference_images") or None
    reference_audio = params.get("reference_audio") or None
    reference_mode = params.get("reference_mode")

    from app.services.providers import resolve_provider
    provider = resolve_provider(model_id)

    new_task = create_task(
        provider=provider,
        model_id=model_id,
        prompt=prompt,
        params={
            "duration": duration,
            "resolution": resolution,
            "camera": params.get("camera", ""),
            "reference_mode": reference_mode,
            "reference_images": reference_images,
            "reference_audio": reference_audio,
        },
    )
    try:
        await _save_task(new_task)
    except Exception:
        pass

    creation = Creation(
        user_id=uuid.UUID(current_user.id),
        type=CreationType.VIDEO,
        title=prompt[:100] or "视频生成(重跑)",
        prompt=prompt,
        status=CreationStatus.PROCESSING,
        params={
            "task_id": new_task.task_id,
            "model_id": model_id,
            "duration": duration,
            "resolution": resolution,
            "retry_of": task_id,
        },
    )
    db.add(creation)
    await db.flush()

    _dispatch_video(new_task.task_id, {
        "task_id": new_task.task_id,
        "model_id": model_id,
        "prompt": prompt,
        "duration": duration,
        "resolution": resolution,
        "camera": params.get("camera", ""),
        "reference_mode": reference_mode,
        "reference_images": reference_images,
        "reference_audio": reference_audio,
    })

    return TaskStatusResponse(
        task_id=new_task.task_id,
        status=new_task.status,
        progress=new_task.progress,
        creation_id=str(creation.id) if creation.id else None,
    )


@router.get("/status/{task_id}", response_model=TaskStatusResponse)
async def get_video_generation_status(task_id: str):
    """Poll the status of a video generation task."""
    # Check result key first; error/cancelled payloads must not be reported as completed.
    from app.services.redis_helper import get_async_redis
    try:
        r = get_async_redis(db=1)
        raw = await r.get(f"spiritlens:result:{task_id}")
        if raw:
            res = json.loads(raw)
            await r.close()
            if res.get("error"):
                return TaskStatusResponse(
                    task_id=task_id,
                    status=res.get("status") or "failed",
                    progress=0,
                    error_message=res.get("error"),
                )
            if res.get("status") == "cancelled":
                return TaskStatusResponse(
                    task_id=task_id,
                    status="cancelled",
                    progress=0,
                    error_message="Task cancelled by user",
                )
            return TaskStatusResponse(
                task_id=task_id, status="completed", progress=100,
                video_url=res.get("video_url"),
                video_poster_url=res.get("video_poster_url"),
            )
        await r.close()
    except Exception:
        pass

    task = await get_task(task_id)
    if task:
        return TaskStatusResponse(
            task_id=task.task_id,
            status=task.status,
            progress=task.progress,
            video_url=task.video_url,
            video_poster_url=task.video_poster_url,
            error_message=task.error_message,
        )

    raise HTTPException(status_code=404, detail="Task not found")


@router.get("/download")
async def download_video(url: str = Query(...), request: Request = None):
    """流式代理下载视频（同源化，使浏览器 `<a download>` 生效）。

    视频存于跨域 CDN（media.yhanm.cn），`<a download>` 跨域时浏览器会忽略
    download 属性直接打开视频。此端点把 CDN URL 转成同源请求，流式转发 +
    Range 透传——响应头一到浏览器即弹出下载栏。

    仅允许转发本站媒体域名（OSS_PUBLIC_URL / PUBLIC_URL），防止 SSRF。
    """
    try:
        from app.core.config import get_settings as _gs
        _cfg = _gs()
        allowed = [
            p.rstrip("/") + "/"
            for p in (_cfg.OSS_PUBLIC_URL, _cfg.PUBLIC_URL)
            if p
        ]
    except Exception:
        allowed = ["https://media.yhanm.cn/"]
    if not any(url.startswith(p) for p in allowed):
        raise HTTPException(status_code=400, detail="仅支持本站媒体链接下载")

    import httpx
    headers = {}
    if request and request.headers.get("range"):
        headers["Range"] = request.headers["range"]

    client = httpx.AsyncClient(follow_redirects=True, timeout=300.0)
    req = client.build_request("GET", url, headers=headers)
    resp = await client.send(req, stream=True)
    if resp.status_code >= 400:
        await resp.aclose()
        await client.aclose()
        raise HTTPException(status_code=502, detail="视频获取失败")

    resp_headers = {}
    for h in ("content-length", "content-range", "accept-ranges"):
        if resp.headers.get(h):
            resp_headers[h.title()] = resp.headers[h]

    async def _iter():
        try:
            async for chunk in resp.aiter_bytes():
                yield chunk
        finally:
            await resp.aclose()
            await client.aclose()

    return StreamingResponse(
        _iter(),
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "video/mp4"),
        headers=resp_headers,
    )
