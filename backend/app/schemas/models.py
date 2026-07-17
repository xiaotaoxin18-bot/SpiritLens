"""Model capabilities schemas."""

from pydantic import BaseModel
from typing import Optional


class SizeOption(BaseModel):
    label: str
    value: str
    pixels: int
    aspect: str


class ModelCapability(BaseModel):
    id: str
    name: str
    vendor: str
    type: str  # "image" | "video"

    # Whether the model is enabled (synced from DB, default True)
    is_enabled: bool = True

    # Size constraints
    min_pixels: Optional[int] = None
    max_pixels: Optional[int] = None
    step_size: Optional[int] = None  # dimension must be multiple of this
    supported_sizes: list[SizeOption] = []
    aspect_ratios: list[str] = []

    # Batch support
    max_batch: int = 1

    # Video-specific
    durations: list[int] = []
    resolutions: list[str] = []

    # Cost
    cost_per_unit: int = 1
