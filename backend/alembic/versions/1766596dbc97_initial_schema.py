"""initial_schema — create all core tables

Revision ID: 1766596dbc97
Revises:
Create Date: 2026-07-03 14:48:01.992074
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "1766596dbc97"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all core tables."""

    # ── users ──────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(255), unique=True, index=True, nullable=True),
        sa.Column("phone", sa.String(20), unique=True, index=True, nullable=True),
        sa.Column("nickname", sa.String(100), nullable=False, index=True),
        sa.Column("username", sa.String(100), unique=True, index=True, nullable=True),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("bio", sa.String(500), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column(
            "status",
            sa.Enum("ACTIVE", "INACTIVE", "BANNED", name="userstatus"),
            nullable=False,
            server_default="ACTIVE",
        ),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── social_accounts ────────────────────────────────────────
    op.create_table(
        "social_accounts",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "provider",
            sa.Enum("WECHAT", "DOUYIN", "GITHUB", "GOOGLE", name="socialprovider"),
            nullable=False,
        ),
        sa.Column("provider_id", sa.String(255), nullable=False),
        sa.Column("extra_data", sa.String(1000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── creations ──────────────────────────────────────────────
    op.create_table(
        "creations",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "type",
            sa.Enum("IMAGE", "VIDEO", "DIGITAL_HUMAN", "CANVAS", name="creationtype"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False, server_default="未命名作品"),
        sa.Column("prompt", sa.Text(), nullable=True),
        sa.Column("negative_prompt", sa.Text(), nullable=True),
        sa.Column("media_url", sa.String(500), nullable=True),
        sa.Column("thumbnail_url", sa.String(500), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("params", postgresql.JSONB(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("PENDING", "PROCESSING", "COMPLETED", "FAILED", name="creationstatus"),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("error_message", sa.String(500), nullable=True),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── favorites ──────────────────────────────────────────────
    op.create_table(
        "favorites",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("creation_id", sa.Uuid(), sa.ForeignKey("creations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── posts ─────────────────────────────────────────────────
    op.create_table(
        "posts",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("creation_id", sa.Uuid(), sa.ForeignKey("creations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("cover_url", sa.String(500), nullable=True),
        sa.Column("cover_width", sa.Integer(), nullable=True),
        sa.Column("cover_height", sa.Integer(), nullable=True),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("like_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("comment_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── likes ──────────────────────────────────────────────────
    op.create_table(
        "likes",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("post_id", sa.Uuid(), sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── comments ───────────────────────────────────────────────
    op.create_table(
        "comments",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("post_id", sa.Uuid(), sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── templates ──────────────────────────────────────────────
    op.create_table(
        "templates",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("cover_url", sa.String(500), nullable=True),
        sa.Column("config", postgresql.JSONB(), nullable=False),
        sa.Column("usage_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_official", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── ai_models ──────────────────────────────────────────────
    op.create_table(
        "ai_models",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(100), nullable=False, index=True),
        sa.Column("vendor", sa.String(100), nullable=False),
        sa.Column(
            "type",
            sa.Enum("IMAGE", "VIDEO", name="modeltype"),
            nullable=False,
        ),
        sa.Column("api_endpoint", sa.String(500), nullable=True),
        sa.Column("api_key", sa.String(500), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("cost_per_unit", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("params", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── Indexes ────────────────────────────────────────────────
    op.create_index("ix_creations_user_id", "creations", ["user_id"])
    op.create_index("ix_creations_type", "creations", ["type"])
    op.create_index("ix_creations_status", "creations", ["status"])
    op.create_index("ix_posts_user_id", "posts", ["user_id"])
    op.create_index("ix_comments_post_id", "comments", ["post_id"])


def downgrade() -> None:
    """Drop all tables."""
    op.drop_table("ai_models")
    op.drop_table("templates")
    op.drop_table("comments")
    op.drop_table("likes")
    op.drop_table("posts")
    op.drop_table("favorites")
    op.drop_table("creations")
    op.drop_table("social_accounts")
    op.drop_table("users")

    # Clean up enums
    op.execute("DROP TYPE IF EXISTS modeltype")
    op.execute("DROP TYPE IF EXISTS creationstatus")
    op.execute("DROP TYPE IF EXISTS creationtype")
    op.execute("DROP TYPE IF EXISTS socialprovider")
    op.execute("DROP TYPE IF EXISTS userstatus")
