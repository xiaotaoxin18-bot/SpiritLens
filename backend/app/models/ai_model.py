"""AiModel model for managing AI model configurations."""

import uuid
from datetime import datetime
from sqlalchemy import Uuid, String, Integer, Boolean, DateTime, JSON, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
import enum


class ModelType(str, enum.Enum):
    IMAGE = "image"
    VIDEO = "video"
    TEXT = "text"


class AiModel(Base):
    __tablename__ = "ai_models"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), index=True)
    vendor: Mapped[str] = mapped_column(String(100))
    type: Mapped[ModelType] = mapped_column(SAEnum(ModelType))
    api_endpoint: Mapped[str | None] = mapped_column(String(500))
    api_key: Mapped[str | None] = mapped_column(String(500))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    cost_per_unit: Mapped[int] = mapped_column(Integer, default=1)
    params: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def __repr__(self):
        return f"<AiModel {self.name} ({self.type.value})>"
