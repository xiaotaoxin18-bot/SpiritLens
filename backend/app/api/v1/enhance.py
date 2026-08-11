"""Prompt enhancement API.

POST /api/v1/enhance/prompt  — enrich an image prompt
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.services.prompt_enhancer import enhance_prompt

router = APIRouter(prefix="/enhance", tags=["enhance"])


class EnhanceRequest(BaseModel):
    prompt: str = Field(..., min_length=1)


class EnhanceResponse(BaseModel):
    original: str
    enhanced: str


@router.post("/prompt", response_model=EnhanceResponse)
async def enhance_image_prompt(req: EnhanceRequest):
    """Enrich an image prompt with more visual details."""
    enhanced = await enhance_prompt(req.prompt)
    return EnhanceResponse(original=req.prompt, enhanced=enhanced)
