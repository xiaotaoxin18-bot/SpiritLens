"""Database configuration and session management."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=20,
    max_overflow=10,
)

async_session_factory = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def init_db():
    """Create all tables.

    Serialized with a transaction-scoped advisory lock: uvicorn --workers=N
    runs this concurrently from every process at startup, and concurrent
    CREATE TABLE IF NOT EXISTS can race on pg_type_typname_nsp_index.
    """
    async with engine.begin() as conn:
        await conn.execute(text("SELECT pg_advisory_xact_lock(737202)"))
        from app.models import user, creation, community, ai_model, project, episode, character, scene, prop, storyboard, season  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    """Dependency that provides a database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
