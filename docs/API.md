# SpiritLens API Reference

Base URL (production): `http://129.28.122.183/spiritlens/api/v1`

## 通用约定

- **时间字段**：数据库存 UTC naive（`TIMESTAMP WITHOUT TIME ZONE`）。API 返回的 `created_at` 等时间带 `+00:00` 时区标注（如 `2026-08-08T06:06:00+00:00`），浏览器 `new Date()` 自动转本地时区（东八区显示 +8h）。**不要返回无时区字符串**（会被前端按本地时间解析导致差 8 小时）。
- **鉴权**：`Authorization: Bearer <token>`。缺 header / token 无效返回 401（非 422）。
- **媒体下载**：跨域 CDN 资源前端走 `downloadMedia()`（fetch blob → 回退代理），见各下载端点。

---

## Auth

### POST /api/v1/auth/register

Register a new user.

```json
{
  "email": "user@example.com",
  "nickname": "灵境创作者",
  "password": "password123"
}
```

**Optional fields:** `phone`, `username`

Response `201`:
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "username": null,
  "nickname": "灵境创作者",
  "is_admin": false
}
```

### POST /api/v1/auth/login

Login and receive JWT tokens.

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response `200`:
```json
{
  "access_token": "jwt...",
  "refresh_token": "jwt...",
  "token_type": "bearer"
}
```

Access Token 默认 7 天不过期，可通过 Redis 覆盖。

**错误响应**：`detail` 字段为中文（如 `{"detail": "用户名或密码错误"}`），前端直接展示，不另做映射。

### POST /api/v1/auth/admin-login

Admin login — username + password.

### GET /api/v1/auth/me

Get current user info. Requires `Authorization: Bearer <token>`.

### PUT /api/v1/auth/me

Update current user profile（个人管理，2026-08-08 新增）。仅更新传入字段，返回更新后的 `UserOut`。

```json
{ "nickname": "新昵称" }
```

| Field | 规则 |
|---|---|
| `nickname` | 1~100 字符 |
| `bio` | ≤500 字符 |
| `avatar_url` | ≤500 字符 |

前端入口：首页（`SpiritLensHero`）与全局导航（`Header.tsx`）用户菜单 →「个人管理」→ 弹窗改昵称 → 前端 `updateUser()` 即时刷新。

### POST /api/v1/auth/change-password

修改密码（2026-08-10 新增）。验证旧密码后更新新密码哈希，前端入口：个人管理弹窗（首页 + 全局导航两处一致）。

```json
{ "old_password": "旧密码", "new_password": "新密码" }
```

| 错误 | 场景 |
|---|---|
| 400「当前密码不正确」 | 旧密码验证失败 |
| 400「新密码不能与当前密码相同」 | 新旧相同 |
| 400「该账号未设置密码」 | 第三方登录等无密码账号 |

### GET /api/v1/auth/captcha

Get a captcha image (SVG). Used during registration. **token 存 Redis（2026-08-10 修复）**：之前用进程内存 dict，后端 4 个 uvicorn worker 各存各的导致「验证码正确却报错、多点几次才成功」——现存 `spiritlens:captcha:` 前缀 + 300s TTL，所有 worker 共享；一次性消费（验证即删）。前端注册失败会自动刷新验证码。

### 密码重置

**✅ 已实现 — 管理员手动重置（临时方案）：** `POST /admin/users/{user_id}/reset-password`，body `{ new_password }`（6~128 位，复用 `hash_password`），管理员不可重置自己。入口：管理后台 → 用户管理 → 重置密码。登录页「忘记密码？」提示联系管理员。

**🔜 规划中（未实现）— 用户自助重置**（短信/邮箱授权就绪后），以下为已确定的设计，开工时按此实现：

| 接口 | 用途 | 说明 |
|------|------|------|
| `POST /auth/forgot-password` | 发重置邮件 | 生成 JWT（`type="reset"`，30 分钟过期，复用 `SECRET_KEY`）→ aiosmtplib 发信；**防枚举**：无论邮箱是否存在都返回「已发送」；Redis 限流同邮箱 5 分钟 1 封 |
| `POST /auth/reset-password` | 邮箱链接改密 | `{ token, new_password }` → 校验 `type == "reset"` 且未过期 → bcrypt 更新 `password_hash`（复用现有 `hash_password`） |
| `POST /auth/send-sms-code` | 发短信验证码 | 6 位随机码存 Redis（`sms:reset:{phone}`，TTL 5 分钟，60s 重发冷却）→ 短信服务商 API |
| `POST /auth/reset-password-by-sms` | 短信改密 | 校验 Redis 验证码（错 5 次作废）→ bcrypt 改密 → 删除验证码（一次性） |

**前置条件：**
- 注册时 email/phone 均为可选 → 必须先补「绑定手机号/邮箱」功能，否则存量用户无法自助重置
- 短信方案：需**企业实名资质** + 阿里云/腾讯云短信（签名/模板审核 1~2 工作日，约 ¥0.04~0.05/条）
- 邮箱方案：SMTP 邮箱授权码（QQ/163/企业邮，免费）或邮件推送服务；需在 `config.py` + `.env` 加 `SMTP_*` 配置，`requirements.txt` 加 `aiosmtplib`
- 可选增强：改密后使旧 token 失效需给 user 表加 `token_version` 字段（当前 JWT 无状态，第一期可不做）

**相关前端：** 新页面 `/auth/forgot-password`（输邮箱/手机号）与 `/auth/reset-password?token=`（新密码 ×2）；登录页「忘记密码？」当前为「开发中」toast，届时改为跳转链接。

---

## Image Generation

### POST /api/v1/image/generate

Submit an image generation task (dispatched to Celery worker).

> `size` 参数会自动缩放以满足模型最低像素要求（通过 `_ensure_min_size`）。
> 如果模型没有 `min_pixels` 限制，则跳过缩放。

```json
{
  "prompt": "赛博朋克城市夜景",
  "model_id": "doubao-seedream-4-5-251128",
  "size": "1920x1920",
  "batch": 1,
  "style": "cyber",
  "negative_prompt": "低质量, 模糊",
  "reference_images": ["/uploads/2026-07-02/xxx.jpg"],
  "reference_strength": 70,
  "seed": 42,
  "reference_dimension": "full"
}
```

Response `200`:
```json
{
  "task_id": "gen_abc123",
  "status": "completed",
  "progress": 100,
  "image_urls": ["/uploads/2026-07-02/abc.jpg"],
  "error_message": null
}
```

### GET /api/v1/image/status/{task_id}

Poll task status. Reads from: Redis result → in-memory task → DB fallback.

### POST /api/v1/image/tasks/{task_id}/cancel

Cancel a running image generation task. Revokes Celery task + marks Redis.

### POST /api/v1/image/prompt

Generate a concise visual/image prompt from asset metadata (for character/scene/prop generation).

```json
{
  "name": "剑客",
  "description": "古代侠客，身披黑色长袍",
  "asset_type": "character",
  "extra": {"gender": "male", "age": "30", "personality": "冷酷"}
}
```

Response `200`:
```json
{
  "prompt": "角色：剑客，男性，30岁，冷酷，古代侠客，身披黑色长袍，半身肖像照，真人风格，细腻皮肤纹理，柔和自然光，电影级光影"
}
```

`asset_type` 可选: `character` / `scene` / `prop`。LLM 不可用时会自动 fallback 为构造式 prompt。

### GET /api/v1/image/download

Proxy download an external image (handles CORS). Query: `url`.

---

## Video Generation

### POST /api/v1/video/generate

Submit a video generation task to the Celery `video` queue (`celery-video` worker, 16 并发)。
后端根据 `model_id` 自动路由到对应 provider（星河智云 或 天翼云）。任务全流程：上游生成 → 流式下载 → 上传 COS（`https://media.yhanm.cn/...`）→ 返回 URL；COS 不可用时回退本地 `/uploads/`。

```json
{
  "prompt": "一只猫在窗边晒太阳",
  "model_id": "tianyi-cdance2.0",
  "duration": 5,
  "size": "720x1280",
  "reference_mode": "universal",
  "reference_images": ["/uploads/2026-07-01/xxx.jpg"]
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | — | 视频描述 |
| `model_id` | string | — | 模型 ID（星河: `doubao-seedance-*` / 天翼云: `tianyi-cdance2.0`） |
| `duration` | int | 5 | 时长 1~30 秒（schema 校验 ge=1 le=30；导演工作台快捷 5/10/15 + 自定义下拉 1~15） |
| `size` | string | `"1280x720"` | 画面尺寸 |
| `reference_mode` | string | `"universal"` | 参考模式 |
| `reference_images` | string[] | `[]` | 参考图 URL（**最多 12 张**，schema `max_length=12`；导演工作台前端超限自动截取前 12 张并提示，2026-08-11） |
| `reference_audio` | string \| null | `null` | 音频参考 URL（BGM/配音，mp3/wav，2026-08-11 新增）。仅天翼云生效（星河忽略）；**不能单独使用，必须搭配参考图**（天翼云报 `VIDEO_REFERENCE_AUDIO_ONLY`）；**时长上限 15.2 秒**，超长后端自动截取前 14.5s |

**参考图注意事项：**
- 星河模型：URL 原样透传（完整公网 URL 不做改写；相对路径自动归一，见 ARCHITECTURE「参考图 URL 处理」）
- 天翼云模型：后端自动**下载 → Pillow 压缩（768px/JPEG q85）→ base64 data URI 内联**（天翼云后端无法抓取外部 URL，仅支持 base64/自有对象存储；压缩后 9 张约 670KB，请求体上限 20MB、安全阈值 19MB，2026-08-11 官方确认）。压缩失败回退原图时，**data URI 前缀按字节魔数检测真实 MIME**（存在「伪 jpg」——后缀 .jpg 实际内容 PNG，曾导致 400 `base64_upload_failed`）
- **参考音频（天翼云，2026-08-11 实测）**：content 元素格式 `{"type": "audio_url", "audio_url": {"url": "data:audio/mpeg;base64,...", "format": "mp3"}}`——**type 是 `audio_url` 而非 `input_audio`**（后者报 400 `content[1].type="input_audio" is invalid`）。后端下载后经 ffmpeg 压缩（`audio_utils.py`：非 mp3 → mp3 mono 128kbps，超预算自动降码率 128→96→64→32；**时长上限 15.2s**，超长截取前 14.5s——留 0.7s 余量，mp3 帧对齐 + LAME padding 会让解码时长略超 `-t` 值，压线曾被判 `VIDEO_REQUEST_PARAMETER_INVALID`）转 data URI 内联；60s WAV 端到端验证成功

### GET /api/v1/video/status/{task_id}

Poll task status. Checks Redis result key first, then in-memory task.

### GET /api/v1/video/download

**流式代理下载视频（同源化，2026-08-08 新增）。**

跨域 CDN 资源（`media.yhanm.cn`）无法用 `<a download>` 直接下载（浏览器忽略 download 属性 → 打开视频），前端 `downloadMedia()` 优先 fetch blob 直连 CDN（依赖 CDN CORS 头），失败时回退此代理。

| Param | 说明 |
|---|---|
| `url` | 视频完整 URL（仅允许本站媒体域名 `OSS_PUBLIC_URL` / `PUBLIC_URL`，防 SSRF） |

- httpx 流式转发 + Range 透传（支持断点续传/分段下载）
- 响应头一到浏览器即弹出下载栏

### 422 错误日志

`main.py` 注册了 `RequestValidationError` 处理器：所有 422 请求会打印 `[422]` 前缀日志（含请求体 + pydantic 校验详情），排查客户端参数问题直接看后端日志。
另：`get_current_user` / `require_admin` 缺 Authorization header 时返回 **401**（而非默认 422）。

### POST /api/v1/video/tasks/{task_id}/cancel

Cancel a running video generation task. 写 Redis 取消标志（worker progress_callback 检测后中断，下载中也能取消）+ `revoke` Celery 任务（排队任务不再启动）+ 标记 cancelled 状态。**DB 记录同步标 `FAILED` + error_message「已取消」**（tasks.py 取消分支，2026-08-08 修复——否则使用记录永远卡「处理中」）。取消后 `GET /status/{task_id}` 返回 `cancelled`，前端轮询需处理该状态。

---

## Upload

### POST /api/v1/upload

Upload files (multipart/form-data). 1-15 files per request, **jpg/png/webp/mp4/mp3**（`ALLOWED_MIME_TYPES`，mp3 2026-08-11 新增，音频参考用），≤50MB each。

```json
{ "urls": ["/uploads/2026-07-02/xxx.jpg"], "errors": [] }
```

---

## Assets

### GET /api/v1/user/assets/recover

恢复接口：返回创作记录（含完整参数，供前端 IndexedDB 重建会话历史）。

| Param | 说明 |
|---|---|
| `include_project` | `true` 时**包含项目管理来源**（source=project）的记录；默认排除（AI 工具页历史只含 AI 工具页生成的记录）。导演工作台恢复丢失状态的镜头时传 `true`，按 prompt 匹配 project 记录（2026-08-10） |
| `project_id` | （2026-08-11）导演工作台恢复时传项目 id，**查该项目全部成员的 project 来源视频**——项目协作场景下他人生成的视频也能找回。安全：先校验当前用户是项目成员（非成员 404），且只返回该项目 config 引用的 URL（不泄露其他视频） |

---

## Models

### GET /api/v1/models

List all models (merged from capability registry + DB). Respects enable/disable from admin.

| Param | Type | Description |
|---|---|---|
| `type` | string | `image` / `video` / `text` |

### GET /api/v1/models/{model_id}

Get capability details for a specific model (supported sizes, ratios, durations, etc.).

---

## Search

### GET /api/v1/search/images

Search via Openverse. Params: `q` (keyword), `count` (max 20).

### POST /api/v1/search/download

Download remote image to local storage.

---

## Prompt Enhancement

### POST /api/v1/enhance/prompt

Enrich a prompt using LLM. Body: `{ "prompt": "...", "style": "..." }`.

---

## Asset Library

### GET /api/v1/user/assets

User's creations. Falls back to Redis for image URLs.

### POST /api/v1/user/assets

Save an asset. Body: `title`, `type`, `media_url`, `cover_url`, `width`, `height`, `prompt`.

### DELETE /api/v1/user/assets/{id}

### POST /api/v1/user/assets/{id}/favorite

Toggle favorite.

### GET /api/v1/user/assets/favorites

### POST /api/v1/user/assets/batch/publish

Publish multiple assets to community. Checks Redis for covers.

---

## Project Management

### GET /api/v1/projects

List user's projects. Supports `q` (search), `page`, `page_size`.

### POST /api/v1/projects

Create project. Body: `name`, `description`, `cover_url`, `aspect_ratio`.

### GET /api/v1/projects/{id}

Project detail.

### PUT /api/v1/projects/{id}

Update project.

### DELETE /api/v1/projects/{id}

Delete project + all nested entities (cascade).

### Season (季) CRUD

```
GET    /api/v1/projects/{id}/seasons
POST   /api/v1/projects/{id}/seasons
PUT    /api/v1/projects/{id}/seasons/{season_id}
DELETE /api/v1/projects/{id}/seasons/{season_id}
```

### Episode (集) CRUD

```
GET    /api/v1/projects/{id}/episodes
POST   /api/v1/projects/{id}/episodes
PUT    /api/v1/projects/{id}/episodes/{episode_id}
DELETE /api/v1/projects/{id}/episodes/{episode_id}
GET    /api/v1/projects/{id}/episodes/{episode_id}
```

**乐观锁（2026-08-10）**：`PUT /episodes/{episode_id}` 支持可选字段 `if_updated_before`（客户端上次 GET 到的 `updated_at`）。服务器发现 `episode.updated_at > if_updated_before` 时返回 **409「配置已被其他用户更新，请重试」**——前端（导演工作台 persistShots）收到 409 后重拉最新配置，**真合并**（2026-08-11：`mergeShots` 逐镜头、逐视频按 id 合并，以服务器为基底 + 本地增量，不再全量替换——此前全量替换会把他人刚保存的 videoUrl 覆盖掉）再重试（≤3 次），防多人同时编辑同一集时后写覆盖先写。不传该字段则行为与旧版一致。

Episode has a `config` JSON field that stores:
```json
{
  "aspectRatio": "9:16",
  "projectTitle": "...",
  "generationMode": "novel",
  "outputLanguage": "中文",
  "visualStyle": "...",
  "structureData": {
    "characters": [...],
    "scenes": [...],
    "props": [...],
    "shots": [...]
  }
}
```

### Export (成片与导出)

```
GET  /api/v1/projects/{id}/episodes/{eid}/export           — 获取所有分镜视频列表及状态
PUT  /api/v1/projects/{id}/episodes/{eid}/export/order      — 保存分镜排序
GET  /api/v1/projects/{id}/episodes/{eid}/export/manifest   — 获取导出清单（已生成/待生成）
```

**多视频（2026-08-08）**：export/manifest 会把每个镜头的**全部视频**（`shot.videos`）展开为独立项，`videoIndex` 表示镜头内视频序号（前端显示「镜头N（M）」）；老数据（仅 `interval`）退化为单视频项。`id` 格式 `{shot_id}:v{序号}`。

### Collaboration (多人协作)

#### Permission Model

| Role | View Project | CRUD Episodes/Assets | Update Project Settings | Delete Project | Manage Members |
|------|:---:|:---:|:---:|:---:|:---:|
| **OWNER** (创建者) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **EDITOR** (编辑者) | ✅ | ✅ | ❌ | ❌ | ❌ |
| **VIEWER** (查看者) | ✅ | ❌ | ❌ | ❌ | ❌ |

创建项目时创建者自动成为 `OWNER`。`OWNER` 可以邀请其他用户加入。

#### GET /api/v1/projects/{id}/members

List all project members. Requires membership.

Response:
```json
[
  { "user_id": "uuid", "role": "OWNER", "nickname": "管理员", "username": "宇航", "created_at": "..." },
  { "user_id": "uuid", "role": "EDITOR", "nickname": "合作者", "username": "collab", "created_at": "..." }
]
```

#### POST /api/v1/projects/{id}/members

Invite a user to the project. **Owner only.**

Body: `{ "user_id": "uuid", "role": "editor" }` (role: `editor` / `viewer`)

Response `201`: `{ "status": "ok", "user_id": "uuid", "role": "editor" }`

#### DELETE /api/v1/projects/{id}/members/{user_id}

Remove a member. **Owner only.** Cannot remove self or the owner.

#### GET /api/v1/projects/{id}/available-users

List all users who can be invited (not already members + not current user). Requires membership.

```json
{ "users": [ { "user_id": "uuid", "nickname": "...", "username": "..." } ] }
```

#### Episode assignee

Episode model supports `assignee_id` (nullable) to designate who is responsible for an episode.

```
POST   /api/v1/projects/{id}/episodes    → body optionally includes "assignee_id": "uuid"
PUT    /api/v1/projects/{id}/episodes/{eid} → body optionally includes "assignee_id": "uuid" (null to clear)
GET    /api/v1/projects/{id}/episodes    → response includes "assignee_id": "uuid | null"
```

### POST /api/v1/projects/{id}/import-novel

Import a novel (text content) and auto-create episodes by chapter.

Body: `{ "content": "长篇小说的全部文本..." }`

---

## Scripts (剧本)

### POST /api/v1/projects/{id}/episodes/{eid}/script/generate

AI generate script from description.

```json
{
  "prompt": "一个古代侠客寻找失散妹妹的故事",
  "duration": "短剧",
  "language": "中文",
  "style": "古风武侠",
  "model_id": "deepseek-v4-flash"
}
```

Response:
```json
{
  "script_content": "第一场...",
  "choices": 3
}
```

### POST /api/v1/projects/{id}/episodes/{eid}/script/continue

AI continue writing from existing script.

```json
{
  "direction": "主角发现了一个惊天秘密",
  "duration": "短剧",
  "language": "中文",
  "style": "古风武侠"
}
```

### POST /api/v1/projects/{id}/episodes/{eid}/script/structure

AI breakdown: extract characters, scenes, props from script.

Returns structured arrays of each entity type. Auto-creates DB records if they don't exist.

---

## Storyboards (分镜)

### GET /api/v1/projects/{id}/episodes/{eid}/storyboards

List all storyboards for an episode.

### POST /api/v1/projects/{id}/episodes/{eid}/storyboards

Create a storyboard. Body: `sequence_number`, `scene_description`, `action_description`, `shot_type`, `dialogue`, `characters` (JSON array), `props` (JSON array).

### PUT /api/v1/projects/{id}/episodes/{eid}/storyboards/{storyboard_id}

Update a storyboard.

### DELETE /api/v1/projects/{id}/episodes/{eid}/storyboards/{storyboard_id}

### POST /api/v1/projects/{id}/episodes/{eid}/storyboards/breakdown

AI breakdown script into storyboards. Reads the episode script from DB, generates 10+ shot entries.

---

## Asset Management (角色/场景/道具)

### GET /api/v1/projects/{id}/characters

List all characters (including variants). Response includes `group_id` field.
Returns all records; frontend groups by `group_id` (`null` = main, non-null = variant).

### POST /api/v1/projects/{id}/characters

Create a character. Optional `group_id` to mark as variant of a parent.

```json
{
  "name": "军官证照",
  "description": "穿军装的半身照",
  "image_url": "/uploads/xxx.jpg",
  "group_id": "父角色uuid"   // 新增可选字段，不传则为主角色
}
```

### PUT /api/v1/projects/{id}/characters/{entity_id}

Update character fields. Supports updating `group_id` (set to `null` to make it a main character, set to a uuid to link as variant).

### DELETE /api/v1/projects/{id}/characters/{entity_id}

Same pattern for `/scenes` and `/props`. Each has: `name`, `description`, `image_url`, `prompt`, `group_id` (新增).

Characters also have optional fields (deprecated): `gender`, `age`, `personality`.

---

## Admin

Require `Authorization: Bearer <token>` with admin privileges.

### GET /api/v1/admin/dashboard

Statistics: users, creations, model count.

### GET/PUT /api/v1/admin/users

User management with search/pagination. Toggle admin, delete.

### GET/POST/PUT/DELETE /api/v1/admin/models

Model CRUD. Supports toggling `is_enabled` and API endpoint connectivity test.

### GET /api/v1/admin/logs

Paginated creation logs. Supports filters:
- `q` — search by user nickname/username
- `type` — `image` / `video`
- `status` — `pending` / `processing` / `completed` / `failed`
- `date` — filter by date (e.g. `2026-07-25`)
- `page` / `page_size` — pagination

每项响应含 `task_id`（`params.task_id`，2026-08-11 新增，前端显示为可复制的「任务ID」列，便于排查）。

### GET /api/v1/admin/settings

System settings (read from env + Redis overrides).

```json
{
  "app_name": "SpiritLens",
  "token_expire_minutes": 10080,
  "refresh_token_expire_days": 30,
  "xinghe_configured": true,
  "deepseek_configured": true,
  ...
}
```

### PUT /api/v1/admin/settings

Update settings (saved to Redis, takes effect immediately).

```json
{ "token_expire_minutes": 1440, "refresh_token_expire_days": 15 }
```

### GET /api/v1/admin/usage

Usage records with infinite scroll pagination.

---

## Community

### GET /api/v1/community/posts

List posts with pagination. Sort: `latest`, `popular`, `featured`.

### POST /api/v1/community/posts

Create post. Body: `title`, `description`, `cover_url`, `cover_width`, `cover_height`.

### GET /api/v1/community/featured

Featured posts.

### GET /api/v1/community/posts/{id}

Post detail.

### POST /api/v1/community/posts/{id}/like

Toggle like.

### GET/POST /api/v1/community/posts/{id}/comments

List / create comments.

### DELETE /api/v1/admin/community/{post_id} (Admin)

Delete a community post from admin panel.

---

## Health

### GET /health

```json
{ "status": "ok", "version": "0.1.0" }
```
