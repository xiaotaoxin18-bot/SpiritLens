"""Script breakdown service — uses LLM to split a script into storyboard entries."""

import json
import logging
import re
import httpx
from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()
DEEPSEEK_API_KEY = settings.DEEPSEEK_API_KEY
DEEPSEEK_API_BASE = settings.DEEPSEEK_API_BASE

# Model registry: capability ID → {api_base, api_key, model_name}
_MODEL_REGISTRY = {
    "deepseek-v4-flash": {"base": DEEPSEEK_API_BASE, "key": DEEPSEEK_API_KEY, "model": "deepseek-v4-flash"},
}
_DEFAULT_MODEL_ID = "deepseek-v4-flash"

SYSTEM_PROMPT = """你是一个短剧剧本分镜拆解专家。你的任务是将一段剧本文字按镜头级拆解为分镜列表。

每个分镜必须包含以下字段：
- scene_description: 场景描述（地点、时间、环境氛围）
- action_description: 动作描述（角色在做什么，画面中的动态）
- shot_type: 景别类型，只能是以下之一：
  - "wide" 全景（展示整个场景和环境）
  - "full" 全（角色全身入镜）
  - "medium" 中景（角色腰部以上）
  - "closeup" 近景（角色胸部以上或特写物体）
  - "extreme_closeup" 特写（面部细节或微小物体）
- dialogue: 该分镜中的对白台词（如果没有台词则为空字符串）
- characters: 该分镜中出现的人物名称列表，如 ["张三", "李四"]
- props: 该分镜中出现的关键道具列表，如 ["剑", "酒杯"]

输出格式：直接输出一个 JSON 数组，每个元素是一个分镜对象。
不要输出 markdown 代码块标记，不要有任何额外文字，只输出纯 JSON。

示例：
[
  {
    "scene_description": "古代宫殿内景，金碧辉煌的大殿，龙椅上坐着皇帝",
    "action_description": "群臣跪拜，高呼万岁",
    "shot_type": "wide",
    "dialogue": "吾皇万岁万岁万万岁",
    "characters": ["皇帝", "群臣"],
    "props": ["龙椅", "朝笏"]
  }
]

注意事项：
1. 严格按照剧本的叙事顺序拆解，不要打乱
2. 每个分镜只描述一个镜头的内容
3. 确保所有人物和道具都被识别出来
4. 如果剧本中有画外音或旁白，放入 dialogue 字段并标注[旁白]"""


async def breakdown_script(script_text: str, model_id: str | None = None) -> list[dict]:
    """Call LLM to break down a script into storyboard entries.

    Args:
        script_text: The script text to break down.
        model_id: Optional model ID to use. If not provided, uses the default.

    Returns a list of dicts with keys:
        scene_description, action_description, shot_type, dialogue, characters, props
    """
    # Resolve model config from registry
    config = _MODEL_REGISTRY.get(model_id) if model_id else None
    if not config:
        config = _MODEL_REGISTRY.get(_DEFAULT_MODEL_ID)
    if not config:
        logger.warning("No model config found — using mock breakdown")
        return _mock_breakdown(script_text)

    api_base = config["base"]
    api_key = config["key"]
    model_name = config["model"]

    if not api_key:
        logger.warning("API key not configured for %s — using mock", model_id or "default")
        return _mock_breakdown(script_text)

    logger.info("Breaking down script with model: %s (id=%s) via %s", model_name, model_id or "default", api_base)

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{api_base}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model_name,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": script_text[:8000]},
                    ],
                    "max_tokens": 4096,
                    "temperature": 0.3,
                },
            )

            if resp.status_code != 200:
                logger.warning("Breakdown API returned %d: %s", resp.status_code, resp.text[:300])
                return _mock_breakdown(script_text)

            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if not content:
                return _mock_breakdown(script_text)

            return _parse_llm_response(content)

    except Exception as e:
        logger.error("Script breakdown failed: %s", e)
        return _mock_breakdown(script_text)


def _parse_llm_response(content: str) -> list[dict]:
    """Parse LLM response string into a list of storyboard dicts."""
    cleaned = content.strip()

    # Remove markdown code block markers if present
    if cleaned.startswith("```"):
        first_nl = cleaned.find("\n")
        if first_nl != -1:
            cleaned = cleaned[first_nl:].strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

    # Try to find JSON array in the response
    try:
        items = json.loads(cleaned)
        if isinstance(items, list):
            return items
    except json.JSONDecodeError:
        pass

    # Fallback: try to extract JSON array using bracket matching
    try:
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start != -1 and end != -1 and end > start:
            items = json.loads(cleaned[start : end + 1])
            if isinstance(items, list):
                return items
    except (json.JSONDecodeError, ValueError):
        pass

    logger.warning("Could not parse LLM response as JSON, using mock fallback")
    return _mock_breakdown("")


# ── Chinese Script Parser (mock / offline mode) ───────────────


# Regex: scene header like "1-1 顶层暗房 内 夜 人物：艾琳娜、马库斯"
# Also matches "1-1 外景 街道 日 人物：张三"
_SCENE_HEADER_RE = re.compile(
    r"(?:\d+\s*[-_]\s*\d+)?"           # optional "1-1" number
    r".*?"                               # location (lazy)
    r"(内|外)\s*"                        # interior/exterior marker
    r"(\S+\s*)"                          # time of day
    r"(?:人物[：:]\s*(.+?))?"            # optional characters
    r"$",
    re.MULTILINE,
)

# Matches "△" action marker at start of a segment
_ACTION_MARKER = re.compile(r"△")

# Matches dialogue: "角色名：（表情）对话内容" or "角色名：对话内容"
# name must be 2-4 Chinese chars or alphanumeric
# Must be followed by ： or :, optionally with （expression）
_DIALOGUE_RE = re.compile(
    r"([一-鿿\w]{2,4})"
    r"[：:]"
    r"(?:（[^）]*）)?"                    # optional parenthetical direction in （）
    r"(.+?)$",
)

# Surname characters — helps identify dialogue names
_SURNAMES = set("艾李王张陈马刘赵孙周吴郑钱冯卫蒋沈韩杨朱秦尤许何吕施")


def _find_dialogue(text: str, known_chars: list[str]) -> tuple[str, str, int] | None:
    """Find dialogue in text. Returns (char_name, cleaned_dialogue, start_pos) or None.

    Only treats as dialogue if the matched name is trusted:
    - Is in known_chars, OR
    - Starts with a common Chinese surname character, OR
    - Is followed by （ (parenthetical direction)
    """
    for m in _DIALOGUE_RE.finditer(text):
        name = m.group(1)
        raw_rest = m.group(2)
        start_pos = m.start()

        # Check if this looks like real character dialogue
        is_trusted = (
            name in known_chars
            or (name and name[0] in _SURNAMES)
            or (start_pos + len(name) < len(text) and text[start_pos + len(name):].startswith("（"))
        )

        if is_trusted:
            cleaned = _clean_dialogue(raw_rest)
            if cleaned.strip():
                return name, cleaned.strip(), start_pos

    return None


def _mock_breakdown(script: str) -> list[dict]:
    """Parse Chinese drama script into storyboard entries offline.

    Handles standard Chinese 剧本 format:
      - Scene headers: "1-1 顶层暗房 内 夜 人物：艾琳娜、马库斯"
      - Action markers: "△红光昏暗。显影液刺鼻。"
      - Dialogue: "马库斯：（面无表情）SEC的传票。"
    """
    if not script:
        return _mock_default()

    # Merge all lines into one for consistent processing
    text = script.replace("\r\n", "\n").replace("\r", "\n").replace("\n", " ").strip()

    # Split by △ — each segment after △ is a potential storyboard beat
    segments = re.split(r"△", text)

    # Phase 1: extract scene context from the first segment (before first △)
    # and from any segment that contains a scene header pattern
    scene_location = ""
    scene_time = ""
    scene_characters: list[str] = []

    # Check first segment for scene header info
    first = segments[0].strip()
    header_info = _parse_header_info(first)
    if header_info:
        scene_location, scene_time, scene_characters = header_info
        # Remove the header portion from the segment for further processing
        segments[0] = _strip_header(first)

    result = []

    for i, seg_text in enumerate(segments):
        seg_text = seg_text.strip()
        if not seg_text:
            continue

        # Check if this segment starts with a scene header (for multi-scene scripts)
        header_info = _parse_header_info(seg_text)
        if header_info:
            scene_location, scene_time, scene_characters = header_info
            remaining = _strip_header(seg_text)
            if not remaining:
                # This segment was just a header, create establishing shot
                result.append({
                    "scene_description": f"{scene_location}，{scene_time}" if scene_time else scene_location,
                    "action_description": "场景建立镜头",
                    "shot_type": "wide",
                    "dialogue": "",
                    "characters": scene_characters.copy(),
                    "props": [],
                })
                continue
            seg_text = remaining

        # Now process this segment for action and/or dialogue
        # Search for dialogue pattern anywhere in the segment
        # Only treat as dialogue if the name is a known character OR followed by （
        dial_search = _find_dialogue(seg_text, scene_characters)
        if dial_search:
            char_name, dial_text, dial_start = dial_search
            action_before = seg_text[:dial_start].strip()

            if action_before:
                # Create action shot first
                result.append({
                    "scene_description": scene_location or f"场景 {len(result) + 1}",
                    "action_description": action_before[:300],
                    "shot_type": _infer_shot_type(action_before, "medium"),
                    "dialogue": "",
                    "characters": _resolve_chars(scene_characters, char_name),
                    "props": _extract_props(action_before),
                })
            # Create dialogue shot
            result.append({
                "scene_description": scene_location or f"场景 {len(result) + 1}",
                "action_description": "",
                "shot_type": "closeup",
                "dialogue": dial_text,
                "characters": _resolve_chars(scene_characters, char_name),
                "props": _extract_props(seg_text),
            })
        else:
            # Pure action shot
            result.append({
                "scene_description": scene_location or f"场景 {len(result) + 1}",
                "action_description": seg_text[:300],
                "shot_type": _infer_shot_type(seg_text, "medium"),
                "dialogue": "",
                "characters": _extract_known_chars(seg_text, scene_characters),
                "props": _extract_props(seg_text),
            })

    # Clean up: fill in scene descriptions
    for i, item in enumerate(result):
        desc = item["scene_description"]
        if not desc or desc.startswith("场景 "):
            if scene_location:
                item["scene_description"] = f"{scene_location}，{scene_time}" if scene_time else scene_location
            else:
                item["scene_description"] = f"场景 {i + 1}"
        if not item["characters"] and scene_characters:
            item["characters"] = scene_characters.copy()

    if not result:
        return _mock_default()

    return result


def _parse_header_info(text: str) -> tuple[str, str, list[str]] | None:
    """Extract scene header info (location, time, characters) from text.

    Looks for: "1-1 顶层暗房 内 夜 人物：艾琳娜、马库斯"
    """
    chars = []

    # Find 人物： marker — stop before △ or 。 or other structural punctuation
    chars_match = re.search(r"人物[：:]\s*([^△。；;]+)", text)
    if chars_match:
        chars = _parse_characters(chars_match.group(1).strip())

    # Find 内 or 外 — key scene header indicator
    # Look for pattern: optional description + 内/外 + time
    io_match = re.search(
        r"([^△。，,]{1,30}?)(内|外)\s*(\S{1,6})?(?:\s+人物[：:])?",
        text,
    )
    if io_match:
        raw_prefix = io_match.group(1).strip()
        io_marker = io_match.group(2)
        time_str = (io_match.group(3) or "").strip()

        # Clean up prefix: strip episode/scene numbers like "1-1 ", episode title like "第1集[...]"
        prefix = re.sub(r"第\d+集\s*\[?[^\]]*\]?\s*", "", raw_prefix)
        prefix = re.sub(r"\d+\s*[-_]\s*\d+\s*", "", prefix)

        if not prefix:
            location = "室内" if io_marker == "内" else "室外"
        else:
            location = prefix.strip()

        # Append interior/exterior qualifier if not already present
        if io_marker == "内":
            location = location + " 内景" if "内" not in location else location
        else:
            location = location + " 外景" if "外" not in location else location

        return location, time_str, chars

    # If no 内/外 but has 人物：, use that
    if chars:
        return "场景", "", chars

    return None


def _strip_header(text: str) -> str:
    """Remove scene header portion from text, leaving action/dialogue content."""
    # Remove 人物：... portion (ends at △ or 。 or ；)
    text = re.sub(r"人物[：:][^△。；;]*", "", text)
    # Remove the scene descriptor prefix: "第1集 [xxx] 1-1 顶层暗房 内 夜"
    text = re.sub(
        r"第\d+集\s*\[?[^\]]*\]?\s*", "", text
    )
    text = re.sub(
        r"\d+\s*[-_]\s*\d+\s*", "", text
    )
    text = re.sub(
        r".*?(内|外)\s*\S{1,6}\s*", "", text, count=1
    )
    return text.strip()


def _clean_dialogue(text: str) -> str:
    """Clean dialogue text: strip parenthetical directions."""
    text = re.sub(r"[（(][^）)]*[）)]", "", text)
    return text.strip()


def _resolve_chars(known_chars: list[str], dial_char: str) -> list[str]:
    """Resolve character list including dialogue speaker."""
    chars = known_chars.copy() if known_chars else []
    if dial_char and dial_char not in chars:
        chars.append(dial_char)
    return chars


def _extract_known_chars(text: str, known_chars: list[str]) -> list[str]:
    """Extract known character names appearing in action text."""
    return [c for c in known_chars if c in text] if known_chars else []


def _parse_characters(chars_str: str) -> list[str]:
    """Parse character names from a Chinese comma-separated list."""
    if not chars_str:
        return []
    chars = [c.strip() for c in re.split(r"[，,、]", chars_str) if c.strip()]
    stopwords = {"人物", "角色", "群众", "群臣", "众"}
    return [c for c in chars if c not in stopwords]


def _extract_props(text: str) -> list[str]:
    """Extract likely props from action description."""
    prop_keywords = [
        "手机", "照片", "剑", "刀", "枪", "酒杯", "书信", "文件",
        "皮包", "皮箱", "手表", "眼镜", "钥匙", "钱", "包", "车", "电脑",
        "计时器", "相纸", "镊子", "水槽", "牛皮纸袋", "传票", "相机",
    ]
    return [p for p in prop_keywords if p in text]


def _infer_shot_type(text: str, default: str = "medium") -> str:
    """Try to infer shot type from action description keywords."""
    if any(k in text for k in ["特写", "细节", "手部", "面部", "眼神", "手指", "夹起"]):
        return "extreme_closeup"
    if any(k in text for k in ["近景", "胸前", "表情", "脸部"]):
        return "closeup"
    if any(k in text for k in ["中景", "腰部", "对话", "交谈"]):
        return "medium"
    if any(k in text for k in ["全景", "环境", "场景", "室内", "室外", "昏暗", "踏入", "踹开"]):
        return "wide"
    if any(k in text for k in ["全身", "走入", "走出", "奔跑"]):
        return "full"
    return default


def _mock_default() -> list[dict]:
    """Default mock when no script is provided."""
    return [
        {
            "scene_description": "默认场景 - 室内客厅，傍晚时分",
            "action_description": "主角从门口走进来",
            "shot_type": "medium",
            "dialogue": "",
            "characters": ["主角"],
            "props": [],
        },
        {
            "scene_description": "室内客厅，暖色灯光",
            "action_description": "主角坐下，拿起桌上的照片端详",
            "shot_type": "closeup",
            "dialogue": "这是…最后的合影了",
            "characters": ["主角"],
            "props": ["照片", "桌子"],
        },
        {
            "scene_description": "室外街道，夜晚，霓虹灯闪烁",
            "action_description": "主角匆匆走过街道",
            "shot_type": "wide",
            "dialogue": "",
            "characters": ["主角"],
            "props": [],
        },
    ]
