"""批量 HEAD 验证 DB 中全部 CDN URL 的可访问性（排查资产库视频看不了）。"""
import asyncio
import sys
from collections import Counter

sys.path.insert(0, "/app")
import httpx
from sqlalchemy import text
from app.core.database import async_session_factory

async def main():
    async with async_session_factory() as s:
        rows = (await s.execute(text(
            "SELECT media_url FROM creations WHERE media_url LIKE 'https://media.yhanm.cn%'"
        ))).all()
    urls = [r[0] for r in rows]
    print(f"CDN URL 共 {len(urls)} 条", flush=True)

    sem = asyncio.Semaphore(20)
    results: list[tuple[str, int]] = []

    async def check(url: str):
        async with sem:
            try:
                async with httpx.AsyncClient(timeout=10, follow_redirects=True) as c:
                    r = await c.head(url)
                    results.append((url, r.status_code))
            except Exception:
                results.append((url, 0))
            print(".", end="", flush=True)

    await asyncio.gather(*[check(u) for u in urls])
    print()

    ok = [r for r in results if r[1] == 200]
    bad = [r for r in results if r[1] != 200]
    print(f"\n200: {len(ok)}  |  非200/失败: {len(bad)}")
    if bad:
        by_date = Counter(u.split("/spiritlens/")[1][:10] if "/spiritlens/" in u else "?" for u, _ in bad)
        print("失败按日期:", dict(sorted(by_date.items())))
        for u, code in bad[:10]:
            print(f"  {code} {u}")

asyncio.run(main())
