"""Model capabilities registry — defines supported sizes, ratios, and params per model.

This is the single source of truth for what each model supports.
Frontend fetches this to dynamically adapt the parameter UI.
"""

from app.schemas.models import ModelCapability, SizeOption

# ─── Helper to build common size options ─────────────────────

def _size(label: str, value: str, aspect: str) -> SizeOption:
    w, h = [int(x) for x in value.split("x")]
    return SizeOption(label=label, value=value, pixels=w * h, aspect=aspect)


# ─── Image Model Capabilities ────────────────────────────────

IMAGE_CAPABILITIES: dict[str, ModelCapability] = {
    "doubao-seedream-4-5-251128": ModelCapability(
        id="doubao-seedream-4-5-251128",
        name="Doubao-Seedream-4.5",
        vendor="星河智云",
        type="image",
        min_pixels=3_686_400,
        max_pixels=16_777_216,
        step_size=64,
        max_batch=4,
        cost_per_unit=5,
        supported_sizes=[
            _size("1:1 方图",   "1920x1920", "1:1"),
            _size("16:9 横图",  "2560x1440", "16:9"),
            _size("9:16 竖图",  "1440x2560", "9:16"),
            _size("4:3 横图",   "2304x1728", "4:3"),
            _size("3:4 竖图",   "1728x2304", "3:4"),
            _size("3:2 横图",   "2496x1664", "3:2"),
            _size("21:9 超宽",  "3024x1296", "21:9"),
        ],
        aspect_ratios=["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"],
    ),
    "doubao-seedream-5-0-260128": ModelCapability(
        id="doubao-seedream-5-0-260128",
        name="Doubao-Seedream-5.0",
        vendor="星河智云",
        type="image",
        min_pixels=3_686_400,
        max_pixels=16_777_216,
        step_size=64,
        max_batch=4,
        cost_per_unit=8,
        supported_sizes=[
            _size("1:1 方图",   "2048x2048", "1:1"),
            _size("16:9 横图",  "2560x1440", "16:9"),
            _size("9:16 竖图",  "1440x2560", "9:16"),
            _size("4:3 横图",   "2304x1728", "4:3"),
            _size("3:4 竖图",   "1728x2304", "3:4"),
            _size("3:2 横图",   "2496x1664", "3:2"),
            _size("21:9 超宽",  "3024x1296", "21:9"),
        ],
        aspect_ratios=["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"],
    ),
}

# ─── Video Model Capabilities ────────────────────────────────

VIDEO_CAPABILITIES: dict[str, ModelCapability] = {
    "doubao-seedance-2-0-260128": ModelCapability(
        id="doubao-seedance-2-0-260128",
        name="Seedance 2.0",
        vendor="星河智云",
        type="video",
        max_batch=1,
        cost_per_unit=15,
        durations=[5, 10],
        resolutions=["720p", "1080p"],
    ),
    "doubao-seedance-2-0-fast-260128": ModelCapability(
        id="doubao-seedance-2-0-fast-260128",
        name="Seedance 2.0 Fast",
        vendor="星河智云",
        type="video",
        max_batch=1,
        cost_per_unit=8,
        durations=[5],
        resolutions=["720p"],
    ),
}

# ─── Text Model Capabilities (for script breakdown, prompt enhancement) ─

TEXT_CAPABILITIES: dict[str, ModelCapability] = {
    # DeepSeek 官方模型
    "deepseek-v4-flash": ModelCapability(
        id="deepseek-v4-flash",
        name="DeepSeek-V4-Flash",
        vendor="DeepSeek",
        type="text",
        cost_per_unit=6,
    ),
}


def get_capability(model_id: str) -> ModelCapability | None:
    """Get capability for a model by its ID."""
    return (
        IMAGE_CAPABILITIES.get(model_id)
        or VIDEO_CAPABILITIES.get(model_id)
        or TEXT_CAPABILITIES.get(model_id)
    )


def get_all_capabilities(model_type: str | None = None) -> list[ModelCapability]:
    """Get all capabilities, optionally filtered by type."""
    all_caps = (
        list(IMAGE_CAPABILITIES.values())
        + list(VIDEO_CAPABILITIES.values())
        + list(TEXT_CAPABILITIES.values())
    )
    if model_type:
        return [c for c in all_caps if c.type == model_type]
    return all_caps
