"""Novel import service — uses LLM to split a novel into episodes."""

import json
import logging
import httpx
from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()
DEEPSEEK_API_KEY = settings.DEEPSEEK_API_KEY
DEEPSEEK_API_BASE = settings.DEEPSEEK_API_BASE

SYSTEM_PROMPT = """你是一个专业的小说分集编辑。你的任务是将一篇长篇小说或剧本按叙事结构拆分为若干集。

每集必须包含以下字段：
- title: 该集的标题（概括本集核心内容，简洁有力，不超过20字）
- summary: 该集的内容概要（50-100字，说清本集发生了什么）
- script_content: 该集的完整剧本/正文内容（原文截取，保持原样，不要改写）

要求：
1. 按自然章节或剧情段落拆分，每集内容量大致均匀
2. 如果原文已有明确的分章/分节标记，优先按这些标记拆分
3. 如果没有分章标记，按剧情转折点合理切分（约1500-3000字为一集）
4. 每集开头的script_content必须从原文该段起始处完整截取
5. 保留原文的全部内容，不要删减

输出格式：直接输出一个 JSON 数组，每个元素是一集。
不要输出 markdown 代码块标记，不要有任何额外文字，只输出纯 JSON。

示例：
[
  {
    "title": "血色协议",
    "summary": "艾琳娜在暗房冲洗照片时发现父亲失踪的线索，马库斯突然闯入带来SEC传票。",
    "script_content": "第1集 [血色协议与十二年暗线] 1-1 顶层暗房 内 夜 人物：艾琳娜、马库斯 △红光昏暗..."
  }
]
"""


async def split_novel_into_episodes(novel_text: str) -> list[dict]:
    """Call LLM to split a novel into episodes.

    Returns a list of dicts with keys: title, summary, script_content
    """
    if not DEEPSEEK_API_KEY:
        logger.warning("No DeepSeek API key configured — using mock split")
        return _mock_split(novel_text)

    try:
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(
                f"{DEEPSEEK_API_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "deepseek-v4-flash",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": novel_text[:15000]},
                    ],
                    "max_tokens": 8192,
                    "temperature": 0.3,
                },
            )

            if resp.status_code != 200:
                logger.warning("Novel split API returned %d: %s", resp.status_code, resp.text[:300])
                return _mock_split(novel_text)

            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if not content:
                return _mock_split(novel_text)

            return _parse_llm_response(content, novel_text)

    except Exception as e:
        logger.error("Novel split failed: %s", e)
        return _mock_split(novel_text)


def _parse_llm_response(content: str, original_text: str) -> list[dict]:
    """Parse LLM response into a list of episode dicts."""
    cleaned = content.strip()

    # Remove markdown code block markers
    if cleaned.startswith("```"):
        first_nl = cleaned.find("\n")
        if first_nl != -1:
            cleaned = cleaned[first_nl:].strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

    # Try to find JSON array
    try:
        items = json.loads(cleaned)
        if isinstance(items, list):
            return items
    except json.JSONDecodeError:
        pass

    # Fallback: try to extract JSON array
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
    return _mock_split(original_text)


def _mock_split(novel_text: str) -> list[dict]:
    """Split novel by paragraphs or chapter markers when LLM unavailable."""
    if not novel_text or len(novel_text.strip()) < 100:
        # Too short to split
        return [{
            "title": "第1集",
            "summary": novel_text[:100] if novel_text else "",
            "script_content": novel_text or "",
        }]

    # Try to split by chapter markers like "第X章", "Chapter X", "---"
    lines = novel_text.split("\n")
    chapters = []
    current_chapter = []
    current_title = None

    for line in lines:
        stripped = line.strip()
        # Detect chapter headings
        if any(marker in stripped for marker in ["第", "章", "Chapter", "CHAPTER", "——", "—"]):
            if len(stripped) < 30 and (stripped.startswith("第") or stripped.startswith("Chapter") or stripped.startswith("CHAPTER") or "章" in stripped):
                if current_chapter:
                    chapters.append((current_title or f"第{len(chapters)+1}集", "\n".join(current_chapter)))
                current_title = stripped
                current_chapter = []
                continue
        current_chapter.append(line)

    if current_chapter:
        chapters.append((current_title or f"第{len(chapters)+1}集", "\n".join(current_chapter)))

    # If no chapters detected, split by double newlines
    if len(chapters) <= 1:
        paragraphs = [p.strip() for p in novel_text.split("\n\n") if p.strip()]
        chunks = []
        chunk_size = max(1, len(paragraphs) // 3) if len(paragraphs) > 3 else len(paragraphs)
        for i in range(0, len(paragraphs), chunk_size):
            chunk = "\n\n".join(paragraphs[i:i+chunk_size])
            chunks.append((f"第{len(chunks)+1}集", chunk))

        chapters = chunks if chunks else [(novel_text[:50], novel_text)]

    result = []
    for title, content in chapters[:10]:  # cap at 10 episodes
        result.append({
            "title": title[:100] if title else f"第{len(result)+1}集",
            "summary": content[:150] if content else "",
            "script_content": content,
        })

    return result
