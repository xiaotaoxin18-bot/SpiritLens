"""Project management API routes."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import joinedload
from app.core.database import get_db
from app.schemas.auth import UserOut
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectOut, ProjectList
from app.schemas import episode as schemas_episode
from app.schemas import character as schemas_character
from app.schemas import scene as schemas_scene
from app.schemas import prop as schemas_prop
from app.schemas import storyboard as schemas_storyboard
from app.schemas import season as schemas_season
from app.api.v1.auth import get_current_user
from app.models.project import Project, ProjectStatus
from app.models.user import User

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=ProjectList)
async def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = Query(None, description="Search by project name"),
    status: str | None = Query(None, description="Filter by status: active, completed"),
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """List projects for the current user."""
    uid = uuid.UUID(current_user.id)
    query = select(Project).where(Project.user_id == uid)
    count_query = select(func.count()).select_from(Project).where(Project.user_id == uid)

    if q:
        like = f"%{q}%"
        query = query.where(Project.name.ilike(like))
        count_query = count_query.where(Project.name.ilike(like))

    if status:
        try:
            status_val = ProjectStatus(status)
            query = query.where(Project.status == status_val)
            count_query = count_query.where(Project.status == status_val)
        except ValueError:
            pass

    # Get total count
    result = await db.execute(count_query)
    total = result.scalar() or 0

    # Paginate
    offset = (page - 1) * page_size
    query = query.order_by(Project.updated_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    projects = result.scalars().all()

    return ProjectList(
        total=total,
        page=page,
        page_size=page_size,
        projects=[ProjectOut(
            id=str(p.id),
            name=p.name,
            description=p.description,
            cover_url=p.cover_url,
            aspect_ratio=p.aspect_ratio,
            status=p.status.value,
            user_id=str(p.user_id),
            created_at=p.created_at,
            updated_at=p.updated_at,
        ) for p in projects],
    )


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Create a new project."""
    project = Project(
        name=data.name,
        description=data.description,
        cover_url=data.cover_url,
        aspect_ratio=data.aspect_ratio or "16:9",
        user_id=uuid.UUID(current_user.id),
    )
    db.add(project)
    await db.flush()
    await db.refresh(project)

    return ProjectOut(
        id=str(project.id),
        name=project.name,
        description=project.description,
        cover_url=project.cover_url,
        aspect_ratio=project.aspect_ratio,
        status=project.status.value,
        user_id=str(project.user_id),
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Get a single project by ID."""
    try:
        pid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    uid = uuid.UUID(current_user.id)
    result = await db.execute(
        select(Project).where(Project.id == pid, Project.user_id == uid)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return ProjectOut(
        id=str(project.id),
        name=project.name,
        description=project.description,
        cover_url=project.cover_url,
        aspect_ratio=project.aspect_ratio,
        status=project.status.value,
        user_id=str(project.user_id),
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Update a project."""
    try:
        pid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    uid = uuid.UUID(current_user.id)
    result = await db.execute(
        select(Project).where(Project.id == pid, Project.user_id == uid)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    if data.cover_url is not None:
        project.cover_url = data.cover_url
    if data.aspect_ratio is not None:
        project.aspect_ratio = data.aspect_ratio
    if data.status is not None:
        try:
            project.status = ProjectStatus(data.status)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status")

    await db.flush()
    await db.refresh(project)

    return ProjectOut(
        id=str(project.id),
        name=project.name,
        description=project.description,
        cover_url=project.cover_url,
        aspect_ratio=project.aspect_ratio,
        status=project.status.value,
        user_id=str(project.user_id),
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Delete a project."""
    try:
        pid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    uid = uuid.UUID(current_user.id)
    result = await db.execute(
        select(Project).where(Project.id == pid, Project.user_id == uid)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.delete(project)
    return None


# ── Episodes (集数) ─────────────────────────────────────────────


@router.get("/{project_id}/episodes", response_model=schemas_episode.EpisodeList)
async def list_episodes(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """List all episodes for a project."""
    from app.models.episode import Episode

    pid = _resolve_project_id(project_id)
    uid = uuid.UUID(current_user.id)

    # Verify ownership
    result = await db.execute(
        select(Project).where(Project.id == pid, Project.user_id == uid)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(Episode)
        .where(Episode.project_id == pid)
        .order_by(Episode.episode_number.asc())
    )
    episodes = result.scalars().all()

    return schemas_episode.EpisodeList(
        total=len(episodes),
        episodes=[schemas_episode.EpisodeOut(
            id=str(e.id),
            project_id=str(e.project_id),
            season_id=str(e.season_id) if e.season_id else None,
            episode_number=e.episode_number,
            title=e.title,
            status=e.status.value,
            script_content=e.script_content,
            config=e.config,
            created_at=e.created_at,
            updated_at=e.updated_at,
        ) for e in episodes],
    )


@router.post("/{project_id}/episodes", response_model=schemas_episode.EpisodeOut, status_code=201)
async def create_episode(
    project_id: str,
    data: schemas_episode.EpisodeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Create a new episode for a project."""
    from app.models.episode import Episode

    pid = _resolve_project_id(project_id)
    uid = uuid.UUID(current_user.id)

    # Verify ownership
    result = await db.execute(
        select(Project).where(Project.id == pid, Project.user_id == uid)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Check for duplicate episode number
    result = await db.execute(
        select(Episode).where(
            Episode.project_id == pid,
            Episode.episode_number == data.episode_number,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"Episode {data.episode_number} already exists",
        )

    episode = Episode(
        project_id=pid,
        episode_number=data.episode_number,
        title=data.title or "",
        script_content=data.script_content,
        cover_url=data.cover_url,
        season_id=uuid.UUID(data.season_id) if data.season_id else None,
    )
    db.add(episode)
    await db.flush()
    await db.refresh(episode)

    return schemas_episode.EpisodeOut(
        id=str(episode.id),
        project_id=str(episode.project_id),
        episode_number=episode.episode_number,
        title=episode.title,
        status=episode.status.value,
        script_content=episode.script_content,
        config=episode.config,
        cover_url=episode.cover_url,
        created_at=episode.created_at,
        updated_at=episode.updated_at,
    )


@router.put("/{project_id}/episodes/{episode_id}", response_model=schemas_episode.EpisodeOut)
async def update_episode(
    project_id: str,
    episode_id: str,
    data: schemas_episode.EpisodeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Update an episode."""
    from app.models.episode import Episode, EpisodeStatus

    pid = _resolve_project_id(project_id)
    eid = _resolve_episode_id(episode_id)
    uid = uuid.UUID(current_user.id)

    # Verify project ownership
    result = await db.execute(
        select(Project).where(Project.id == pid, Project.user_id == uid)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(Episode).where(Episode.id == eid, Episode.project_id == pid)
    )
    episode = result.scalar_one_or_none()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    if data.title is not None:
        episode.title = data.title
    if data.episode_number is not None:
        episode.episode_number = data.episode_number
    if data.status is not None:
        try:
            episode.status = EpisodeStatus(data.status)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status")
    if data.script_content is not None:
        episode.script_content = data.script_content
    if data.config is not None:
        episode.config = data.config
    if data.season_id is not None:
        episode.season_id = uuid.UUID(data.season_id)

    await db.flush()
    await db.refresh(episode)

    return schemas_episode.EpisodeOut(
        id=str(episode.id),
        project_id=str(episode.project_id),
        episode_number=episode.episode_number,
        title=episode.title,
        status=episode.status.value,
        script_content=episode.script_content,
        config=episode.config,
        created_at=episode.created_at,
        updated_at=episode.updated_at,
    )


@router.delete("/{project_id}/episodes/{episode_id}", status_code=204)
async def delete_episode(
    project_id: str,
    episode_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Delete an episode."""
    from app.models.episode import Episode

    pid = _resolve_project_id(project_id)
    eid = _resolve_episode_id(episode_id)
    uid = uuid.UUID(current_user.id)

    result = await db.execute(
        select(Project).where(Project.id == pid, Project.user_id == uid)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(Episode).where(Episode.id == eid, Episode.project_id == pid)
    )
    episode = result.scalar_one_or_none()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    await db.delete(episode)
    return None


@router.get("/{project_id}/episodes/{episode_id}", response_model=schemas_episode.EpisodeOut)
async def get_episode(
    project_id: str,
    episode_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Get a single episode by ID."""
    from app.models.episode import Episode

    pid = _resolve_project_id(project_id)
    eid = _resolve_episode_id(episode_id)
    uid = uuid.UUID(current_user.id)

    # Verify ownership
    result = await db.execute(
        select(Project).where(Project.id == pid, Project.user_id == uid)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(Episode).where(Episode.id == eid, Episode.project_id == pid)
    )
    episode = result.scalar_one_or_none()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    return schemas_episode.EpisodeOut(
        id=str(episode.id),
        project_id=str(episode.project_id),
        episode_number=episode.episode_number,
        title=episode.title,
        status=episode.status.value,
        script_content=episode.script_content,
        config=episode.config,
        cover_url=episode.cover_url,
        created_at=episode.created_at,
        updated_at=episode.updated_at,
    )


# ── Seasons (季) ─────────────────────────────────────────────


@router.get("/{project_id}/seasons", response_model=schemas_season.SeasonList)
async def list_seasons(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """List all seasons for a project, ordered by sort_order."""
    from app.models.season import Season

    pid = _resolve_project_id(project_id)
    uid = uuid.UUID(current_user.id)
    await _verify_project_owner(pid, uid, db)

    result = await db.execute(
        select(Season)
        .where(Season.project_id == pid)
        .order_by(Season.sort_order.asc())
    )
    seasons = result.scalars().all()

    return schemas_season.SeasonList(
        total=len(seasons),
        seasons=[_season_out(s) for s in seasons],
    )


@router.post("/{project_id}/seasons", response_model=schemas_season.SeasonOut, status_code=201)
async def create_season(
    project_id: str,
    data: schemas_season.SeasonCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Create a new season."""
    from app.models.season import Season

    pid = _resolve_project_id(project_id)
    uid = uuid.UUID(current_user.id)
    await _verify_project_owner(pid, uid, db)

    season = Season(
        project_id=pid,
        title=data.title,
        sort_order=data.sort_order,
    )
    db.add(season)
    await db.flush()
    await db.refresh(season)
    return _season_out(season)


@router.put("/{project_id}/seasons/{season_id}", response_model=schemas_season.SeasonOut)
async def update_season(
    project_id: str,
    season_id: str,
    data: schemas_season.SeasonUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Update a season."""
    from app.models.season import Season

    pid = _resolve_project_id(project_id)
    sid = uuid.UUID(season_id)
    uid = uuid.UUID(current_user.id)
    await _verify_project_owner(pid, uid, db)

    result = await db.execute(
        select(Season).where(Season.id == sid, Season.project_id == pid)
    )
    season = result.scalar_one_or_none()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    if data.title is not None:
        season.title = data.title
    if data.sort_order is not None:
        season.sort_order = data.sort_order

    await db.flush()
    await db.refresh(season)
    return _season_out(season)


@router.delete("/{project_id}/seasons/{season_id}", status_code=204)
async def delete_season(
    project_id: str,
    season_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Delete a season. Episodes under it become unassigned (season_id = NULL)."""
    from app.models.season import Season

    pid = _resolve_project_id(project_id)
    sid = uuid.UUID(season_id)
    uid = uuid.UUID(current_user.id)
    await _verify_project_owner(pid, uid, db)

    result = await db.execute(
        select(Season).where(Season.id == sid, Season.project_id == pid)
    )
    season = result.scalar_one_or_none()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    await db.delete(season)
    return None


# ── Novel Import ─────────────────────────────────────────────


@router.post("/{project_id}/import-novel", response_model=schemas_episode.ImportNovelResponse)
async def import_novel(
    project_id: str,
    data: schemas_episode.ImportNovelRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """导入整篇小说，AI 自动拆分为多集。"""
    from app.models.episode import Episode
    from app.services.novel_import import split_novel_into_episodes

    pid = _resolve_project_id(project_id)
    uid = uuid.UUID(current_user.id)
    await _verify_project_owner(pid, uid, db)

    try:
        items = await split_novel_into_episodes(data.content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 分集失败: {str(e)}")

    if not items:
        raise HTTPException(status_code=400, detail="未能从小说内容中拆分出有效剧集")

    # Get highest existing episode number
    result = await db.execute(
        select(Episode.episode_number)
        .where(Episode.project_id == pid)
        .order_by(Episode.episode_number.desc())
        .limit(1)
    )
    last_num = result.scalar() or 0

    # Create episodes
    episodes = []
    for i, item in enumerate(items, start=1):
        ep = Episode(
            project_id=pid,
            episode_number=last_num + i,
            title=item.get("title", f"第{last_num + i}集")[:200],
            script_content=item.get("script_content"),
        )
        db.add(ep)
        episodes.append(ep)

    await db.flush()
    for ep in episodes:
        await db.refresh(ep)

    return schemas_episode.ImportNovelResponse(
        total=len(episodes),
        episodes=[schemas_episode.EpisodeOut(
            id=str(ep.id),
            project_id=str(ep.project_id),
            episode_number=ep.episode_number,
            title=ep.title,
            status=ep.status.value,
            script_content=ep.script_content,
            created_at=ep.created_at,
            updated_at=ep.updated_at,
        ) for ep in episodes],
    )


# ── Storyboards (分镜) ──────────────────────────────────────────


@router.get("/{project_id}/episodes/{episode_id}/storyboards", response_model=schemas_storyboard.StoryboardList)
async def list_storyboards(
    project_id: str,
    episode_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """List all storyboards for an episode, ordered by sequence_number."""
    from app.models.storyboard import Storyboard

    pid = _resolve_project_id(project_id)
    eid = _resolve_episode_id(episode_id)
    uid = uuid.UUID(current_user.id)
    await _verify_project_owner(pid, uid, db)

    result = await db.execute(
        select(Storyboard)
        .where(Storyboard.episode_id == eid)
        .order_by(Storyboard.sequence_number.asc())
    )
    items = result.scalars().all()

    return schemas_storyboard.StoryboardList(
        total=len(items),
        storyboards=[_storyboard_out(sb) for sb in items],
    )


@router.post("/{project_id}/episodes/{episode_id}/storyboards", response_model=schemas_storyboard.StoryboardOut, status_code=201)
async def create_storyboard(
    project_id: str,
    episode_id: str,
    data: schemas_storyboard.StoryboardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Create a single storyboard manually."""
    from app.models.storyboard import Storyboard, ShotType

    pid = _resolve_project_id(project_id)
    eid = _resolve_episode_id(episode_id)
    uid = uuid.UUID(current_user.id)
    await _verify_project_owner(pid, uid, db)

    sb = Storyboard(
        episode_id=eid,
        sequence_number=data.sequence_number,
        scene_description=data.scene_description,
        action_description=data.action_description,
        shot_type=ShotType(data.shot_type) if data.shot_type else None,
        dialogue=data.dialogue,
        characters=data.characters,
        props=data.props,
    )
    db.add(sb)
    await db.flush()
    await db.refresh(sb)
    return _storyboard_out(sb)


@router.put("/{project_id}/episodes/{episode_id}/storyboards/{storyboard_id}", response_model=schemas_storyboard.StoryboardOut)
async def update_storyboard(
    project_id: str,
    episode_id: str,
    storyboard_id: str,
    data: schemas_storyboard.StoryboardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Update a storyboard."""
    from app.models.storyboard import Storyboard, ShotType

    pid = _resolve_project_id(project_id)
    eid = _resolve_episode_id(episode_id)
    uid = uuid.UUID(current_user.id)
    await _verify_project_owner(pid, uid, db)

    result = await db.execute(
        select(Storyboard).where(Storyboard.id == uuid.UUID(storyboard_id), Storyboard.episode_id == eid)
    )
    sb = result.scalar_one_or_none()
    if not sb:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    if data.sequence_number is not None:
        sb.sequence_number = data.sequence_number
    if data.scene_description is not None:
        sb.scene_description = data.scene_description
    if data.action_description is not None:
        sb.action_description = data.action_description
    if data.shot_type is not None:
        sb.shot_type = ShotType(data.shot_type) if data.shot_type else None
    if data.dialogue is not None:
        sb.dialogue = data.dialogue
    if data.characters is not None:
        sb.characters = data.characters
    if data.props is not None:
        sb.props = data.props
    if data.generated_scene_image_url is not None:
        sb.generated_scene_image_url = data.generated_scene_image_url
    if data.generated_character_image_url is not None:
        sb.generated_character_image_url = data.generated_character_image_url
    if data.generated_video_url is not None:
        sb.generated_video_url = data.generated_video_url

    await db.flush()
    await db.refresh(sb)
    return _storyboard_out(sb)


@router.delete("/{project_id}/episodes/{episode_id}/storyboards/{storyboard_id}", status_code=204)
async def delete_storyboard(
    project_id: str,
    episode_id: str,
    storyboard_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Delete a storyboard."""
    from app.models.storyboard import Storyboard

    pid = _resolve_project_id(project_id)
    eid = _resolve_episode_id(episode_id)
    uid = uuid.UUID(current_user.id)
    await _verify_project_owner(pid, uid, db)

    result = await db.execute(
        select(Storyboard).where(Storyboard.id == uuid.UUID(storyboard_id), Storyboard.episode_id == eid)
    )
    sb = result.scalar_one_or_none()
    if not sb:
        raise HTTPException(status_code=404, detail="Storyboard not found")
    await db.delete(sb)
    return None


# ── AI Script Breakdown ─────────────────────────────────────────


@router.post("/{project_id}/episodes/{episode_id}/storyboards/breakdown", response_model=schemas_storyboard.StoryboardList)
async def ai_breakdown_script(
    project_id: str,
    episode_id: str,
    model_id: str = Query(None, description="Text model ID to use for breakdown"),
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """AI 自动拆解剧本为分镜列表。先删除该集现有分镜，再重新生成。"""
    from app.models.storyboard import Storyboard
    from app.models.episode import Episode
    from app.services.script_breakdown import breakdown_script

    pid = _resolve_project_id(project_id)
    eid = _resolve_episode_id(episode_id)
    uid = uuid.UUID(current_user.id)
    await _verify_project_owner(pid, uid, db)

    # Get episode with script
    result = await db.execute(
        select(Episode).where(Episode.id == eid, Episode.project_id == pid)
    )
    episode = result.scalar_one_or_none()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    if not episode.script_content:
        raise HTTPException(status_code=400, detail="请先上传剧本再拆解")

    # Delete existing storyboards
    await db.execute(
        Storyboard.__table__.delete().where(Storyboard.episode_id == eid)
    )

    # Call LLM to break down script
    try:
        items = await breakdown_script(episode.script_content, model_id=model_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 拆解失败: {str(e)}")

    # Bulk insert
    storyboards = []
    for i, item in enumerate(items, start=1):
        sb = Storyboard(
            episode_id=eid,
            sequence_number=i,
            scene_description=item.get("scene_description"),
            action_description=item.get("action_description"),
            shot_type=_parse_shot_type(item.get("shot_type")),
            dialogue=item.get("dialogue"),
            characters=_json_list(item.get("characters")),
            props=_json_list(item.get("props")),
        )
        db.add(sb)
        storyboards.append(sb)

    await db.flush()
    for sb in storyboards:
        await db.refresh(sb)

    return schemas_storyboard.StoryboardList(
        total=len(storyboards),
        storyboards=[_storyboard_out(sb) for sb in storyboards],
    )


# ── Project Asset CRUD helpers ──────────────────────────────────


async def _verify_project_owner(project_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession):
    """Ensure current user owns the project. Raises 404 if not."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")


def _asset_out(entity) -> dict:
    return dict(
        id=str(entity.id), project_id=str(entity.project_id),
        name=entity.name, description=entity.description,
        image_url=entity.image_url,
        prompt=getattr(entity, 'prompt', None),
        created_at=entity.created_at, updated_at=entity.updated_at,
    )


# ── Characters (角色) ───────────────────────────────────────────


@router.get("/{project_id}/characters", response_model=schemas_character.CharacterList)
async def list_characters(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    from app.models.character import Character
    pid = _resolve_project_id(project_id)
    await _verify_project_owner(pid, uuid.UUID(current_user.id), db)
    result = await db.execute(
        select(Character).where(Character.project_id == pid).order_by(Character.created_at.desc())
    )
    items = result.scalars().all()
    return schemas_character.CharacterList(total=len(items), characters=[_asset_out(c) for c in items])


@router.post("/{project_id}/characters", response_model=schemas_character.CharacterOut, status_code=201)
async def create_character(
    project_id: str,
    data: schemas_character.CharacterCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    from app.models.character import Character
    pid = _resolve_project_id(project_id)
    await _verify_project_owner(pid, uuid.UUID(current_user.id), db)
    entity = Character(project_id=pid, name=data.name, description=data.description, image_url=data.image_url)
    db.add(entity)
    await db.flush()
    await db.refresh(entity)
    return _asset_out(entity)


@router.put("/{project_id}/characters/{entity_id}", response_model=schemas_character.CharacterOut)
async def update_character(
    project_id: str, entity_id: str,
    data: schemas_character.CharacterUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    from app.models.character import Character
    pid, eid, uid = _resolve_project_id(project_id), uuid.UUID(entity_id), uuid.UUID(current_user.id)
    await _verify_project_owner(pid, uid, db)
    result = await db.execute(select(Character).where(Character.id == eid, Character.project_id == pid))
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="角色 not found")
    if data.name is not None: entity.name = data.name
    if data.description is not None: entity.description = data.description
    if data.image_url is not None: entity.image_url = data.image_url
    await db.flush()
    await db.refresh(entity)
    return _asset_out(entity)


@router.delete("/{project_id}/characters/{entity_id}", status_code=204)
async def delete_character(
    project_id: str, entity_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    from app.models.character import Character
    pid, eid, uid = _resolve_project_id(project_id), uuid.UUID(entity_id), uuid.UUID(current_user.id)
    await _verify_project_owner(pid, uid, db)
    result = await db.execute(select(Character).where(Character.id == eid, Character.project_id == pid))
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="角色 not found")
    await db.delete(entity)
    return None


# ── Scenes (场景) ───────────────────────────────────────────────


@router.get("/{project_id}/scenes", response_model=schemas_scene.SceneList)
async def list_scenes(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    from app.models.scene import Scene
    pid = _resolve_project_id(project_id)
    await _verify_project_owner(pid, uuid.UUID(current_user.id), db)
    result = await db.execute(
        select(Scene).where(Scene.project_id == pid).order_by(Scene.created_at.desc())
    )
    items = result.scalars().all()
    return schemas_scene.SceneList(total=len(items), scenes=[_asset_out(s) for s in items])


@router.post("/{project_id}/scenes", response_model=schemas_scene.SceneOut, status_code=201)
async def create_scene(
    project_id: str,
    data: schemas_scene.SceneCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    from app.models.scene import Scene
    pid = _resolve_project_id(project_id)
    await _verify_project_owner(pid, uuid.UUID(current_user.id), db)
    entity = Scene(project_id=pid, name=data.name, description=data.description, image_url=data.image_url)
    db.add(entity)
    await db.flush()
    await db.refresh(entity)
    return _asset_out(entity)


@router.put("/{project_id}/scenes/{entity_id}", response_model=schemas_scene.SceneOut)
async def update_scene(
    project_id: str, entity_id: str,
    data: schemas_scene.SceneUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    from app.models.scene import Scene
    pid, eid, uid = _resolve_project_id(project_id), uuid.UUID(entity_id), uuid.UUID(current_user.id)
    await _verify_project_owner(pid, uid, db)
    result = await db.execute(select(Scene).where(Scene.id == eid, Scene.project_id == pid))
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="场景 not found")
    if data.name is not None: entity.name = data.name
    if data.description is not None: entity.description = data.description
    if data.image_url is not None: entity.image_url = data.image_url
    await db.flush()
    await db.refresh(entity)
    return _asset_out(entity)


@router.delete("/{project_id}/scenes/{entity_id}", status_code=204)
async def delete_scene(
    project_id: str, entity_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    from app.models.scene import Scene
    pid, eid, uid = _resolve_project_id(project_id), uuid.UUID(entity_id), uuid.UUID(current_user.id)
    await _verify_project_owner(pid, uid, db)
    result = await db.execute(select(Scene).where(Scene.id == eid, Scene.project_id == pid))
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="场景 not found")
    await db.delete(entity)
    return None


# ── Props (道具) ────────────────────────────────────────────────


@router.get("/{project_id}/props", response_model=schemas_prop.PropList)
async def list_props(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    from app.models.prop import Prop
    pid = _resolve_project_id(project_id)
    await _verify_project_owner(pid, uuid.UUID(current_user.id), db)
    result = await db.execute(
        select(Prop).where(Prop.project_id == pid).order_by(Prop.created_at.desc())
    )
    items = result.scalars().all()
    return schemas_prop.PropList(total=len(items), props=[_asset_out(p) for p in items])


@router.post("/{project_id}/props", response_model=schemas_prop.PropOut, status_code=201)
async def create_prop(
    project_id: str,
    data: schemas_prop.PropCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    from app.models.prop import Prop
    pid = _resolve_project_id(project_id)
    await _verify_project_owner(pid, uuid.UUID(current_user.id), db)
    entity = Prop(project_id=pid, name=data.name, description=data.description, image_url=data.image_url)
    db.add(entity)
    await db.flush()
    await db.refresh(entity)
    return _asset_out(entity)


@router.put("/{project_id}/props/{entity_id}", response_model=schemas_prop.PropOut)
async def update_prop(
    project_id: str, entity_id: str,
    data: schemas_prop.PropUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    from app.models.prop import Prop
    pid, eid, uid = _resolve_project_id(project_id), uuid.UUID(entity_id), uuid.UUID(current_user.id)
    await _verify_project_owner(pid, uid, db)
    result = await db.execute(select(Prop).where(Prop.id == eid, Prop.project_id == pid))
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="道具 not found")
    if data.name is not None: entity.name = data.name
    if data.description is not None: entity.description = data.description
    if data.image_url is not None: entity.image_url = data.image_url
    await db.flush()
    await db.refresh(entity)
    return _asset_out(entity)


@router.delete("/{project_id}/props/{entity_id}", status_code=204)
async def delete_prop(
    project_id: str, entity_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    from app.models.prop import Prop
    pid, eid, uid = _resolve_project_id(project_id), uuid.UUID(entity_id), uuid.UUID(current_user.id)
    await _verify_project_owner(pid, uid, db)
    result = await db.execute(select(Prop).where(Prop.id == eid, Prop.project_id == pid))
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="道具 not found")
    await db.delete(entity)
    return None


# ── Helpers ─────────────────────────────────────────────────────


def _resolve_project_id(project_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")


def _resolve_episode_id(episode_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(episode_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid episode ID")


def _storyboard_out(sb) -> dict:
    """Convert a Storyboard model to a response dict."""
    from app.models.storyboard import ShotType

    return dict(
        id=str(sb.id),
        episode_id=str(sb.episode_id),
        sequence_number=sb.sequence_number,
        scene_description=sb.scene_description,
        action_description=sb.action_description,
        shot_type=sb.shot_type.value if isinstance(sb.shot_type, ShotType) else sb.shot_type,
        dialogue=sb.dialogue,
        characters=sb.characters,
        props=sb.props,
        generated_scene_image_url=sb.generated_scene_image_url,
        generated_character_image_url=sb.generated_character_image_url,
        generated_video_url=sb.generated_video_url,
        created_at=sb.created_at,
        updated_at=sb.updated_at,
    )


def _parse_shot_type(value: str | None):
    """Parse shot_type string, return None if invalid."""
    from app.models.storyboard import ShotType

    if not value:
        return None
    try:
        return ShotType(value)
    except ValueError:
        return None


def _json_list(items: list[str] | None) -> str | None:
    """Convert a list of strings to a JSON string, or return None."""
    import json

    if not items:
        return None
    return json.dumps(items, ensure_ascii=False)


def _season_out(s) -> dict:
    """Convert a Season model to response dict."""
    return dict(
        id=str(s.id),
        project_id=str(s.project_id),
        title=s.title,
        sort_order=s.sort_order,
        created_at=s.created_at,
        updated_at=s.updated_at,
    )
