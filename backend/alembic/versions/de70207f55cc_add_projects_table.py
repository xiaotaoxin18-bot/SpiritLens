"""add_projects_table — create projects table

Revision ID: de70207f55cc
Revises: 1766596dbc97
Create Date: 2026-07-04 05:39:08.269717
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "de70207f55cc"
down_revision: Union[str, None] = "1766596dbc97"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("cover_url", sa.String(length=500), nullable=True),
        sa.Column("aspect_ratio", sa.String(length=10), nullable=True, server_default="16:9"),
        sa.Column(
            "status",
            sa.Enum("ACTIVE", "COMPLETED", name="projectstatus"),
            nullable=False,
            server_default="ACTIVE",
        ),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_projects_name"), "projects", ["name"])


def downgrade() -> None:
    op.drop_index(op.f("ix_projects_name"), table_name="projects")
    op.drop_table("projects")
    op.execute("DROP TYPE IF EXISTS projectstatus")
