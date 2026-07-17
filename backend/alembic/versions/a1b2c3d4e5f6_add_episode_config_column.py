"""Add config JSONB column to episodes table.

Revision ID: a1b2c3d4e5f6
Revises: bd9e3f1a2c4d
Create Date: 2026-07-07 11:00:00
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "bd9e3f1a2c4d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("episodes", sa.Column("config", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("episodes", "config")
