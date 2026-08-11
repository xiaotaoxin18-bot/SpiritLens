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
 /ai-tool/canvas -> CanvasProjectList
 /ai-tool/canvas/[id] -> InfiniteCanvas -> CanvasEditor (全屏画布编辑器)
 /projects -> project list (CRUD + search)
 /projects/[id] -> ProjectOverview (Season + 集数管理 + 导入小说)
 /projects/[id]/episodes/[eid] -> EpisodeWorkspace (4 阶段工作台)
   ├── 剧本与故事 (ScriptStage)
   ├── 角色与场景 (StageAssets)
   ├── 导演工作台 (StageDirector) — 上半: 镜头网格 / 下半: 三栏编辑区
   └── 成片与导出 (StageExport) — 全屏播放器 + 侧栏播放列表
 /assets -> asset library (masonry grid + preview modal)
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
- **Immersive routes** (`/ai-tool/image`, `/ai-tool/video`, `/admin`, `/projects`, `/ai-tool/canvas/[id]`): full-screen, no Header/Footer
- **Homepage** (`/`): custom hero layout (SpiritLensHero) + **显示 Footer**（`!isHome` 条件已移除）
- **画布列表** (`/ai-tool/canvas`): 显示 Header，**不显示 Footer**
- **Other routes**: Header + Footer

Footer 排除规则：`NO_FOOTER_ROUTES = ["/assets", "/community"]` + `hasFooter()` 额外排除 `/ai-tool/canvas`
- **ToastProvider** for notifications
- **ThemeProvider** for dark/light mode

### State Management

| Store | Persist | Purpose |
|---|---|---|
| `store/auth.ts` | IndexedDB (migrated from localStorage) | User, token, auto-refresh |
| `store/sessions.ts` | IndexedDB (migrated from localStorage) | Generation history (capacity: GB level) |
| `store/theme.tsx` | localStorage | Dark/light toggle |
| `lib/canvas-storage.ts` | localStorage | Canvas 多项目管理 |

## Backend Routes

```
/api/v1/
 /auth/*            -- JWT login/register/refresh/captcha/me
 /admin/*           -- Dashboard, users CRUD, models CRUD, settings, logs
 /image/*           -- Image generation (Celery) + status + cancel + prompt (visual)
 /video/*           -- Video generation (background thread) + status + cancel
 /upload            -- File upload (multipart, 1-15 files, jpg/png/webp/mp4/mp3)
 /search/*          -- Openverse search + download
 /enhance/prompt    -- LLM prompt enrichment
 /models            -- Model capabilities (merged DB + hardcoded)
 /user/assets/*     -- Asset library, /recover (恢复历史), favorites, batch publish
 /community/*       -- Posts, likes, comments
 /projects/*        -- Project management (CRUD + episodes/seasons/storyboards/assets/scripts/export)
```

## AI Provider 架构

支持多个独立 AI 供应商，各自有独立 API Key / 模型 ID / API 地址。

| 供应商 | 名称 | 能力 | 实现文件 |
|--------|------|------|----------|
| 星河智云 | `xinghe` | 图片 + 视频 | `services/providers/xinghe.py` |
| 天翼云 | `tianyi` | 视频 | `services/providers/tianyi.py` |
| DeepSeek | — | 文本 | 直连 `api.deepseek.com` |

Provider 路由在 `services/providers/__init__.py` 中通过 `PROVIDER_MAP` + `resolve_provider()` 分发。

## Generation Flow

图片与视频生成统一走 **Celery 队列**（2026-08 并发优化后，视频不再使用后台线程）。

```
Frontend -> POST /api/v1/{image,video}/generate
  -> API: create task (Redis) + DB record (PROCESSING)
  -> apply_async(task_id=业务task_id) 派发到对应队列
       image  → celery-image worker（image 队列，threads pool，当前 128 并发）
       video  → celery-video worker（video 队列，threads pool，当前 192 并发）
  -> worker:
       resolve_provider(model_id) → 调上游 API（星河/天翼云）
       progress_callback → 写 Redis 进度（force_redis=True，线程各自 loop）
       上游完成 → 流式下载（save_upload_stream 分块写盘，可取消）
       → 上传腾讯云 COS（SigV4，公有读私有写）→ 返回公网 URL → 删本地
       → 视频（mp4）上传后**同步全量 GET 预热 CDN**（2026-08-10 修复：旧 Range 请求只缓存 1 字节分片且异步放飞，导致「视频生好了首次播不出、刷新才出现」；现改为全量 200 + 最多 3 次重试，标记完成前边缘必已缓存）
       → 写 Redis result/task key + PG creations (COMPLETED)
  -> Frontend 轮询 GET /status/{task_id}（WS 为加速器，失败自动回退轮询）
  -> 完成 -> <img>/<video src="https://media.yhanm.cn/..."> 播放走 CDN
```

**媒体下载（跨域 CDN）**：`<a download>` 对跨域 URL 会被浏览器忽略 download 属性（直接打开资源）。前端统一走 `lib/download.ts` 的 `downloadMedia()`：
1. fetch blob 直连 CDN（依赖 CDN 已配置 CORS：`Access-Control-Allow-Origin: https://yhanm.cn`）→ 快、不占服务器
2. 失败回退同源代理 `GET /api/v1/video/download` / `image/download`（流式转发 + Range 透传，防 SSRF：仅允许本站媒体域名）

**时间约定**：DB 存 UTC naive，API 返回 `+00:00` 标注（`_iso_cst` 等 helper），前端 `new Date()` 自动转本地（东八区）。日期筛选类参数按东八区偏移 8 小时对齐。

**数据自动清理（2026-08-10 上线，2026-08-11 调整）**：
- **定时清理个人生成**：`app/scripts/cleanup_old_generations.py`（服务器 cron 每日 4:17 `docker exec` 执行，日志 `~/spiritlens/logs/cleanup.log`）。规则：`creations` 表按每条记录自己的 `created_at` 判断——**视频/图片均 >30 天**（2026-08-11 由 7/14 天放宽），任何状态（COMPLETED/FAILED/PENDING）超期一律删；**PROCESSING 永不删**；已发布社区（有 posts 引用）保留；**被项目引用的记录和文件都跳过**（2026-08-11 修复：原来只保护文件不保护记录，导致"项目里能播、资产库条目却消失"——SQL 现在排除 `media_url`/`thumbnail_url` 在项目引用集合内的记录）。删除 = DB 记录 + COS 对象 + 本地文件；前端历史靠同步机制（孤儿移除）自动消失。支持 `--dry-run` 预演。
- **项目删除连根清理**：`DELETE /api/v1/projects/{id}` 除删 project 行（FK 级联清空 episodes/characters/scenes/props/seasons/storyboards/members）外，先收集项目全部媒体 URL（角色/场景/道具 image_url + 集封面 + episode.config JSON 递归 + storyboard 生成图）→ `delete_media()` 删 COS 对象/本地文件。每项目按 project_id 独立收集。

**进度交付**：worker 写 Redis（`spiritlens:task:{id}` hash），前端轮询/WS 读取 —— 与进程无关，多 worker/多进程安全。

**取消**：`POST /tasks/{id}/cancel` → 写 `spiritlens:cancel:{id}` 标志（TTL 24h）+ `revoke(task_id)`（排队任务）→ worker 的 progress_callback 检测标志 → 设 cancel_event → provider 轮询循环抛 RuntimeError → 任务写 `{"status":"cancelled"}` 终态（下载中经 cancel_check 逐块中断）→ **DB creations 同步标 FAILED「已取消」**（2026-08-08 修复：取消不更新 DB 会导致使用记录永远卡「处理中」）。前端轮询需处理 `cancelled` 状态（导演工作台多视频卡片的「取消」按钮即此链路）。

**崩溃兜底**：`task_acks_late=True` + `task_acks_on_failure_or_timeout=True`（2026-08-11 修复：部署重建 worker 时未完成/已取未执行的任务由 broker 重新投递，不再丢失——此前默认 ack 导致部署重启清空队列中的视频任务，任务永久卡 PROCESSING）+ `task_failure` 信号写 failed 终态 + worker 启动时清扫超过 30 分钟仍 running 的滞留任务（SIGKILL 场景）。

**导演工作台离开页面恢复机制（2026-08-10 升级，2026-08-11 项目级）**：
加载镜头时检测 `interval.taskId && status !== "completed"` → 调用 GET /status/{taskId}
如果 interval 有 `videoUrl` 但状态不对 → 直接置为 completed
如果无 taskId → GET /user/assets/recover?include_project=true&project_id={项目id} 按 prompt 匹配项目记录
（2026-08-11：recover 新增 `project_id` 参数——校验成员后查**该项目全部成员**的 project 视频，项目协作场景下他人生成的视频也能找回（原来只查当前用户，其他人永远匹配不到）；且只返回该项目 config 引用的 URL，防泄露。匹配 status=COMPLETED + media_url + prompt 精确。**匹配不到不再标 failed**（2026-08-11：保留未完成状态等下次恢复，避免"他人视频在本地匹配不到"被误标红））

**episode config 乐观锁（2026-08-10，2026-08-11 真合并）**：导演工作台 persistShots 是 GET+PUT 读改写，多人同时编辑同一集会互相覆盖。PUT /episodes/{id} 支持 `if_updated_before`（updated_at），服务器校验不符返回 409「配置已被其他用户更新」→ 前端重拉最新配置，**`mergeShots` 真合并**（逐镜头、逐视频按 id 合并：服务器为基底 + 本地增量，同 id 视频字段取并集，videoUrl 双方都保留）后重试（≤3 次）——修复了此前"全量替换"导致后写者把他人刚保存的 videoUrl 覆盖掉的问题（视频"消失"根因之一）。

### 导演工作台 → 成片导出

```
StageDirector (生成各分镜视频)
  -> 保存到 episode.config.shots[].videos（多视频列表，2026-08-08）
  -> persistShots() 持久化到 episode config
  -> 并发安全：shotsRef + 函数式 updateShot；轮询按 videoId 定位更新
  -> 老数据 shots[].interval 兼容（shotVideos()：videos 存在即优先）

StageExport 读取同一 config（后端 export.py 展开全部 videos）
  -> GET /api/v1/projects/{id}/episodes/{eid}/export
  -> 全屏视频播放器 + 侧栏播放列表 + 拖拽排序（项 = 镜头×视频，「镜头N（M）」）
  -> 顺序播放 / 单个下载 / 批量下载
  -> PUT /api/v1/projects/{id}/episodes/{eid}/export/order (保存排序)
```

### Script / Structure / Storyboard / Prompt (Direct LLM)

同上（DeepSeek API 生成文本内容）。

## AI Providers

| Provider | Image Endpoint | Video Endpoint | Text Endpoint | Models |
|---|---|---|---|---|
| 星河智云 | `/v1/images/generations` | `/v1/videos` | -- | Seedream (image) + Seedance (video) |
| 天翼云 | -- | `/v1/contents/generations/tasks` | -- | Tianyi CDance (video) |
| DeepSeek | -- | -- | `/v1/chat/completions` | DeepSeek-V4-Flash (text) |

## Object Storage（腾讯云 COS + CDN）

生成结果上传 COS（零依赖：httpx 手写 AWS SigV4，腾讯云 COS 兼容 S3 协议）。

- 桶：`yhanm-1441531263`（成都 `ap-chengdu`，**公有读私有写**）
- 域名：`https://media.yhanm.cn`（腾讯云 CDN 加速，免费 HTTPS，90 天需续期）→ EdgeOne CNAME
- 实现：`services/object_storage.py`（`upload_file` / `build_key` / `is_enabled`）
- 入口：`services/file_storage.py` 的 `save_upload` / `save_upload_stream` 末尾 COS 分支 —— 上传成功返回公网 URL 并删本地，**失败自动回退本地存储**（渐进式开关 `OSS_ENABLED`）
- 播放链路：浏览器直连 CDN，不占服务器带宽（服务器仅承担上传调度）
- 历史本地文件：nginx `/spiritlens/uploads/` 继续伺服，无需迁移

## 参考图 URL 处理（2026-08 修复）

`_to_public_url`（tianyi.py）/ xinghe.py 的 URL 归一规则：

| 输入 | 输出 |
|---|---|
| 完整公网 URL（`https://media.yhanm.cn/...`） | **原样返回**（曾 bug：剥离 host 重拼 PUBLIC_URL 导致 `/spiritlens/spiritlens/` 双前缀 404，天翼云"素材链接不存在"根因） |
| 相对路径 `/spiritlens/...`（前端相对化存储的 COS 路径） | 拼 `OSS_PUBLIC_URL`（media.yhanm.cn） |
| 相对路径 `/uploads/...`（本地存储） | 拼 `PUBLIC_URL`（yhanm.cn/spiritlens） |
| `http://localhost` | 替换为 `PUBLIC_URL` |

## 天翼云参考图：base64 内联

天翼云后端**无法抓取外部 URL**（CDN 域名与腾讯云 COS 域名均报"素材无法访问"，且其客服确认仅支持对象存储与 base64）→ 参考图改为：

```
下载参考图（httpx）→ Pillow 压缩（最长边 768px / JPEG q85，1.9MB→55KB）
→ base64 data URI 内联进请求体（9 张约 670KB，远低于天翼云 20MB 请求限制）
```

- 依赖：Pillow（Dockerfile 独立安装层，不污染 requirements.txt 缓存）
- 超限提示：请求体 >19MB（安全阈值，官方上限 20MB，2026-08-11 天翼云确认）时报"减少素材/压缩"

## 天翼云参考音频：audio_url + ffmpeg 压缩（2026-08-11）

实测确认格式：`{"type": "audio_url", "audio_url": {"url": "data:audio/mpeg;base64,...", "format": "mp3"}}`——**type 是 `audio_url` 不是 `input_audio`**（后者 400 `content[1].type="input_audio" is invalid`），`url` 字段直接吃 data URI。

```
下载音频（httpx）→ audio_utils.audio_to_mp3_data_uri()
  ├─ 已是 mp3 且时长 ≤15.2s → 原样透传（ffprobe 探测时长）
  ├─ 其他 → ffmpeg 转 mp3 mono 128kbps，超预算降码率（128→96→64→32）
  └─ 超 15.2s → 截取前 14.5s（-t，留 0.7s 余量：mp3 帧对齐 + LAME padding）
→ data URI 内联进 content（audio_url 元素）
```

- 依赖：**ffmpeg/ffprobe**（Dockerfile apt 层，清华 debian 源，放 pip 层之前避免缓存失效）
- **时长上限 15.2s**（实测报错 `audio duration ... must be less than or equal to 15.2`）；**不能单独作为参考**（`VIDEO_REFERENCE_AUDIO_ONLY`），必须搭配参考图——产品流程天然满足
- 前端：导演工作台 + AI 视频页「上传音频」+ `@音频N` 黄色 chip（`shot.audioRef` / `videoParams.audioUrl` 持久化）；上传时探测时长提示 15s 上限
- 星河忽略 `reference_audio`（签名兼容，暂不支持）

## 并发架构（2026-08 优化）

- **后端 API**：uvicorn `--workers 4`（环境变量 `UVICORN_WORKERS`）
- **Celery**：两个独立 worker 容器，threads pool：
  - `celery-image`：消费 `image` 队列（当前 128 并发，`CELERY_IMAGE_CONCURRENCY`，项目根 `.env` 配置）
  - `celery-video`：消费 `video` 队列（当前 192 并发，`CELERY_VIDEO_CONCURRENCY`，`--prefetch-multiplier=1`）
  - 总槽位 320（4 核 CPU 极限附近）；天翼云 API 并发签约 400，追满需加服务器/加核
- **队列路由**：`celery_app.py` `task_routes`（image/video/celery 兜底），长耗时视频任务不饿死图片任务
- **数据库**：Postgres `max_connections=200`（4×pool 30 + 任务临时连接）；多进程 seed 用 `pg_advisory_lock` 串行化
- **多进程安全**：任务状态全走 Redis；WS 推送是加速器（跨进程失效时前端轮询兜底）

## Redis Key Structure

| Key | Purpose | TTL |
|---|---|---|
| `spiritlens:result:{task_id}` | Generation result JSON（error→failed / `{"status":"cancelled"}`→cancelled / 否则 completed） | None |
| `spiritlens:task:{task_id}` | Task status hash（含 params，retry 依赖） | None |
| `spiritlens:cancel:{task_id}` | 取消标志（worker progress_callback 轮询检测） | 24h |
| `spiritlens:settings` | System settings override Hash | None |

## Database Models (12 tables)

| Model | Table | Description |
|---|---|---|
| User | `users` | Auth + admin |
| AiModel | `ai_models` | AI model registry |
| Creation | `creations` | User generation history |
| CommunityPost | `community_posts` | Community posts |
| CommunityComment | `community_comments` | Post comments |
| Project | `projects` | Creative projects | user_id + project_members (multi-user) |
| Season | `seasons` | Project seasons (季) |
| Episode | `episodes` | Episodes (集) |
| Character | `characters` | Character assets — supports `group_id` for variants |
| Scene | `scenes` | Scene assets — supports `group_id` for variants |
| Prop | `props` | Prop assets — supports `group_id` for variants |
| Storyboard | `storyboards` | Storyboard shots |

## Key Files

```
backend/
 app/
  api/v1/
   auth.py, admin.py, upload.py, search.py, models.py
   media/image.py, video.py               -- Generation APIs
   assets.py, community.py
   projects.py                             -- Projects + nested CRUD + collaboration
   export.py                               -- Episode export
   scripts.py                              -- Script generate/continue/structure
  core/config.py, database.py
  models/ (...)
  schemas/ (...)
  services/
   generation.py                           -- Task manager (Redis + memory fallback)
   task_persistence.py                     -- PG 结果落库（Celery 与 API 共享）
   object_storage.py                       -- 腾讯云 COS 上传（SigV4，零依赖）
   file_storage.py                         -- 本地 + COS 双分支存储
   redis_helper.py                         -- Unified Redis connection
   providers/__init__.py                   -- Provider router
   providers/xinghe.py                     -- Xinghe Zhiyun (image + video)
   providers/tianyi.py                     -- Tianyi (video)
   audio_utils.py                          -- 参考音频压缩（ffmpeg → mp3 mono，15.2s 截断，2026-08-11）
   script_generation.py, script_breakdown.py, script_structure.py
   novel_import.py, web_search.py, captcha.py
  tasks.py                                 -- Celery tasks (generate_image / generate_video + 信号兜底)
  celery_app.py                            -- Celery 应用（image/video 队列路由）

frontend/
 src/
  app/ai-tool/canvas/page.tsx               -- 画布列表页（简洁卡片：标题+日期+删除）
  app/ai-tool/video/page.tsx               -- AI Video 生成页面
  app/ai-tool/image/page.tsx               -- AI Image 生成页面
  app/assets/page.tsx                       -- 资产库（Masonry + 预览 Modal）
  app/projects/[id]/page.tsx                -- 项目概览
  app/projects/[id]/episodes/[eid]/page.tsx -- 集工作区（4 Tab + 侧栏导航）
  app/projects/[id]/assets/[type]/[assetId]/page.tsx -- 资产详情页（group_id 变体分组，上传可改名）
  components/projects/script/
   ScriptStage.tsx                          -- 剧本与故事
   StageAssets/
    index.tsx                               -- 角色/场景/道具 卡片网格（按 group_id 聚合+变体计数，tab 持久化）
    CharacterCard.tsx, SceneCard.tsx, PropCard.tsx  -- 各类型卡片（hover 删除按钮，变体徽标）
   StageDirector/
    index.tsx                               -- 导演工作台主组件
    ShotWorkbench.tsx                       -- 底部三栏编辑区
    ShotCard.tsx                            -- 镜头卡片
    types.ts                               -- Shot/VideoInterval 类型
   StageExport/index.tsx                   -- 成片导出（播放器）
  lib/
   indexeddb-storage.ts                    -- IndexedDB 适配器
   session-recovery.ts                     -- 历史会话跨设备同步（每次打开合并：补缺+孤儿移除）
   download.ts                             -- 媒体下载工具（fetch blob 直连 CDN → 回退同源代理）
  store/sessions.ts                        -- 会话存储（IndexedDB persist）
```

## Deployment

| Service | Port | Access |
|---|---|---|
| nginx | 80 | Public |
| SpiritLens Backend（uvicorn 4 workers） | 8085 | nginx internal |
| SpiritLens Frontend | 3005 | nginx internal |
| celery-image / celery-video | — | Docker internal（Redis broker） |
| PostgreSQL | 5432 | Docker internal |
| Redis | 6379 | Docker internal |

**部署方式**：代码改动必须 `docker compose build + up -d`（镜像含代码 + env 注入）；`restart` 不更新代码/环境变量，`docker cp` 会被镜像重建覆盖。详见 `deploy/README.md`。

### Deployment Guide

See `deploy/README.md`. Quick reference:
- **Python files**: `scp -> docker cp -> docker restart`
- **Frontend**: `docker compose build frontend -> up -d`
- **nginx**: edit `/etc/nginx/sites-available/clawshop`, then `nginx -t && systemctl reload nginx`
