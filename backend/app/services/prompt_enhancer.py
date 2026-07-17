"""Prompt enhancement service — uses LLM to enrich image generation prompts."""

import httpx
import logging
from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()
LLM_API_KEY = settings.DEEPSEEK_API_KEY
LLM_API_BASE = settings.DEEPSEEK_API_BASE
LLM_MODEL = "deepseek-v4-flash"

SYSTEM_PROMPT = """你是一个AI绘画提示词优化助手。你的任务是：
1. 理解用户输入的原始提示词
2. 丰富视觉细节（光影、色彩、构图、材质、风格等）
3. 保持用户的原始意图和核心元素
4. 用中文输出，简洁精炼，不要多余的解释
5. 直接输出优化后的提示词，不要加引号、前缀或后缀

示例：
用户输入：一只猫坐在窗边
优化后：一只虎斑猫安静地坐在木质窗台上，午后阳光透过玻璃洒在它柔软的毛发上，窗外是朦胧的城市天际线，温暖的暖色调，电影级光影，浅景深"""


async def enhance_prompt(original: str) -> str:
    """Enhance/simplify an image prompt using LLM."""
    if not LLM_API_KEY:
        return original

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{LLM_API_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {LLM_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": LLM_MODEL,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": original},
                    ],
                    "max_tokens": 300,
                    "temperature": 0.7,
                },
            )

            if resp.status_code != 200:
                logger.warning("Enhance API returned %d: %s", resp.status_code, resp.text[:200])
                return original

            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if content:
                return content.strip().strip('"').strip("'")

    except Exception as e:
        logger.error("Prompt enhancement failed: %s", e)

    return original
