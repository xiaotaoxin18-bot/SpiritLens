"""Migrate data from SQLite to PostgreSQL.

Usage:
    python scripts/migrate_to_pg.py

Requires:
    - PostgreSQL running with 'spiritlens' database created
    - SQLite database file (spiritlens_v2.db) present
    - Set DATABASE_URL in backend/.env to point to PostgreSQL

Steps:
    1. Creates PostgreSQL schema via Alembic migrations
    2. Exports data from SQLite
    3. Imports into PostgreSQL
"""

import asyncio
import sqlite3
from datetime import datetime
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from alembic.config import Config
from alembic import command

from app.core.config import get_settings

settings = get_settings()
SQLITE_PATH = Path(__file__).parent.parent / "spiritlens_v2.db"

TABLES = ["users", "social_accounts", "creations", "ai_models", "posts", "likes", "comments"]

# Columns that are Boolean in PG but stored as 0/1 in SQLite
BOOLEAN_COLS = {
    "is_admin", "is_enabled", "is_public", "is_verified", "is_banned",
    "is_deleted", "is_pinned", "is_archived", "is_hidden", "is_featured", "is_official",
}

# Columns that are DateTime in PG but stored as strings in SQLite
DATETIME_COLS = {
    "created_at", "updated_at", "completed_at", "deleted_at",
    "last_login", "last_seen", "published_at", "processed_at",
}


def export_sqlite(table: str) -> list[dict]:
    """Export all rows from a SQLite table."""
    conn = sqlite3.connect(str(SQLITE_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.execute(f"SELECT * FROM {table}")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


async def import_to_pg(table: str, rows: list[dict]):
    """Import rows into PostgreSQL using raw SQL."""
    if not rows:
        print(f"  {table}: 0 rows (empty)")
        return

    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        columns = list(rows[0].keys())
        placeholders = ", ".join([f":{c}" for c in columns])
        col_names = ", ".join(columns)

        for row in rows:
            clean = {}
            for k, v in row.items():
                if isinstance(v, bytes):
                    v = v.decode("utf-8", errors="replace")
                if isinstance(v, int) and k in BOOLEAN_COLS:
                    v = bool(v)
                if isinstance(v, str) and k in DATETIME_COLS and v:
                    try:
                        v = datetime.fromisoformat(v)
                    except ValueError:
                        pass
                clean[k] = v

            await conn.execute(
                text(f"INSERT INTO {table} ({col_names}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"),
                clean,
            )
        await conn.commit()
        print(f"  {table}: {len(rows)} rows imported")

    await engine.dispose()


async def main():
    print("=== SpiritLens Data Migration: SQLite → PostgreSQL ===\n")

    pg_url = settings.DATABASE_URL
    if pg_url.startswith("sqlite"):
        print("❌ DATABASE_URL still points to SQLite. Update .env first.")
        return

    if not SQLITE_PATH.exists():
        print(f"❌ SQLite database not found: {SQLITE_PATH}")
        print("   Run the app locally first to generate the SQLite database.")
        return

    print(f"Source: SQLite ({SQLITE_PATH})")
    print(f"Target: {pg_url}\n")

    # Step 1: Create PostgreSQL schema via Alembic
    print("Running Alembic migrations to create PostgreSQL schema...")
    alembic_cfg = Config(Path(__file__).parent.parent / "alembic.ini")
    command.upgrade(alembic_cfg, "head")
    print("  Schema created.\n")

    # Step 2: Export from SQLite and import to PostgreSQL
    for table in TABLES:
        print(f"Migrating {table}...")
        rows = export_sqlite(table)
        await import_to_pg(table, rows)

    print("\n✅ Migration complete!")
    print("   Run 'alembic check' to verify schema is up to date.")


if __name__ == "__main__":
    asyncio.run(main())
