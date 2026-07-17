"""SpiritLens application configuration."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "SpiritLens"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/spiritlens"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Auth
    SECRET_KEY: str = "spiritlens-dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: str = "http://localhost:3005"

    # Public URL (for converting local paths to full URLs when sending to AI APIs)
    PUBLIC_URL: str = "http://localhost:8085"

    # Celery
    CELERY_BROKER_URL: str = "redis://127.0.0.1:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://127.0.0.1:6379/1"

    # File Upload
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024  # 50MB

    # ─── AI Provider API Keys ──────────────────────────────
    # Stability AI
    STABILITY_API_KEY: str = ""
    STABILITY_API_BASE: str = "https://api.stability.ai/v2beta"

    # Black Forest Lab (FLUX)
    BFL_API_KEY: str = ""

    # Xinghe Zhiyun — unified model gateway
    XINGHE_API_KEY: str = ""
    XINGHE_API_BASE: str = "https://xinghezhiyun.com/api/v3"
    # DeepSeek Official API
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_API_BASE: str = "https://api.deepseek.com/v1"

    class Config:
        env_file = ".env"
        extra = "ignore"  # Allow extra env vars (e.g. OPENAI_API_KEY)


@lru_cache()
def get_settings() -> Settings:
    return Settings()
