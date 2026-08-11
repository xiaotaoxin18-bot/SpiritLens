"""add_project_members_and_assignee — multi-user collaboration support

- Creates project_members table
- Adds assignee_id column to episodes
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f7g8h9i0j1k2"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create project_members table
    op.create_table(
        "project_members",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "role",
            sa.Enum("OWNER", "EDITOR", "VIEWER", name="projectmemberrole"),
            nullable=False,
            server_default="EDITOR",
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_member"),
    )
    op.create_index(op.f("ix_project_members_project_id"), "project_members", ["project_id"])
    op.create_index(op.f("ix_project_members_user_id"), "project_members", ["user_id"])

    # Add assignee_id to episodes
    op.add_column(
        "episodes",
        sa.Column("assignee_id", sa.Uuid(), nullable=True),
    )
    op.create_index(op.f("ix_episodes_assignee_id"), "episodes", ["assignee_id"])
    op.create_foreign_key(
        "fk_episodes_assignee_id",
        "episodes", "users",
        ["assignee_id"], ["id"],
        ondelete="SET NULL",
    )

    # Auto-insert owner records for existing projects
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            INSERT INTO project_members (id, project_id, user_id, role, created_at)
            SELECT gen_random_uuid(), id, user_id, 'OWNER', NOW()
            FROM projects
            WHERE NOT EXISTS (
                SELECT 1 FROM project_members pm
                WHERE pm.project_id = projects.id AND pm.user_id = projects.user_id
            )
        """)
    )


def downgrade() -> None:
    op.drop_constraint("fk_episodes_assignee_id", "episodes", type_="foreignkey")
    op.drop_index(op.f("ix_episodes_assignee_id"), table_name="episodes")
    op.drop_column("episodes", "assignee_id")
    op.drop_index(op.f("ix_project_members_user_id"), table_name="project_members")
    op.drop_index(op.f("ix_project_members_project_id"), table_name="project_members")
    op.drop_table("project_members")
    op.execute("DROP TYPE IF EXISTS projectmemberrole")
