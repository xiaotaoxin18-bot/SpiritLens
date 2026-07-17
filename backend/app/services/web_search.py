"""Web search service — searches reference images.

Uses Openverse API (free, open-source, no API key needed).
Falls back to DuckDuckGo if Openverse fails.
"""

import asyncio
import httpx
import logging

logger = logging.getLogger(__name__)


async def search_images(query: str, count: int = 24) -> list[dict]:
    """Search for reference images.

    Returns list of: { url, thumbnail, title, source, width, height }
    """
    # Try Openverse first
    try:
        results = await _search_openverse(query, count)
        if results:
            return results
    except Exception as e:
        logger.warning("Openverse failed: %s", e)

    return []


async def _search_openverse(query: str, count: int) -> list[dict]:
    """Search images using Openverse API (free, no key needed)."""
    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        resp = await client.get(
            "https://api.openverse.org/v1/images/",
            params={"q": query, "page_size": min(count, 20), "license": "cc0"},
        )
        if resp.status_code != 200:
            logger.warning("Openverse returned %d", resp.status_code)
            return []

        data = resp.json()
        # Quick-check thumbnails in parallel to filter out dead links
        async def check_url(item: dict) -> dict | None:
            thumb = item.get("thumbnail") or item.get("url")
            if not thumb:
                return None
            try:
                async with httpx.AsyncClient(timeout=3) as c:
                    # Lightweight HEAD request
                    r = await c.head(thumb, follow_redirects=True)
                    if r.status_code >= 400:
                        return None
            except Exception:
                return None
            url = item.get("url") or thumb
            return {
                "url": url,
                "thumbnail": thumb,
                "title": (item.get("title") or "")[:200],
                "source": item.get("source", ""),
                "width": item.get("width", 0) or 0,
                "height": item.get("height", 0) or 0,
            }

        tasks = [check_url(item) for item in data.get("results", [])]
        checked = await asyncio.gather(*tasks)
        results = [r for r in checked if r is not None]

        return results[:count]
