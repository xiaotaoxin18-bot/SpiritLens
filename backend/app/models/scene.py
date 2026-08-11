"""Scene (场景) model for project management."""

import uuid
from datetime import datetime
from sqlalchemy import Uuid, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    prompt: Mapped[str | None] = mapped_column(
        Text, comment="AI 生成提示词，用于场景一致性", default=None
    )
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(), nullable=True, default=None,
        comment="变体组：相同 group_id 的属于同一组，null 表示主场景",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def __repr__(self):
        return f"<Scene {self.name}>"
