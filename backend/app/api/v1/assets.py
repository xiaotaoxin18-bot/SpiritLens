"""User assets API — personal creation library."""

import uuid
import json as json_lib
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, or_
from app.core.database import get_db
from app.schemas.auth import UserOut
from app.api.v1.auth import get_current_user
from app.models.creation import Favorite
from datetime import datetime
from app.services.redis_helper import get_redis

logger = logging.getLogger(__name__)


class AssetCreate(BaseModel):
    title: str = Field(default="未命名作品", max_length=255)
    type: str = Field(default="image", pattern="^(image|video)$")
    media_url: Optional[str] = None
    cover_url: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    prompt: Optional[str] = None


router = APIRouter(prefix="/user", tags=["user"])


@router.post("/assets", status_code=status.HTTP_201_CREATED)
async def create_asset(
    data: AssetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Save an image/video to the user's asset library."""
    uid = str(current_user.id)
    now = datetime.utcnow()

    await db.execute(
        text("""
            INSERT INTO creations (id, user_id, type, title, prompt, media_url, thumbnail_url,
                                   width, height, status, is_public, created_at, updated_at, params)
            VALUES (:id, :uid, CAST(:ctype AS creationtype), :title, :prompt, :media_url, :thumbnail_url,
                    :width, :height, 'completed'::creationstatus, false, :now, :now, '{}'::jsonb)
        """),
        {
            "id": str(uuid.uuid4()),
            "uid": uid,
            "ctype": data.type.upper() if data.type.upper() in ("IMAGE", "VIDEO") else "IMAGE",
            "title": data.title,
            "prompt": data.prompt or "",
            "media_url": data.media_url or data.cover_url,
            "thumbnail_url": data.cover_url,
            "width": data.width,
            "height": data.height,
            "now": now,
        },
    )
    await db.commit()
    return {"ok": True}


class BatchPublish(BaseModel):
    ids: list[str]


@router.post("/assets/batch/publish", status_code=status.HTTP_201_CREATED)
async def batch_publish(
    data: BatchPublish,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Publish multiple assets to the community."""
    uid = str(current_user.id)
    published = 0
    now = datetime.utcnow()
    for aid in data.ids:
        row = await db.execute(
            text("SELECT prompt, media_url, thumbnail_url, width, height, params FROM creations WHERE id = CAST(:aid AS uuid) AND user_id = :uid"),
            {"aid": aid, "uid": uid},
        )
        asset = row.one_or_none()
        if not asset:
            continue

        # Try to get real image URL from Redis (params.task_id)
        cover = asset.media_url or asset.thumbnail_url
        if not cover and asset.params:
            task_id = asset.params.get("task_id")
            if task_id:
                try:
                    rr = get_redis(db=1)
                    raw = rr.get(f"spiritlens:result:{task_id}")
                    if raw:
                        res = json_lib.loads(raw)
                        urls = res.get("image_urls", []) or ([res.get("video_url")] if res.get("video_url") else [])
                        if urls:
                            cover = urls[0]
                    rr.close()
                except Exception:
                    pass

        await db.execute(
            text("""
                INSERT INTO posts (id, user_id, creation_id, title, description, cover_url, cover_width, cover_height,
                               view_count, like_count, comment_count, is_featured, created_at, updated_at)
                VALUES (:id, :uid, :cid, :title, :desc, :cover, :cw, :ch,
                        0, 0, 0, false, :now, :now)
            """),
            {
                "id": str(uuid.uuid4()),
                "uid": uid,
                "cid": uuid.UUID(aid),
                "title": (asset.prompt or "未命名作品")[:100],
                "desc": "",
                "cover": cover,
                "cw": asset.width,
                "ch": asset.height,
                "now": now,
            },
        )
        published += 1
    await db.commit()
    return {"published": published}


@router.delete("/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Delete a single asset from the user's library."""
    uid = str(current_user.id)
    result = await db.execute(
        text("DELETE FROM creations WHERE id = CAST(:aid AS uuid) AND user_id = :uid"),
        {"aid": asset_id, "uid": uid},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Asset not found")
    await db.commit()


@router.get("/assets/favorites")
async def list_favorites(
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """List current user's favorited creations."""
    uid = str(current_user.id)
    offset = (page - 1) * page_size

    count = await db.execute(
        text("SELECT COUNT(*) FROM favorites WHERE user_id = :uid"),
        {"uid": uid},
    )
    total = count.scalar() or 0

    rows = await db.execute(
        text("""
            SELECT c.id, c.type, c.status, c.media_url, c.thumbnail_url,
                   c.prompt, c.width, c.height, c.params, c.created_at
            FROM creations c
            INNER JOIN favorites f ON f.creation_id = c.id AND f.user_id = :uid
            ORDER BY f.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"uid": uid, "limit": page_size, "offset": offset},
    )

    items = []
    for r in rows:
        image_urls = []
        task_id = None
        media_url = r.media_url  # local copy (Row is immutable)
        status_str = r.status

        if r.params:
            image_urls = r.params.get("image_urls", [])
            task_id = r.params.get("task_id")

        # Redis fallback + DB persistence for favorited items too
        if (not image_urls or status_str == "processing") and task_id:
            try:
                rr = get_redis(db=1)
                raw = rr.get(f"spiritlens:result:{task_id}")
                if raw:
                    res = json_lib.loads(raw)
                    if res.get("image_urls"):
                        image_urls = res["image_urls"]
                    if res.get("video_url"):
                        media_url = media_url or res["video_url"]

                    # Persist to DB so it survives Redis restart/expiry
                    if image_urls:
                        first_url = image_urls[0]
                        new_params = dict(r.params) if r.params else {}
                        new_params["image_urls"] = image_urls
                        await db.execute(
                            text("""
                                UPDATE creations
                                SET status = 'completed',
                                    media_url = :media,
                                    params = CAST(:params AS jsonb),
                                    updated_at = :now
                                WHERE id = CAST(:aid AS uuid)
                            """),
                            {
                                "media": first_url,
                                "params": json_lib.dumps(new_params),
                                "now": datetime.utcnow(),
                                "aid": str(r.id),
                            },
                        )
                        await db.commit()
                        status_str = "completed"
                        logger.info("Persisted Redis result to DB (favorites): task=%s asset=%s", task_id, r.id)
                    elif media_url:
                        # Video case — only media_url was in the Redis result
                        new_params = dict(r.params) if r.params else {}
                        await db.execute(
                            text("""
                                UPDATE creations
                                SET status = 'completed',
                                    media_url = :media,
                                    params = CAST(:params AS jsonb),
                                    updated_at = :now
                                WHERE id = CAST(:aid AS uuid)
                            """),
                            {
                                "media": media_url,
                                "params": json_lib.dumps(new_params),
                                "now": datetime.utcnow(),
                                "aid": str(r.id),
                            },
                        )
                        await db.commit()
                        status_str = "completed"
                        logger.info("Persisted Redis video to DB (favorites): task=%s asset=%s", task_id, r.id)
                rr.close()
            except Exception:
                pass

        items.append({
            "id": str(r.id),
            "type": (r.type or "").lower(),
            "status": status_str,
            "media_url": media_url,
            "thumbnail_url": r.thumbnail_url,
            "prompt": r.prompt or "",
            "width": r.width,
            "height": r.height,
            "image_urls": image_urls or ([media_url] if media_url else []),
            "is_favorited": True,
            "created_at": r.created_at.isoformat() if r.created_at else "",
        })

    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.post("/assets/{asset_id}/favorite")
async def toggle_favorite(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Toggle favorite status for an asset."""
    uid = uuid.UUID(current_user.id)
    cid = uuid.UUID(asset_id)

    # Check asset exists
    result = await db.execute(
        text("SELECT id FROM creations WHERE id = CAST(:aid AS uuid)"),
        {"aid": asset_id},
    )
    if not result.one_or_none():
        raise HTTPException(status_code=404, detail="Asset not found")

    # Check if already favorited
    existing = await db.execute(
        text("SELECT id FROM favorites WHERE user_id = :uid AND creation_id = :cid"),
        {"uid": str(uid), "cid": asset_id},
    )
    fav = existing.one_or_none()

    if fav:
        await db.execute(
            text("DELETE FROM favorites WHERE id = CAST(:fid AS uuid)"),
            {"fid": str(fav.id)},
        )
        await db.commit()
        return {"favorited": False}
    else:
        await db.execute(
            text("""
                INSERT INTO favorites (id, user_id, creation_id, created_at)
                VALUES (:id, :uid, :cid, :now)
            """),
            {"id": str(uuid.uuid4()), "uid": str(uid), "cid": asset_id, "now": datetime.utcnow()},
        )
        await db.commit()
        return {"favorited": True}


@router.get("/assets")
async def list_assets(
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """List current user's creations (personal asset library)."""
    uid = str(current_user.id)  # uuid hex string
    offset = (page - 1) * page_size

    count = await db.execute(
        text("SELECT COUNT(*) FROM creations WHERE user_id = :uid"),
        {"uid": uid},
    )
    total = count.scalar() or 0

    rows = await db.execute(
        text("""
            SELECT c.id, c.type, c.status, c.media_url, c.thumbnail_url,
                   c.prompt, c.width, c.height, c.params, c.created_at,
                   CASE WHEN f.id IS NOT NULL THEN true ELSE false END AS is_favorited
            FROM creations c
            LEFT JOIN favorites f ON f.creation_id = c.id AND f.user_id = :uid
            WHERE c.user_id = :uid
            ORDER BY c.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"uid": uid, "limit": page_size, "offset": offset},
    )

    items = []
    for r in rows:
        task_id = None
        image_urls = []
        media_url = r.media_url  # local copy (Row is immutable)
        status_str = r.status

        if r.params:
            task_id = r.params.get("task_id")
            image_urls = r.params.get("image_urls", [])

        # If not yet completed, try Redis fallback and persist to DB
        if (not image_urls or status_str == "processing") and task_id:
            try:
                rr = get_redis(db=1)
                raw = rr.get(f"spiritlens:result:{task_id}")
                if raw:
                    res = json_lib.loads(raw)
                    if res.get("image_urls"):
                        image_urls = res["image_urls"]
                    if res.get("video_url"):
                        media_url = media_url or res["video_url"]

                    # Persist to DB so it survives Redis restart/expiry
                    if image_urls:
                        first_url = image_urls[0]
                        new_params = dict(r.params) if r.params else {}
                        new_params["image_urls"] = image_urls
                        await db.execute(
                            text("""
                                UPDATE creations
                                SET status = 'completed',
                                    media_url = :media,
                                    params = CAST(:params AS jsonb),
                                    updated_at = :now
                                WHERE id = CAST(:aid AS uuid)
                            """),
                            {
                                "media": first_url,
                                "params": json_lib.dumps(new_params),
                                "now": datetime.utcnow(),
                                "aid": str(r.id),
                            },
                        )
                        await db.commit()
                        status_str = "completed"
                        logger.info("Persisted Redis result to DB: task=%s asset=%s", task_id, r.id)
                    elif media_url:
                        # Video case — only media_url was in the Redis result
                        new_params = dict(r.params) if r.params else {}
                        await db.execute(
                            text("""
                                UPDATE creations
                                SET status = 'completed',
                                    media_url = :media,
                                    params = CAST(:params AS jsonb),
                                    updated_at = :now
                                WHERE id = CAST(:aid AS uuid)
                            """),
                            {
                                "media": media_url,
                                "params": json_lib.dumps(new_params),
                                "now": datetime.utcnow(),
                                "aid": str(r.id),
                            },
                        )
                        await db.commit()
                        status_str = "completed"
                        logger.info("Persisted Redis video to DB: task=%s asset=%s", task_id, r.id)
                rr.close()
            except Exception:
                pass

        items.append({
            "id": str(r.id),
            "type": (r.type or "").lower(),
            "status": status_str,
            "media_url": media_url,
            "thumbnail_url": r.thumbnail_url,
            "prompt": r.prompt or "",
            "width": r.width,
            "height": r.height,
            "task_id": task_id,
            "image_urls": image_urls or ([media_url] if media_url else []),
            "is_favorited": r.is_favorited,
            "created_at": r.created_at.isoformat() if r.created_at else "",
        })

    return {"total": total, "page": page, "page_size": page_size, "items": items}
