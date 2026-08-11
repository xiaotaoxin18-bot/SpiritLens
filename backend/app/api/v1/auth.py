"""Auth API routes."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.schemas.auth import UserRegister, UserLogin, Token, UserOut, UserUpdate, ChangePassword
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
            detail="请填写邮箱、手机号或用户名",
        )

    if data.email:
        existing = await auth_service.get_user_by_email(db, data.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="该邮箱已被注册",
            )

    if data.phone:
        existing = await auth_service.get_user_by_phone(db, data.phone)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="该手机号已被注册",
            )

    if data.username:
        existing = await auth_service.get_user_by_username(db, data.username)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="该用户名已被使用",
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
            detail="请填写邮箱、手机号或用户名",
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
            detail="用户名或密码错误",
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
            detail="登录已过期，请重新登录",
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录凭证无效",
        )

    # Verify user still exists
    result = await db.execute(
        select(User).where(User.id == uuid.UUID(user_id))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    new_access = auth_service.create_access_token({"sub": str(user.id)})
    new_refresh = auth_service.create_refresh_token({"sub": str(user.id)})
    return Token(access_token=new_access, refresh_token=new_refresh)


@router.post("/admin-login", response_model=Token)
async def admin_login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    """Admin login — only allows users with is_admin=True."""
    if not data.email and not data.phone and not data.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请填写邮箱、手机号或用户名",
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
            detail="用户名或密码错误",
        )

    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该账号没有管理员权限",
        )

    access_token = auth_service.create_access_token({"sub": str(user.id)})
    refresh_token = auth_service.create_refresh_token({"sub": str(user.id)})

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
    )


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Decode JWT and return current user."""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录或登录已过期",
        )
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录或登录已过期",
        )
    payload = auth_service.decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录已过期，请重新登录",
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录凭证无效",
        )
    result = await db.execute(
        select(User).where(User.id == uuid.UUID(user_id))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
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


@router.put("/me", response_model=UserOut)
async def update_me(
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Update current user profile (nickname / bio / avatar)."""
    result = await db.execute(
        select(User).where(User.id == uuid.UUID(current_user.id))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if data.nickname is not None:
        user.nickname = data.nickname
    if data.bio is not None:
        user.bio = data.bio
    if data.avatar_url is not None:
        user.avatar_url = data.avatar_url

    await db.commit()
    await db.refresh(user)
    return _user_to_out(user)


@router.post("/change-password")
async def change_password(
    data: ChangePassword,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """修改密码：验证旧密码 → 更新新密码哈希。"""
    result = await db.execute(
        select(User).where(User.id == uuid.UUID(current_user.id))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if not user.password_hash:
        raise HTTPException(status_code=400, detail="该账号未设置密码，无法修改")
    if not auth_service.verify_password(data.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="当前密码不正确")
    if data.old_password == data.new_password:
        raise HTTPException(status_code=400, detail="新密码不能与当前密码相同")

    user.password_hash = auth_service.hash_password(data.new_password)
    await db.commit()
    return {"message": "密码已更新"}
