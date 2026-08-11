"""Script generation service — uses LLM to generate or continue drama scripts."""

import json
import logging
import httpx
from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()
DEEPSEEK_API_KEY = settings.DEEPSEEK_API_KEY
DEEPSEEK_API_BASE = settings.DEEPSEEK_API_BASE

# Text model registry — only DeepSeek Official
MODEL_REGISTRY = {
    "deepseek-v4-flash": {"base": DEEPSEEK_API_BASE, "key": DEEPSEEK_API_KEY, "model": "deepseek-v4-flash"},
}
_DEFAULT_MODEL_ID = "deepseek-v4-flash"

# ── Generate from scratch ──────────────────────────────────────

SYSTEM_PROMPT_GENERATE = """你是一个短剧/影视剧本创作专家。根据用户提供的故事梗概或主题，创作一段完整的剧本。

创作要求：
1. 剧本格式：使用标准中文剧本格式，包含场景标题（场次/地点/时间）；
2. 描写生动：场景描写用 "△" 标记，动作描写要有画面感；
3. 对白自然：角色对话要符合人物性格；
4. 结构完整：包含起承转合；
5. 输出纯剧本文字，不要评价。

示例格式：
1-1 顶层暗房 内 夜 人物：艾琳娜、马库斯
△红光昏暗。显影液刺鼻。暗房中只有一盏红灯照明。
马库斯：（面无表情）SEC的传票到了。
艾琳娜：什么？他们怎么知道的？
△艾琳娜手中的相纸滑落在地。"""


async def generate_script(
    prompt: str,
    duration: str = "5-10分钟",
    language: str = "中文",
    style: str = "悬疑",
    model_id: str | None = None,
) -> str:
    """Generate a script from a prompt/topic description."""
    config = _resolve_model(model_id)
    if not config or not config.get("key"):
        logger.warning("No LLM configured — returning mock script")
        return _mock_generated_script(prompt, duration, style)

    user_prompt = (
        f"请创作一部{style}风格的短剧剧本（预估时长{duration}）。\n"
        f"语言：{language}\n"
        f"故事梗概：{prompt}\n\n"
        "请直接输出完整的剧本，包含场景标题和对白。"
    )

    try:
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(
                f"{config['base']}/chat/completions",
                headers={
                    "Authorization": f"Bearer {config['key']}",
                    
                    "temperature": 0.8,
                },
            )

            if resp.status_code != 200:
                logger.warning("Script generation API returned %d: %s", resp.status_code, resp.text[:300])
                return _mock_generated_script(prompt, duration, style)

            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if content:
                return content.strip()

    except Exception as e:
        logger.error("Script generation failed: %s", e)

    return _mock_generated_script(prompt, duration, style)


# ── Continue / extend existing script ──────────────────────────

SYSTEM_PROMPT_CONTINUE = """你是一个短剧/影视剧本续写专家。根据已有的剧本内容和用户的新要求，继续往下创作。

要求：
1. 保持原剧本的人物设定、风格和节奏；
2. 续写部分与原文自然衔接；
3. 使用相同格式（场景标题/△标记/对白）；
4. 直接输出续写内容，不重复原文，不要评价。"""

async def continue_script(
    existing_script: str,
    direction: str,
    model_id: str | None = None,
) -> str:
    """Continue/extend an existing script based on user direction."""
    config = _resolve_model(model_id)
    if not config or not config.get("key"):
        logger.warning("No LLM configured — returning mock continuation")
        return _mock_continuation(direction)

    user_prompt = (
        f"已有剧本：\n{existing_script[:6000]}\n\n"
        f"续写要求：{direction}\n\n"
        "请直接输出续写的剧本内容。"
    )

    try:
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(
                f"{config['base']}/chat/completions",
                headers={
                    "Authorization": f"Bearer {config['key']}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": config["model"],
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT_CONTINUE},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 4096,
                    "temperature": 0.7,
                },
            )

            if resp.status_code != 200:
                logger.warning("Script continue API returned %d: %s", resp.status_code, resp.text[:300])
                return _mock_continuation(direction)

            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if content:
                return content.strip()

    except Exception as e:
        logger.error("Script continuation failed: %s", e)

    return _mock_continuation(direction)


# ── Rewrite existing script ────────────────────────────────────

SYSTEM_PROMPT_REWRITE = """你是一个短剧/影视剧本修改专家。根据用户提供的修改要求，对现有剧本进行修改。

要求：
1. 严格遵循用户的修改要求进行改写；
2. 保持原剧本的基本框架和人物设定；
3. 使用相同格式（场景标题/△标记/对白）；
4. 输出完整的修改后的剧本（包含未修改的部分），不要遗漏内容；
5. 直接输出剧本，不要评价。"""


async def rewrite_script(
    existing_script: str,
    instruction: str,
    model_id: str | None = None,
) -> str:
    """Rewrite/modify an existing script based on user instruction."""
    config = _resolve_model(model_id)
    if not config or not config.get("key"):
        logger.warning("No LLM configured — returning mock rewrite")
        return _mock_rewrite(existing_script, instruction)

    user_prompt = (
        f"已有剧本：\n{existing_script[:8000]}\n\n"
        f"修改要求：{instruction}\n\n"
        "请输出完整的修改后的剧本（保留未修改的部分）。"
    )

    try:
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(
                f"{config['base']}/chat/completions",
                headers={
                    "Authorization": f"Bearer {config['key']}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": config["model"],
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT_REWRITE},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 4096,
                    "temperature": 0.7,
                },
            )

            if resp.status_code != 200:
                logger.warning("Script rewrite API returned %d: %s", resp.status_code, resp.text[:300])
                return _mock_rewrite(existing_script, instruction)

            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if content:
                return content.strip()

    except Exception as e:
        logger.error("Script rewrite failed: %s", e)

    return _mock_rewrite(existing_script, instruction)


# ── Helpers ────────────────────────────────────────────────────

def _resolve_model(model_id: str | None) -> dict | None:
    """Resolve model config by ID, or use default."""
    config = MODEL_REGISTRY.get(model_id) if model_id else None
    if not config:
        config = MODEL_REGISTRY.get(_DEFAULT_MODEL_ID)
    return config


def _mock_generated_script(prompt: str, duration: str, style: str) -> str:
    """Generate a mock script when LLM is unavailable."""
    return f"""1-1 客厅 内 夜 人物：林浩、苏雨晴
△客厅里灯光昏暗，窗外下着雨。林浩坐在沙发上，手中握着一张泛黄的照片。
苏雨晴从门外走进来，浑身湿透。

苏雨晴：（气喘吁吁）你真的去了那个地方？

林浩：（头也不抬）我必须知道真相。

△林浩将照片放在茶几上，照片里是一扇古老的大门。

1-2 书房 内 日 人物：林浩
△第二天清晨，林浩在书房里翻阅旧报纸。阳光透过百叶窗在地板上投下条纹状的光影。

林浩：（自言自语）所有的线索都指向同一个地方…

△他合上报纸，从抽屉里拿出一把生锈的钥匙。

1-3 老街 外 日 人物：林浩、神秘老人
△午后的老街上人烟稀少。林浩按照地址找到一栋废弃的楼房。
一位白发老人坐在楼下的藤椅上。

神秘老人：（眯着眼）你终于来了。我等了三十年。

林浩：（紧张地）您知道这把钥匙的来历？

神秘老人：那是你父亲留下的。他…不是普通人。

△林浩震惊地看着手中的钥匙，它在阳光下发出一丝微弱的光芒。

（AI 生成 | 风格：{style} | 时长：{duration} | 基于：{prompt}）"""


def _mock_rewrite(existing: str, instruction: str) -> str:
    """Return a mock rewritten script when LLM is unavailable."""
    return existing + f"\n\n（AI 改写 | 要求：{instruction}）"


def _mock_continuation(direction: str) -> str:
    """Generate a mock continuation when LLM is unavailable."""
    return f"""
1-4 地下室 内 夜 人物：林浩、苏雨晴
△林浩和苏雨晴顺着楼梯来到地下室。空气中弥漫着灰尘和铁锈的味道。
墙上挂满了泛黄的图纸和照片。

苏雨晴：（低声）这里到底是什么地方？

林浩：（用手电筒照向深处）我父亲的实验室。他失踪前一直在这里工作。

△手电筒的光束照到一张巨大的工作台，上面散落着各种仪器和笔记。

1-5 实验室 内 夜 人物：林浩、苏雨晴
△林浩翻开桌上的笔记本，里面密密麻麻写满了实验记录。

林浩：（念）"第47次实验…终于成功了。但这代价…"

苏雨晴：（凑过来看）代价？什么代价？

△笔记本的最后一页被撕掉了，只留下一个日期——三十年前的今天。

林浩：（声音有些发抖）明天…就是那个日期的三十周年。

（AI 续写 | 方向：{direction}）"""


# ─── Shot list generation ────────────────────────────────

SHOT_GENERATION_SYSTEM_PROMPT = """你是一个专业影视分镜设计师。根据提供的剧本结构数据（场景、角色、道具、故事段落），为每个场景生成精确的分镜列表。

输出要求：
1. 每个场景生成 2-5 个分镜，根据段落内容丰富程度决定
2. 每个分镜包含：
   - sceneId: 对应的场景ID
   - actionSummary: 镜头动作描述（中文，50-100字）
   - cameraMovement: 运镜方式（fixed/pan/tilt/zoom/track/dolly/crane/handheld）
   - shotSize: 景别（close-up/medium-shot/full-shot/long-shot/wide-shot）
   - characters: 该镜头涉及的角色ID列表
   - props: 该镜头涉及的道具ID列表
3. 分镜顺序按故事发展排列
4. 相同场景的多个分镜要有不同的运镜和景别

只输出 JSON 数组，格式：
[{"sceneId":"...","actionSummary":"...","cameraMovement":"...","shotSize":"...","characters":["..."],"props":["..."]}]"""


async def generate_shot_list(
    scenes: list[dict],
    characters: list[dict] | None = None,
    props: list[dict] | None = None,
    story_paragraphs: list[dict] | None = None,
    model_id: str | None = None,
) -> list[dict]:
    """Generate a shot list from script structure data using AI."""
    config = _resolve_model(model_id)
    if not config or not config.get("key"):
        logger.warning("No LLM configured — returning mock shot list")
        return _mock_shot_list(scenes, characters, props)

    chars = characters or []
    proplist = props or []
    paragraphs = story_paragraphs or []

    scenes_text = "\n".join([
        f"场景{s.get('id','?')}: {s.get('name','')} - {s.get('location','')} {s.get('time','')} {s.get('atmosphere','')}"
        for s in scenes
    ])
    chars_text = "\n".join([
        f"角色{c.get('id','?')}: {c.get('name','')} ({c.get('gender','')}, {c.get('age','')}) - {c.get('personality','')}"
        for c in chars
    ])
    props_text = "\n".join([
        f"道具{p.get('id','?')}: {p.get('name','')} - {p.get('category','')} - {p.get('description','')}"
        for p in proplist
    ])
    paragraphs_text = "\n".join([
        f"段落{p.get('id','?')} [场景{p.get('sceneRefId','?')}]: {p.get('text','')[:200]}"
        for p in paragraphs
    ])

    user_prompt = f"""请根据以下剧本结构数据生成完整的分镜列表：

=== 场景列表 ===
{scenes_text}

=== 角色列表 ===
{chars_text}

=== 道具列表 ===
{props_text}

=== 故事段落 ===
{paragraphs_text}

要求：
1. 每个场景至少生成 2 个分镜
2. 分镜顺序按故事发展排列
3. 每个分镜使用不同的运镜和景别
4. 正确分配角色和道具（匹配段落中出现的角色和道具）
5. 动作描述要具体、有画面感
6. 用中文输出 actionSummary"""

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{config['base']}/chat/completions",
                headers={
                    "Authorization": f"Bearer {config['key']}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": config["model"],
                    "messages": [
                        {"role": "system", "content": SHOT_GENERATION_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 4096,
                    "temperature": 0.7,
                },
            )

            if resp.status_code != 200:
                logger.warning("Shot generation API returned %d: %s", resp.status_code, resp.text[:300])
                return _mock_shot_list(scenes, characters, props)

            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if content:
                import json as _json
                content_clean = content.strip()
                if content_clean.startswith("```"):
                    content_clean = content_clean.split("\n", 1)[-1]
                    if "```" in content_clean:
                        content_clean = content_clean.rsplit("```", 1)[0]
                    content_clean = content_clean.strip()
                if content_clean.startswith("["):
                    try:
                        shots = _json.loads(content_clean)
                        if isinstance(shots, list) and len(shots) > 0:
                            return shots
                    except _json.JSONDecodeError:
                        pass

    except Exception as e:
        logger.error("Shot generation failed: %s", e)

    return _mock_shot_list(scenes, characters, props)


def _mock_shot_list(scenes: list[dict], characters: list[dict] | None = None, props: list[dict] | None = None) -> list[dict]:
    """Generate a mock shot list when LLM is unavailable."""
    shots = []
    camera_movements = ["fixed", "pan", "tilt", "zoom", "track", "dolly", "handheld", "crane"]
    shot_sizes = ["wide-shot", "full-shot", "medium-shot", "close-up"]

    for si, scene in enumerate(scenes):
        scene_name = scene.get("name", f"场景{si+1}")
        desc = scene.get("description", "")
        loc = scene.get("location", "")
        atmos = scene.get("atmosphere", "")
        scene_id = scene.get("id", str(si + 1))

        shot_count = max(2, min(4, len(desc) // 30 + 2))
        for j in range(shot_count):
            cm = camera_movements[(si * 4 + j) % len(camera_movements)]
            ss = shot_sizes[j % len(shot_sizes)]
            shots.append({
                "sceneId": str(scene_id),
                "actionSummary": f"{scene_name} - {desc or '场景推进'}（{loc}·{atmos}）",
                "cameraMovement": cm,
                "shotSize": ss,
                "characters": [],
                "props": [],
            })

    return shots
