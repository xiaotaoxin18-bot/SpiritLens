"""Season (季) schemas."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class SeasonCreate(BaseModel):
    title: str = Field(default="", max_length=200)
    sort_order: int = Field(default=0, ge=0)


class SeasonUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    sort_order: Optional[int] = Field(None, ge=0)


class SeasonOut(BaseModel):
    id: str
    project_id: str
    title: str
    sort_order: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SeasonList(BaseModel):
    total: int
    seasons: list[SeasonOut]
