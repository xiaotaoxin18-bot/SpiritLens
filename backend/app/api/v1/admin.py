"""Admin API routes."""

import uuid
from datetime import datetime, timezone, timedelta, date as date_type
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Date
from app.core.database import get_db
from app.core.config import get_settings as get_app_settings
from app.schemas.auth import UserOut
from app.services import auth as auth_service
from app.models.user import User
from app.models.creation import Creation
from app.models.ai_model import AiModel, ModelType
from pydantic import BaseModel, Field
import httpx
import redis as sync_redis


def _get_redis():
    """Get sync Redis connection using configured REDIS_URL (always DB 1 to match auth.py)."""
    try:
        from app.core.config import get_settings
        cfg = get_settings()
        url = cfg.REDIS_URL or "redis://redis:6379/0"
        parts = url.replace("redis://", "").split("@")
        host_port = parts[-1].split("/")[0]
        host = host_port.split(":")[0]
        port = int(host_port.split(":")[1]) if ":" in host_port else 6379
        return sync_redis.Redis(host=host, port=port, db=1, decode_responses=True)
    except Exception:
        return sync_redis.Redis(host="redis", port=6379, db=1, decode_responses=True)

router = APIRouter(prefix="/admin", tags=["admin"])


def _iso_cst(ts) -> str | None:
    """naive DB datetime (stored as UTC) → ISO with +00:00.

    浏览器 new Date("...+00:00") 会自动转本地时区（东八区），
    否则无时区字符串会被按本地时间解析，显示差 8 小时。
    """
    if ts is None:
        return None
    return ts.replace(tzinfo=timezone.utc).isoformat()


async def require_admin(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Dependency: verify the request comes from an admin user."""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录或登录已过期",
        )
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
    if not user or not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


@router.get("/dashboard")
async def dashboard(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Dashboard statistics."""
    # 东八区「今天」0 点对应的 UTC 时刻（DB 存 UTC naive）
    cst_now = datetime.utcnow() + timedelta(hours=8)
    today_start = cst_now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(hours=8)

    # Total users
    total_users_result = await db.execute(select(func.count(User.id)))
    total_users = total_users_result.scalar() or 0

    # Today's new users
    today_users_result = await db.execute(
        select(func.count(User.id)).where(User.created_at >= today_start)
    )
    today_users = today_users_result.scalar() or 0

    # Total creations
    total_creations_result = await db.execute(select(func.count(Creation.id)))
    total_creations = total_creations_result.scalar() or 0

    # Today's creations
    today_creations_result = await db.execute(
        select(func.count(Creation.id)).where(Creation.created_at >= today_start)
    )
    today_creations = today_creations_result.scalar() or 0

    # Recent users (last 5)
    recent_result = await db.execute(
        select(User).order_by(User.created_at.desc()).limit(5)
    )
    recent_users = recent_result.scalars().all()

    # Model count — query actual enabled models from DB
    model_count_result = await db.execute(select(func.count(AiModel.id)))
    model_count = model_count_result.scalar() or 0

    return {
        "total_users": total_users,
        "today_users": today_users,
        "total_creations": total_creations,
        "today_creations": today_creations,
        "model_count": model_count,
        "recent_users": [
            {
                "id": str(u.id),
                "username": u.username,
                "nickname": u.nickname,
                "is_admin": u.is_admin,
                "created_at": _iso_cst(u.created_at),
            }
            for u in recent_users
        ],
    }


@router.get("/dashboard/trends")
async def dashboard_trends(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Daily creation trends for the last N days, grouped by type."""
    since = datetime.utcnow() - timedelta(days=days)

    rows = await db.execute(
        select(
            cast(Creation.created_at, Date).label("day"),
            Creation.type,
            func.count(Creation.id).label("count"),
        )
        .where(Creation.created_at >= since)
        .group_by("day", Creation.type)
        .order_by("day")
    )
    raw = rows.all()

    # Build a map: (date_str, type) -> count
    lookup: dict[tuple[str, str], int] = {}
    all_types: set[str] = set()
    for row in raw:
        key = (row.day.isoformat(), row.type.value)
        lookup[key] = row.count
        all_types.add(row.type.value)

    # Fill in all dates, zero-fill missing
    type_order = sorted(all_types) if all_types else ["image", "video"]
    today = datetime.utcnow().date()
    dates: list[str] = []
    series: dict[str, list[int]] = {t: [] for t in type_order}

    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        ds = d.isoformat()
        dates.append(ds)
        for t in type_order:
            series[t].append(lookup.get((ds, t), 0))

    return {
        "dates": dates,
        "series": series,
    }


@router.get("/users")
async def list_users(
    q: str = "",
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all users with optional search."""
    query = select(User).order_by(User.created_at.desc())

    if q:
        like = f"%{q}%"
        query = query.where(
            User.nickname.ilike(like)
            | User.username.ilike(like)
            | User.email.ilike(like)
        )

    # Count total
    count_query = select(User.id).select_from(User)
    if q:
        like = f"%{q}%"
        count_query = count_query.where(
            User.nickname.ilike(like)
            | User.username.ilike(like)
            | User.email.ilike(like)
        )
    total_result = await db.execute(count_query)
    total = len(total_result.fetchall())

    # Paginate
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "users": [
            {
                "id": str(u.id),
                "username": u.username,
                "nickname": u.nickname,
                "email": u.email,
                "avatar_url": u.avatar_url,
                "bio": u.bio,
                "is_admin": u.is_admin,
                "status": u.status.value if u.status else "active",
                "created_at": _iso_cst(u.created_at),
            }
            for u in users
        ],
    }


@router.put("/users/{user_id}/toggle-admin")
async def toggle_admin(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Toggle a user's admin status."""
    result = await db.execute(
        select(User).where(User.id == uuid.UUID(user_id))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot change your own admin status")
    user.is_admin = not user.is_admin
    await db.flush()
    return {"is_admin": user.is_admin}


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete a user by ID (cascades their projects and all related data)."""
    result = await db.execute(
        select(User).where(User.id == uuid.UUID(user_id))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    # 注意：不能直接 db.delete(user) —— ORM 会把子表外键置 NULL（UPDATE projects
    # SET user_id=NULL），projects.user_id 是 NOT NULL 约束 → IntegrityError 500。
    # 先 DB 级删除用户的项目（CASCADE 链：projects → seasons/episodes/characters/
    # scenes/props/members → storyboards），再删用户（creations/posts/favorites
    # /comments/likes/templates 等 CASCADE；episodes.assignee_id SET NULL 可空）。
    from sqlalchemy import text as _text
    await db.execute(_text("DELETE FROM projects WHERE user_id = :uid"), {"uid": user.id})
    await db.delete(user)
    await db.flush()


class AdminResetPasswordInput(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=128)


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    data: AdminResetPasswordInput,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin resets a user's password (temporary fallback until SMS/email reset ships)."""
    result = await db.execute(
        select(User).where(User.id == uuid.UUID(user_id))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot reset your own password")
    user.password_hash = auth_service.hash_password(data.new_password)
    await db.flush()
    return {"reset": True, "user_id": str(user.id)}


# ─── Model Management ─────────────────────────────────────────────


class TestConnectionInput(BaseModel):
    api_endpoint: str


@router.post("/models/test-connection")
async def test_model_connection(
    data: TestConnectionInput,
    admin: User = Depends(require_admin),
):
    """Test if an API endpoint is reachable."""
    if not data.api_endpoint:
        raise HTTPException(status_code=400, detail="API Endpoint is required")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(data.api_endpoint)
            return {
                "success": True,
                "status_code": resp.status_code,
                "detail": f"连接成功，状态码: {resp.status_code}",
            }
    except httpx.TimeoutException:
        return {"success": False, "status_code": None, "detail": "连接超时（10秒）"}
    except httpx.RequestError as e:
        return {"success": False, "status_code": None, "detail": f"连接失败: {e}"}
    except Exception as e:
        return {"success": False, "status_code": None, "detail": f"未知错误: {e}"}


@router.get("/models")
async def list_models(
    type: str = "",
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all AI models, optionally filtered by type."""
    query = select(AiModel).order_by(AiModel.sort_order, AiModel.name)
    if type in ("image", "video"):
        query = query.where(AiModel.type == ModelType(type))
    result = await db.execute(query)
    models = result.scalars().all()
    return {
        "models": [
            {
                "id": str(m.id),
                "name": m.name,
                "vendor": m.vendor,
                "type": m.type.value,
                "api_endpoint": m.api_endpoint,
                "api_key": m.api_key,
                "is_enabled": m.is_enabled,
                "sort_order": m.sort_order,
                "cost_per_unit": m.cost_per_unit,
                "params": m.params,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in models
        ],
    }


@router.post("/models", status_code=status.HTTP_201_CREATED)
async def create_model(
    data: dict,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Create a new AI model."""
    model = AiModel(
        name=data["name"],
        vendor=data.get("vendor", ""),
        type=ModelType(data["type"]),
        api_endpoint=data.get("api_endpoint"),
        api_key=data.get("api_key"),
        is_enabled=data.get("is_enabled", True),
        sort_order=data.get("sort_order", 0),
        cost_per_unit=data.get("cost_per_unit", 1),
        params=data.get("params"),
    )
    db.add(model)
    await db.flush()
    return {"id": str(model.id)}


@router.put("/models/{model_id}")
async def update_model(
    model_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update an AI model."""
    result = await db.execute(
        select(AiModel).where(AiModel.id == uuid.UUID(model_id))
    )
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    if "name" in data:
        model.name = data["name"]
    if "vendor" in data:
        model.vendor = data["vendor"]
    if "type" in data:
        model.type = ModelType(data["type"])
    if "api_endpoint" in data:
        model.api_endpoint = data.get("api_endpoint")
    if "api_key" in data:
        model.api_key = data.get("api_key")
    if "is_enabled" in data:
        model.is_enabled = data["is_enabled"]
    if "sort_order" in data:
        model.sort_order = data["sort_order"]
    if "cost_per_unit" in data:
        model.cost_per_unit = data["cost_per_unit"]
    if "params" in data:
        model.params = data["params"]
    await db.flush()
    return {"id": str(model.id)}


@router.delete("/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete an AI model."""
    result = await db.execute(
        select(AiModel).where(AiModel.id == uuid.UUID(model_id))
    )
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    await db.delete(model)
    await db.flush()


@router.put("/models/{model_id}/toggle")
async def toggle_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Toggle model enabled/disabled."""
    result = await db.execute(
        select(AiModel).where(AiModel.id == uuid.UUID(model_id))
    )
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    model.is_enabled = not model.is_enabled
    await db.flush()
    return {"is_enabled": model.is_enabled}


# ─── Usage Logs ─────────────────────────────────────────────


@router.get("/logs")
async def list_logs(
    page: int = 1,
    page_size: int = 20,
    type: str = "",
    status: str = "",
    q: str = "",
    date: str = "",
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List creation logs with pagination and optional filters."""
    # Base query with user join (LEFT JOIN so records survive user deletion)
    query = (
        select(Creation, User.nickname, User.username)
        .outerjoin(User, Creation.user_id == User.id)
        .order_by(Creation.created_at.desc())
    )

    # Filters
    if type in ("image", "video"):
        query = query.where(Creation.type == type)
    if status in ("pending", "processing", "completed", "failed"):
        query = query.where(Creation.status == status)
    if q:
        like = f"%{q}%"
        query = query.where(User.nickname.ilike(like) | User.username.ilike(like))
    if date:
        try:
            # 前端选的是东八区日期，DB 存 UTC naive —— 偏移 8 小时对齐
            date_obj = date_type.fromisoformat(date) - timedelta(hours=8)
            next_day = date_obj + timedelta(days=1)
            query = query.where(Creation.created_at.between(date_obj, next_day))
        except ValueError:
            pass

    # Count total (without join for efficiency)
    count_query = select(func.count(Creation.id))
    if type in ("image", "video"):
        count_query = count_query.where(Creation.type == type)
    if status in ("pending", "processing", "completed", "failed"):
        count_query = count_query.where(Creation.status == status)
    if date:
        try:
            # 东八区日期 → UTC naive 区间（偏移 8 小时对齐）
            date_obj = date_type.fromisoformat(date) - timedelta(hours=8)
            next_day = date_obj + timedelta(days=1)
            count_query = count_query.where(Creation.created_at.between(date_obj, next_day))
        except ValueError:
            pass
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Paginate
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    result = await db.execute(query)
    rows = result.all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "logs": [
            {
                "id": str(row.Creation.id),
                "user_id": str(row.Creation.user_id),
                "user_nickname": row.nickname,
                "type": row.Creation.type.value,
                "title": row.Creation.title,
                "prompt": row.Creation.prompt,
                "status": row.Creation.status.value,
                "model_id": (row.Creation.params or {}).get("model_id", ""),
                "task_id": (row.Creation.params or {}).get("task_id", ""),
                "error_message": row.Creation.error_message,
                "created_at": _iso_cst(row.Creation.created_at),
            }
            for row in rows
        ],
    }


# ─── System Settings ────────────────────────────────────────

_SETTINGS_REDIS_KEY = "spiritlens:settings"


class SettingsUpdate(BaseModel):
    token_expire_minutes: int | None = None
    refresh_token_expire_days: int | None = None


@router.get("/settings")
async def get_settings(
    admin: User = Depends(require_admin),
):
    """Return system configuration (safe fields only)."""
    cfg = get_app_settings()
    result = {
        "app_name": cfg.APP_NAME,
        "app_version": cfg.APP_VERSION,
        "environment": cfg.ENVIRONMENT,
        "debug": cfg.DEBUG,
        "cors_origins": cfg.CORS_ORIGINS,
        "public_url": cfg.PUBLIC_URL,
        "token_expire_minutes": cfg.ACCESS_TOKEN_EXPIRE_MINUTES,
        "refresh_token_expire_days": cfg.REFRESH_TOKEN_EXPIRE_DAYS,
        "upload_max_size_mb": cfg.MAX_UPLOAD_SIZE // (1024 * 1024),
        "xinghe_configured": bool(cfg.XINGHE_API_KEY),
        "tianyi_configured": bool(cfg.TIANYI_API_KEY),
        "stability_configured": bool(cfg.STABILITY_API_KEY),
        "bfl_configured": bool(cfg.BFL_API_KEY),
    }
    # Merge Redis overrides
    r = _get_redis()
    if r:
        try:
            redis_token = r.hget(_SETTINGS_REDIS_KEY, "token_expire_minutes")
            redis_refresh = r.hget(_SETTINGS_REDIS_KEY, "refresh_token_expire_days")
            if redis_token:
                result["token_expire_minutes"] = int(redis_token)
            if redis_refresh:
                result["refresh_token_expire_days"] = int(redis_refresh)
        except Exception:
            pass
        finally:
            r.close()
    return result


@router.put("/settings")
async def update_settings(
    data: SettingsUpdate,
    admin: User = Depends(require_admin),
):
    """Update system settings (saved to Redis, takes effect immediately)."""
    r = _get_redis()
    if not r:
        raise HTTPException(status_code=500, detail="Redis 不可用，设置无法保存")
    try:
        mapping = {}
        if data.token_expire_minutes is not None:
            mapping["token_expire_minutes"] = str(data.token_expire_minutes)
        if data.refresh_token_expire_days is not None:
            mapping["refresh_token_expire_days"] = str(data.refresh_token_expire_days)
        if mapping:
            r.hset(_SETTINGS_REDIS_KEY, mapping=mapping)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存设置失败: {e}")
    finally:
        r.close()

    # Return updated config
    cfg = get_app_settings()
    result = {
        "app_name": cfg.APP_NAME,
        "token_expire_minutes": data.token_expire_minutes or cfg.ACCESS_TOKEN_EXPIRE_MINUTES,
        "refresh_token_expire_days": data.refresh_token_expire_days or cfg.REFRESH_TOKEN_EXPIRE_DAYS,
    }
    return result
