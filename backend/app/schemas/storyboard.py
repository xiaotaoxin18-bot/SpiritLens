"""Storyboard (分镜) schemas."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class StoryboardCreate(BaseModel):
    sequence_number: int = Field(..., ge=1, description="分镜序号")
    scene_description: Optional[str] = None
    action_description: Optional[str] = None
    shot_type: Optional[str] = None  # wide / full / medium / closeup / extreme_closeup
    dialogue: Optional[str] = None
    characters: Optional[str] = None  # JSON array
    props: Optional[str] = None  # JSON array


class StoryboardUpdate(BaseModel):
    sequence_number: Optional[int] = Field(None, ge=1)
    scene_description: Optional[str] = None
    action_description: Optional[str] = None
    shot_type: Optional[str] = None
    dialogue: Optional[str] = None
    characters: Optional[str] = None
    props: Optional[str] = None
    generated_scene_image_url: Optional[str] = None
    generated_character_image_url: Optional[str] = None
    generated_video_url: Optional[str] = None


class StoryboardOut(BaseModel):
    id: str
    episode_id: str
    sequence_number: int
    scene_description: Optional[str] = None
    action_description: Optional[str] = None
    shot_type: Optional[str] = None
    dialogue: Optional[str] = None
    characters: Optional[str] = None
    props: Optional[str] = None
    generated_scene_image_url: Optional[str] = None
    generated_character_image_url: Optional[str] = None
    generated_video_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class StoryboardList(BaseModel):
    total: int
    storyboards: list[StoryboardOut]
