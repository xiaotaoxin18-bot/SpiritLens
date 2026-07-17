"""Character schemas."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class CharacterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    image_url: Optional[str] = None
    prompt: Optional[str] = None


class CharacterUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    image_url: Optional[str] = None
    prompt: Optional[str] = None


class CharacterOut(BaseModel):
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


class CharacterList(BaseModel):
    total: int
    characters: list[CharacterOut]
