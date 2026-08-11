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
9. **Canvas** — 智能画布是一个 **多项目管理** 系统：
   - `/ai-tool/canvas` — 画布项目列表页（非沉浸式，显示 Header，**不显示 Footer，不显示 Homepage Footer**）
   - `/ai-tool/canvas/[id]` — 画布编辑器（沉浸式，全屏 ReactFlow）
   - 项目列表和画布数据通过 `src/lib/canvas-storage.ts` 存入 localStorage
   - 每个项目独立存储：`spiritlens:canvas:data:{projectId}`
   - `CanvasEditor` 接收 `projectId` 参数决定加载/保存哪个项目
   - 自动提取节点中的首张成功图片作为项目缩略图
10. **AI Image/Video** — Session-sidebar layout, mock generation with progress, localStorage persistence
11. **Light mode** — Use `light:` variant for per-component overrides; `.light` class on `<html>`
12. **Text colors** — Use `text-text-primary` / `text-text-secondary` / `text-text-muted` instead of `text-white/X`
13. **Backgrounds** — Use `bg-surface-*` classes instead of `bg-[#...]`
14. **Admin routes** — Check `isAuthenticated && user?.is_admin` in useEffect to guard; redirect to `/auth/admin/login`
15. **Color tokens in border/background** — Use `border-white/[0.08] light:border-black/[0.08]` pattern for theme-aware borders; `bg-white/[0.04] light:bg-black/[0.03]` for theme-aware backgrounds

## Homepage Layout (主页布局)

```
.spirit-home-page
├── .spirit-code-hero      ← 全屏静态背景（深色/浅色各有独立样式；2026-08-10 起动画已关闭）
└── .home-content-shell    ← 内容外壳（含山体背景延伸）
    ├── .tool-grid         ← 「选择你的创作工具」区域
    └── FeaturedWorks      ← 精选作品
```

**hero 动画状态（2026-08-10）**：`spiritlens-hero.css` 已删除天空漂移/水晶浮动/粒子移动/能量台脉冲共 11 处 `animation` 引用（静态位置与光影保留）；仍保留山体 22s 漂移、轨道扫光、logo/徽章/标题/按钮动画与全部 hover 过渡。keyframes 定义未删，恢复只需加回 `animation:` 行。

### ToolGrid 位置控制（深浅色分开）

| 模式 | 控制文件 | 控制方式 | 当前值 |
|------|---------|---------|--------|
| **深色** | `ToolGrid.tsx` | Tailwind class `-mt-X` | `-mt-8`（-2rem） |
| **浅色** | `spiritlens-hero.css` | `.light .tool-grid { margin-top }` | `-145px` |

**原则：** 只动 ToolGrid 自身，不动任何背景（hero 背景、山体延伸、shell 渐变）。

- `params` and `searchParams` in page components are Promises — must `await`
- No `tailwind.config.ts` — theme is defined in `globals.css` via `@theme inline {}`
- Use `@import "tailwindcss"` not `@tailwind` directives
- `useRouter` from `next/navigation`
- `@xyflow/react` v12: `Node<CanvasNodeData>` requires data to extend `Record<string, unknown>` — use `FlowNodeData` type alias

## 按钮反馈规范（全站约定，2026-08-08 大修）

**所有按钮点击后必须有明确反馈**：
1. **异步操作按钮**：加 loading 状态（`disabled={busy}` + Loader2 转圈），`finally` 恢复；`catch` 用 `useToast()` → `toast(err.message || "操作失败", "error")`
2. **成功反馈**：操作成功但页面无明显变化 → `toast("...成功", "success")`；复制类 → `toast("已复制", "success")`
3. **高危删除**：加确认（`window.confirm` 或页面确认弹窗）+ loading
4. **`href="#"` 死链接**：`onClick` + `toast("功能建设中", "info")`
5. **toast 用法**：`import { useToast } from "@/components/ui/Toast"`（AppShell 全局包裹，所有页面可用）；Hook 组件顶层调用

## 用户菜单（个人管理）

- **首页**：`SpiritLensHero.tsx` 导航右侧头像下拉菜单；**其他页面**：`Header.tsx` 用户菜单
- 菜单项：管理后台（admin）/ 我的工作台 / **个人管理**（改昵称 + 改密码，调 `PUT /api/v1/auth/me` + `POST /api/v1/auth/change-password`，保存后 `updateUser()` 即时刷新）/ 退出登录
- 改两处导航时保持菜单项一致（共用同一套接口和 store 方法）——个人管理弹窗两处结构完全一致，改一处必须同步另一处
- **登录页记住密码（2026-08-10）**：`LoginForm.tsx` 勾选后 localStorage（`spiritlens:login-remember`）存账号 + **base64 混淆密码**（非加密，XSS 可解）；旧版明文数据加载时自动迁移转 base64；登录成功用 `window.location.href` 整页跳转（尝试触发 Chrome 保存密码提示，SPA router.push 不会触发，且 Chrome SPA 提示本身不可靠）

## Episode Workspace (集创作工作区)

四个工作区**平级独立**，可随时切换，无前置依赖：

| 阶段 | 标签 | 组件 | 说明 |
|:---:|------|------|------|
| 01 | 剧本与故事 | `ScriptStage` | 上传/编写剧本，AI拆解分镜 |
| 02 | 角色与场景 | `StageAssets` | 角色/场景/道具管理，卡片网格布局（正方形图片+名称） |
| 03 | 导演工作台 | `StageDirector` | 镜头网格 + 三栏编辑区（参考图/提示词/生成视频） |
| 04 | 成片与导出 | `StageExport` | 排序 + 导出清单 + 全屏播放器 |

### ⚠️ ShotWorkbench 双布局（2026-08-10 踩坑）

`ShotWorkbench.tsx` 有 `layout="bottom"`（438-772 行附近，**实际渲染**，父组件传 `layout="bottom"`）和 `layout="sidebar"`（775+ 行，旧布局已不用）两套 return。**改 ShotWorkbench 必须改 bottom 布局那套**——曾把多选弹窗加进 sidebar 而删了 bottom 的弹窗，导致线上点资产库按钮无反应。改文件先 grep `layout === "bottom"` 定位实际渲染分支。

### 资产库选择器（AssetLibraryPicker，2026-08-10 重设计）

- **两级结构**：第一层只显示主条目（`!group_id`）+「N 个形象」计数徽标，搜索保留（搜主条目名）；点主条目 → 第二层显示全部形象（主+变体），主形象带「原始」角标，各自显示自己的名字
- **`mode: "single" | "multi"` prop**：single（默认）第二层点击即选；multi 勾选角标 + 底部「已选 N 张 / 确认添加(N 张）」
- 使用点：导演工作台参考图列（multi，确认后并行 fetch blob 保序逐个 `onUploadRefImage`）、StageAssets 顶部浏览（single）、卡片替换（single）
- 后端零改动：`GET /api/v1/projects/{id}/{type}` 返回全量，前端按 group_id 分组

### 导演工作台 StageDirector

**布局：** 左侧 Tab 导航不变，右侧主区域分为上下两部分：
- **上半部分** — 镜头卡片网格（`ShotCard`），点击选中
- **下半部分** — 三栏编辑区（仅在选中镜头时显示）

**三栏结构：**
| 列 | 内容 |
|:--:|------|
| ① | SHOT 编号 + 参考图（按角色/场景/道具分组） + 资产库/上传按钮 |
| ② | 视频提示词（contentEditable + @提及） + 视频模型 + 比例 + 时长 + 分辨率 + 生成按钮（右下角） |

**时长选择**：快捷按钮 5/10/15 秒 + 「自定义…」下拉（1~15 秒整数值，排除快捷值）。选中自定义值时快捷按钮不高亮。后端 `duration` 校验 ge=1 le=30。
| ③ | 生成结果 - **多视频列表**（可滚动） |

**多视频（2026-08-08）**：一个镜头可生成多个视频（不限流，并发安全）：
- 数据结构：`Shot.videos: VideoInterval[]`（`types.ts`）；`interval` 仅老数据兼容
- **关键约定**：`shotVideos(s)` 用 `s.videos !== undefined ? s.videos : [interval]`——videos 存在即优先（空数组=已删光，**不能退化回 interval**，否则老数据残留失败视频会"复活"）；删光视频时同步清 `interval`
- 并发安全：`shotsRef` + 函数式 `updateShot`（多任务轮询互不覆盖）
- 生成**追加**到列表尾部；轮询按 `videoId` 定位更新（`updateShotVideo`）
- **上传按钮无 `accept` 过滤（2026-08-10）**：去掉 `accept="image/*"` 让文件框不预枚举图片（打开更快），改在前端 onChange 过滤 `f.type.startsWith("image/")` + toast「已跳过非图片文件」；目录记忆是浏览器/系统行为不受影响
- 每张卡片：**提示词（可复制）** + 播放器/进度条/失败信息 + **下载/重跑/取消/删除**（**取消在删除前**；生成中卡片有「取消」→ `POST /api/v1/video/tasks/{taskId}/cancel` 终止后端任务 + 卡片变「已取消」）
- **生成按钮反馈（2026-08-10 改为 2 秒反馈）**：按钮文案**只由 `justSubmitted` 驱动**（点击后 2 秒定时器）——点击立即「生成中...」，2 秒后变「继续生成」（列表有任意视频）或「生成视频」，**与真实生成状态解耦**（真实进度由视频卡片体现）；三处按钮（提示词右下角/列表底部虚线/无视频大按钮）同一逻辑；`isGenerating` 仅用于「视频生成中，请耐心等待...」提示行；防连点 1.5s `submitLockRef` + 异常点击 30s 锁保留
- 失败提示基于**列表最新 failed 项**（不用 interval）
- **取消任务 DB 记录**：后端取消时（`tasks.py`）同步把 creations 标 `FAILED`+「已取消」（否则使用记录永远卡「处理中」）；轮询需处理 `cancelled` 状态（标已取消并停止）

**Key Files:**
- `components/projects/script/StageDirector/index.tsx` — 主组件，`loadData` 加载镜头配置
- `components/projects/script/StageDirector/ShotWorkbench.tsx` — 底部三栏编辑区
- `components/projects/script/StageDirector/ShotCard.tsx` — 镜头卡片（紧凑型）
- `components/projects/script/StageDirector/types.ts` — 类型定义

### contentEditable @提及参考图（导演工作台 + AI 视频 + AI 图片共用）

**实现：** `<div contentEditable>` + `textToHtml()` 将 `图N`/`@图N` 转为彩色 chip
- `onInput` 检测 `@` → 弹出浮层（`fixed` 定位）→ `insertMention()` 插入 chip
- chip：`<span contentEditable="false" class="bg-brand-cyan/15 text-brand-cyan font-bold font-mono border border-brand-cyan/30">`
- `prompt` 状态存纯文本（`div.textContent`），用 `useEffect` 双向同步
- `textToHtml()` 用正则 `/(@?图\d+)/g` 匹配，生成 chip HTML
- `insertMention()` 用 Range API 删除 `@` 后插入 chip
- 外部修改 prompt（rerun/clear）时通过 `useEffect` 同步到 div
- 关键文件：`ShotWorkbench.tsx`（导演）、`video/page.tsx`、`image/page.tsx`
- 详情见记忆 `contentEditable-at-mention.md`

### 视频生成持久化

**生成流程：**
1. 点击"生成" → 立即清空旧 `videoUrl` + 设置 `status: "generating"`
2. API 返回 `taskId` → 存入 shot.interval
3. 轮询状态 → 完成时更新 `videoUrl` + `status: "completed"`
4. 所有状态通过 `updateShot` → `persistShots` 保存到 episode config

**persistShots 乐观锁（2026-08-10）**：保存镜头是 GET+PUT 读改写，多人同时编辑同一集（如项目成员协作/双标签页）会**后写覆盖先写**（张雲镜头丢失事件根因）。现 PUT 带 `if_updated_before`（上次 GET 的 updated_at），服务器校验不符返回 **409「配置已被其他用户更新，请重试」**；前端收到 409 重拉最新配置、用「服务器 structureData + 本地 shots」合并重试（≤3 次）。改 persistShots 必须保留这个重试循环。

**恢复流程（刷新后/离开回来）：**
- `useEffect` 检测 `interval.taskId && status !== "completed"` → 查询 API 恢复
- 如果 shot 有 `videoUrl` 但状态不对 → 渲染时强制修正为 `completed`
- 如果无 `taskId` → **按 prompt 从 `GET /api/v1/user/assets/recover?include_project=true` 匹配 project 记录**（2026-08-10：recover 默认排除 project 记录，工作台恢复必须带 `include_project`；匹配「status=COMPLETED + media_url + source=project + prompt 精确匹配」的最新一条，找回"提交后立即关页面导致 taskId 未持久化"的丢失视频；匹配不到才标 failed）

**Key Files:** `components/projects/script/StageDirector/index.tsx`

## 媒体下载策略（跨域 CDN）

**规则：所有媒体下载按钮必须用 `downloadMedia()`（`src/lib/download.ts`），禁止 `<a href download>` 直链或程序化 `a.click()`。**

原因：视频/图片存于跨域 CDN（`media.yhanm.cn`），`<a download>` 对跨域链接会被浏览器忽略 download 属性 → **直接打开资源（"放大"）**。

`downloadMedia(url, filename, { isVideo })` 两级策略：
1. **fetch blob 直连 CDN**（依赖 CDN 已配置的 CORS 头）—— 下载走 CDN 带宽，快、不占服务器
2. 失败自动回退**同源代理接口**（`/api/v1/video/download`、`/api/v1/image/download`，流式转发）—— 保证可用

已接入入口：导演工作台（2 处）、资产库预览/批量、AI 工具页下载封面、AI 图片页（卡片+预览弹窗）、画布图片节点、成片导出、StageAssets 预览、资产详情页。全站共 11 处。

## Asset Detail Page (资产详情页)

**路由:** `/projects/[id]/assets/[type]/[assetId]` (type = characters | scenes | props)

- 按 **group_id** 分组展示变体：`items.filter(i => i.id === mainId || i.group_id === mainId)`
- 主角色显示 **"（原始）"** 标签，变体可独立命名
- 每个变体为独立卡片：图片(正方形) + 名称(可编辑) + 三按钮
- 图片: 点击放大预览 + 下载，hover 显示更换/重新生成
- 提示词编辑: 点击弹出底部 Modal（模型选择 + 尺寸选择 + 生成按钮）
- 上传新形象（可多选）: `handleUploadBatch` 逐张上传依次建变体（`group_id=主id`），最后一个自动进入改名模式，成功 toast「已上传 N 个」；超 15 张拒绝提示分批。「更换」按钮保持单张（每卡换一图）
- 变体改名: 点击名称 → 进入输入框 → 失焦/回车保存

**卡片三按钮:**
| 按钮 | 功能 |
|------|------|
| 提示词 | 弹出 Modal（含模型/尺寸选择），编辑后点"生成"直接生图 |
| 资产库 | 调用 PUT 更新保存到库 |
| 删除 | 二次确认后删除该变体 |

**Key Files:** `frontend/src/app/projects/[id]/assets/[type]/[assetId]/page.tsx`

## StageAssets (角色与场景)

**Key Files:** `components/projects/script/StageAssets/index.tsx`, `CharacterCard.tsx`, `SceneCard.tsx`, `PropCard.tsx`

- 按 **group_id** 聚合：只显示主条目（`group_id=null`），变体通过计数徽标展示
- 每张卡片左下角显示 `+N` 变体计数（N>0 时显示）
- 网格布局: `grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3`
- 网格第一个位置是**添加卡片**（青色虚线边框 `border-brand-cyan/30`）
- 点击添加卡片 → 弹出 Modal（名称 + 描述 + 图片上传）
- **多图上传（2026-08-10）**：添加弹窗 + 详情页「上传新形象」均支持一次选多张（角色/场景/道具三 tab 共用代码）。弹窗选 N 张 → 预览缩略图网格（每张可 ✕，可继续累加）→ 确认时逐张上传，**第一张建主记录，其余建变体（`group_id=主id`）** → 网格显示 1 张卡 + `+N` 徽标；软上限 15 张（`MAX_ADD_IMAGES`），超了 toast 截取。后端 `POST /api/v1/upload` 单次上限 15 张、nginx `client_max_body_size 200m`
- 有图片的卡片 hover 时左上角显示 **删除按钮** 🗑️（二次确认）
- 图片 hover 时显示半透明遮罩 + "点击编辑" 提示
- 点击卡片 → 跳转到详情页 `/projects/[id]/assets/[type]/[assetId]`
- **Tab 持久化**：切换 tab 时存入 `sessionStorage`，从详情页返回后自动恢复
- 模型选择 + 比例选择在页面顶部 Header 中

## Project Management (项目管理)

**Key Files:** `frontend/src/app/projects/page.tsx`（项目列表）、`frontend/src/app/projects/[id]/page.tsx`（项目详情）

- 项目列表页（`/projects`）是沉浸式路由（无 Header/Footer），根容器用 `h-full overflow-y-auto` 内部滚动——**不要改回 `min-h-screen`**（会被外层 `h-screen overflow-hidden` 裁剪导致无法滚动）

### 添加集数
- 季头部 `+` 按钮: 自动顺序添加（1→2→3）
- 暂无集数: 改为输入框，支持 `第4集` / `4` / `1-3` 格式
- 创建剧集提示词: `请输入剧名，xxx/xxx-第x季`

## AI 视频生成 (@提及参考图)

**Key Files:** `frontend/src/app/ai-tool/video/page.tsx`

- 输入框 `min-h-40`(160px)，支持 `@` 触发参考图选择
- 弹出浮层菜单，↑↓/Enter/Escape 操作
- 参考图编号: 图1/图2/...
- 视频参数持久化: modelId/duration/size 存 `localStorage`(`spiritlens:video:params`)
- 刷新后自动恢复，改哪个记哪个
- **并发提交（2026-08-10）**：发送按钮只受「无提示词」和「异常点击 30s 锁」禁用，**生成中可继续发新提示词**——每次提交独立 taskId + 独立轮询 + 独立 WS，互不干扰；`isRunning` 只在全部生成结束后才复位（图片页同款，2026-08-10 一起改）
- **下载封面（2026-08-10 修复）**：菜单常显；有 poster/参考图直接下载，**都没有则 canvas 抽视频第一帧**（`crossOrigin="anonymous"` 新建隐藏 video → loadeddata → drawImage → JPEG，5s 超时兜底）——两个 provider 的 `video_poster_url` 都是空字符串，之前按钮只在有参考图时出现

## AI 图片生成
**Key Files:** `frontend/src/app/ai-tool/image/page.tsx`
- 同样支持 `@` 提及参考图
- 提示词输入框 `min-h-40`

## 资产管理库页面 (`/assets`)

- 卡片网格（Masonry 布局）+ 点击预览放大
- 图片点击 → 全屏预览 Modal，视频点击 → 播放器
- 预览 Modal 有关闭 + 下载按钮
- 批量操作模式（选择 → 删除/发布/下载）

## 历史会话跨设备同步（合并语义）

- 会话存储于 IndexedDB（`indexeddb-storage.ts`，GB 级，上限 200 会话），首次加载自动从 localStorage 迁移
- **每次打开 AI 工具页都从后端合并历史**（`session-recovery.ts` 的 `restoreHistory()`，模块级 `merged` 标志防重入，video/image 两页共享，幂等）：
  - **补缺**：后端 `GET /api/v1/user/assets/recover` 返回的记录按「类型+日期」分组，本地缺失的补建会话（标题 `X月X日`）
  - **孤儿移除**：本地 generation 的后端 id（`creationId` 或 `recover-{id}` 前缀）不在后端集合 → 自动移除（其他设备删除了记录）
- **删除全局生效**：删除会话时先收集所有 generation 的后端 id（`collectBackendIds`）逐个 `DELETE /api/v1/user/assets/{id}`，再删本地 → 换设备/刷新后不会"复活"
- 恢复的 generation 必须设置 `creationId`（否则无法联动删除）
- 会话列表时间显示**最后一条生成记录的时间**（`lastGen.createdAt`），非会话创建时间
- 已知边界：recover 接口 LIMIT 500，超出部分不会同步（代码注释已注明）

**Key Files:**
- `store/sessions.ts` — Zustand persist store
- `lib/indexeddb-storage.ts` — IndexedDB 适配器
- `lib/session-recovery.ts` — 后端恢复逻辑

## Director's Workbench Key Files

| File | Purpose |
|------|---------|
| `components/projects/script/StageDirector/index.tsx` | Main director workbench — shot grid, persistence, recovery |
| `components/projects/script/StageDirector/ShotWorkbench.tsx` | Bottom panel — 3-column editor with @mention, generate, video player |
| `components/projects/script/StageDirector/ShotCard.tsx` | Shot thumbnail card — compact header, aspect-[2/1] thumbnail, scene name badge |
| `components/projects/script/StageDirector/types.ts` | Shot, VideoInterval, Keyframe, CameraMovement types |

## StageExport Key Files

| File | Purpose |
|------|---------|
| `components/projects/script/StageExport/index.tsx` | 成片播放 — 全屏视频播放器 + 侧栏播放列表 + 拖拽排序 + 全部下载 |

**多视频导出**：后端 `export.py` 把每个镜头的**全部视频**展开为导出项（`videoIndex` 区分），前端命名 **`镜头N（M）`**（播放器标题/侧栏/下载文件名统一，`itemLabel()`）。

## Creation Status Enum (重要)

`Creation` 模型的 `status` 字段使用 PostgreSQL 枚举，值全部**大写**：
- `PENDING` / `PROCESSING` / `COMPLETED` / `FAILED`

**所有原始 SQL 中的 status 赋值必须使用大写！** 小写 `'completed'` 会导致 UPDATE 静默失败。
Python ORM 使用 `CreationStatus.COMPLETED.value` 获取小写值，但 PostgreSQL 存储大写。

## Project Asset API 模式

所有项目嵌套资源（episodes / characters / scenes / props）遵循统一模式：
- `GET /api/v1/projects/{id}/{type}` — 列表
- `POST /api/v1/projects/{id}/{type}` — 创建
- `PUT /api/v1/projects/{id}/{type}/{entity_id}` — 更新
- `DELETE /api/v1/projects/{id}/{type}/{entity_id}` — 删除
- 自动校验项目成员资格（`_verify_project_member`），仅 owner 可管理成员/删除项目
