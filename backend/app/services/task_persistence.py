"""PG persistence helpers for generation tasks.

Shared by Celery tasks (``app.tasks``) and the API layer (``app.api.v1.video``).
Each helper opens a short-lived async engine (pool_size=1) so it is safe to run
on any event loop — task threads inside a Celery threads-pool worker, or request
loops inside FastAPI — without sharing loop-bound connections.

Failure is non-fatal by design: the Redis task record is the source of truth
for the frontend; the creations table is for admin logs/dashboard stats.
"""

import json
import logging

logger = logging.getLogger(__name__)


async def _run_pg(statement: str, params: dict, db_url: str, log_msg: str):
    """Execute a single UPDATE on the creations table via a throwaway engine."""
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import text

    engine = create_async_engine(db_url, echo=False, pool_size=1)
    try:
        async with sessionmaker(engine, class_=AsyncSession)() as session:
            await session.execute(text(statement), params)
            await session.commit()
    finally:
        await engine.dispose()
    logger.info(log_msg)


async def save_result_to_db(task_id: str, result: dict, db_url: str):
    """Persist image generation result to the creations table."""
    image_urls = result.get("image_urls", [])
    media_url = image_urls[0] if image_urls else None
    await _run_pg(
        """
        UPDATE creations
        SET status = 'COMPLETED',
            media_url = :media,
            params = jsonb_set(
                COALESCE(CAST(params AS jsonb), '{}'::jsonb),
                '{image_urls}',
                to_jsonb(CAST(:urls AS json))
            )::json,
            updated_at = NOW()
        WHERE params->>'task_id' = :task_id
        """,
        {"task_id": task_id, "media": media_url, "urls": json.dumps(image_urls)},
        db_url,
        f"Saved image result to DB: task_id={task_id} media={str(media_url)[:80]}",
    )


async def save_error_to_db(task_id: str, error: str, db_url: str):
    """Persist image generation error to the creations table."""
    await _run_pg(
        """
        UPDATE creations
        SET status = 'FAILED',
            error_message = :error,
            updated_at = NOW()
        WHERE params->>'task_id' = :task_id
        """,
        {"task_id": task_id, "error": error[:500]},
        db_url,
        f"Saved image error to DB: task_id={task_id}",
    )


async def save_video_to_db(task_id: str, result: dict, db_url: str):
    """Persist video generation result to the creations table."""
    video_url = result.get("video_url", "")
    await _run_pg(
        """
        UPDATE creations
        SET status = 'COMPLETED',
            media_url = :media,
            params = jsonb_set(
                COALESCE(CAST(params AS jsonb), '{}'::jsonb),
                '{video_url}',
                to_jsonb(CAST(:video_url AS text))
            )::json,
            updated_at = NOW()
        WHERE params->>'task_id' = :task_id
        """,
        {"task_id": task_id, "media": video_url, "video_url": video_url},
        db_url,
        f"Saved video result to DB: task_id={task_id} media={video_url[:80]}",
    )


async def save_video_error_to_db(task_id: str, error: str, db_url: str):
    """Persist video generation error to the creations table."""
    await _run_pg(
        """
        UPDATE creations
        SET status = 'FAILED',
            error_message = :error,
            updated_at = NOW()
        WHERE params->>'task_id' = :task_id
        """,
        {"task_id": task_id, "error": error[:500]},
        db_url,
        f"Saved video error to DB: task_id={task_id}",
    )
