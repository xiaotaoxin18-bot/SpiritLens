"""Generation schemas for AI media generation."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ImageGenerationRequest(BaseModel):
    """Request to generate an image."""
    prompt: str = Field(..., min_length=1, max_length=50000)
    model_id: str = Field(..., description="AI model identifier")
    size: str = "1024x1024"
    batch: int = Field(default=1, ge=1, le=4)
    style: Optional[str] = None
    negative_prompt: Optional[str] = None
    seed: Optional[int] = None
    reference_images: list[str] = Field(default_factory=list, max_length=9)
    reference_strength: Optional[int] = Field(default=None, ge=0, le=100, description="参考强度 0-100")
    reference_dimension: Optional[str] = Field(default=None, pattern="^(style|character)$", description="参考维度: style=风格特征, character=人物长相")
    source: str = "ai-tool"  # 来源标记：ai-tool / project（AI 工具页历史恢复时排除 project）



class VideoGenerationRequest(BaseModel):
    """Request to generate a video."""
    prompt: str = Field(..., min_length=1, max_length=50000)
    model_id: str = Field(..., description="AI model identifier")
    duration: int = Field(default=5, ge=1, le=30)
    resolution: str = "720p"
    camera: str = "static"
    size: str = ""
    reference_mode: str = "universal"
    reference_images: list[str] = Field(default_factory=list, max_length=12)
    reference_audio: Optional[str] = Field(default=None, description="音频参考 URL（BGM/配音，mp3），与参考图一起传给天翼云")
    source: str = "ai-tool"  # 来源标记：ai-tool（AI 工具页）/ project（项目管理）


class GenerationTaskOut(BaseModel):
    """Task status response."""
    task_id: str
    status: str  # pending, running, completed, failed
    progress: int = 0
    created_at: datetime
    completed_at: Optional[datetime] = None
    model_id: str
    prompt: str

    # Results (only when completed)
    image_urls: list[str] = Field(default_factory=list)
    video_url: Optional[str] = None
    video_poster_url: Optional[str] = None

    # Error
    error_message: Optional[str] = None


class TaskStatusResponse(BaseModel):
    """Polling response for task status."""
    task_id: str
    status: str
    progress: int = 0
    image_urls: list[str] = Field(default_factory=list)
    video_url: Optional[str] = None
    video_poster_url: Optional[str] = None
    error_message: Optional[str] = None
    creation_id: Optional[str] = None  # UUID of the creations table record
