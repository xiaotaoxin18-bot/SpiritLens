"""SpiritLens — One-stop AI creative platform."""

import json
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, func, text as sql_text
from app.core.config import get_settings
from app.api.v1 import router as v1_router
from app.services.generation import subscribe_progress, unsubscribe_progress
from app.core.database import init_db, async_session_factory
from app.models.user import User
from app.models.ai_model import AiModel, ModelType
from app.services.auth import hash_password

settings = get_settings()


async def _seed_lock(session):
    """Serialize multi-worker startup seeding via a session-level advisory lock.

    uvicorn --workers=N runs the lifespan in every process at once; without a
    lock, concurrent ALTER TYPE / model upserts can conflict.
    """
    await session.execute(sql_text("SELECT pg_advisory_lock(737201)"))


async def _seed_unlock(session):
    try:
        await session.execute(sql_text("SELECT pg_advisory_unlock(737201)"))
    except Exception:
        pass


async def seed_admin():
    """Create or update admin user."""
    admin_password = settings.ADMIN_PASSWORD
    if not admin_password:
        print("[WARN] ADMIN_PASSWORD not set, skipping admin seed")
        return

    async with async_session_factory() as session:
        await _seed_lock(session)
        try:
            result = await session.execute(
                select(User).where(User.is_admin == True).limit(1)
            )
            admin = result.scalar_one_or_none()
            if admin is None:
                admin = User(
                    username="宇航",
                    nickname="管理员",
                    password_hash=hash_password(admin_password),
                    is_admin=True,
                )
                session.add(admin)
                await session.commit()
                print("[OK] Admin account seeded")
        finally:
            await _seed_unlock(session)


async def seed_models():
    """Create or update default AI models (upsert by name)."""
    # Ensure PostgreSQL enum supports 'text' value for model types
    async with async_session_factory() as session:
        await _seed_lock(session)
        try:
            await session.execute(sql_text("ALTER TYPE modeltype ADD VALUE 'TEXT'"))
            await session.commit()
        except Exception:
            await session.rollback()
        finally:
            await _seed_unlock(session)

    defaults = [
        # ── Image Models (Xinghe) ────────────────────────────
        # Xinghe Zhiyun unified gateway (see https://xinghezhiyun.com/model-catalog)
        AiModel(name="Doubao-Seedream-4.5", vendor="星河智云", type=ModelType.IMAGE, sort_order=1, cost_per_unit=5,
                api_endpoint=f"{settings.XINGHE_API_BASE.rstrip('/')}/images/generations",
                is_enabled=True),
        AiModel(name="Doubao-Seedream-5.0", vendor="星河智云", type=ModelType.IMAGE, sort_order=2, cost_per_unit=8,
                api_endpoint=f"{settings.XINGHE_API_BASE.rstrip('/')}/images/generations",
                is_enabled=True),
        # ── Video Models (Xinghe) ────────────────────────────
        # Doubao Seedance series via Xinghe Zhiyun
        AiModel(name="Seedance-2.0", vendor="星河智云", type=ModelType.VIDEO, sort_order=6, cost_per_unit=15,
                api_endpoint=f"{settings.XINGHE_API_BASE.rstrip('/')}/videos",
                is_enabled=True),
        AiModel(name="Seedance-2.0-Fast", vendor="星河智云", type=ModelType.VIDEO, sort_order=7, cost_per_unit=8,
                api_endpoint=f"{settings.XINGHE_API_BASE.rstrip('/')}/videos",
                is_enabled=True),
        # ── Video Models (天翼云) ────────────────────────────
        # Doubao Seedance series via Tianyi Cloud Edge AI Gateway
        AiModel(name="Seedance-2.0 (天翼云)", vendor="天翼云", type=ModelType.VIDEO, sort_order=8, cost_per_unit=15,
                api_endpoint=f"{settings.TIANYI_API_BASE.rstrip('/')}/contents/generations/tasks",
                is_enabled=True),
        # ── Text / LLM Models (via DeepSeek Official) ───────
        AiModel(name="DeepSeek-V4-Flash", vendor="DeepSeek", type=ModelType.TEXT, sort_order=12, cost_per_unit=6,
                api_endpoint="https://api.deepseek.com/v1/chat/completions",
                is_enabled=True),
    ]

    async with async_session_factory() as session:
        await _seed_lock(session)
        try:
            result = await session.execute(select(AiModel))
            existing_models = list(result.scalars().all())

            removed = 0
            for model in existing_models:
                if model.type in {ModelType.IMAGE, ModelType.VIDEO}:
                    await session.delete(model)
                    removed += 1

            if removed:
                await session.flush()

            result = await session.execute(select(AiModel))
            existing_by_name = {m.name: m for m in result.scalars().all()}

            added = 0
            for m in defaults:
                existing = existing_by_name.get(m.name)
                if existing is None:
                    session.add(m)
                    added += 1
                else:
                    existing.vendor = m.vendor
                    existing.type = m.type
                    existing.api_endpoint = m.api_endpoint
                    existing.sort_order = m.sort_order
                    existing.cost_per_unit = m.cost_per_unit

            await session.commit()
            if added:
                print(f"[OK] {added} new model(s) seeded")
            if removed:
                print(f"[OK] {removed} legacy model(s) removed")
            else:
                print("[OK] All models already exist; model endpoints synced")
        finally:
            await _seed_unlock(session)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    await init_db()
    await seed_admin()
    await seed_models()
    yield
    # Shutdown


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="One-stop AI creative platform — SpiritLens",
    lifespan=lifespan,
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Log 422 request bodies + validation details (useful for debugging client issues)."""
    body = ""
    try:
        body = json.dumps(await request.json(), ensure_ascii=False)[:2000]
    except Exception:
        pass
    print(f"[422] {request.method} {request.url.path} body={body} "
          f"errors={json.dumps(exc.errors(), ensure_ascii=False)[:2000]}")
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(v1_router)

# WebSocket for task progress


@app.websocket("/ws/task/{task_id}")
async def task_websocket(websocket: WebSocket, task_id: str):
    await websocket.accept()

    async def send_progress(tid: str, progress: int, status: str):
        try:
            await websocket.send_json({"task_id": tid, "progress": progress, "status": status})
        except Exception:
            pass

    subscribe_progress(task_id, send_progress)
    try:
        while True:
            try:
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
            except WebSocketDisconnect:
                break
    finally:
        unsubscribe_progress(task_id, send_progress)


# Mount uploads directory for serving uploaded files
uploads_path = Path(settings.UPLOAD_DIR)
uploads_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "version": settings.APP_VERSION}
