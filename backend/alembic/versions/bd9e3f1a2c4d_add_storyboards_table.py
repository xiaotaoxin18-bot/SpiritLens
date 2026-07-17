"""add_storyboards_table — create storyboards (分镜) table

Revision ID: bd9e3f1a2c4d
Revises: de70207f55cc
Create Date: 2026-07-06 02:02:42.689
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "bd9e3f1a2c4d"
down_revision: Union[str, None] = "de70207f55cc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "storyboards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("episode_id", sa.Uuid(), nullable=False),
        sa.Column("sequence_number", sa.Integer(), nullable=False),
        sa.Column("scene_description", sa.Text(), nullable=True),
        sa.Column("action_description", sa.Text(), nullable=True),
        sa.Column(
            "shot_type",
            sa.Enum("WIDE", "FULL", "MEDIUM", "CLOSEUP", "EXTREME_CLOSEUP", name="shottype"),
            nullable=True,
        ),
        sa.Column("dialogue", sa.Text(), nullable=True, comment="对白/台词"),
        sa.Column("characters", sa.Text(), nullable=True, comment="JSON array of character names"),
        sa.Column("props", sa.Text(), nullable=True, comment="JSON array of prop names"),
        sa.Column("generated_scene_image_url", sa.String(500), nullable=True),
        sa.Column("generated_character_image_url", sa.String(500), nullable=True),
        sa.Column("generated_video_url", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["episode_id"], ["episodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_storyboards_episode_id"), "storyboards", ["episode_id"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_storyboards_episode_id"), table_name="storyboards")
    op.drop_table("storyboards")
    op.execute("DROP TYPE IF EXISTS shottype")
