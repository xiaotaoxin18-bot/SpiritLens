"""Image generation API endpoint.

POST /api/v1/image/generate       — submit generation task (dispatched to Celery)
GET  /api/v1/image/status/{task_id}    — poll task status from Redis
POST /api/v1/image/tasks/{task_id}/cancel  — cancel a running task
GET  /api/v1/image/download       — proxy download external image
POST /api/v1/image/prompt         — generate a concise visual/image prompt from asset metadata
"""

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
import httpx
import logging
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_app import celery_app
from app.core.database import get_db
from app.schemas.generation import ImageGenerationRequest, TaskStatusResponse
from app.services.providers import generate_image as create_redis_task
from app.services.generation import get_task
from app.tasks import generate_image as celery_generate_image
from app.models.creation import Creation, CreationType, CreationStatus
from app.models.user import User
from app.api.v1.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/image", tags=["image"])


@router.post("/generate", response_model=TaskStatusResponse)
async def create_image_generation(
    req: ImageGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit an image generation task to Celery worker.

    Returns immediately with a task_id. Poll GET /status/{task_id}
    to check completion.
    """
    # Create task record (stored in Redis via generation.py)
    result = await create_redis_task(
        prompt=req.prompt,
        model_id=req.model_id,
        size=req.size,
        batch=req.batch,
        style=req.style,
        negative_prompt=req.negative_prompt,
        seed=req.seed,
        reference_images=req.reference_images or None,
        reference_strength=req.reference_strength,
    )

    # Persist a creation record in PostgreSQL for dashboard stats
    creation = Creation(
        user_id=current_user.id,
        type=CreationType.IMAGE,
        title=req.prompt[:100] or "图片生成",
        prompt=req.prompt,
        negative_prompt=req.negative_prompt,
        status=CreationStatus.PROCESSING,
        params={
            "task_id": result["task_id"],
            "model_id": req.model_id,
            "size": req.size,
            "batch": req.batch,
            "style": req.style,
            "reference_dimension": req.reference_dimension,
        },
    )
    db.add(creation)
    await db.flush()

    # Dispatch to Celery worker in background
    celery_generate_image.delay(
        prompt=req.prompt,
        model_id=req.model_id,
        task_id=result["task_id"],
        size=req.size,
        batch=req.batch,
        negative_prompt=req.negative_prompt,
        seed=req.seed,
        reference_images=req.reference_images or None,
        reference_strength=req.reference_strength,
        reference_dimension=req.reference_dimension,
    )

    return TaskStatusResponse(
        task_id=result["task_id"],
        status=result["status"],
        progress=result["progress"],
        image_urls=result.get("image_urls", []),
        error_message=result.get("error_message"),
        creation_id=str(creation.id) if creation.id else None,
    )


@router.get("/status/{task_id}", response_model=TaskStatusResponse)
async def get_generation_status(task_id: str):
    """Poll the status of a generation task."""
    # Check Celery result key first (overrides in-memory "pending" status)
    try:
        from app.services.redis_helper import get_async_redis; r = get_async_redis(db=1)
        raw = await r.get(f"spiritlens:result:{task_id}")
        if raw:
            import json
            res = json.loads(raw)
            await r.close()
            return TaskStatusResponse(
                task_id=task_id, status="completed", progress=100,
                image_urls=res.get("image_urls", []),
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
            image_urls=task.image_urls,
            error_message=task.error_message,
        )

    # Final fallback: check DB for creation record with this task_id
    try:
        from sqlalchemy import text
        from app.core.database import async_session_factory
        async with async_session_factory() as db:
            row = (await db.execute(
                text("SELECT status, media_url, params, error_message FROM creations WHERE params->>'task_id' = :task_id LIMIT 1"),
                {"task_id": task_id},
            )).one_or_none()
            if row:
                image_urls = []
                if row.params:
                    image_urls = row.params.get("image_urls", [])
                if not image_urls and row.media_url:
                    image_urls = [row.media_url]
                return TaskStatusResponse(
                    task_id=task_id,
                    status=row.status or "pending",
                    progress=100 if row.status == "completed" else 0,
                    image_urls=image_urls,
                    error_message=row.error_message,
                )
    except Exception:
        pass

    raise HTTPException(status_code=404, detail="Task not found")


@router.post("/tasks/{task_id}/cancel")
async def cancel_image_generation(task_id: str):
    """Cancel a running image generation task.

    Revokes the Celery task (if pending) and marks as cancelled in Redis
    so the frontend sees the cancelled state.
    """
    # 1. Attempt to revoke the Celery task (works if not yet started)
    try:
        celery_app.control.revoke(task_id, terminate=False)
    except Exception as e:
        logger.warning("Celery revoke failed for %s: %s", task_id, e)

    # 2. Mark as cancelled in Redis for the status endpoint
    try:
        from app.services.redis_helper import get_redis
        r = get_redis(db=1)
        r.hset(f"spiritlens:task:{task_id}", mapping={"status": "cancelled"})
        r.set(f"spiritlens:result:{task_id}", '{"status":"cancelled"}')
        r.close()
        logger.info("Image task %s cancelled via Redis", task_id)
    except Exception as e:
        logger.warning("Failed to mark image task %s as cancelled: %s", task_id, e)

    return {"status": "cancelled", "task_id": task_id}


# ── Visual prompt generation ─────────────────────────────────


class VisualPromptRequest(BaseModel):
    """Request to generate a concise visual/image prompt."""
    name: str = Field(..., min_length=1, max_length=200, description="Asset name")
    description: str = Field(default="", max_length=1000, description="Asset description")
    asset_type: str = Field(default="character", pattern="^(character|scene|prop)$", description="Asset type")
    extra: dict = Field(default_factory=dict, description="Extra attributes (gender, personality, age, location, time, atmosphere, category, etc.)")


class VisualPromptResponse(BaseModel):
    prompt: str


@router.post("/prompt", response_model=VisualPromptResponse)
async def generate_visual_prompt(
    req: VisualPromptRequest,
):
    """Generate a concise visual/image prompt from asset metadata.

    Uses the text LLM to produce a 1-2 sentence prompt suitable for image generation.
    Falls back to a constructed prompt if the LLM is unavailable.
    """
    prompt = await _generate_visual_prompt_text(
        name=req.name,
        description=req.description,
        asset_type=req.asset_type,
        extra=req.extra,
    )
    return VisualPromptResponse(prompt=prompt)


async def _generate_visual_prompt_text(
    name: str,
    description: str,
    asset_type: str,
    extra: dict,
) -> str:
    """Generate a concise visual prompt using the text LLM (or fallback)."""
    # Try LLM-based generation
    try:
        from app.core.config import get_settings
        settings = get_settings()
        api_key = settings.DEEPSEEK_API_KEY
        api_base = settings.DEEPSEEK_API_BASE

        if api_key and api_base:
            type_labels = {"character": "角色", "scene": "场景", "prop": "道具"}
            type_label = type_labels.get(asset_type, asset_type)

            # Build extra attributes description
            extra_parts = []
            for k, v in extra.items():
                if v and k not in ("id", "image_url", "prompt", "shapeRefImage", "status", "libraryId", "turnaround_status"):
                    extra_parts.append(f"{k}: {v}")
            extra_str = f"（{', '.join(extra_parts)}）" if extra_parts else ""

            system_prompt = (
                "You are a visual prompt engineer for AI image generation. "
                "Given a character/scene/prop name and description, output ONLY a concise 1-3 sentence "
                "visual prompt in Chinese suitable for image generation. "
                "Describe the subject, setting, lighting, mood, and style. "
                "Output ONLY the prompt text, no explanations, no markdown."
            )
            user_prompt = f"生成{type_label}的视觉描述：{name}{extra_str}。描述：{description}"

            import httpx
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{api_base}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "deepseek-v4-flash",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "max_tokens": 256,
                        "temperature": 0.7,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                    if content and len(content) <= 1500:
                        return content
    except Exception as e:
        logger.warning("Visual prompt generation via LLM failed: %s", e)

    # Fallback: construct from metadata
    return _build_fallback_prompt(name, description, asset_type, extra)


def _build_fallback_prompt(name: str, description: str, asset_type: str, extra: dict) -> str:
    """Build a visual prompt from metadata without LLM."""
    if asset_type == "character":
        parts = [name]
        gender = extra.get("gender", "")
        if gender:
            parts.append(gender)
        age = extra.get("age", "")
        if age:
            parts.append(age)
        personality = extra.get("personality", "")
        if personality:
            parts.append(personality)
        if description:
            parts.append(description)
        base = f"角色：{'，'.join(parts)}"
        return f"{base}，半身肖像照，真人风格，细腻皮肤纹理，柔和自然光，电影级光影"

    elif asset_type == "scene":
        parts = [name]
        location = extra.get("location", "")
        if location and location not in name:
            parts.append(location)
        time = extra.get("time", "")
        if time:
            parts.append(time)
        atmosphere = extra.get("atmosphere", "")
        if atmosphere:
            parts.append(atmosphere)
        if description:
            parts.append(description)
        base = f"场景：{'，'.join(parts)}"
        return f"{base}，电影级画面，广角镜头，丰富细节，氛围感强"

    else:  # prop
        parts = [name]
        category = extra.get("category", "")
        if category:
            parts.append(category)
        if description:
            parts.append(description)
        base = f"道具：{'，'.join(parts)}"
        return f"{base}，高清特写，细节清晰，质感真实"


@router.get("/download")
async def download_image(url: str = Query(...)):
    """Proxy download an external image (handles CORS)."""
    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch image")
        content_type = resp.headers.get("content-type", "image/png")
        return Response(
            content=resp.content,
            media_type=content_type,
            headers={"Content-Disposition": "attachment; filename=download.png"},
        )
