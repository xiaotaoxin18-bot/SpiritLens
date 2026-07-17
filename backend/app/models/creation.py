"""Creation models for AI-generated content."""

import uuid
from datetime import datetime
from sqlalchemy import Uuid, String, Text, Integer, DateTime, ForeignKey, Enum as SAEnum, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class CreationType(str, enum.Enum):
    IMAGE = "image"
    VIDEO = "video"
    DIGITAL_HUMAN = "digital_human"
    CANVAS = "canvas"


class CreationStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Creation(Base):
    __tablename__ = "creations"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), ForeignKey("users.id", ondelete="CASCADE")
    )
    type: Mapped[CreationType] = mapped_column(SAEnum(CreationType))
    title: Mapped[str] = mapped_column(String(255), default="未命名作品")
    prompt: Mapped[str | None] = mapped_column(Text)
    negative_prompt: Mapped[str | None] = mapped_column(Text)
    media_url: Mapped[str | None] = mapped_column(String(500))
    thumbnail_url: Mapped[str | None] = mapped_column(String(500))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    params: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[CreationStatus] = mapped_column(
        SAEnum(CreationStatus), default=CreationStatus.PENDING
    )
    error_message: Mapped[str | None] = mapped_column(String(500))
    is_public: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    user = relationship("User", back_populates="creations")
    posts = relationship("Post", back_populates="creation", cascade="all, delete-orphan")
    favorites = relationship("Favorite", back_populates="creation", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Creation {self.title} ({self.type.value})>"


class Favorite(Base):
    __tablename__ = "favorites"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), ForeignKey("users.id", ondelete="CASCADE")
    )
    creation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), ForeignKey("creations.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User")
    creation = relationship("Creation", back_populates="favorites")

    def __repr__(self):
        return f"<Creation {self.title} ({self.type.value})>"
