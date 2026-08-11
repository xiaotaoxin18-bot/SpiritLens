"""Script generation API — generate & continue scripts using LLM."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.auth import UserOut
from app.api.v1.auth import get_current_user
from app.services.script_generation import generate_script, continue_script, rewrite_script
from app.services.script_structure import parse_script_structure

router = APIRouter(prefix="/projects/{project_id}/episodes/{episode_id}/script", tags=["script"])


class GenerateScriptRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="故事梗概或主题")
    duration: str = Field(default="5-10分钟", description="预估时长")
    language: str = Field(default="中文", description="语言")
    style: str = Field(default="悬疑", description="视觉风格/类型")
    model_id: str | None = Field(default=None, description="文本模型 ID")


class ContinueScriptRequest(BaseModel):
    direction: str = Field(..., min_length=1, description="续写方向/要求")
    model_id: str | None = Field(default=None, description="文本模型 ID")


class RewriteScriptRequest(BaseModel):
    instruction: str = Field(..., min_length=1, description="改写要求")
    model_id: str | None = Field(default=None, description="文本模型 ID")


class ScriptResponse(BaseModel):
    content: str


@router.post("/generate", response_model=ScriptResponse)
async def api_generate_script(
    project_id: str,
    episode_id: str,
    data: GenerateScriptRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """AI 生成剧本：根据故事梗概自动创作完整剧本。"""
    from app.models.project import Project
    from app.models.episode import Episode

    pid = uuid.UUID(project_id)
    eid = uuid.UUID(episode_id)
    uid = uuid.UUID(current_user.id)

    verify = await db.execute(
        Project.__table__.select().where(Project.id == pid, Project.user_id == uid)
    )
    if not verify.first():
        raise HTTPException(status_code=404, detail="Project not found")

    verify_ep = await db.execute(
        Episode.__table__.select().where(Episode.id == eid, Episode.project_id == pid)
    )
    if not verify_ep.first():
        raise HTTPException(status_code=404, detail="Episode not found")

    content = await generate_script(
        prompt=data.prompt,
        duration=data.duration,
        language=data.language,
        style=data.style,
        model_id=data.model_id,
    )

    return ScriptResponse(content=content)


class StructureResponse(BaseModel):
    characters: list[dict]
    scenes: list[dict]
    props: list[dict]


@router.post("/structure", response_model=StructureResponse)
async def api_parse_structure(
    project_id: str,
    episode_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
    model_id: str | None = Query(None, description="Text model ID"),
):
    """AI 结构化解构：从剧本中提取角色、场景、道具列表。"""
    from app.models.project import Project
    from app.models.episode import Episode

    pid = uuid.UUID(project_id)
    eid = uuid.UUID(episode_id)
    uid = uuid.UUID(current_user.id)

    verify = await db.execute(
        Project.__table__.select().where(Project.id == pid, Project.user_id == uid)
    )
    if not verify.first():
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        Episode.__table__.select().where(Episode.id == eid, Episode.project_id == pid)
    )
    ep = result.first()
    if not ep:
        raise HTTPException(status_code=404, detail="Episode not found")

    script = ep._mapping.get("script_content") or ""
    if not script:
        raise HTTPException(status_code=400, detail="请先输入剧本内容")

    data = await parse_script_structure(script, model_id=model_id)

    # Also save extracted entities to project-level character/scene/prop tables
    if data.get("characters") or data.get("scenes") or data.get("props"):
        from app.models.character import Character
        from app.models.scene import Scene
        from app.models.prop import Prop

        # Delete existing entities for this project (fresh sync each time)
        await db.execute(Character.__table__.delete().where(Character.project_id == pid))
        await db.execute(Scene.__table__.delete().where(Scene.project_id == pid))
        await db.execute(Prop.__table__.delete().where(Prop.project_id == pid))

        for ch in data.get("characters", []):
            if ch.get("name"):
                db.add(Character(
                    project_id=pid,
                    name=ch["name"][:100],
                    description=ch.get("description") or ch.get("personality") or "",
                    prompt=f"A {ch.get('gender','')} character: {ch.get('name')}, personality: {ch.get('personality','')}",
                ))
        for sc in data.get("scenes", []):
            if sc.get("name"):
                db.add(Scene(
                    project_id=pid,
                    name=sc["name"][:100],
                    description=f"{sc.get('location','')} - {sc.get('time','')} - {sc.get('atmosphere','')}",
                ))
        for pp in data.get("props", []):
            if pp.get("name"):
                db.add(Prop(
                    project_id=pid,
                    name=pp["name"][:100],
                    description=pp.get("description") or pp.get("category") or "",
                ))
        await db.flush()

    return StructureResponse(**data)


@router.post("/continue", response_model=ScriptResponse)
async def api_continue_script(
    project_id: str,
    episode_id: str,
    data: ContinueScriptRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """AI 续写剧本：基于现有剧本内容继续创作。"""
    from app.models.project import Project
    from app.models.episode import Episode

    pid = uuid.UUID(project_id)
    eid = uuid.UUID(episode_id)
    uid = uuid.UUID(current_user.id)

    verify = await db.execute(
        Project.__table__.select().where(Project.id == pid, Project.user_id == uid)
    )
    if not verify.first():
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        Episode.__table__.select().where(Episode.id == eid, Episode.project_id == pid)
    )
    ep = result.first()
    if not ep:
        raise HTTPException(status_code=404, detail="Episode not found")

    existing_script = ep._mapping.get("script_content") or ""
    if not existing_script:
        raise HTTPException(status_code=400, detail="请先创建或输入剧本内容再续写")

    content = await continue_script(
        existing_script=existing_script,
        direction=data.direction,
        model_id=data.model_id,
    )

    return ScriptResponse(content=content)


@router.post("/rewrite", response_model=ScriptResponse)
async def api_rewrite_script(
    project_id: str,
    episode_id: str,
    data: RewriteScriptRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """AI 改写剧本：基于现有剧本内容按用户要求修改。"""
    from app.models.project import Project
    from app.models.episode import Episode

    pid = uuid.UUID(project_id)
    eid = uuid.UUID(episode_id)
    uid = uuid.UUID(current_user.id)

    verify = await db.execute(
        Project.__table__.select().where(Project.id == pid, Project.user_id == uid)
    )
    if not verify.first():
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        Episode.__table__.select().where(Episode.id == eid, Episode.project_id == pid)
    )
    ep = result.first()
    if not ep:
        raise HTTPException(status_code=404, detail="Episode not found")

    existing_script = ep._mapping.get("script_content") or ""
    if not existing_script:
        raise HTTPException(status_code=400, detail="请先创建或输入剧本内容再改写")

    content = await rewrite_script(
        existing_script=existing_script,
        instruction=data.instruction,
        model_id=data.model_id,
    )

    return ScriptResponse(content=content)
