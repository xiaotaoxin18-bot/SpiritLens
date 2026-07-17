"""Video generation API endpoint.

POST /api/v1/video/generate  — submit video generation task
GET  /api/v1/video/status/{task_id}  — poll task status
"""

# 维护说明：本模块承载对外 API 边界，注释重点说明权限校验、查询条件、事务提交和异常语义，避免后续改动破坏接口契约。

import logging
import asyncio
import threading
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.schemas.generation import VideoGenerationRequest, TaskStatusResponse
from app.services.generation import create_task, get_task, _save_task, update_progress, complete_task, fail_task
from app.models.creation import Creation, CreationType, CreationStatus
from app.models.user import User
from app.api.v1.auth import get_current_user

logger = logging.getLogger(__name__)

# Track running video generation threads for cancellation
_running_tasks: dict[str, threading.Event] = {}


async def _save_video_to_db(task_id: str, result: dict, db_url: str):
    """Persist video generation result to PostgreSQL creations table."""
    try:
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy import text
        engine = create_async_engine(db_url, echo=False, pool_size=1)
        async with sessionmaker(engine, class_=AsyncSession)() as session:
            video_url = result.get("video_url", "")
            await session.execute(
                text("""
                    UPDATE creations
                    SET status = 'completed',
                        media_url = :media,
                        params = jsonb_set(
                            COALESCE(params, '{}'::jsonb),
                            '{video_url}',
                            to_jsonb(:video_url)
                        ),
                        updated_at = NOW()
                    WHERE params->>'task_id' = :task_id
                """),
                {"task_id": task_id, "media": video_url, "video_url": video_url},
            )
            await session.commit()
        await engine.dispose()
        logger.info("Saved video result to DB: task_id=%s media=%.80s", task_id, video_url)
    except Exception as exc:
        logger.warning("Failed to persist video result to DB (non-fatal): %s", exc, exc_info=True)


async def _save_video_error_to_db(task_id: str, error: str, db_url: str):
    """Persist video generation error to PostgreSQL creations table."""
    try:
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy import text
        engine = create_async_engine(db_url, echo=False, pool_size=1)
        async with sessionmaker(engine, class_=AsyncSession)() as session:
            await session.execute(
                text("""
                    UPDATE creations
                    SET status = 'failed',
                        error_message = :error,
                        updated_at = NOW()
                    WHERE params->>'task_id' = :task_id
                """),
                {"task_id": task_id, "error": error[:500]},
            )
            await session.commit()
        await engine.dispose()
        logger.info("Saved video error to DB: task_id=%s error=%.80s", task_id, error)
    except Exception as exc:
        logger.warning("Failed to persist video error to DB (non-fatal): %s", exc, exc_info=True)

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

    # Create task record (stored in Redis via generation.py)
    task = create_task(
        provider="xinghe",
        model_id=req.model_id,
        prompt=req.prompt,
        params={
            "duration": req.duration,
            "resolution": effective_resolution,
            "camera": "",
            "reference_mode": req.reference_mode,
            "reference_images": req.reference_images,
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
        },
    )
    db.add(creation)
    await db.flush()

    # Run video generation in background thread
    import asyncio
    from app.services.providers.xinghe import generate_video as xinghe_generate
    from app.services.generation import update_progress

    async def _video_progress(p: int, status: str):
        await update_progress(task.task_id, p, status)

    def _run_task():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            if cancel_event.is_set():
                return

            result = loop.run_until_complete(xinghe_generate(
                prompt=req.prompt,
                model_id=req.model_id,
                duration=req.duration,
                resolution=effective_resolution,
                camera="",
                reference_images=req.reference_images or None,
                cancel_event=cancel_event,
                progress_callback=_video_progress,
            ))
            # Save result to both Redis keys so API can find it
            import json
            try:
                from app.services.redis_helper import get_redis
                r = get_redis(db=1)
                r.set(f"spiritlens:result:{task.task_id}", json.dumps(result))
                r.hset(f"spiritlens:task:{task.task_id}", mapping={
                    "status": "completed",
                    "progress": "100",
                    "video_url": result.get("video_url", ""),
                    "video_poster_url": result.get("video_poster_url", ""),
                })
                r.close()
            except Exception:
                pass

            # Always persist to PG so admin logs show completion
            loop.run_until_complete(_save_video_to_db(task.task_id, result, get_settings().DATABASE_URL))
        except Exception as e:
            logger.exception("Video generation failed")
            try:
                from app.services.redis_helper import get_redis
                r = get_redis(db=1)
                r.set(f"spiritlens:result:{task.task_id}", json.dumps({"error": str(e)}))
                r.hset(f"spiritlens:task:{task.task_id}", mapping={"status": "failed", "error_message": str(e)})
                r.close()
            except Exception:
                pass
            cfg2 = get_settings()
            loop.run_until_complete(_save_video_error_to_db(task.task_id, str(e), cfg2.DATABASE_URL))
        finally:
            _running_tasks.pop(task.task_id, None)
            loop.close()

    cancel_event = threading.Event()
    _running_tasks[task.task_id] = cancel_event
    t = threading.Thread(target=_run_task, daemon=True)
    t.start()

    return TaskStatusResponse(
        task_id=task.task_id,
        status=task.status,
        progress=task.progress,
        error_message=task.error_message,
        creation_id=str(creation.id) if creation.id else None,
    )


@router.post("/tasks/{task_id}/cancel")
async def cancel_video_generation(task_id: str):
    """Cancel a running video generation task."""
    event = _running_tasks.get(task_id)
    if event:
        event.set()  # Signal the thread to stop
    # Mark as cancelled in Redis
    from app.services.redis_helper import get_redis
    try:
        r = get_redis(db=1)
        r.hset(f"spiritlens:task:{task_id}", mapping={"status": "cancelled", "progress": "0"})
        r.set(f"spiritlens:result:{task_id}", "{\"status\":\"cancelled\"}")
        r.close()
    except Exception:
        pass
    await update_progress(task_id, 0, "cancelled")
    return {"status": "cancelled"}


@router.get("/status/{task_id}", response_model=TaskStatusResponse)
async def get_video_generation_status(task_id: str):
    """Poll the status of a video generation task."""
    # Check result key first; error/cancelled payloads must not be reported as completed.
    from app.services.redis_helper import get_async_redis
    try:
        r = get_async_redis(db=1)
        raw = await r.get(f"spiritlens:result:{task_id}")
        if raw:
            import json
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
