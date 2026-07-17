# SpiritLens Architecture

## Overview

SpiritLens is a full-stack AI creative platform.
- **Frontend**: Next.js 16 (App Router) + Tailwind v4 + Zustand 5 + `@xyflow/react` v12
- **Backend**: Python FastAPI + SQLAlchemy async + Celery
- **Database**: PostgreSQL 16 (production), SQLite (development)
- **Cache**: Redis 7 (task results, Celery broker, settings overrides)
- **Deployment**: Docker Compose + nginx (sub-path `/spiritlens`)

## Frontend Pages

```
app/ (with basePath: "/spiritlens")
 / -> HeroSection + ToolGrid + FeaturedWorks (SSR, immersive chrome-free layout)
 /auth/login /auth/register /auth/admin/login
 /ai-tool/image -> ImageGenPage (session + polling)
 /ai-tool/video -> VideoGenPage (session + polling)
 /ai-tool/canvas -> InfiniteCanvas -> CanvasEditor
 /projects -> project list (CRUD + search)
 /projects/[id] -> ProjectOverview (Season + 集数管理 + 导入小说)
 /projects/[id]/episodes/[eid] -> EpisodeWorkspace (5 阶段工作台)
 /assets -> asset library (masonry grid + batch ops)
 /community -> CommunityGallery (waterfall layout)
 /community/[id] -> PostDetail
 /workspace -> workspace (stats + recent creations)
 /admin
   / -> dashboard (stats + trends chart)
   /users -> user management
   /models -> model management
   /logs -> usage records (infinite scroll)
   /community -> community management
   /settings -> system settings
```

### AppShell Layout

`AppShell` wraps all pages with:
- **Immersive routes** (`/ai-tool/*`, `/admin`, `/projects`): full-screen, no Header/Footer
- **Homepage** (`/`): custom hero layout (SpiritLensHero), no Header/Footer
- **Other routes**: Header + Footer
- **Footer excluded on**: `/assets`, `/community`
- **ToastProvider** for notifications
- **ThemeProvider** for dark/light mode

### State Management

| Store | Persist | Purpose |
|---|---|---|
| `store/auth.ts` | localStorage | User, token, auto-refresh |
| `store/sessions.ts` | localStorage | Generation history |
| `store/theme.tsx` | localStorage | Dark/light toggle |

## Backend Routes

```
/api/v1/
 /auth/*            -- JWT login/register/refresh/captcha/me
 /admin/*           -- Dashboard, users CRUD, models CRUD, settings, logs
 /image/*           -- Image generation (Celery) + status + cancel + prompt (visual)
 /video/*           -- Video generation (background thread) + status + cancel
 /upload            -- File upload (multipart, max 9 files)
 /search/*          -- Openverse search + download
 /enhance/prompt    -- LLM prompt enrichment
 /models            -- Model capabilities (merged DB + hardcoded)
 /user/assets/*     -- Asset library, favorites, batch publish
 /community/*       -- Posts, likes, comments
 /projects/*        -- Project management (CRUD + episodes/seasons/storyboards/assets/scripts)
```

## Generation Flow

### Image (Celery Worker)

```
Frontend -> POST /api/v1/image/generate
  -> API creates task (Redis) + DB record (status=PROCESSING)
  -> Celery worker picks up
    -> resolve_provider(model_id) -> xinghe
    -> POST https://xinghezhiyun.com/v1/images/generations
    -> Download images -> save_upload()
    -> Write result to Redis (spiritlens:result:*)
    -> Always persist result to PostgreSQL creations table (status=COMPLETED)
  -> Frontend polls GET /status/{task_id}
    -> Read from Redis -> fallback to DB -> fallback to in-memory
  -> Complete -> display <img>
```

### Video (Background Thread)

```
Frontend -> POST /api/v1/video/generate
  -> Body: { prompt, model_id, duration, size, reference_images? }
  -> Reference images format (when provided):
       "content": [
         {"type": "text", "text": "prompt"},
         {"type": "image_url", "image_url": {"url": "https://..."}}
       ]
       (prompt field is removed, replaced by content array)
  -> API creates task + DB record (status=PROCESSING)
  -> Background thread runs (not Celery)
    -> xinghe.py generate_video()
    -> POST https://xinghezhiyun.com/v1/videos
    -> Poll GET /v1/videos/{video_id} until succeeded
    -> Download MP4 from /v1/videos/{video_id}/content -> save_upload()
    -> Write result to Redis (spiritlens:result:*)
    -> Persist result to PostgreSQL creations table (status=COMPLETED/FAILED)
  -> Frontend polls GET /status/{task_id} (最多 20 分钟超时)
  -> Complete -> <video> element
```

### Export (播放列表 + 顺序播放)

```
StageDirector (生成各分镜视频)
  -> 保存 videoUrl 到 episode.config.shots[].interval.videoUrl
  -> StageExport 读取同一 config
    -> GET /api/v1/projects/{id}/episodes/{eid}/export
    -> 展示所有分镜 + 状态 + 播放列表
    -> 顺序播放 / 单个下载 / 批量下载
    -> PUT /api/v1/projects/{id}/episodes/{eid}/export/order (保存排序)
```

### Script Generation (Direct LLM)

```
Frontend -> POST /api/v1/projects/{id}/episodes/{eid}/script/generate
  -> script_generation.py -> DeepSeek API
  -> Persist to episode.script_content
  -> Returns generated script text
```

### Script → Structure Breakdown

```
Frontend -> POST /api/v1/projects/{id}/episodes/{eid}/script/structure
  -> script_structure.py -> DeepSeek API
  -> Extracts characters/scenes/props from script
  -> Auto-creates DB records for each
```

### Script → Storyboard Breakdown

```
Frontend -> POST /api/v1/projects/{id}/episodes/{eid}/storyboards/breakdown
  -> Reads episode script from DB
  -> script_breakdown.py -> DeepSeek API
  -> Generates 10+ shot entries
  -> Persists to storyboards table
```

### Visual Prompt Generation

```
Frontend -> POST /api/v1/image/prompt
  -> Receives asset name/description/type
  -> _generate_visual_prompt_text()
  -> DeepSeek API (or fallback constructed prompt)
  -> Returns 1-3 sentence visual prompt
```

## AI Providers

| Provider | Image Endpoint | Video Endpoint | Text Endpoint | Models |
|---|---|---|---|---|
| 星河智云 | `/v1/images/generations` | `/v1/videos` | -- | Seedream (image) + Seedance (video) |
| DeepSeek | -- | -- | `/v1/chat/completions` | DeepSeek-V4-Flash (text) |

Notes:
- Image API via `/v1/` (was `/api/v3/`, now unified under `/v1/` base)
- Video API via `/v1/videos` with polling via GET `/v1/videos/{video_id}`
- Image batch uses `sequential_image_generation` mode (not `n` parameter)

## Redis Key Structure

| Key | Purpose | TTL |
|---|---|---|
| `spiritlens:result:{task_id}` | Generation result JSON | None |
| `spiritlens:task:{task_id}` | Task status hash | None |
| `spiritlens:settings` | System settings override Hash | None |

## Database Models (12 tables)

| Model | Table | Description |
|---|---|---|
| User | `users` | Auth + admin |
| AiModel | `ai_models` | AI model registry |
| Creation | `creations` | User generation history |
| CommunityPost | `community_posts` | Community posts |
| CommunityComment | `community_comments` | Post comments |
| Project | `projects` | Creative projects |
| Season | `seasons` | Project seasons (季) |
| Episode | `episodes` | Episodes (集) |
| Character | `characters` | Character assets |
| Scene | `scenes` | Scene assets |
| Prop | `props` | Prop assets |
| Storyboard | `storyboards` | Storyboard shots |

## Key Files

```
backend/
 app/
  api/v1/
   auth.py, admin.py, upload.py, search.py, models.py
   media/image.py                     -- Image generation + status + cancel + prompt
   video.py                           -- Video generation + status + cancel
   assets.py, community.py
   projects.py                        -- Projects + nested CRUD (seasons/episodes/characters/scenes/props/storyboards)
   scripts.py                         -- Script generate/continue/structure
  core/config.py, database.py
  models/ (12 models: user, creation, community, ai_model, project, season, episode, character, scene, prop, storyboard)
  schemas/ (auth, generation, models, project, episode, season, storyboard, character, scene, prop)
  services/
   generation.py                      -- Task manager (Redis + DB)
   redis_helper.py                    -- Unified Redis connection
   providers/
    __init__.py                       -- Provider router + generate_image()
    xinghe.py                         -- Xinghe Zhiyun (image + video)
   file_storage.py                    -- File save/validate
   model_capabilities.py              -- Model capability registry (image/video/text)
   auth.py                            -- Auth logic
   prompt_enhancer.py                 -- LLM prompt enrichment
   script_generation.py               -- Script AI generation/continuation
   script_breakdown.py                -- Script → storyboard breakdown
   script_structure.py                -- Script → characters/scenes/props extraction
   novel_import.py                    -- Novel → episodes splitting
   web_search.py                      -- Openverse image search
   captcha.py                         -- SVG captcha generation
  tasks.py                            -- Celery tasks (image generation)
  celery_app.py                       -- Celery app
  alembic/                            -- Database migrations
 tests/test_api.py                    -- API integration tests
```

## Deployment

| Service | Port | Access |
|---|---|---|
| nginx | 80 | Public |
| SpiritLens Backend | 8085 | nginx internal |
| SpiritLens Frontend | 3005 | nginx internal |
| PostgreSQL | 5432 | Docker internal |
| Redis | 6379 | Docker internal |

### Deployment Guide

See `deploy/README.md`. Quick reference:
- **Python files**: `scp -> docker cp -> docker restart`
- **Frontend**: `docker compose build --no-cache frontend -> up -d`
- **nginx**: edit `/etc/nginx/sites-available/clawshop`, then `nginx -t && systemctl reload nginx`
