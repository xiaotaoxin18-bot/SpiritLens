"""Image search API.

GET /api/v1/search/images?q=xxx&count=12  — search reference images
"""

from fastapi import APIRouter, Query, HTTPException
from app.services.web_search import search_images
from app.services.file_storage import save_upload
import httpx

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/images")
async def search_reference_images(
    q: str = Query(..., min_length=1, max_length=200, description="搜索关键词"),
    count: int = Query(12, ge=1, le=50, description="返回数量"),
):
    """Search for reference images via public search engines."""
    results = await search_images(q, count)
    return {"query": q, "total": len(results), "results": results}


@router.post("/download")
async def download_reference_image(data: dict):
    """Download a remote image to local storage for use as reference."""
    url = data.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="url is required")

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()
        content_type = resp.headers.get("content-type", "image/jpeg")
        local_path = await save_upload(resp.content, content_type)
        return {"url": local_path}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"下载失败: {str(e)[:100]}")
