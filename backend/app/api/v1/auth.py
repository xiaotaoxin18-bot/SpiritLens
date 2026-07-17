"""Auth API routes."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.schemas.auth import UserRegister, UserLogin, Token, UserOut
from app.services import auth as auth_service
from app.models.user import User
from app.services.captcha import generate as generate_captcha, verify as verify_captcha
from fastapi.responses import Response

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/captcha")
async def get_captcha():
    """Generate a CAPTCHA. Returns token + SVG data."""
    token, svg = generate_captcha()
    return {"token": token, "image": svg}


def _user_to_out(user: User) -> UserOut:
    return UserOut(
        id=str(user.id),
        email=user.email,
        username=user.username,
        nickname=user.nickname,
        avatar_url=user.avatar_url,
        bio=user.bio,
        is_admin=user.is_admin,
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    """Register a new user with email, phone, or username."""
    # Verify CAPTCHA
    if not verify_captcha(data.captcha_token, data.captcha_text):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码错误",
        )

    if not data.email and not data.phone and not data.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email, phone, or username is required",
        )

    if data.email:
        existing = await auth_service.get_user_by_email(db, data.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )

    if data.phone:
        existing = await auth_service.get_user_by_phone(db, data.phone)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Phone already registered",
            )

    if data.username:
        existing = await auth_service.get_user_by_username(db, data.username)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already taken",
            )

    user = await auth_service.create_user(
        db,
        email=data.email,
        phone=data.phone,
        username=data.username,
        nickname=data.nickname or data.username or "用户",
        password=data.password,
    )
    return _user_to_out(user)


@router.post("/login", response_model=Token)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    """Login with email, phone, or username and password."""
    if not data.email and not data.phone and not data.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email, phone, or username is required",
        )

    user = await auth_service.authenticate_user(
        db,
        email=data.email,
        phone=data.phone,
        username=data.username,
        password=data.password,
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    access_token = auth_service.create_access_token({"sub": str(user.id)})
    refresh_token = auth_service.create_refresh_token({"sub": str(user.id)})

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
    )


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=Token)
async def refresh_token(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Exchange a refresh token for a new access token."""
    payload = auth_service.decode_token(data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    # Verify user still exists
    result = await db.execute(
        select(User).where(User.id == uuid.UUID(user_id))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_access = auth_service.create_access_token({"sub": str(user.id)})
    new_refresh = auth_service.create_refresh_token({"sub": str(user.id)})
    return Token(access_token=new_access, refresh_token=new_refresh)


@router.post("/admin-login", response_model=Token)
async def admin_login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    """Admin login — only allows users with is_admin=True."""
    if not data.email and not data.phone and not data.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email, phone, or username is required",
        )

    user = await auth_service.authenticate_user(
        db,
        email=data.email,
        phone=data.phone,
        username=data.username,
        password=data.password,
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    access_token = auth_service.create_access_token({"sub": str(user.id)})
    refresh_token = auth_service.create_refresh_token({"sub": str(user.id)})

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
    )


async def get_current_user(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Decode JWT and return current user."""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
        )
    payload = auth_service.decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    result = await db.execute(
        select(User).where(User.id == uuid.UUID(user_id))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return _user_to_out(user)


async def get_current_user_optional(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Optional auth — returns UserOut or None if no/invalid token."""
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    payload = auth_service.decode_token(token)
    if payload is None:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    result = await db.execute(
        select(User).where(User.id == uuid.UUID(user_id))
    )
    user = result.scalar_one_or_none()
    if not user:
        return None
    return _user_to_out(user)


@router.get("/me", response_model=UserOut)
async def get_me(current_user: UserOut = Depends(get_current_user)):
    """Get current user info."""
    return current_user
