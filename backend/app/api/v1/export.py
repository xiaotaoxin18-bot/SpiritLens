"""Export API — episode video export (collect, order, manifest)."""

import json
import logging
import uuid
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.episode import Episode
from app.models.user import User
from app.api.v1.auth import get_current_user
from app.api.v1.projects import _verify_project_member

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["export"])


# ─── Schemas ────────────────────────────────────────────────


class ExportRequest(BaseModel):
    """Request to save the export shot order."""
    shotOrder: list[str]


class ExportItem(BaseModel):
    """A single exportable video item."""
    id: str
    sequence: int
    actionSummary: str = ""
    videoUrl: str = ""
    status: str = "pending"  # completed | pending | failed
    duration: int = 5
    videoPrompt: str = ""
    videoIndex: int = 1  # 镜头内第几个视频（多视频：镜头1（1）/镜头1（2））


class ExportListResponse(BaseModel):
    """Response listing all shots for export."""
    total: int
    items: list[ExportItem]
    aspectRatio: str = "16:9"
    episodeTitle: str = ""


class ExportManifest(BaseModel):
    """Export manifest with completed/pending breakdown."""
    episodeTitle: str = ""
    aspectRatio: str = "16:9"
    totalShots: int = 0
    completedCount: int = 0
    pendingCount: int = 0
    completedVideos: list[dict] = []
    pendingShots: list[dict] = []


# ─── Helpers ────────────────────────────────────────────────


def _parse_shots(episode, config: dict) -> tuple[list[dict], str]:
    """Extract and normalize shots from episode config."""
    structure_data = config.get("structureData") or {}
    shots = structure_data.get("shots") or []
    aspect_ratio = config.get("aspectRatio", "16:9")
    episode_title = episode.title or f"第 {episode.episode_number} 集"
    return shots, aspect_ratio, episode_title


def _shot_videos(shot: dict, idx: int) -> list[ExportItem]:
    """Convert a shot dict to one or more ExportItems (multi-video support).

    videos 列表优先（一个镜头多个视频 → 镜头N（1）/镜头N（2）…）；
    老数据（仅 interval）退化为单视频。
    """
    shot_id = shot.get("id", f"shot-{idx + 1}")
    action = shot.get("actionSummary", shot.get("sceneDescription", ""))
    interval = shot.get("interval") or {}
    videos = shot.get("videos") or ([interval] if interval else [])

    items: list[ExportItem] = []
    for vi, v in enumerate(videos):
        video_url = v.get("videoUrl") or ""
        if video_url:
            status = "completed"
        elif v.get("status") == "failed":
            status = "failed"
        else:
            status = "pending"

        items.append(ExportItem(
            id=f"{shot_id}:v{vi + 1}",
            sequence=idx + 1,
            actionSummary=action,
            videoUrl=video_url,
            status=status,
            duration=v.get("duration", 5),
            videoPrompt=v.get("videoPrompt", ""),
            videoIndex=vi + 1,
        ))
    return items


# ─── Routes ─────────────────────────────────────────────────


@router.get("/{project_id}/episodes/{episode_id}/export", response_model=ExportListResponse)
async def get_export_videos(
    project_id: str,
    episode_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all shots with video URLs for export.

    Reads from episode config (where StageDirector stores shot data).
    Returns ordered list of shots with their video status.
    """
    await _verify_project_member(project_id, current_user.id, db)

    result = await db.execute(
        select(Episode).where(
            Episode.id == uuid.UUID(episode_id),
            Episode.project_id == uuid.UUID(project_id)
        )
    )
    episode = result.scalar_one_or_none()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    config = episode.config or {}
    shots, aspect_ratio, episode_title = _parse_shots(episode, config)

    items = [item for i, s in enumerate(shots) for item in _shot_videos(s, i)]

    return ExportListResponse(
        total=len(items),
        items=items,
        aspectRatio=aspect_ratio,
        episodeTitle=episode_title,
    )


@router.put("/{project_id}/episodes/{episode_id}/export/order")
async def save_export_order(
    project_id: str,
    episode_id: str,
    req: ExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save the export shot order to episode config (drag-reorder persistence)."""
    await _verify_project_member(project_id, current_user.id, db)

    result = await db.execute(
        select(Episode).where(
            Episode.id == uuid.UUID(episode_id),
            Episode.project_id == uuid.UUID(project_id)
        )
    )
    episode = result.scalar_one_or_none()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    config = episode.config or {}
    structure_data = config.get("structureData") or {}
    shots = structure_data.get("shots") or []

    # Reorder shots according to shotOrder
    shot_map = {s.get("id", ""): s for s in shots}
    reordered: list[dict] = []
    for sid in req.shotOrder:
        if sid in shot_map:
            reordered.append(shot_map[sid])
            del shot_map[sid]

    # Append remaining shots not in the order list
    reordered.extend(shot_map.values())

    structure_data["shots"] = reordered
    config["structureData"] = structure_data
    episode.config = config

    await db.commit()

    return {"status": "ok", "total": len(reordered)}


@router.get("/{project_id}/episodes/{episode_id}/export/manifest", response_model=ExportManifest)
async def get_export_manifest(
    project_id: str,
    episode_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get an export manifest — which shots have videos, which are pending.

    Frontend uses this to display progress and build download playlist.
    """
    await _verify_project_member(project_id, current_user.id, db)

    result = await db.execute(
        select(Episode).where(
            Episode.id == uuid.UUID(episode_id),
            Episode.project_id == uuid.UUID(project_id)
        )
    )
    episode = result.scalar_one_or_none()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    config = episode.config or {}
    shots, aspect_ratio, episode_title = _parse_shots(episode, config)

    completed: list[dict] = []
    pending: list[dict] = []

    for idx, shot in enumerate(shots):
        sid = shot.get("id", f"shot-{idx + 1}")
        action = shot.get("actionSummary", shot.get("sceneDescription", ""))
        interval = shot.get("interval") or {}
        videos = shot.get("videos") or ([interval] if interval else [])

        for vi, v in enumerate(videos):
            video_url = v.get("videoUrl") or ""
            if video_url:
                completed.append({
                    "id": f"{sid}:v{vi + 1}",
                    "sequence": idx + 1,
                    "videoIndex": vi + 1,
                    "actionSummary": action,
                    "videoUrl": video_url,
                    "duration": v.get("duration", 5),
                })
            else:
                pending.append({
                    "id": f"{sid}:v{vi + 1}",
                    "sequence": idx + 1,
                    "videoIndex": vi + 1,
                    "actionSummary": action,
                })

    return ExportManifest(
        episodeTitle=episode_title,
        aspectRatio=aspect_ratio,
        totalShots=len(shots),
        completedCount=len(completed),
        pendingCount=len(pending),
        completedVideos=completed,
        pendingShots=pending,
    )
