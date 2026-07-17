"""Community API routes — posts, likes, comments."""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field
from typing import Optional
from app.core.database import get_db
from app.models.community import Post, Like, Comment
from app.models.creation import Creation
from app.models.user import User
from app.schemas.auth import UserOut
from app.api.v1.auth import get_current_user, get_current_user_optional

router = APIRouter(prefix="/community", tags=["community"])


class PostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    cover_url: Optional[str] = None
    cover_width: Optional[int] = None
    cover_height: Optional[int] = None
    creation_id: Optional[str] = None  # Link to an existing creation


class PostOut(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    cover_url: Optional[str] = None
    view_count: int
    like_count: int
    comment_count: int
    is_featured: bool
    user_id: str
    user_nickname: str
    user_avatar: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True


@router.get("/posts")
async def list_posts(
    page: int = 1,
    page_size: int = 20,
    sort: str = "latest",  # latest | popular | featured
    db: AsyncSession = Depends(get_db),
):
    """List community posts with pagination + sorting."""
    query = (
        select(Post)
        .options(selectinload(Post.user))
        .order_by(
            desc(Post.like_count) if sort == "popular"
            else desc(Post.is_featured) if sort == "featured"
            else desc(Post.created_at)
        )
    )
    total_q = select(func.count(Post.id))
    total = (await db.execute(total_q)).scalar() or 0

    rows = (
        (await db.execute(query.offset((page - 1) * page_size).limit(page_size)))
        .scalars()
        .all()
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "posts": [
            {
                "id": str(p.id),
                "title": p.title,
                "description": p.description,
                "cover_url": p.cover_url,
                "cover_width": p.cover_width,
                "cover_height": p.cover_height,
                "view_count": p.view_count,
                "like_count": p.like_count,
                "comment_count": p.comment_count,
                "is_featured": p.is_featured,
                "user_id": str(p.user_id),
                "user_nickname": p.user.nickname if p.user else "未知",
                "user_avatar": p.user.avatar_url if p.user else None,
                "created_at": p.created_at.isoformat() if p.created_at else "",
            }
            for p in rows
        ],
    }


@router.get("/posts/{post_id}")
async def get_post(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Get a single post by ID."""
    result = await db.execute(
        select(Post)
        .options(selectinload(Post.user))
        .where(Post.id == uuid.UUID(post_id))
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Increment view count
    post.view_count += 1
    await db.flush()

    # Check if current user has liked
    liked = False
    if current_user:
        like_result = await db.execute(
            select(Like).where(
                Like.post_id == uuid.UUID(post_id),
                Like.user_id == uuid.UUID(current_user.id),
            )
        )
        liked = like_result.scalar_one_or_none() is not None

    return {
        "id": str(post.id),
        "title": post.title,
        "description": post.description,
        "cover_url": post.cover_url,
        "cover_width": post.cover_width,
        "cover_height": post.cover_height,
        "view_count": post.view_count,
        "like_count": post.like_count,
        "comment_count": post.comment_count,
        "is_featured": post.is_featured,
        "user_id": str(post.user_id),
        "user_nickname": post.user.nickname if post.user else "未知",
        "user_avatar": post.user.avatar_url if post.user else None,
        "liked": liked,
        "created_at": post.created_at.isoformat() if post.created_at else "",
    }


@router.get("/featured")
async def get_featured(db: AsyncSession = Depends(get_db)):
    """Featured works for the home page (top 8 by likes)."""
    rows = (
        await db.execute(
            select(Post)
            .options(selectinload(Post.user))
            .order_by(desc(Post.like_count))
            .limit(8)
        )
    ).scalars().all()
    return {
        "posts": [
            {
                "id": str(p.id),
                "title": p.title,
                "cover_url": p.cover_url,
                "cover_width": p.cover_width,
                "cover_height": p.cover_height,
                "like_count": p.like_count,
                "view_count": p.view_count,
                "user_nickname": p.user.nickname if p.user else "未知",
            }
            for p in rows
        ],
    }


@router.post("/posts", status_code=status.HTTP_201_CREATED)
async def create_post(
    data: PostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Publish a new post."""
    creation_id = uuid.UUID(data.creation_id) if data.creation_id else None
    if data.creation_id and creation_id:
        exists = await db.execute(
            select(Creation).where(Creation.id == creation_id)
        )
        if not exists.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Creation not found")

    post = Post(
        user_id=uuid.UUID(current_user.id),
        creation_id=creation_id,
        title=data.title,
        description=data.description,
        cover_url=data.cover_url,
        cover_width=data.cover_width,
        cover_height=data.cover_height,
    )
    db.add(post)
    await db.flush()
    return {"id": str(post.id)}


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Post).where(Post.id == uuid.UUID(post_id))
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    await db.delete(post)
    await db.flush()


@router.post("/posts/{post_id}/like")
async def toggle_like(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pid = uuid.UUID(post_id)
    existing = await db.execute(
        select(Like).where(Like.post_id == pid, Like.user_id == uuid.UUID(current_user.id))
    )
    like = existing.scalar_one_or_none()
    if like:
        await db.delete(like)
        await db.execute(
            select(Post).where(Post.id == pid)
        )
        post = (await db.execute(select(Post).where(Post.id == pid))).scalar_one()
        post.like_count = max(0, post.like_count - 1)
        await db.flush()
        return {"liked": False, "like_count": post.like_count}
    else:
        like = Like(post_id=pid, user_id=uuid.UUID(current_user.id))
        db.add(like)
        post = (await db.execute(select(Post).where(Post.id == pid))).scalar_one()
        post.like_count += 1
        await db.flush()
        return {"liked": True, "like_count": post.like_count}


@router.get("/posts/{post_id}/comments")
async def list_comments(
    post_id: str,
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Comment)
            .options(selectinload(Comment.user))
            .where(Comment.post_id == uuid.UUID(post_id))
            .order_by(Comment.created_at)
        )
    ).scalars().all()
    return {
        "comments": [
            {
                "id": str(c.id),
                "content": c.content,
                "user_id": str(c.user_id),
                "user_nickname": c.user.nickname if c.user else "未知",
                "user_avatar": c.user.avatar_url if c.user else None,
                "created_at": c.created_at.isoformat() if c.created_at else "",
            }
            for c in rows
        ],
    }


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)


@router.post("/posts/{post_id}/comments", status_code=status.HTTP_201_CREATED)
async def create_comment(
    post_id: str,
    data: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pid = uuid.UUID(post_id)
    comment = Comment(
        post_id=pid, user_id=uuid.UUID(current_user.id), content=data.content
    )
    db.add(comment)
    post = (await db.execute(select(Post).where(Post.id == pid))).scalar_one()
    post.comment_count += 1
    await db.flush()
    return {"id": str(comment.id)}


@router.delete("/posts/{post_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    post_id: str,
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a comment. Users can delete their own; admins can delete any."""
    result = await db.execute(
        select(Comment).where(
            Comment.id == uuid.UUID(comment_id),
            Comment.post_id == uuid.UUID(post_id),
        )
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if str(comment.user_id) != str(current_user.id) and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="只能删除自己的评论")
    await db.delete(comment)
    post = (await db.execute(select(Post).where(Post.id == uuid.UUID(post_id)))).scalar_one()
    post.comment_count = max(0, post.comment_count - 1)
    await db.flush()
