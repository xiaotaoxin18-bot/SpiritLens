"""One-time script: backfill creations status from Redis.

Run inside the Docker container:
    docker cp scripts/backfill_status.py spiritlens-backend-1:/app/scripts/
    docker exec -w /app spiritlens-backend-1 python scripts/backfill_status.py
"""

import json
import os
import sys

# Add /app to sys.path so we can import app modules
sys.path.insert(0, "/app")

import redis
from sqlalchemy import create_engine, text

# Read DB URL from env (already set in the container)
PG_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/spiritlens")
# AsyncPG driver not needed for sync script
PG_URL = PG_URL.replace("+asyncpg", "")

STATUS_MAP = {
    "completed": "completed",
    "failed": "failed",
    "cancelled": "failed",
}
STUCK_STATUSES = {"processing", "pending"}


def main():
    r = redis.Redis(host="localhost", port=6379, db=1, decode_responses=True)
    engine = create_engine(PG_URL)

    fixed = 0
    skipped = 0
    errors = 0

    for key in r.scan_iter(match="spiritlens:result:*"):
        task_id = key.replace("spiritlens:result:", "")
        raw = r.get(key)
        if not raw:
            skipped += 1
            continue

        try:
            result = json.loads(raw)
        except json.JSONDecodeError:
            errors += 1
            continue

        status = result.get("status", "completed")
        db_status = STATUS_MAP.get(status, "completed")
        image_urls = result.get("image_urls", []) or []
        media = image_urls[0] if image_urls else result.get("video_url", "")
        error_msg = result.get("error_message") or result.get("error") or None

        with engine.connect() as conn:
            current = conn.execute(
                text("SELECT status FROM creations WHERE params->>'task_id' = :task_id"),
                {"task_id": task_id},
            ).one_or_none()

            if current is None:
                skipped += 1
                continue

            if current[0] not in STUCK_STATUSES:
                skipped += 1
                continue

            conn.execute(
                text("""
                    UPDATE creations
                    SET status = CAST(:status AS creationstatus),
                        media_url = :media,
                        error_message = :error,
                        params = jsonb_set(
                            COALESCE(params, '{}'::jsonb),
                            '{image_urls}',
                            :urls::jsonb
                        ),
                        updated_at = NOW()
                    WHERE params->>'task_id' = :task_id
                """),
                {
                    "task_id": task_id,
                    "status": db_status,
                    "media": media or None,
                    "error": error_msg,
                    "urls": json.dumps(image_urls),
                },
            )
            conn.commit()
            fixed += 1

    engine.dispose()
    r.close()

    print(f"Fixed: {fixed}, Skipped: {skipped}, Errors: {errors}")


if __name__ == "__main__":
    main()
