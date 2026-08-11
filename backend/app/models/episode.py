"""Episode (集数) model for project management."""

import uuid
from datetime import datetime
from sqlalchemy import Uuid, String, Text, Integer, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class EpisodeStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"


class Episode(Base):
    __tablename__ = "episodes"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    season_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(), ForeignKey("seasons.id", ondelete="SET NULL"), nullable=True, index=True
    )
    episode_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[EpisodeStatus] = mapped_column(
        SAEnum(EpisodeStatus), default=EpisodeStatus.DRAFT
    )
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True,
        comment="负责该集的用户"
    )
    script_content: Mapped[str | None] = mapped_column(Text)
    config: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=dict, comment="JSON config: duration, style, mode, aspect_ratio, etc.")
    cover_url: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def __repr__(self):
        return f"<Episode {self.episode_number}: {self.title}>"
