"""add group_id to characters, scenes, props

Revision ID: 8a2b1c3d4e5f
Revises: 1766596dbc97
Create Date: 2026-07-29 10:30:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "8a2b1c3d4e5f"
down_revision: Union[str, None] = "f7g8h9i0j1k2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("characters", sa.Column("group_id", sa.Uuid(), nullable=True, comment="变体组：相同 group_id 的属于同一组，null 表示主角色"))
    op.add_column("scenes", sa.Column("group_id", sa.Uuid(), nullable=True, comment="变体组：相同 group_id 的属于同一组，null 表示主场景"))
    op.add_column("props", sa.Column("group_id", sa.Uuid(), nullable=True, comment="变体组：相同 group_id 的属于同一组，null 表示主道具"))


def downgrade() -> None:
    op.drop_column("props", "group_id")
    op.drop_column("scenes", "group_id")
    op.drop_column("characters", "group_id")
