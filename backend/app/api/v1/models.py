"""Public model capabilities API.

GET /api/v1/models          — list all models with capabilities (merged from DB)
GET /api/v1/models/{id}     — get specific model capability
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.ai_model import AiModel
from app.services.model_capabilities import get_capability, get_all_capabilities

router = APIRouter(prefix="/models", tags=["models"])


def _normalize_name(name: str) -> str:
    """Normalize model name for comparison: lowercase, replace hyphens/spaces with single space."""
    import re
    return re.sub(r'[-\s]+', ' ', name.lower()).strip()


def _preferred_db_models(models: list[AiModel]) -> dict[str, AiModel]:
    """Prefer current Xinghe/DeepSeek rows over historical provider rows."""
    preferred: dict[str, AiModel] = {}
    for model in sorted(models, key=lambda m: (
        0 if ("xinghezhiyun.com" in (m.api_endpoint or "") or (m.vendor or "") in {"星河智云", "DeepSeek"}) else 1,
        0 if m.is_enabled else 1,
    )):
        preferred.setdefault(_normalize_name(model.name), model)
    return preferred


@router.get("")
async def list_models(type: str | None = None, db: AsyncSession = Depends(get_db)):
    """List all enabled AI models with their capabilities.

    Merges hardcoded capability definitions with database records so
    admin enable/disable and cost changes are reflected in the frontend.
    """
    # 1. Get all capability entries as dicts
    caps = get_all_capabilities(type)

    # 2. Query all DB models for enabled/disabled status
    stmt = select(AiModel)
    result = await db.execute(stmt)
    db_models = result.scalars().all()

    # 3. Build normalized lookup: normalize both sides to match despite
    #    hyphens vs spaces (e.g. "Seedance-1.5-Pro" == "Seedance 1.5 Pro")
    db_map = _preferred_db_models(db_models)

    # 4. Merge: only return models enabled in DB; pull cost from DB
    merged = []
    cap_norm_names = set()
    for cap in caps:
        norm = _normalize_name(cap.name)
        cap_norm_names.add(norm)
        db_m = db_map.get(norm)
        if db_m is not None:
            if not db_m.is_enabled:
                continue  # Skipped disabled models
            cap.cost_per_unit = db_m.cost_per_unit
            if cap.type == "text":
                cap.vendor = db_m.vendor
        # If no DB record (still show with defaults)
        cap.is_enabled = True
        merged.append(cap.model_dump())

    # 5. Also include DB-only models (no capability entry but enabled in DB)
    for db_m in db_models:
        db_type = db_m.type.value if hasattr(db_m.type, 'value') else str(db_m.type)
        if type is not None and db_type != type:
            continue  # Skip models that don't match the requested type
        if db_type in {"image", "video"}:
            continue
        if _normalize_name(db_m.name) not in cap_norm_names and db_m.is_enabled:
            merged.append({
                "id": db_m.name.lower().replace(" ", "-").replace("/", "-").replace(".", "-").replace("(", "").replace(")", ""),
                "name": db_m.name,
                "vendor": db_m.vendor,
                "type": db_type,
                "is_enabled": True,
                "cost_per_unit": db_m.cost_per_unit,
                "max_batch": 1,
                "supported_sizes": [],
                "aspect_ratios": [],
                "min_pixels": None, "max_pixels": None, "step_size": None,
                "durations": [], "resolutions": [],
            })

    return {"models": sorted(merged, key=lambda m: (m.get("type", ""), m.get("name", "")))}


@router.get("/{model_id}")
async def get_model(model_id: str, db: AsyncSession = Depends(get_db)):
    """Get capabilities for a specific model."""
    cap = get_capability(model_id)
    if not cap:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")

    # Check DB for enabled/disabled and cost
    stmt = select(AiModel)
    result = await db.execute(stmt)
    db_m = _preferred_db_models(result.scalars().all()).get(_normalize_name(cap.name))

    if db_m is not None and not db_m.is_enabled:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' is disabled")

    if db_m is not None:
        cap.cost_per_unit = db_m.cost_per_unit
        if cap.type == "text":
            cap.vendor = db_m.vendor
    cap.is_enabled = True
    return cap.model_dump()
