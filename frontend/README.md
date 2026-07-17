# SpiritLens Frontend

Next.js 16 (App Router) + Tailwind CSS v4 + Zustand 5 + @xyflow/react v12

## 开发环境

```bash
npm install
npx next dev --port 3000
# 访问 http://localhost:3000/spiritlens
```

## 项目结构

```
src/
├── app/                    # 页面路由
│   ├── admin/              # 管理后台
│   ├── ai-tool/            # AI 工具（image/video/canvas）
│   ├── assets/             # 资产库
│   ├── auth/               # 认证
│   ├── community/          # 灵感社区
│   ├── projects/           # 项目管理
│   └── workspace/          # 工作台
├── components/
│   ├── admin/              # 管理后台组件
│   ├── ai-tools/           # AI 工具组件（含 canvas/ 节点系统）
│   ├── auth/               # 认证表单
│   ├── community/          # 社区组件
│   ├── home/               # 首页组件
│   ├── layout/             # 布局（AppShell/Header/Footer）
│   ├── projects/           # 项目管理组件（含 script/）
│   └── ui/                 # 设计系统原子组件 + Toast
├── store/
│   ├── auth.ts             # Zustand + persist（JWT 认证）
│   ├── sessions.ts         # Zustand + persist（生成历史）
│   └── theme.tsx           # Context（深/浅色主题）
└── services/
    └── api.ts              # API 客户端（JWT 自动注入 + 刷新）
```

## 关键约定

- **"use client"** — 所有交互组件需要此指令
- **cn()** — `import { cn } from "@/lib/utils"` 合并 className
- **颜色** — 使用 `text-text-primary` / `bg-surface-card` 等语义化变量，勿用硬编码色值
- **沉浸路由** — `ai-tool/*`、`admin`、`projects` 全屏无 Header/Footer
- **params** — Next.js 16 中 `params` 和 `searchParams` 是 Promise，需 `await`

## 构建生产

```bash
npx next build
npx next start --port 3005
```
