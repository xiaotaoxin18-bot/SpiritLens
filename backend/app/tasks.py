"""Celery task definitions for AI generation."""
import asyncio
import json
import logging
from app.celery_app import celery_app
from app.services.providers import resolve_provider, get_api_model_id
from app.services.providers.xinghe import generate_image as xinghe_generate
from app.core.config import get_settings
from app.services.generation import complete_task, fail_task

logger = logging.getLogger(__name__)


async def _save_result_to_db(task_id: str, result: dict, db_url: str):
    """Persist Celery result to PostgreSQL creations table."""
    try:
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy import text
        engine = create_async_engine(db_url, echo=False, pool_size=1)
        image_urls = result.get("image_urls", [])
        media_url = image_urls[0] if image_urls else None
        async with sessionmaker(engine, class_=AsyncSession)() as session:
            await session.execute(
                text("""
                    UPDATE creations
                    SET status = 'completed',
                        media_url = :media,
                        params = jsonb_set(COALESCE(params, '{}'::jsonb), '{image_urls}', :urls),
                        updated_at = NOW()
                    WHERE params->>'task_id' = :task_id
                """),
                {"task_id": task_id, "media": media_url, "urls": json.dumps(image_urls)},
            )
            await session.commit()
        await engine.dispose()
        logger.info("Saved image result to DB: task_id=%s media=%.80s", task_id, media_url)
    except Exception:
        logger.warning("Failed to persist Celery result to DB (non-fatal)", exc_info=True)


async def _save_error_to_db(task_id: str, error: str, db_url: str):
    """Persist Celery error to PostgreSQL creations table."""
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
                {"task_id": task_id, "error": error},
            )
            await session.commit()
        await engine.dispose()
        logger.info("Saved image error to DB: task_id=%s", task_id)
    except Exception:
        logger.warning("Failed to persist celery error to DB (non-fatal)", exc_info=True)

logger = logging.getLogger(__name__)


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
        self.update_state(state="PROGRESS", meta={"progress": 5, "status": "running"})

        async def on_progress(pct: int, msg: str):
            status = "running"
            if pct >= 100:
                status = "completed"
            self.update_state(state="PROGRESS", meta={"progress": pct, "status": status})
            try:
                from app.services.generation import update_progress as upd
                loop2 = asyncio.get_event_loop()
                if loop2.is_running():
                    asyncio.ensure_future(upd(task_id, pct, status))
            except Exception:
                pass

        # Resolve provider and canonical model ID
        provider = resolve_provider(model_id)
        api_model_id = get_api_model_id(model_id)
        logger.info("Dispatching image generation: model=%s → provider=%s (api_model=%s)",
                     model_id, provider, api_model_id)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            if provider != "xinghe":
                raise RuntimeError(f"Unsupported image provider: {provider}")

            result = loop.run_until_complete(
                xinghe_generate(
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
                from app.services.redis_helper import get_redis
                r = get_redis(db=1)
                r.set(f"spiritlens:result:{task_id}", json.dumps(result))
                r.close()
            except Exception:
                pass

            # Always persist result to PostgreSQL so admin logs show completion
            loop.run_until_complete(_save_result_to_db(task_id, result, get_settings().DATABASE_URL))

            # Update in-memory task store
            try:
                loop2 = asyncio.get_event_loop()
                if loop2.is_running():
                    asyncio.ensure_future(complete_task(task_id, result))
            except Exception:
                pass

            self.update_state(state="SUCCESS", meta={"progress": 100, "status": "completed"})
            return result
        finally:
            loop.close()

    except Exception as exc:
        logger.exception("Celery image task failed: model=%s", model_id)
        self.update_state(state="FAILURE", meta={"progress": 0, "status": "failed"})
        error_msg = str(exc)[:500]
        asyncio.run(_save_error_to_db(task_id, error_msg, get_settings().DATABASE_URL))
        try:
            loop2 = asyncio.get_event_loop()
            if loop2.is_running():
                asyncio.ensure_future(fail_task(task_id, error_msg))
        except Exception:
            pass
