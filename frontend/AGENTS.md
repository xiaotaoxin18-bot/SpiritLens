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
3. **Icons** — Use `lucide-react`, destructure at import
4. **API** — Use `src/services/api.ts` which auto-injects JWT from localStorage
5. **Canvas** — 多项目管理：`/ai-tool/canvas` → `/ai-tool/canvas/[id]` 全屏画布编辑器
   - 画布列表卡片保持简洁：标题 + 日期 + hover删除，不要缩略图/图标/分隔线
6. **Footer** — 首页显示 Footer，画布列表页不显示（AppShell 精确排除 `/ai-tool/canvas`）
6. **AI Studio** — 图片/视频生成页面共用 `SessionSidebar`，支持 `@` 提及 参考图；**生成中可并发提交新提示词**（2026-08-10，发送按钮不再被 isRunning 禁用）

## Episode Workspace (集创作工作区)

四个 Tab 平级独立，左侧导航栏固定：

| 阶段 | Tab | 组件 | 说明 |
|:---:|------|------|------|
| 01 | 剧本与故事 | `ScriptStage` | 上传/编写剧本，AI拆解 |
| 02 | 角色与场景 | `StageAssets` | 卡片网格，hover 遮罩提示，点击进详情 |
| 03 | 导演工作台 | `StageDirector` | 上半: 镜头网格 / 下半: 三栏编辑区 |
| 04 | 成片与导出 | `StageExport` | 全屏播放 + 侧栏列表 + 排序 |

Tab 选择持久化到 localStorage（`episode-stage-{episodeId}`），SSR 后通过 `useEffect` 恢复。

## 导演工作台

### 布局

```
┌──────────────────────────────────────────┐
│  左侧导航 (4 Tab)  │  上半: 镜头网格      │
│                    │  (ShotCard 紧凑型)   │
│                    ├─────────────────────┤
│                    │  下半: 三栏编辑区     │
│                    │  ①参考图 ②提示词+参数 │
│                    │  ③生成结果(视频播放器)│
└──────────────────────────────────────────┘
```

### ⚠️ ShotWorkbench 双布局

`ShotWorkbench.tsx` 有 `layout="bottom"`（**实际渲染**）和 `layout="sidebar"`（旧布局不用）两套 return——**改它必须改 bottom 布局那套**（2026-08-10 曾因改错分支导致线上资产库按钮无反应）。先 grep `layout === "bottom"` 定位。

### 视频生成持久化

1. 点击生成 → `updateShot({ interval: { status: "generating", videoUrl: null } })`
2. API 返回 `taskId` → 存入 interval（`updateShot({ interval: { taskId } })`）
3. 轮询完成 → `updateShot({ interval: { videoUrl, status: "completed" } })`
4. 刷新后恢复：检测 `taskId && status !== "completed"` → 查询 API
5. 修复遗留：如果 `videoUrl` 存在但状态不对 → 渲染时强制 `completed`

**注意**：轮询期间所有 interval 更新必须**保留 taskId**——否则 persistShots 写入的 config 无 taskId，恢复逻辑会误标 failed 导致「生成中/失败」反复横跳。
**persistShots 乐观锁（2026-08-10）**：PUT 带 `if_updated_before`（updated_at），409 冲突时重拉合并重试 ≤3 次——防多人编辑互相覆盖。**恢复**：无 taskId 的镜头按 prompt 从 `recover?include_project=true` 匹配 project 记录找回。

**多视频（2026-08-08）**：一个镜头多个视频 → `Shot.videos` 列表（生成追加、按 videoId 定位更新、`shotsRef` 并发安全）。**`shotVideos()` 必须 `videos !== undefined` 优先**（空数组=删光，不能退化回 interval 否则残留失败会复活；删光同步清 interval）。卡片含提示词（可复制）/下载/重跑/**取消**（生成中卡片，调 cancel 接口，后端同步标 DB FAILED「已取消」）/删除。`isGenerating` 基于 videos 列表（按钮点击后立即「生成中...」反馈）。导出显示「镜头N（M）」。

**时长选择**：快捷 5/10/15 + 自定义下拉 1~15 秒。

### contentEditable @提及

`<div contentEditable>` 替代 `<textarea>`，Uncontrolled 模式。
- `@` 触发浮层 → 选中 → 插入 chip（`<span contentEditable="false">@图N</span>`）
- `prompt` 状态存纯文本（`div.textContent`）
- 详情见 `contentEditable-mention.md` 记忆

### Key Files
- `StageDirector/index.tsx` — 主组件 + 持久化 + 恢复
- `StageDirector/ShotWorkbench.tsx` — 三栏编辑区
- `StageDirector/ShotCard.tsx` — 镜头卡片
- `StageDirector/types.ts` — 类型定义

## StageExport (成片导出)

全屏视频播放器 + 侧栏播放列表：
- 视频铺满播放区域（`absolute inset-0`）
- 进度条悬浮在底部（渐变背景）
- 播放列表支持拖拽排序
- 顺序播放 / 单一下载 / 批量下载

## Asset Detail Page

- 路由: `/projects/[id]/assets/[type]/[assetId]`
- 按 `group_id` 分组展示变体（group_id=null 为主角色，否则为变体）
- 主角色标记"（原始）"，变体可点击名称直接改名（失焦/回车保存）
- 上传新形象（可多选）→ 逐张建变体（`group_id=主id`），最后一个自动改名；「更换」保持单张
- 三按钮：提示词（含模型/尺寸选择）/ 资产库 / 删除
- 图片 hover 显示更换/重新生成 + 提示词弹窗有生成按钮

## StageAssets (角色与场景)

- 网格: `grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3`
- 按 `group_id` 聚合：只显示主条目，变体计数的 `+N` 徽标在左下角
- 添加卡片最前，青色虚线边框
- 图片 hover → 半透明遮罩 + "点击编辑" 文字 + 左上角删除按钮
- 点击卡片进详情页
- Tab 切换自动持久化到 `sessionStorage`，返回后恢复
- **多图上传（2026-08-10）**：添加弹窗 + 详情页上传新形象支持多选，第一张建主记录其余建变体（group_id），软上限 15 张；后端单次上限 15 张、nginx 200m
- **资产库选择器两级（2026-08-10）**：第一层主条目+变体计数，点进显示全部形象；`mode: "single"|"multi"`，导演工作台多选参考图

## 历史会话跨设备同步

- IndexedDB（`indexeddb-storage.ts`）存储，GB 级，上限 200 会话
- **每次打开都从后端合并**（`session-recovery.ts`）：补缺（按类型+日期分组）+ 孤儿移除（后端已删的记录自动消失）
- **删除会话全局生效**：先删后端记录（`collectBackendIds` → `DELETE /user/assets/{id}`）再删本地
- 会话时间显示最后一条生成记录的时间
- 恢复记录必须设置 `creationId`

## 用户菜单

首页导航（`SpiritLensHero.tsx`）与全局导航（`Header.tsx`）的用户菜单均有「个人管理」入口（改昵称 → `PUT /api/v1/auth/me`；改密码 → `POST /api/v1/auth/change-password`；保存后 `updateUser()`）。两处弹窗结构完全一致，改一处必须同步另一处。登录页「记住密码」存 localStorage（base64 混淆，旧明文自动迁移）。

## 媒体下载策略（跨域 CDN）

**所有媒体下载按钮必须用 `downloadMedia()`（`src/lib/download.ts`）**，禁止 `<a download>` 直链/程序化 `a.click()`——跨域 CDN 资源会被浏览器忽略 download 属性直接打开（"放大"）。
两级策略：fetch blob 直连 CDN（快）→ 失败回退同源代理（`/api/v1/video|image/download`）。

## Project Asset API

统一模式：
- `GET /api/v1/projects/{id}/{type}` — 列表
- `POST /api/v1/projects/{id}/{type}` — 创建
- `PUT /api/v1/projects/{id}/{type}/{entity_id}` — 更新
- `DELETE /api/v1/projects/{id}/{type}/{entity_id}` — 删除

## Creation Status Enum

PostgreSQL 枚举值**大写**：`PENDING / PROCESSING / COMPLETED / FAILED`
Python ORM 中 `CreationStatus.COMPLETED.value` 是小写，但 DB 存大写。

## Production

| Detail | Value |
|--------|-------|
| Domain | `https://yhanm.cn/spiritlens/` |
| API base | `https://yhanm.cn/spiritlens/api/v1/` |
| Public URL env | `PUBLIC_URL=https://yhanm.cn/spiritlens` |

## Tailwind v4 Notes

- No `tailwind.config.ts` — theme in `globals.css` via `@theme inline {}`
- Use `@import "tailwindcss"` not `@tailwind` directives
- `aspect-*` utilities may not work reliably, use `padding-bottom` percentage trick instead
- Use `light:` variant for light mode overrides
