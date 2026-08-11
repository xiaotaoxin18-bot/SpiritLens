"""Project schemas."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    cover_url: Optional[str] = None
    aspect_ratio: Optional[str] = Field(default="16:9")


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    cover_url: Optional[str] = None
    aspect_ratio: Optional[str] = None
    status: Optional[str] = None


class ProjectOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    cover_url: Optional[str] = None
    aspect_ratio: Optional[str] = None
    status: str
    user_id: str
    user_nickname: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProjectList(BaseModel):
    total: int
    page: int
    page_size: int
    projects: list[ProjectOut]


class AddMemberRequest(BaseModel):
    user_id: str
    role: str = "editor"
