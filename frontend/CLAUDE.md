@AGENTS.md

# SpiritLens Project Guide

## Brand Tokens (CSS variables from globals.css)

| Tailwind Class | Value (深色) | Value (浅色) |
|----------------|-------------|-------------|
| `bg-surface-base` | `#0d0d0e` | `#f8f7fc` |
| `bg-surface-card` | `#141416` | `#ffffff` |
| `bg-surface-elevated` | `#0c0b14` | `#fefdff` |
| `bg-surface-overlay` | `#1d1d1e` | `#ffffff` |
| `text-text-primary` | `#f0edff` | `#1a1625` |
| `text-text-secondary` | `#9b95b8` | `#6e6580` |
| `text-text-muted` | `#6a6388` | `#a098b0` |
| `text-brand-purple` | `#6c3bff` | `#6c3bff` |
| `text-brand-cyan` | `#00d4ff` | `#00d4ff` |
| `border-border-subtle` | `rgba(108,59,255,0.12)` | `rgba(108,59,255,0.08)` |
| `glass` | glass morphism card style | semi-transparent white |
| `.text-gradient` | white → cyan gradient | purple → cyan gradient |
| `.text-gradient-purple` | purple → cyan gradient | purple → cyan gradient |

## Project Conventions

1. **"use client"** — All interactive components need this directive
2. **cn()** — Use `import { cn } from "@/lib/utils"` for conditional className merging
3. **Framer Motion** — Use `motion.div` with `variants` for staggered animations
4. **Icons** — Use `lucide-react`, destructure at import
5. **Stores** — Auth in `store/auth.ts` (Zustand+persist), Theme in `store/theme.tsx` (Context), Sessions in `store/sessions.ts` (Zustand+persist)
6. **API** — Use `src/services/api.ts` which auto-injects JWT from localStorage (`spiritlens-auth`)
7. **Layout** — `AppShell` wraps ThemeProvider + conditionally renders Header/Footer; immersive routes (ai-tool/*, /admin) hide chrome
8. **Pages** — Each route is a directory with `page.tsx`
9. **Canvas** — `InfiniteCanvas` in `ai-tools/` wraps `ReactFlowProvider` → `CanvasEditor` with node system
10. **AI Image/Video** — Session-sidebar layout, mock generation with progress, localStorage persistence
11. **Light mode** — Use `light:` variant for per-component overrides; `.light` class on `<html>`
12. **Text colors** — Use `text-text-primary` / `text-text-secondary` / `text-text-muted` instead of `text-white/X`
13. **Backgrounds** — Use `bg-surface-*` classes instead of `bg-[#...]`
14. **Admin routes** — Check `isAuthenticated && user?.is_admin` in useEffect to guard; redirect to `/auth/admin/login`
15. **Color tokens in border/background** — Use `border-white/[0.08] light:border-black/[0.08]` pattern for theme-aware borders; `bg-white/[0.04] light:bg-black/[0.03]` for theme-aware backgrounds

## Important Next.js 16 Gotchas

- `params` and `searchParams` in page components are Promises — must `await`
- No `tailwind.config.ts` — theme is defined in `globals.css` via `@theme inline {}`
- Use `@import "tailwindcss"` not `@tailwind` directives
- `useRouter` from `next/navigation`
- `@xyflow/react` v12: `Node<CanvasNodeData>` requires data to extend `Record<string, unknown>` — use `FlowNodeData` type alias

## Project Management (集数管理)

| Tab | Component | Backend Model | Description |
|-----|-----------|---------------|-------------|
| 集数管理 | `EpisodeList` | Episode | 列集数→新建集数弹窗（编号自动识别、剧本粘贴/上传.docx、封面上传） |
| 角色管理 | `AssetList` type="characters" | Character | 通用资产列表，支持名称+描述+参考图上传 |
| 场景管理 | `AssetList` type="scenes" | Scene | 同上 |
| 道具管理 | `AssetList` type="props" | Prop | 同上 |

**Key Files**

| File | Purpose |
|------|---------|
| `components/projects/EpisodeList.tsx` | 集数列表（卡片网格 + 删除 + "进入创作"） |
| `components/projects/CreateEpisodeDialog.tsx` | 新建集数弹窗（名称自动识别编号、剧本粘贴/上传、封面图） |
| `components/projects/AssetList.tsx` | 通用资产列表组件（角色/场景/道具共用） |
| `components/projects/CreateAssetDialog.tsx` | 通用新建资产弹窗（名称+描述+参考图上传） |
| `components/projects/ProjectCard.tsx` | 项目卡片（含悬停删除按钮） |
| `components/projects/CreateProjectDialog.tsx` | 创建项目弹窗（名称+描述+比例选择） |
| `components/projects/CreateEpisodeDialog.tsx` | 新建集数弹窗 |

**AssetList 组件约定** — 创建新的资产类型时:
1. 后端建 model（id, project_id, name, description, image_url）
2. 在 `projects.py` 添加 CRUD 路由（参考 characters/scenes/props 模式）
3. 前端用 `<AssetList type="xxx" label="名称" icon={Icon} />` 即可

## Admin Pages

| File | Purpose |
|------|---------|
| `app/admin/page.tsx` | Dashboard with stats cards |
| `app/admin/users/page.tsx` | User management (table, search, pagination, admin toggle, delete) |
| `app/admin/models/page.tsx` | AI model management (CRUD, toggle, API test) |
| `app/auth/admin/login/page.tsx` | Admin login page |

## Backend Key Files

| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI app, lifespan, seed data |
| `backend/app/core/config.py` | Settings (DB, JWT, CORS) |
| `backend/app/core/database.py` | SQLAlchemy async engine + session |
| `backend/app/api/v1/auth.py` | Auth + admin auth + /me endpoint |
| `backend/app/api/v1/admin.py` | Dashboard, user mgmt, model mgmt CRUD |
| `backend/app/api/v1/projects.py` | 项目 CRUD + 集数/角色/场景/道具嵌套 CRUD |
| `backend/app/api/v1/video.py` | Video generation API (POST generate, GET status, WebSocket progress) |
| `backend/app/api/v1/assets.py` | User asset library CRUD + favorites + Redis fallback for status |
| `backend/app/api/v1/ws.py` | WebSocket endpoint for real-time task progress |
| `backend/app/services/providers/xinghe.py` | Xinghe Zhiyun API provider (image + video generation) |
| `backend/app/services/generation.py` | Task management (create/save/load/progress callbacks) |
| `backend/app/models/project.py` | Project model (name, description, cover_url, aspect_ratio, status) |
| `backend/app/models/episode.py` | Episode model (project_id, episode_number, title, status, script_content, cover_url) |
| `backend/app/models/character.py` | Character model (project_id, name, description, image_url) |
| `backend/app/models/scene.py` | Scene model (同上) |
| `backend/app/models/prop.py` | Prop model (同上) |
| `backend/app/models/user.py` | User model |
| `backend/app/models/ai_model.py` | AiModel model |
| `backend/app/models/community.py` | Community post/comment models |
| `backend/app/models/creation.py` | Creation (user generation assets) model — uses CreationStatus enum (lowercase: pending/processing/completed/failed)

## Production Server

| Detail | Value |
|--------|-------|
| Domain | `https://yhanm.cn` (HTTPS with Let's Encrypt) |
| App subpath | `/spiritlens/` |
| Root path (`/`) | Returns 404 (reserved for future landing page) |
| HTTP 80 | Auto-redirects to HTTPS |
| IP direct | `http://129.28.122.183/spiritlens/` still works |
| nginx SSL cert | `/etc/nginx/ssl/yhanm.cn_bundle.crt` |
| nginx config | `/etc/nginx/sites-enabled/clawshop` (HTTP), `/etc/nginx/nginx.conf` (HTTPS server block)

## Director's Workbench Key Files

| File | Purpose |
|------|---------|
| `components/projects/script/StageDirector/index.tsx` | Main director workbench — shot grid, video generation, persistence |
| `components/projects/script/StageDirector/ShotWorkbench.tsx` | Side panel — prompt editing, ref images, duration, resolution, video player |
| `components/projects/script/StageDirector/ShotCard.tsx` | Shot thumbnail card — hero background when empty, video preview when done |
| `components/projects/script/StageDirector/types.ts` | Shot, VideoInterval, Keyframe types |

## Creation Status Enum (重要)

`Creation` 模型的 `status` 字段使用 `CreationStatus` 枚举，值全部**小写**：
- `pending` / `processing` / `completed` / `failed`

**所有原始 SQL 中的 status 赋值必须使用小写！** 大写 `'COMPLETED'` 会导致 UPDATE 静默失败。
涉及文件：`video.py`、`tasks.py`、`assets.py` 中的 `SET status = 'completed'`。

## Project Asset API 模式

所有项目嵌套资源（episodes / characters / scenes / props）遵循统一模式：
- `GET /api/v1/projects/{id}/{type}` — 列表
- `POST /api/v1/projects/{id}/{type}` — 创建
- `PUT /api/v1/projects/{id}/{type}/{entity_id}` — 更新
- `DELETE /api/v1/projects/{id}/{type}/{entity_id}` — 删除
- 自动校验项目所有权（`_verify_project_owner`）
