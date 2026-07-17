"""Episode schemas."""

from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime


class EpisodeCreate(BaseModel):
    episode_number: int = Field(..., ge=1, description="集数编号")
    title: str = Field(default="", max_length=200, description="集数标题")
    script_content: Optional[str] = None
    cover_url: Optional[str] = None
    season_id: Optional[str] = None
    config: Optional[dict] = None


class EpisodeUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    episode_number: Optional[int] = Field(None, ge=1)
    status: Optional[str] = None
    script_content: Optional[str] = None
    cover_url: Optional[str] = None
    season_id: Optional[str] = None
    config: Optional[dict] = None


class EpisodeOut(BaseModel):
    id: str
    project_id: str
    season_id: Optional[str] = None
    episode_number: int
    title: str
    status: str
    script_content: Optional[str] = None
    config: Optional[Any] = None
    cover_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EpisodeList(BaseModel):
    total: int
    episodes: list[EpisodeOut]


class ImportNovelRequest(BaseModel):
    content: str = Field(..., min_length=1, description="整篇小说内容")
    auto_number: bool = Field(default=True, description="是否自动编号")


class ImportNovelResponse(BaseModel):
    total: int
    episodes: list[EpisodeOut]
