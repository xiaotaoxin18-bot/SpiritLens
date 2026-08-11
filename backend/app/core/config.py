"""SpiritLens application configuration."""

from pydantic_settings import BaseSettings
from pydantic import model_validator
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
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Admin seed
    ADMIN_PASSWORD: str = ""

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

    # ─── Object Storage (腾讯云 COS, S3 兼容) ──────────────
    # 开启后生成结果上传 COS 返回公网 URL（播放不占服务器带宽）；
    # 未配置或上传失败时自动回退本地存储。需要"公有读私有写"的桶。
    OSS_ENABLED: bool = False
    OSS_REGION: str = "ap-chengdu"     # COS 地域（成都）
    OSS_BUCKET: str = ""               # 存储桶名称
    OSS_SECRET_ID: str = ""            # 腾讯云 SecretId
    OSS_SECRET_KEY: str = ""           # 腾讯云 SecretKey
    OSS_PUBLIC_URL: str = ""           # 可选：自定义域名/CDN，留空用 COS 默认域名

    # ─── AI Provider API Keys ──────────────────────────────
    # Stability AI
    STABILITY_API_KEY: str = ""
    STABILITY_API_BASE: str = "https://api.stability.ai/v2beta"

    # Black Forest Lab (FLUX)
    BFL_API_KEY: str = ""

    # Xinghe Zhiyun — unified model gateway
    XINGHE_API_KEY: str = ""
    XINGHE_API_BASE: str = "https://xinghezhiyun.com/api/v3"

    # Tianyi Cloud Edge AI Gateway (天翼云)
    TIANYI_API_KEY: str = ""
    TIANYI_API_BASE: str = "https://ai.ctaigw.cn/v1"

    # DeepSeek Official API
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_API_BASE: str = "https://api.deepseek.com/v1"

    class Config:
        env_file = ".env"
        extra = "ignore"  # Allow extra env vars (e.g. OPENAI_API_KEY)

    @model_validator(mode="after")
    def validate_secrets(self):
        env = self.ENVIRONMENT
        if env != "development" and not self.SECRET_KEY:
            raise ValueError(
                "SECRET_KEY must be set via .env or environment variable in non-development environments"
            )
        return self


@lru_cache()
def get_settings() -> Settings:
    return Settings()
