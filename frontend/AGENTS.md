<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# SpiritLens Project Guide

## Brand Tokens (CSS variables from globals.css)

| Tailwind Class | Value |
|----------------|-------|
| `bg-brand-deep` | `#0d0a1a` |
| `bg-brand-dark` | `#1a0a3e` |
| `bg-brand-mid` | `#2a1a5e` |
| `text-brand-purple` | `#6c3bff` |
| `text-brand-cyan` | `#00d4ff` |
| `text-text-primary` | `#f0edff` |
| `text-text-secondary` | `#9b95b8` |
| `text-text-muted` | `#6a6388` |
| `glass` | glass morphism card style |
| `border-border-subtle` | border with purple tint |
| `.text-gradient` | white → cyan gradient text |
| `.text-gradient-purple` | purple → cyan gradient text |

## Project Conventions

1. **"use client"** — All interactive components need this directive
2. **cn()** — Use `import { cn } from "@/lib/utils"` for conditional className merging
3. **Framer Motion** — Use `motion.div` with `variants` for staggered animations
4. **Icons** — Use `lucide-react`, destructure at import
5. **State** — Global auth state in `src/store/auth.ts` (Zustand + persist)
6. **API** — Use `src/services/api.ts` which auto-injects JWT from localStorage
7. **Layout** — `app/layout.tsx` wraps all pages with Header + Footer
8. **Pages** — Each route is a directory with `page.tsx`, can import server/client components
9. **Canvas** — `InfiniteCanvas` in `ai-tools/` is the full-screen canvas with left toolbar
10. **AI Studio** — `AIStudio` in `ai-tools/` handles image/video generation pages

## Backend Integration

- Video: POST /api/v1/video/generate → background thread → Xinghe API → local download
- Video WebSocket: WS /api/v1/ws/task/{task_id} (real-time progress)
- Video status: GET /api/v1/video/status/{task_id} (polling fallback)
- Cancel: POST /api/v1/video/tasks/{id}/cancel
- Cancel: POST /api/v1/image/tasks/{id}/cancel
- Assets: GET /api/v1/user/assets (user's creation library)
- Favorites: POST /api/v1/user/assets/{id}/favorite
- Community detail: GET /api/v1/community/posts/{id}
- Comments: GET/POST /api/v1/community/posts/{id}/comments
- Upload: POST /api/v1/upload
- Models: GET /api/v1/models?type=image|video
- Admin logs: GET /api/v1/admin/logs

## Production Server

| Detail | Value |
|--------|-------|
| Domain | `https://yhanm.cn/spiritlens/` |
| API base | `https://yhanm.cn/spiritlens/api/v1/` |
| Public URL env | `PUBLIC_URL=https://yhanm.cn/spiritlens` |
| IP fallback | `http://129.28.122.183/spiritlens/` |

## Video Generation Flow

1. POST `/api/v1/video/generate` → returns `task_id`
2. Frontend connects WebSocket `ws://.../ws/task/{task_id}` for real-time progress
3. Backend background thread polls Xinghe API for completion
4. On completion → downloads video to local storage → saves to Redis + PostgreSQL
5. Frontend polling (`GET /status/{task_id}` every 2s) as backup
6. Session store persists generation state across page refreshes

## Creation Status Enum

PostgreSQL enum `CreationStatus` values are **lowercase**: `pending`, `processing`, `completed`, `failed`.
Raw SQL must use lowercase! `'COMPLETED'` (uppercase) silently fails.

## Important Next.js 16 Gotchas

- `params` and `searchParams` in page components are Promises — must `await`
- No `tailwind.config.ts` — theme is defined in `globals.css` via `@theme inline {}`
- Use `@import "tailwindcss"` not `@tailwind` directives
- `useRouter` from `next/navigation`
