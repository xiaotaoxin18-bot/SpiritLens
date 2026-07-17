"""AI Generation service — Redis-backed async task manager.

Handles submission, progress tracking, and completion of generation tasks.
Tasks survive backend restarts via Redis persistence.
"""

import asyncio
import uuid
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Callable, Awaitable

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

# ─── Redis connection ─────────────────────────────────────────

_redis: aioredis.Redis | None = None
_redis_ready = False

# Prefix for task keys in Redis
TASK_PREFIX = "spiritlens:task:"


async def _get_redis(*, force_new: bool = False) -> aioredis.Redis | None:
    """Get or create Redis connection using configured REDIS_URL."""
    global _redis, _redis_ready
    if _redis is None or force_new:
        from app.services.redis_helper import get_async_redis
        conn = get_async_redis(db=1)
        try:
            await conn.ping()
            if not force_new:
                _redis = conn
                _redis_ready = True
            return conn
        except Exception as e:
            logger.warning("Redis not available: %s — falling back to memory", e)
            return None
    if not _redis_ready:
        try:
            await _redis.ping()
            _redis_ready = True
        except Exception as e:
            logger.warning("Redis not available: %s — falling back to memory", e)
            return None
    return _redis


async def _close_redis():
    """Close Redis connection."""
    global _redis, _redis_ready
    if _redis:
        await _redis.close()
        _redis = None
        _redis_ready = False


# ─── In-memory fallback task store ────────────────────────────
# Used when Redis is not available (dev/fallback)

_task_store: dict[str, "GenerationTask"] = {}


# ─── Task model ─────────────────────────────────────────────

class GenerationTask:
    """Represents a single generation task."""
    def __init__(
        self,
        *,
        task_id: str,
        provider: str,
        model_id: str,
        prompt: str,
        params: dict | None = None,
    ):
        self.task_id = task_id
        self.provider = provider
        self.model_id = model_id
        self.prompt = prompt
        self.params = params or {}
        self.status: str = "pending"
        self.progress: int = 0
        self.created_at = datetime.now(timezone.utc)
        self.completed_at: datetime | None = None
        self.result: dict | None = None
        self.error_message: str | None = None
        self.image_urls: list[str] = []
        self.video_url: str | None = None
        self.video_poster_url: str | None = None

    def to_dict(self) -> dict:
        d = {
            "task_id": self.task_id,
            "status": self.status,
            "progress": self.progress,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else "",
            "provider": self.provider,
            "model_id": self.model_id,
            "prompt": self.prompt,
            "video_url": self.video_url or "",
            "video_poster_url": self.video_poster_url or "",
            "error_message": self.error_message or "",
        }
        # image_urls as JSON string for Redis compatibility
        d["image_urls_json"] = json.dumps(self.image_urls)
        return {k: v for k, v in d.items() if v is not None}

    @classmethod
    def from_dict(cls, data: dict) -> "GenerationTask":
        task = cls(
            task_id=data["task_id"],
            provider=data.get("provider", ""),
            model_id=data.get("model_id", ""),
            prompt=data.get("prompt", ""),
            params=data.get("params", {}),
        )
        task.status = data.get("status", "pending")
        task.progress = int(data.get("progress", 0))
        if data.get("created_at"):
            task.created_at = datetime.fromisoformat(data["created_at"])
        if data.get("completed_at"):
            task.completed_at = datetime.fromisoformat(data["completed_at"])
        img_json = data.get("image_urls_json", data.get("image_urls", "[]"))
        try:
            task.image_urls = json.loads(img_json) if isinstance(img_json, str) else img_json
        except (json.JSONDecodeError, TypeError):
            task.image_urls = []
        task.video_url = data.get("video_url") or None
        task.video_poster_url = data.get("video_poster_url") or None
        task.error_message = data.get("error_message") or None
        task.result = data.get("result")
        return task


# ─── Progress callbacks (in-memory, for WebSocket) ───────────

_progress_callbacks: dict[str, list[Callable[[str, int, str], Awaitable[None]]]] = {}

# ─── ID generation ───────────────────────────────────────────

def _generate_id() -> str:
    return f"gen_{uuid.uuid4().hex[:12]}"


# ─── Storage helpers (Redis or fallback) ────────────────────

async def _save_task(task: GenerationTask, *, force_redis: bool = False):
    """Save task to Redis (or memory fallback)."""
    r = await _get_redis(force_new=force_redis)
    if r:
        try:
            await r.hset(TASK_PREFIX + task.task_id, mapping=task.to_dict())
            # 不设过期，手动删除
        except Exception:
            _task_store[task.task_id] = task
        finally:
            if force_redis:
                await r.close()
    else:
        _task_store[task.task_id] = task


async def _load_task(task_id: str, *, force_redis: bool = False) -> GenerationTask | None:
    """Load task from Redis (or memory fallback)."""
    r = await _get_redis(force_new=force_redis)
    if r:
        try:
            data = await r.hgetall(TASK_PREFIX + task_id)
            if data:
                return GenerationTask.from_dict(data)
        finally:
            if force_redis:
                await r.close()
    return _task_store.get(task_id)


# ─── Public API ─────────────────────────────────────────────

def create_task(
    provider: str,
    model_id: str,
    prompt: str,
    params: dict | None = None,
) -> GenerationTask:
    """Create a new generation task and store it."""
    task = GenerationTask(
        task_id=_generate_id(),
        provider=provider,
        model_id=model_id,
        prompt=prompt,
        params=params,
    )
    # Sync store (schedule async save if event loop is running)
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(_save_task(task))
    except RuntimeError:
        pass
    _task_store[task.task_id] = task  # Always keep in-memory copy
    return task


async def get_task(task_id: str) -> GenerationTask | None:
    return await _load_task(task_id)


async def update_progress(task_id: str, progress: int, status: str | None = None, *, force_redis: bool = False):
    """Update task progress in Redis and notify callbacks."""
    task = await _load_task(task_id, force_redis=force_redis)
    if not task:
        return
    task.progress = progress
    if status:
        task.status = status
    await _save_task(task, force_redis=force_redis)
    if task_id in _progress_callbacks:
        for cb in _progress_callbacks[task_id]:
            try:
                if asyncio.iscoroutinefunction(cb):
                    asyncio.ensure_future(cb(task_id, progress, status or task.status))
            except Exception:
                logger.exception("Progress callback error")


async def complete_task(task_id: str, result: dict, *, force_redis: bool = False):
    """Mark task as completed with generation results."""
    task = await _load_task(task_id, force_redis=force_redis)
    if not task:
        return
    task.status = "completed"
    task.progress = 100
    task.completed_at = datetime.now(timezone.utc)
    task.result = result
    task.image_urls = result.get("image_urls", result.get("urls", []))
    task.video_url = result.get("video_url")
    task.video_poster_url = result.get("video_poster_url")
    await _save_task(task, force_redis=force_redis)
    await update_progress(task_id, 100, "completed")


async def fail_task(task_id: str, error: str, *, force_redis: bool = False):
    """Mark task as failed."""
    task = await _load_task(task_id, force_redis=force_redis)
    if not task:
        return
    task.status = "failed"
    task.progress = 0
    task.completed_at = datetime.now(timezone.utc)
    task.error_message = error
    await _save_task(task, force_redis=force_redis)
    await update_progress(task_id, 0, "failed", force_redis=force_redis)


def subscribe_progress(task_id: str, callback: Callable[[str, int, str], Awaitable[None]]):
    if task_id not in _progress_callbacks:
        _progress_callbacks[task_id] = []
    _progress_callbacks[task_id].append(callback)


def unsubscribe_progress(task_id: str, callback: Callable[[str, int, str], Awaitable[None]]):
    if task_id in _progress_callbacks:
        _progress_callbacks[task_id] = [cb for cb in _progress_callbacks[task_id] if cb is not callback]
        if not _progress_callbacks[task_id]:
            del _progress_callbacks[task_id]
