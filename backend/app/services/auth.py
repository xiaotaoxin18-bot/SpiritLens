"""Auth service."""

from datetime import datetime, timedelta, timezone
from typing import Optional
import json
import bcrypt
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import get_settings
from app.models.user import User

settings = get_settings()

# Redis settings key
_SETTINGS_REDIS_KEY = "spiritlens:settings"


def _get_redis():
    """Get a sync Redis connection for reading settings."""
    try:
        import redis as sync_redis
        # Use REDIS_URL from config to find the right host in Docker
        url = settings.REDIS_URL or "redis://localhost:6379/0"
        parts = url.replace("redis://", "").split("@")
        host_port = parts[-1].split("/")[0]
        host = host_port.split(":")[0]
        port = int(host_port.split(":")[1]) if ":" in host_port else 6379
        r = sync_redis.Redis(host=host, port=port, db=1, decode_responses=True)
        return r
    except Exception:
        return None


def get_token_expire_minutes() -> int:
    """Get token expire minutes from Redis override, fallback to env."""
    try:
        r = _get_redis()
        if r:
            val = r.hget(_SETTINGS_REDIS_KEY, "token_expire_minutes")
            r.close()
            if val:
                return int(val)
    except Exception:
        pass
    return settings.ACCESS_TOKEN_EXPIRE_MINUTES


def get_refresh_token_expire_days() -> int:
    """Get refresh token expire days from Redis override, fallback to env."""
    try:
        r = _get_redis()
        if r:
            val = r.hget(_SETTINGS_REDIS_KEY, "refresh_token_expire_days")
            r.close()
            if val:
                return int(val)
    except Exception:
        pass
    return settings.REFRESH_TOKEN_EXPIRE_DAYS


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=get_token_expire_minutes())
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=get_refresh_token_expire_days())
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_phone(db: AsyncSession, phone: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.phone == phone))
    return result.scalar_one_or_none()


async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    email: Optional[str],
    phone: Optional[str],
    username: Optional[str],
    nickname: str,
    password: str,
) -> User:
    user = User(
        email=email,
        phone=phone,
        username=username,
        nickname=nickname,
        password_hash=hash_password(password),
    )
    db.add(user)
    await db.flush()
    return user


async def authenticate_user(
    db: AsyncSession,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    username: Optional[str] = None,
    password: str = "",
) -> Optional[User]:
    if email:
        user = await get_user_by_email(db, email)
    elif phone:
        user = await get_user_by_phone(db, phone)
    elif username:
        user = await get_user_by_username(db, username)
    else:
        return None

    if not user or not user.password_hash:
        return None

    if not verify_password(password, user.password_hash):
        return None

    return user
