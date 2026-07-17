# SpiritLens API Reference

Base URL (production): `http://129.28.122.183/spiritlens/api/v1`

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

### POST /api/v1/auth/admin-login

Admin login — username + password.

### GET /api/v1/auth/me

Get current user info. Requires `Authorization: Bearer <token>`.

### GET /api/v1/auth/captcha

Get a captcha image (SVG). Used during registration.

---

## Image Generation

### POST /api/v1/image/generate

Submit an image generation task (dispatched to Celery worker).

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

Submit a video generation task (background thread, not Celery).

```json
{
  "prompt": "一只猫在窗边晒太阳",
  "model_id": "doubao-seedance-2-0-fast-260128",
  "duration": 5,
  "size": "720x1280",
  "reference_mode": "universal",
  "reference_images": ["/uploads/2026-07-01/xxx.jpg"]
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | — | 视频描述 |
| `model_id` | string | — | 模型 ID |
| `duration` | int | 5 | 时长 3~30 秒 |
| `size` | string | `"1280x720"` | 画面尺寸 |
| `reference_mode` | string | `"universal"` | 参考模式 |
| `reference_images` | string[] | `[]` | 参考图 URL（最多 3 张） |

### GET /api/v1/video/status/{task_id}

Poll task status. Checks Redis result key first, then in-memory task.

### POST /api/v1/video/tasks/{task_id}/cancel

Cancel a running video generation task. Signals background thread + marks Redis.

---

## Upload

### POST /api/v1/upload

Upload image files (multipart/form-data). 1-9 files, jpg/png/webp, ≤50MB each.

```json
{ "urls": ["/uploads/2026-07-02/xxx.jpg"], "errors": [] }
```

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
### POST /api/v1/projects/{id}/characters
### PUT /api/v1/projects/{id}/characters/{entity_id}
### DELETE /api/v1/projects/{id}/characters/{entity_id}

Same pattern for `/scenes` and `/props`. Each has: `name`, `description`, `image_url`, `prompt`.

Characters also have optional fields: `gender`, `age`, `personality`.

---

## Admin

Require `Authorization: Bearer <token>` with admin privileges.

### GET /api/v1/admin/dashboard

Statistics: users, creations, model count.

### GET/PUT /api/v1/admin/users

User management with search/pagination. Toggle admin, delete.

### GET/POST/PUT/DELETE /api/v1/admin/models

Model CRUD. Supports toggling `is_enabled` and API endpoint connectivity test.

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
