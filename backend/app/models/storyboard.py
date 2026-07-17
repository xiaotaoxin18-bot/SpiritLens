"""Storyboard (分镜) model for episode script breakdown."""

import uuid
from datetime import datetime
from sqlalchemy import Uuid, String, Text, Integer, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
import enum


class ShotType(str, enum.Enum):
    WIDE = "wide"               # 全景
    FULL = "full"               # 全景
    MEDIUM = "medium"           # 中景
    CLOSEUP = "closeup"         # 近景
    EXTREME_CLOSEUP = "extreme_closeup"  # 特写


class Storyboard(Base):
    __tablename__ = "storyboards"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), primary_key=True, default=uuid.uuid4
    )
    episode_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), ForeignKey("episodes.id", ondelete="CASCADE"), index=True
    )
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)

    # Core content from AI breakdown
    scene_description: Mapped[str | None] = mapped_column(Text)
    action_description: Mapped[str | None] = mapped_column(Text)
    shot_type: Mapped[ShotType | None] = mapped_column(SAEnum(ShotType))
    dialogue: Mapped[str | None] = mapped_column(Text, comment="对白/台词")

    # Character and prop references (JSON array of names)
    characters: Mapped[str | None] = mapped_column(
        Text, comment='JSON array of character names, e.g. ["张三","李四"]'
    )
    props: Mapped[str | None] = mapped_column(
        Text, comment='JSON array of prop names, e.g. ["剑","酒杯"]'
    )

    # Generated assets
    generated_scene_image_url: Mapped[str | None] = mapped_column(String(500))
    generated_character_image_url: Mapped[str | None] = mapped_column(String(500))
    generated_video_url: Mapped[str | None] = mapped_column(String(500))

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def __repr__(self):
        return f"<Storyboard #{self.sequence_number}>"
