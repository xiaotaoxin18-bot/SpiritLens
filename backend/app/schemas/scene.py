"""Scene schemas."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class SceneCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    image_url: Optional[str] = None
    prompt: Optional[str] = None


class SceneUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    image_url: Optional[str] = None
    prompt: Optional[str] = None


class SceneOut(BaseModel):
    id: str
    project_id: str
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    prompt: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SceneList(BaseModel):
    total: int
    scenes: list[SceneOut]
