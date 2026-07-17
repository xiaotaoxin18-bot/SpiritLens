"""SpiritLens API v1 router."""

from fastapi import APIRouter
from app.api.v1 import auth, admin
from app.api.v1.media.image import router as image_router
from app.api.v1.models import router as models_router
from app.api.v1.upload import router as upload_router
from app.api.v1.search import router as search_router
from app.api.v1.enhance import router as enhance_router
from app.api.v1.ws import router as ws_router
from app.api.v1.community import router as community_router
from app.api.v1.assets import router as assets_router
from app.api.v1.video import router as video_router
from app.api.v1.projects import router as projects_router
from app.api.v1.scripts import router as scripts_router
from app.api.v1.export import router as export_router

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(admin.router)
router.include_router(image_router)
router.include_router(models_router)
router.include_router(upload_router)
router.include_router(search_router)
router.include_router(enhance_router)
router.include_router(ws_router)
router.include_router(community_router)
router.include_router(assets_router)
router.include_router(video_router)
router.include_router(projects_router)
router.include_router(scripts_router)
router.include_router(export_router)
