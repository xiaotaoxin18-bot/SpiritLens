"""Redis connection helper — reads REDIS_URL from config for correct host/port."""

import os


def _parse_redis_url(url: str | None = None) -> dict:
    """Parse REDIS_URL into connection kwargs."""
    if not url:
        url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    parts = url.replace("redis://", "").split("@")
    host_port = parts[-1].split("/")[0]
    db = 0
    if "/" in parts[-1]:
        db_val = parts[-1].split("/")[1]
        if db_val:
            db = int(db_val)
    host = host_port.split(":")[0]
    port = int(host_port.split(":")[1]) if ":" in host_port else 6379
    return {"host": host, "port": port, "db": db}


def get_redis(db: int | None = None, decode_responses: bool = True):
    """Get a sync Redis connection using the configured REDIS_URL."""
    import redis as sync_redis
    kwargs = _parse_redis_url()
    if db is not None:
        kwargs["db"] = db
    return sync_redis.Redis(**kwargs, decode_responses=decode_responses)


def get_async_redis(db: int | None = None, decode_responses: bool = True):
    """Get an async Redis connection using the configured REDIS_URL."""
    import redis.asyncio as aioredis
    kwargs = _parse_redis_url()
    if db is not None:
        kwargs["db"] = db
    return aioredis.Redis(**kwargs, decode_responses=decode_responses)


# ─── 生成提交限流（防自动化批量提交）────────────────────────

RATE_LIMIT = 10      # 同用户窗口内提交上限
RATE_WINDOW = 60     # 窗口秒数


async def check_generate_rate(user_id: str, kind: str) -> bool:
    """同用户 60 秒内 > 10 次生成提交 → False（调用方返回 429）。

    Redis INCR + 60s 过期；首次计数设置过期。
    """
    r = get_async_redis(db=1)
    key = f"spiritlens:rate:{kind}:{user_id}"
    try:
        count = await r.incr(key)
        if count == 1:
            await r.expire(key, RATE_WINDOW)
        return count <= RATE_LIMIT
    finally:
        await r.close()
