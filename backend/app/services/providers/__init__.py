"""Provider router — dispatches generation requests to the correct AI provider."""

import logging
from typing import Optional

from app.services.generation import create_task

logger = logging.getLogger(__name__)

# Provider capabilities: which models map to which provider implementation.
# Image and video generation is routed through Xinghe Zhiyun's unified gateway.
PROVIDER_MAP: dict[str, str] = {
    "doubao-seedream-4-5-251128": "xinghe",
    "doubao-seedream-5-0-260128": "xinghe",
    "doubao-seedance-2-0-260128": "xinghe",
    "doubao-seedance-2-0-fast-260128": "xinghe",
}

# Canonical model ID mapping (internal → API)
MODEL_ID_MAP: dict[str, str] = {}


def get_api_model_id(model_id: str) -> str:
    """Map internal model ID to the API's canonical model ID."""
    return MODEL_ID_MAP.get(model_id, model_id)


# Provider display names (for model selection)
PROVIDER_META: dict[str, dict] = {
    "xinghe": {
        "name": "星河智云",
        "capabilities": ["image", "video"],
        "models": [
            {"id": "doubao-seedream-4-5-251128", "name": "Doubao-Seedream-4.5", "type": "image"},
            {"id": "doubao-seedream-5-0-260128", "name": "Doubao-Seedream-5.0", "type": "image"},
            {"id": "doubao-seedance-2-0-260128", "name": "Seedance 2.0", "type": "video"},
            {"id": "doubao-seedance-2-0-fast-260128", "name": "Seedance 2.0 Fast", "type": "video"},
        ],
    },
}


def resolve_provider(model_id: str) -> str:
    """Map a model_id to a provider key."""
    # Try direct lookup
    if model_id in PROVIDER_MAP:
        return PROVIDER_MAP[model_id]
    # Try prefix match
    if model_id.startswith("doubao-"):
        return "xinghe"
    return "unknown"


async def generate_image(
    prompt: str,
    model_id: str,
    *,
    size: str = "1024x1024",
    batch: int = 1,
    style: Optional[str] = None,
    negative_prompt: Optional[str] = None,
    seed: Optional[int] = None,
    reference_images: Optional[list[str]] = None,
    reference_strength: Optional[int] = None,
) -> dict:
    """Create an image generation task and dispatch to Celery worker.

    Creates a task record in Redis and returns immediately.
    The actual generation runs in a Celery worker via app/tasks.py.
    Poll GET /api/v1/image/status/{task_id} for completion.
    """
    provider = resolve_provider(model_id)
    logger.info("Creating image generation task: model=%s → provider=%s", model_id, provider)

    from app.services.generation import _save_task

    # Create task (stored in Redis via generation.py)
    task = create_task(
        provider=provider,
        model_id=model_id,
        prompt=prompt,
        params={
            "size": size,
            "batch": batch,
            "style": style,
            "negative_prompt": negative_prompt,
            "seed": seed,
            "reference_images": reference_images,
        },
    )

    # Explicitly save to Redis now (not just scheduled)
    try:
        await _save_task(task)
    except Exception:
        pass  # Falls back to in-memory

    return task.to_dict()
