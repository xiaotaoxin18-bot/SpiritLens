# SpiritLens · 灵境

> 一站式 AI 创意创作平台，释放你的无限想象

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.138-009688?logo=fastapi)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06D6D4?logo=tailwindcss)
![ReactFlow](https://img.shields.io/badge/ReactFlow-12-FF0072?logo=react)
![Zustand](https://img.shields.io/badge/Zustand-5-orange?logo=react)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0-red)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)

---

## 📋 项目概述

SpiritLens（灵境）是一个面向个人创作者和专业工作室的 AI 创作平台，提供：

- **AI 图片生成** — 文生图 / 图生图，支持模型选择、参考图（上传 + 联网搜索）、高级参数（seed/批次/负向提示词）
- **AI 视频生成** — 文生视频 / 首尾帧 / 图生视频，多种 Seedance 模型
- **智能画布（无限画布）** — 多项目管理 + 基于 ReactFlow v12 的节点式工作流，支持自由缩放、框选、拖拽、连线、真实 API 生成；项目列表页管理多个画布作品
- **对话会话管理** — 左侧侧边栏，支持新建/切换/删除对话，Zustand + localStorage 持久化
- **双主题系统** — 深色模式 + 浅色模式，画布独立主题切换
- **参考图系统** — 文件上传 + 联网搜索（Openverse），参考强度滑块
- **灵感社区** — 作品展示画廊，点赞/评论/发布
- **项目管理** — 剧名 → 上传剧本/粘贴 → AI 拆分镜 → 提取场景/角色/道具 → 逐分镜生成，支持 Season（季）/ 集数三级结构
- **剧本与故事编辑器** — AI 生成/续写剧本 + 结构化拆解（角色/场景/道具/分镜）
- **管理员后台** — 仪表盘 / 用户管理 / AI 模型管理（CRUD + API 连通性测试）/ 使用记录（无限滚动）/ 社区管理 / 系统设置
- **JWT 认证系统** — 用户注册/登录 + 管理员登录，Token 刷新
- **实时进度** — WebSocket 任务进度推送
### 品牌色
| 角色 | 深色模式 | 浅色模式 |
|------|----------|----------|
| 品牌紫 | `#6c3bff` | `#6c3bff` |
| 品牌青 | `#00d4ff` | `#00d4ff` |
| 背景 | `#0d0a1a` | `#f8f6f2` |
| 卡片 | `#141416` | `#ffffff` |
| 主文字 | `#f0edff` | `#1a1625` |
| 辅助粉 | `#ff3b9e` | — |
| 辅助琥珀 | `#ffb83d` | — |
| 辅助绿 | `#00e676` | — |

---

## 🏗 技术架构
```
SpiritLens/
├── frontend/                    # Next.js 16 (App Router) + Tailwind v4
│   ├── src/
│   │   ├── app/                 # 页面路由 (10+ 路由)
│   │   │   ├── admin/           # 管理后台 (dashboard/用户/模型/日志/社区/设置)
│   │   │   ├── ai-tool/         # AI 工具 (image/video/canvas)
│   │   │   ├── assets/          # 资产库
│   │   │   ├── auth/            # 认证 (login/register/admin-login)
│   │   │   ├── community/       # 灵感社区
│   │   │   ├── projects/        # 项目管理 (> [id]/ > episodes/[eid])
│   │   │   └── workspace/       # 工作台
│   │   ├── components/
│   │   │   ├── ui/              # 设计系统原子 + Toast 通知
│   │   │   ├── layout/          # AppShell/Header/Footer/ThemeServerInit
│   │   │   ├── home/            # HeroSection/ToolGrid/FeaturedWorks/SpiritLensHero
│   │   │   ├── projects/        # 项目管理组件 (含 script/ScriptStage.tsx)
│   │   │   ├── ai-tools/        # AI 工具组件
│   │   │   │   ├── canvas/      # 画布节点系统 (canvas-editor + 4 种节点)
│   │   │   │   ├── SearchPanel.tsx / SessionSidebar.tsx
│   │   │   │   └── AIStudio.tsx / GenerationPicker.tsx
│   │   │   ├── auth/            # LoginForm/RegisterForm/AdminLoginForm
│   │   │   ├── admin/           # ModelTrendChart
│   │   │   └── community/       # CommunityGallery + PublishDialog
│   │   ├── store/               # Zustand 状态管理 (auth/sessions/theme)
│   │   └── services/            # API 客户端 (JWT 自动注入 + 自动刷新)
│   ├── Dockerfile
│   └── .env.local
├── backend/                     # FastAPI + SQLAlchemy Async + Celery
│   ├── app/
│   │   ├── api/v1/              # REST API + WebSocket
│   │   │   ├── media/           # image.py (图片生成 API)
│   │   │   ├── admin.py         # 管理后台 (dashboard/用户/模型/设置/日志)
│   │   │   ├── auth.py          # 认证 (register/login/refresh/me/captcha)
│   │   │   ├── assets.py        # 用户资产库
│   │   │   ├── community.py     # 社区 (帖子/评论/点赞)
│   │   │   ├── enhance.py       # Prompt 润色
│   │   │   ├── models.py        # 模型能力 API
│   │   │   ├── projects.py      # 项目管理 (项目/集数/Season/分镜/角色/场景/道具)
│   │   │   ├── scripts.py       # 剧本生成/续写/结构化拆解
│   │   │   ├── search.py        # 联网搜索 (Openverse)
│   │   │   ├── upload.py        # 文件上传
│   │   │   ├── video.py         # 视频生成 API
│   │   │   └── ws.py            # WebSocket 端点
│   │   ├── core/                # config/database (配置+数据库)
│   │   ├── models/              # 数据模型 (12 张表)
│   │   │   ├── user.py, ai_model.py, creation.py, community.py
│   │   │   ├── project.py, season.py, episode.py
│   │   │   ├── character.py, scene.py, prop.py, storyboard.py
│   │   ├── schemas/             # Pydantic 校验
│   │   │   ├── auth.py, generation.py, models.py
│   │   │   ├── project.py, episode.py, season.py, storyboard.py
│   │   │   ├── character.py, scene.py, prop.py
│   │   └── services/
│   │       ├── generation.py    # 内存+Redis 双备份任务管理
│   │       ├── task_persistence.py # PG 结果落库（Celery 任务与 API 共享）
│   │       ├── object_storage.py   # 腾讯云 COS 上传（SigV4，零依赖）
│   │       ├── providers/       # AI Provider 路由
│   │       │   ├── __init__.py  # Provider 路由 + generate_image()
│   │       │   ├── xinghe.py    # 星河智云 (image+video)
│   │       │   └── tianyi.py    # 天翼云 (video)
│   │       ├── auth.py          # 认证逻辑 (hash/verify/token)
│   │       ├── file_storage.py  # 文件保存 + 校验（本地 + COS 分支）
│   │       ├── model_capabilities.py # 模型能力注册表
│   │       ├── web_search.py    # 联网搜索 (Openverse)
│   │       ├── prompt_enhancer.py    # Prompt 润色
│   │       ├── script_generation.py  # 剧本 AI 生成/续写
│   │       ├── script_breakdown.py   # 剧本→分镜拆解
│   │       ├── script_structure.py   # 剧本结构化 (角色/场景/道具提取)
│   │       ├── novel_import.py       # 小说导入→分集
│   │       ├── captcha.py       # SVG 验证码
│   │       └── redis_helper.py  # 统一 Redis 连接
│   ├── alembic/                 # 数据库迁移
│   ├── scripts/                 # 数据迁移 + 运维脚本
│   ├── tests/                   # 37+ API 集成测试
│   ├── tasks.py                 # Celery 任务定义（generate_image / generate_video）
│   ├── celery_app.py            # Celery 应用（image/video 队列路由）
│   ├── Dockerfile
│   └── requirements.txt
├── deploy/                      # 部署配置
│   ├── deploy.sh                # 一键部署脚本
│   ├── nginx-spiritlens.conf    # nginx 多项目路由
│   └── README.md
├── docker-compose.yml           # 开发环境
├── docker-compose.prod.yml      # 生产环境 (PostgreSQL + Redis + Celery)
├── docs/
│   ├── API.md
│   ├── ARCHITECTURE.md
│   └── MODEL_CAPABILITIES.md
└── nginx.conf
```

### 前端技术栈

| 技术 | 用途 |
|------|------|
| Next.js 16 (App Router) | 框架 |
| TypeScript | 类型安全 |
| Tailwind CSS v4 | 样式 + 双主题系统（`@theme inline`） |
| @xyflow/react v12 | 画布节点编辑器 |
| Framer Motion | 动画 |
| Zustand 5 + persist | 状态管理 |
| TanStack React Query | 数据请求 |
| Lucide React | 图标库 |

### 后端技术栈

| 技术 | 用途 |
|------|------|
| FastAPI | Web 框架 + WebSocket |
| SQLAlchemy 2.0 (async) | ORM |
| PostgreSQL 16 (生产) / SQLite (开发) | 数据库 |
| Redis 7 | 缓存 + Celery Broker + 任务状态 |
| Celery | 异步任务队列（图片 `image` 队列 + 视频 `video` 队列，threads pool） |
| 腾讯云 COS + CDN | 对象存储（SigV4 直传，公有读私有写，播放走 CDN 不占服务器带宽） |
| Alembic | 数据库迁移 |
| JWT (python-jose) | 认证 |
| httpx | 异步 HTTP 客户端 |

### AI Providers

| Provider | 模型 | 接入方式 |
|----------|------|----------|
| 🌌 星河智云 | Seedream 4.5/5.0 (图片) + Seedance 2.0/2.0 Fast (视频) | https://xinghezhiyun.com (v1/v3) |
| 🔮 DeepSeek | DeepSeek-V4-Flash (文本) | https://api.deepseek.com/v1 |

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- Python >= 3.11
- Docker（生产部署）

### 前端

```bash
cd frontend
npm install  # 装依赖（仅首次）
npx next dev --port 3000   # 启动
# 访问 http://localhost:3000
```

### 后端

```bash
cd backend
python -m venv venv   # 创建虚拟环境（仅首次）
source venv/Scripts/activate  # Windows 激活虚拟环境
pip install -r requirements.txt    # 安装依赖（仅首次）
uvicorn app.main:app --reload --port 8000    # 启动
# 访问 http://localhost:8000
# API 文档 http://localhost:8000/docs
```

### 默认管理员账号
- 账号：`admin`
- 密码：`admin123`

### Docker 部署

```bash
# 生产部署
docker compose -f docker-compose.prod.yml -p spiritlens up -d --build

# 初始化数据库（首次）
docker exec spiritlens-backend-1 alembic upgrade head

# 查看日志
docker compose -f docker-compose.prod.yml -p spiritlens logs -f
```

---

## 📁 页面路由

| 路径 | 页面 | 描述 |
|------|------|------|
| `/` | 首页 | Hero + 工具卡片 + 灵感作品 |
| `/auth/login` | 用户登录 | 邮箱/用户名 + 密码 |
| `/auth/register` | 用户注册 | 邮箱注册 |
| `/auth/admin/login` | 管理员登录 | 管理员专用登录入口 |
| `/ai-tool/image` | AI 图片生成 | 文生图 / 图生图，会话管理，参考图，联网搜索 |
| `/ai-tool/video` | AI 视频生成 | 文生视频 / 首尾帧 / 图生视频，会话管理 |
| `/ai-tool/canvas` | 智能画布 | **节点式工作流（核心）** |
| `/community` | 灵感社区 | 作品展示画廊 |
| `/community/[id]` | 作品详情 | 点赞/评论 |
| `/projects` | 项目列表 | 项目 CRUD + 搜索 |
| `/projects/[id]` | 项目详情 | Season + 集数管理 + 导入小说 |
| `/projects/[id]/episodes/[eid]` | 集数创作 | 5 阶段工作台（剧本→角色→导演→导出→提示词） |
| `/workspace` | 工作台 | 作品管理 + 统计 |
| `/assets` | 资产库 | 批量操作 + 收藏 |
| `/admin` | 管理后台 | 仪表盘 |
| `/admin/users` | 用户管理 | 用户列表/搜索/管理员切换/删除 |
| `/admin/models` | 模型管理 | AI 模型 CRUD + 启用/禁用 + API 测试 |
| `/admin/logs` | 使用记录 | 无限滚动加载 |
| `/admin/community` | 社区管理 | 帖子管理 |
| `/admin/settings` | 系统设置 | 运行时配置 |

---

## ✨ 核心特性
### 智能画布（无限画布）

基于 ReactFlow v12 的节点式工作流编辑器，支持：

| 功能 | 说明 |
|------|------|
| **节点类型** | 图像节点、视频节点、文本节点、上传节点 |
| **自由缩放** | 选中后拖拽右下角手柄，自由调整大小 |
| **框选** | 空白处拖拽框选多个节点，一起移动 |
| **连线** | 节点间拖拽连线，数据自动流转 |
| **双击添加** | 双击空白处弹出添加节点面板 |
| **快捷模板** | 文生图、图生视频、文字生视频一键创建 |
| **文本→图片** | 文本节点内容自动同步到连接的图像节点 |
| **多图参考** | 多个图像节点连到视频节点，带角色标记 |
| **真实生成** | 图像/视频节点接入真实 API，真正出图出视频 |
| **保存/加载** | 画布状态自动保存到 localStorage |
| **主题切换** | 画布独立的深/浅色主题，不跟随全局 |
| **Prompt 润色** | 图像节点内一键优化提示词 |

### 画布节点工作流
```
文本节点 → 图像节点 → 视频节点
  (内容)    (生成图片)   (生成视频)
```

### AI 图片生成（已接入真实模型）
- 对接星河智云 Doubao-Seedream 4.5 / 5.0 真实 API
- 模型能力 API + 前端动态适配（尺寸/比例/batch 限制）
- 尺寸自动缩放（自动放大到模型最低像素要求，保留比例，按 64px 步长对齐）
- 参考图上传 + 联网搜索（Openverse 免费搜索引擎）
- 参考强度滑块（0~100%）
- 生成图片自动上传腾讯云 COS（永久存储，播放走 CDN；COS 不可用时回退本地）
- 批量生图（多次 API 调用实现 batch）
- Seed 支持（控制可复现性）

### AI 视频生成（已接入真实模型）
- 对接星河智云 Seedance 系列（2.0 / 2.0 Fast）+ 天翼云 Seedance（2.0 天翼云）
- 文生视频 / 图生视频 / 首尾帧
- 参考图使用 OpenAI 兼容格式（`content` 数组 + `image_url`）
- **天翼云参考图用 base64 内联**：天翼云后端无法抓取外部 URL（自定义域名与腾讯云 COS 域名均失败），参考图先下载 → Pillow 压缩（768px/JPEG q85，1.9MB→55KB）→ base64 data URI 内联传输，最多 12 张（2026-08-11 前端自动截取超限部分）
- **天翼云参考音频（2026-08-11 接入）**：BGM/配音参考，`audio_url` + data URI 内联；ffmpeg 压缩 mp3 mono，**时长上限 15.2s 自动截取**；须搭配参考图使用；导演工作台 + AI 视频页支持上传 + `@音频N` 引用
- 长视频支持（最长 2 小时轮询）
- 参考图多角色多张（导演工作台支持从资产库选取角色/场景/道具图作为参考）
- 生成全流程走 Celery 队列：上游生成 → **流式下载**（分块写盘不占内存）→ 上传 COS → CDN 播放
- 可取消（下载中途也能中断）、失败重试、worker 崩溃兜底（Redis 状态 + 启动清扫；`acks_late` 部署重启不丢任务，2026-08-11）

### AI 文本生成（DeepSeek）
- DeepSeek-V4-Flash 官方 API 接入
- 剧本 AI 生成/续写
- 剧本结构化拆解（角色/场景/道具提取）
- 剧本→分镜拆解
- 角色/场景/道具 → 视觉提示词生成
- Prompt 润色优化

### 联网搜索参考图

- 无需 API Key，使用 Openverse 开源搜索引擎
- 搜索图片 → 自动下载到本地 → 加入参考图
- HEAD 请求验证过滤失效链接

### 项目管理（集数创作工作台）
SpiritLens 提供完整的影视级项目管理流程：
| 阶段 | 功能 | 状态 |
|------|------|:----:|
| **01 剧本与故事** | 剧本编辑/AI生成/续写 + 结构化拆解（角色/场景/道具/分镜） | ✅ |
| **02 角色与场景** | AI 生图（角色定妆/场景概念/道具清单），变体 + 三视图 | ✅ |
| **03 导演工作台** | 分镜列表 → 参考图 → AI 视频生成（Seedance，5/10/15 秒可选） | ✅ |
| **04 成片与导出** | 播放列表 + 顺序播放 + 批量下载 + 拖拽排序 | ✅ |
| **05 提示词管理** | 批量编辑/优化 | 🚧 |

核心特性：
- 项目 → Season（季）→ 集数（Episode）三级结构
- 画面比例（16:9 / 9:16 / 1:1）三阶段持久共享
- 集数支持 .docx 上传 / 粘贴剧本 / 整本小说导入
- 自定义镜头：手动添加 + 独立提示词生成视频
- **多人协作不互相覆盖**（2026-08-10）：集配置保存带乐观锁（`if_updated_before` + 409 冲突重试合并）；丢失状态的视频按 prompt 从后端找回（recover?include_project=true）
- 所有数据持久化到 PostgreSQL，刷新不丢失

### 双主题系统
- 深色模式：赛博霓虹，紫青色调
- 浅色模式：净白紫韵，暖灰背景
- 画布有独立主题切换，不跟随全局

---

## 🗺 开发路线图

### Phase 1 — 项目骨架
- [x] Next.js 16 + FastAPI 项目初始化
- [x] 双主题系统（深色 + 浅色）
- [x] 会话管理（新建/切换/删除对话）
- [x] AI 图片/视频生成页面
- [x] 智能画布节点编辑器（ReactFlow）
- [x] 登录/注册 + JWT 认证
- [x] 管理员后台（仪表盘/用户/模型/日志/社区/设置）
- [x] 数据库模型（12 张表）
### Phase 2 — AI 模型接入
- [x] 星河智云 Doubao-Seedream 图像生成
- [x] 星河智云 Seedance 视频生成
- [x] DeepSeek V4 Flash 文本模型接入
- [x] 模型能力 API + 前端动态适配
- [x] 文件上传系统
- [x] 联网搜索参考图（Openverse）
- [x] 画布节点真实生成
- [x] 异步任务队列（Celery + Redis）
### Phase 3 — 产品化
- [x] WebSocket 实时进度
- [x] 错误处理 + Toast 通知
- [x] Docker 部署配置（PostgreSQL + Redis + Celery）
- [x] 社区功能（点赞/评论/发布）
- [x] 评论删除
- [x] Alembic 数据库迁移
- [x] 37+ API 集成测试
- [x] Prompt 润色
- [x] 验证码系统
- [x] 项目管理完整流程（项目→Season→集数→剧本→分镜→角色场景道具→生成）
- [x] 剧本 AI 生成/续写/结构化拆解
- [x] 小说导入自动分集
- [x] 角色/场景/道具 视觉提示词生成
### Phase 4 🔲 — 生产完善
- [ ] CI/CD
- [ ] 监控与告警
- [ ] 前端单元测试
- [ ] 更多 provider 接入（BFL / Stability AI）
- [x] 忘记密码/密码重置 — **管理员手动重置已上线**（`POST /admin/users/{id}/reset-password`，管理后台 → 用户管理 → 重置密码；登录页提示联系管理员）
- [ ] 用户自助重置（短信验证码 或 邮箱链接二选一；前提：先补「绑定手机号/邮箱」功能，注册时两者均为可选，存量用户大多未绑定）
  - 短信方案：需企业资质 + 短信服务商（阿里云/腾讯云短信，约 ¥0.04~0.05/条）
  - 邮箱方案：SMTP 邮箱授权码零成本，需加 `aiosmtplib` + `SMTP_*` 环境变量
  - 设计要点已定：验证码存 Redis（TTL 自动过期）、重置 JWT 复用 `SECRET_KEY`（`type="reset"`）、防枚举 + 限流，详见 `docs/API.md`「规划中」小节

---

## 🔧 部署维护

### 增量部署（改一处部署一处）

参见 `deploy/README.md`。**注意：后端/worker 代码必须 `build + up -d`（镜像含代码），`restart` 不会更新容器内代码与环境变量，`docker cp` 会被镜像重建覆盖**：

```bash
# 后端 / Celery worker（Python 文件）
scp -i ~/.ssh/clawshop backend/app/xxx.py ubuntu@server:~/spiritlens/backend/app/xxx.py
ssh -i ~/.ssh/clawshop ubuntu@server "cd ~/spiritlens && docker compose -f docker-compose.prod.yml -p spiritlens build backend celery-image celery-video && docker compose -f docker-compose.prod.yml -p spiritlens up -d backend celery-image celery-video"

# 仅改 .env 配置（不涉及代码）
ssh -i ~/.ssh/clawshop ubuntu@server "cd ~/spiritlens && docker compose -f docker-compose.prod.yml -p spiritlens up -d backend celery-image celery-video"

# 前端文件
scp -i ~/.ssh/clawshop frontend/xxx.tsx ubuntu@server:~/spiritlens/frontend/xxx.tsx
ssh -i ~/.ssh/clawshop ubuntu@server "cd ~/spiritlens && docker compose -f docker-compose.prod.yml -p spiritlens build frontend && docker compose -f docker-compose.prod.yml -p spiritlens up -d frontend"

# nginx
scp -i ~/.ssh/clawshop deploy/nginx-spiritlens.conf ubuntu@server:~/spiritlens/deploy/
ssh -i ~/.ssh/clawshop ubuntu@server "sudo cp ~/spiritlens/deploy/nginx-spiritlens.conf /etc/nginx/sites-available/clawshop && sudo nginx -t && sudo systemctl reload nginx"
```

### 生成并发调优（环境变量，无需改代码）

**项目根 `.env`**（服务器 `/home/ubuntu/spiritlens/.env`，compose 插值源；不是 backend/.env）中调整后 `up -d` 两个 worker 容器即可。当前生产值：图片 128 + 视频 192 = **320 并发槽位**（4 核 CPU 极限附近；天翼云 API 并发已签约 400，本地追满需加服务器/加核）。

| 变量 | 默认 | 说明 |
|------|------|------|
| `CELERY_IMAGE_CONCURRENCY` | 16 | 图片生成并发（线程池） |
| `CELERY_VIDEO_CONCURRENCY` | 16 | 视频生成并发（线程池） |
| `UVICORN_WORKERS` | 4 | 后端 API 进程数 |
| `OSS_*` | 关 | 对象存储配置（见 `deploy/README.md`） |

---

## 📄 许可证
MIT
