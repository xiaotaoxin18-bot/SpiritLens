"""Celery task definitions for AI generation."""
import asyncio
import json
import logging
import threading
from datetime import datetime, timezone

from celery import Celery
from celery.signals import task_failure, worker_ready

from app.celery_app import celery_app
from app.services.providers import resolve_provider, get_api_model_id
from app.core.config import get_settings
from app.services.generation import complete_task, fail_task
from app.services.task_persistence import (
    save_result_to_db,
    save_error_to_db,
    save_video_to_db,
    save_video_error_to_db,
)

logger = logging.getLogger(__name__)

# Stale-task sweep: tasks stuck in running/pending longer than this are marked
# failed on worker startup (covers tasks lost to SIGKILL / container crash,
# where the task_failure signal cannot run).
STALE_TASK_TIMEOUT_SECONDS = 30 * 60
CANCEL_FLAG_TTL_SECONDS = 24 * 3600


# ─── Terminal-state writers (sync Redis, for signals & sweeper) ──────────


def _redis_sync():
    from app.services.redis_helper import get_redis
    return get_redis(db=1)


def _mark_failed_sync(task_id: str, error: str, *, is_video: bool):
    """Write a failed terminal state to Redis task/result keys.

    Sync variant — safe to call from Celery signals and the startup sweeper,
    which run outside any event loop.
    """
    try:
        r = _redis_sync()
        r.hset(f"spiritlens:task:{task_id}", mapping={
            "status": "failed",
            "progress": "0",
            "error_message": error[:500],
        })
        # Video status endpoint reads the result key; image status endpoint
        # only checks its existence, so for image tasks hset alone is enough.
        if is_video:
            r.set(f"spiritlens:result:{task_id}", json.dumps({"error": error[:500]}))
        r.close()
        logger.info("Marked stale/failed task in Redis: %s", task_id)
    except Exception:
        logger.exception("Failed to mark task failed: %s", task_id)


@task_failure.connect
def _on_task_failure(sender=None, task_id=None, exception=None, einfo=None, **kwargs):
    """Backstop for failures the task body could not handle itself.

    Fires when an exception escapes the task (uncaught BaseException,
    TimeLimitExceeded under prefork, etc.). Normal body-caught failures and
    cancellations already write their terminal state inside the task, so this
    only runs for the paths where that did not happen.
    """
    try:
        task_name = getattr(sender, "name", "") or ""
        is_video = task_name == "app.tasks.generate_video"
        err = str(exception or einfo or "worker error")[:500]
        _mark_failed_sync(task_id, err, is_video=is_video)
    except Exception:
        logger.exception("task_failure handler error")


@worker_ready.connect
def _sweep_stale_tasks(sender=None, **kwargs):
    """Mark tasks stuck in running/pending as failed on worker startup.

    Runs in every worker container (idempotent). Skips cancelled/completed.
    """
    try:
        r = _redis_sync()
        now = datetime.now(timezone.utc)
        keys = r.keys("spiritlens:task:*")
        for key in keys or []:
            try:
                data = r.hgetall(key)
                status = (data.get("status") or b"").decode(errors="ignore")
                created_raw = data.get("created_at") or b""
                if status in ("running", "pending") and created_raw:
                    created = datetime.fromisoformat(created_raw.decode(errors="ignore"))
                    if (now - created).total_seconds() > STALE_TASK_TIMEOUT_SECONDS:
                        task_id = key.decode().split(":", 2)[2]
                        # Video tasks carry provider xinghe/tianyi and video params;
                        # discriminate by presence of 'duration' in params JSON.
                        params_raw = (data.get("params") or b"{}").decode(errors="ignore")
                        is_video = "duration" in params_raw
                        _mark_failed_sync(task_id, "任务因服务重启中断（超时清理）", is_video=is_video)
            except Exception:
                continue
        r.close()
        logger.info("Stale task sweep finished")
    except Exception:
        logger.exception("Stale task sweep failed")


# ─── Image generation ─────────────────────────────────────────────────


@celery_app.task(bind=True, max_retries=1, soft_time_limit=120, time_limit=150)
def generate_image(
    self,
    prompt: str,
    model_id: str,
    *,
    task_id: str = "",
    size: str = "1024x1024",
    batch: int = 1,
    negative_prompt: str | None = None,
    seed: int | None = None,
    reference_images: list[str] | None = None,
    reference_strength: int | None = None,
    reference_dimension: str | None = None,
) -> dict:
    """Generate image via Celery worker — dispatches to correct provider."""
    try:
        async def on_progress(pct: int, msg: str):
            status = "running"
            if pct >= 100:
                status = "completed"
            self.update_state(state="PROGRESS", meta={"progress": pct, "status": status})
            # force_redis: threads-pool tasks run on their own event loop and must
            # never reuse the process-cached Redis connection (loop-bound).
            await update_progress(task_id, pct, status, force_redis=True, skip_callbacks=True)

        from app.services.generation import update_progress

        # Resolve provider and canonical model ID
        provider = resolve_provider(model_id)
        api_model_id = get_api_model_id(model_id)
        logger.info("Dispatching image generation: model=%s → provider=%s (api_model=%s)",
                     model_id, provider, api_model_id)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            if provider == "xinghe":
                from app.services.providers.xinghe import generate_image as provider_generate
            elif provider == "tianyi":
                from app.services.providers.tianyi import generate_image as provider_generate
            else:
                raise RuntimeError(f"Unsupported image provider: {provider}")

            result = loop.run_until_complete(
                provider_generate(
                    prompt, model_id=api_model_id, size=size, batch=batch,
                    negative_prompt=negative_prompt, seed=seed,
                    reference_images=reference_images,
                    reference_strength=reference_strength,
                    reference_dimension=reference_dimension,
                    progress_callback=on_progress,
                )
            )
            # Save result to Redis (primary) + always persist to DB
            result["task_id"] = task_id
            try:
                r = _redis_sync()
                r.set(f"spiritlens:result:{task_id}", json.dumps(result))
                r.close()
            except Exception:
                pass

            # Always persist result to PostgreSQL so admin logs show completion
            loop.run_until_complete(save_result_to_db(task_id, result, get_settings().DATABASE_URL))

            self.update_state(state="SUCCESS", meta={"progress": 100, "status": "completed"})
            return result
        finally:
            loop.close()

    except Exception as exc:
        logger.exception("Celery image task failed: model=%s", model_id)
        self.update_state(state="FAILURE", meta={"progress": 0, "status": "failed"})
        error_msg = str(exc)[:500]
        asyncio.run(save_error_to_db(task_id, error_msg, get_settings().DATABASE_URL))
        try:
            loop2 = asyncio.get_event_loop()
            if loop2.is_running():
                asyncio.ensure_future(fail_task(task_id, error_msg, force_redis=True))
        except Exception:
            pass


# ─── Video generation ─────────────────────────────────────────────────


@celery_app.task(bind=True, max_retries=1, soft_time_limit=3600, time_limit=3700)
def generate_video(
    self,
    task_id: str,
    model_id: str,
    prompt: str,
    *,
    duration: int = 5,
    resolution: str = "1280x720",
    camera: str = "",
    reference_mode: str | None = None,
    reference_images: list[str] | None = None,
    reference_audio: str | None = None,
) -> dict:
    """Generate video via Celery worker — dispatches to correct provider.

    Progress/results are written to the same Redis keys the old in-process
    thread used, so /video/status and the frontend polling work unchanged.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    cancel_event = threading.Event()

    try:
        from app.services.generation import update_progress

        async def is_cancelled() -> bool:
            """Check the Redis cancel flag (set by POST /video/tasks/{id}/cancel).

            Consulted between chunks during downloads and on every progress
            callback; setting the thread-local cancel_event additionally makes
            the provider's poll loop raise RuntimeError (max ~4s delay).
            """
            if cancel_event.is_set():
                return True
            try:
                from app.services.redis_helper import get_async_redis
                r = get_async_redis(db=1)
                cancelled = await r.get(f"spiritlens:cancel:{task_id}")
                await r.close()
                return bool(cancelled)
            except Exception:
                return False

        async def on_progress(pct: int, status: str):
            if await is_cancelled():
                cancel_event.set()
            # force_redis: fresh connection per call on this thread's own loop
            await update_progress(task_id, pct, status, force_redis=True, skip_callbacks=True)

        provider = resolve_provider(model_id)
        api_model_id = get_api_model_id(model_id)
        logger.info("Dispatching video generation: model=%s → provider=%s (api_model=%s)",
                    model_id, provider, api_model_id)

        if provider == "xinghe":
            from app.services.providers.xinghe import generate_video as provider_generate
        elif provider == "tianyi":
            from app.services.providers.tianyi import generate_video as provider_generate
        else:
            raise RuntimeError(f"不支持的视频生成 provider: {provider}")

        result = loop.run_until_complete(provider_generate(
            prompt=prompt,
            model_id=api_model_id,
            duration=duration,
            resolution=resolution,
            camera=camera,
            reference_images=reference_images or None,
            reference_audio=reference_audio or None,
            cancel_event=cancel_event,
            cancel_check=is_cancelled,
            progress_callback=on_progress,
        ))

        # Save result to Redis (primary) + always persist to DB
        result["task_id"] = task_id
        try:
            r = _redis_sync()
            r.set(f"spiritlens:result:{task_id}", json.dumps(result))
            r.hset(f"spiritlens:task:{task_id}", mapping={
                "status": "completed",
                "progress": "100",
                "video_url": result.get("video_url", ""),
                "video_poster_url": result.get("video_poster_url", ""),
            })
            r.close()
        except Exception:
            pass

        loop.run_until_complete(save_video_to_db(task_id, result, get_settings().DATABASE_URL))
        self.update_state(state="SUCCESS", meta={"progress": 100, "status": "completed"})
        return result

    except Exception as exc:
        logger.exception("Celery video task failed: task_id=%s model=%s", task_id, model_id)
        error_msg = str(exc)[:500]

        # Distinguish user cancel from genuine failure so /video/status
        # reports 'cancelled' (result key shape {"status":"cancelled"}).
        cancelled = False
        try:
            r = _redis_sync()
            if r.get(f"spiritlens:cancel:{task_id}"):
                cancelled = True
            r.close()
        except Exception:
            pass

        try:
            r = _redis_sync()
            if cancelled:
                r.set(f"spiritlens:result:{task_id}", '{"status":"cancelled"}')
                r.hset(f"spiritlens:task:{task_id}", mapping={"status": "cancelled", "progress": "0"})
                # DB 同步标 FAILED（枚举无 CANCELLED），否则使用记录永远卡「处理中」
                try:
                    loop.run_until_complete(save_video_error_to_db(task_id, "已取消", get_settings().DATABASE_URL))
                except Exception:
                    pass
            else:
                r.set(f"spiritlens:result:{task_id}", json.dumps({"error": error_msg}))
                r.hset(f"spiritlens:task:{task_id}", mapping={
                    "status": "failed",
                    "progress": "0",
                    "error_message": error_msg,
                })
                loop.run_until_complete(save_video_error_to_db(task_id, error_msg, get_settings().DATABASE_URL))
            r.close()
        except Exception:
            pass

        if cancelled:
            self.update_state(state="REVOKED", meta={"status": "cancelled"})
        else:
            self.update_state(state="FAILURE", meta={"progress": 0, "status": "failed"})
        return None

    finally:
        loop.close()
