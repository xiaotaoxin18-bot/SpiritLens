"""Script structure parsing service — extracts characters, scenes, props from script using LLM."""

import json
import logging
import asyncio
import httpx
from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()
DEEPSEEK_API_KEY = settings.DEEPSEEK_API_KEY
DEEPSEEK_API_BASE = settings.DEEPSEEK_API_BASE

_MODEL_REGISTRY = {
    "deepseek-v4-flash": {"base": DEEPSEEK_API_BASE, "key": DEEPSEEK_API_KEY, "model": "deepseek-v4-flash"},
}
_DEFAULT_MODEL_ID = "deepseek-v4-flash"


SYSTEM_PROMPT = """你是一个剧本结构分析专家。你的任务是从一段剧本文字中提取出结构化的信息。

输出格式：直接输出一个 JSON 对象，包含以下三个字段：
1. characters: 角色列表，每个角色包含：
   - name: 角色名
   - gender: 性别
   - personality: 性格描述（从对白和动作中推断）
   - description: 外貌/身份描述

2. scenes: 场景列表，每个场景包含：
   - name: 场景名（如"顶层暗房"、"老街"）
   - location: 地点描述
   - time: 时间（日/夜/清晨/黄昏）
   - atmosphere: 氛围描述

3. props: 道具列表，每个道具包含：
   - name: 道具名称
   - category: 分类（武器/文件/日常/科技/其他）
   - description: 道具描述

注意：
- 去重：同名角色/场景/道具只出现一次
- 如果没有明确信息，字段可以为空字符串
- 只输出纯 JSON，不要 markdown 代码块，不要额外文字

示例输出：
{
  "characters": [
    {"name": "艾琳娜", "gender": "女", "personality": "冷静果断", "description": "年轻女侦探"},
    {"name": "马库斯", "gender": "男", "personality": "深沉内敛", "description": "神秘男子"}
  ],
  "scenes": [
    {"name": "顶层暗房", "location": "公寓顶层", "time": "夜", "atmosphere": "昏暗压抑，红光闪烁"}
  ],
  "props": [
    {"name": "传票", "category": "文件", "description": "SEC调查传票"},
    {"name": "照片", "category": "日常", "description": "泛黄的老照片"}
  ]
}"""


async def parse_script_structure(script_text: str, model_id: str | None = None) -> dict:
    """Parse script text and extract characters, scenes, props."""
    config = _resolve_model(model_id)
    if not config or not config.get("key"):
        logger.warning("No LLM configured — returning mock structure")
        return _empty_structure()

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            # Retry loop with exponential backoff for 429 rate limits
            max_retries = 3
            for attempt in range(max_retries + 1):
                resp = await client.post(
                    f"{config['base']}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {config['key']}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": config["model"],
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": script_text[:8000]},
                        ],
                        "max_tokens": 4096,
                        "temperature": 0.3,
                    },
                )
                if resp.status_code == 429 and attempt < max_retries:
                    wait = 10 * (attempt + 1)
                    logger.warning("Structure API 429 (attempt %d/%d), retrying in %ds...", attempt + 1, max_retries, wait)
                    await asyncio.sleep(wait)
                else:
                    break

            if resp.status_code != 200:
                logger.warning("Structure API returned %d: %s", resp.status_code, resp.text[:300])
                return _empty_structure()

            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if content:
                return _parse_response(content)

    except Exception as e:
        logger.error("Script structure parsing failed: %s", e)

    return _empty_structure()


def _parse_response(content: str) -> dict:
    """Parse LLM JSON response."""
    cleaned = content.strip()
    if cleaned.startswith("```"):
        first_nl = cleaned.find("\n")
        if first_nl != -1:
            cleaned = cleaned[first_nl:].strip()
        for end in ["```json", "```"]:
            if cleaned.endswith(end):
                cleaned = cleaned[:-len(end)].strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

    try:
        result = json.loads(cleaned)
        if isinstance(result, dict):
            return {
                "characters": result.get("characters", []),
                "scenes": result.get("scenes", []),
                "props": result.get("props", []),
            }
    except json.JSONDecodeError:
        pass

    try:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            result = json.loads(cleaned[start:end+1])
            return {
                "characters": result.get("characters", []),
                "scenes": result.get("scenes", []),
                "props": result.get("props", []),
            }
    except (json.JSONDecodeError, ValueError):
        pass

    logger.warning("Could not parse LLM structure response as JSON")
    return _empty_structure()


def _empty_structure() -> dict:
    """Return empty structure when LLM unavailable."""
    return {"characters": [], "scenes": [], "props": []}


def _resolve_model(model_id: str | None) -> dict | None:
    config = _MODEL_REGISTRY.get(model_id) if model_id else None
    if not config:
        config = _MODEL_REGISTRY.get(_DEFAULT_MODEL_ID)
    return config
