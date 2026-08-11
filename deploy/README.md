# SpiritLens 部署指南

## 服务器现状

| 项目 | 值 |
|------|-----|
| 服务器 | 天翼云 ECS `129.28.122.183`（4核 120G 内存，10Mbps 带宽） |
| SSH | `ssh -i ~/.ssh/clawshop ubuntu@129.28.122.183` |
| 项目目录 | `/home/ubuntu/spiritlens` |
| Compose 项目名 | `spiritlens`（必须带 `-p spiritlens`） |
| 域名 | 主站 `yhanm.cn`（nginx 直连服务器）；媒体 `media.yhanm.cn`（EdgeOne CNAME → 腾讯云 CDN → COS 桶） |
| AI 服务商 | 天翼云 API 中转（图片+视频，API 并发上限 200）；DeepSeek（文本） |

## 服务架构

```
                    nginx (80/443, yhanm.cn)
                      │
  /spiritlens/*  ──► spiritlens-frontend-1   (Next.js :3005)
  /spiritlens/api/* ──► spiritlens-backend-1 (uvicorn 4 workers :8085)
  /spiritlens/uploads/* ──► 同上（历史本地文件伺服）
                      │
  ┌───────────────────┴────────────────────────────┐
  │ Redis (broker/状态)                            │
  ├─ spiritlens-celery-image-1   -Q image  (16 线程) │
  ├─ spiritlens-celery-video-1   -Q video  (16 线程) │
  ├─ spiritlens-postgres-1       (max_connections=200) │
  └─ 生成结果 → 腾讯云 COS（yhanm-1441531263, 成都, 公有读私有写）
              → CDN（media.yhanm.cn，免费 HTTPS）→ 用户播放
```

## 部署步骤（增量，只部署改动的）

### Python 代码（backend / celery worker）

```bash
# 本地：上传改动文件
scp -i ~/.ssh/clawshop backend/app/xxx.py ubuntu@129.28.122.183:/home/ubuntu/spiritlens/backend/app/xxx.py

# 服务器：build + up（⚠️ 必须 build：镜像含代码，restart 不更新代码/环境变量，docker cp 会被镜像重建覆盖）
ssh -i ~/.ssh/clawshop ubuntu@129.28.122.183 \
  "cd /home/ubuntu/spiritlens && docker compose -f docker-compose.prod.yml -p spiritlens build backend celery-image celery-video && docker compose -f docker-compose.prod.yml -p spiritlens up -d backend celery-image celery-video"
```

> 提示：Dockerfile 已配置**清华 pip 源**（`-i https://pypi.tuna.tsinghua.edu.cn/simple`）—— 服务器 PyPI 直连极慢（曾卡 20+ 分钟），现在依赖安装秒级。pip 层有 buildkit 缓存（requirements.txt 未变则 10 秒完成）；Pillow 为独立安装层（参考图压缩用，见下）。

### 仅改 .env 配置（不涉及代码）

```bash
ssh -i ~/.ssh/clawshop ubuntu@129.28.122.183 \
  "cd /home/ubuntu/spiritlens && docker compose -f docker-compose.prod.yml -p spiritlens up -d backend celery-image celery-video"
```

### 前端文件

```bash
scp -i ~/.ssh/clawshop frontend/xxx.tsx ubuntu@129.28.122.183:/home/ubuntu/spiritlens/frontend/xxx.tsx
ssh -i ~/.ssh/clawshop ubuntu@129.28.122.183 \
  "cd /home/ubuntu/spiritlens && docker compose -f docker-compose.prod.yml -p spiritlens build frontend && docker compose -f docker-compose.prod.yml -p spiritlens up -d frontend"
```

### nginx（服务器上执行）

```bash
sudo cp deploy/nginx-spiritlens.conf /etc/nginx/sites-available/default
sudo nginx -t && sudo systemctl reload nginx
```

## 环境变量（backend/.env）

### 必填

```
XINGHE_API_KEY=...      # 星河智云（图片+视频）
TIANYI_API_KEY=...      # 天翼云（视频）
DEEPSEEK_API_KEY=...    # DeepSeek（文本）
SECRET_KEY=...          # JWT 密钥
ADMIN_PASSWORD=...      # 管理员初始密码
PUBLIC_URL=https://yhanm.cn/spiritlens
```

### 对象存储（腾讯云 COS，可选但推荐）

```
OSS_ENABLED=true
OSS_REGION=ap-chengdu
OSS_BUCKET=yhanm-1441531263
OSS_SECRET_ID=AKID...
OSS_SECRET_KEY=...
OSS_PUBLIC_URL=https://media.yhanm.cn
```

- 桶要求：**公有读私有写**；CDN 需**关闭回源鉴权**（公桶不需要），HTTPS 配免费证书
- 开启后生成结果上传 COS 返回公网 URL；未配置或上传失败自动回退本地存储
- ⚠️ 桶权限若被改回私有，匿名读取会 403

### 并发调优

⚠️ 这些是 **compose 插值变量**，必须写在**项目根 `.env`**（`/home/ubuntu/spiritlens/.env`），不是 `backend/.env`。调整后 `up -d celery-image celery-video` 生效。

当前生产值：图片 128 + 视频 192 = **320 并发槽位**（4 核 CPU 极限附近；天翼云 API 并发已签约 400，本地追满需加服务器/加核）。

| 变量 | 默认 | 当前 | 说明 |
|------|------|------|------|
| `CELERY_IMAGE_CONCURRENCY` | 16 | 128 | 图片生成并发（threads pool，任务短占用轻） |
| `CELERY_VIDEO_CONCURRENCY` | 16 | 192 | 视频生成并发（threads pool，4 核 CPU 极限附近） |
| `UVICORN_WORKERS` | 4 | 4 | 后端 API 进程数 |
| `BACKEND_PORT` / `FRONTEND_PORT` | 8085 / 3005 | — | 端口 |

## 数据自动清理（2026-08-10 上线，2026-08-11 调整）

**规则**：`creations` 表按每条记录自己的创建时间判断——**视频/图片均 >30 天**（2026-08-11 由 7/14 天放宽；任何状态，PROCESSING 生成中除外）；已发布社区的保留；**被项目引用的记录和文件都跳过**（2026-08-11 修复：原来只保护文件不保护记录，导致"项目里能播、资产库条目却消失"）。

```bash
# 手动预演（只统计不删除）
docker exec spiritlens-backend-1 python -m app.scripts.cleanup_old_generations --dry-run

# 手动执行
docker exec spiritlens-backend-1 python -m app.scripts.cleanup_old_generations
```

**已配置 cron**（`crontab -l` 可见）：每天 4:17 自动执行，日志 `/home/ubuntu/spiritlens/logs/cleanup.log`。
改动保留期：编辑 `backend/app/scripts/cleanup_old_generations.py` 顶部 `VIDEO_RETENTION_DAYS` / `IMAGE_RETENTION_DAYS`。

**项目删除连根清理**：`DELETE /projects/{id}` 现在会一并删除该项目的全部媒体文件（COS 对象 + 本地），DB 行由 FK 级联清空。

## 常用管理命令

```bash
# 查看容器状态
docker compose -f docker-compose.prod.yml -p spiritlens ps

# 查看日志
docker compose -f docker-compose.prod.yml -p spiritlens logs -f celery-video

# 容器内执行命令（验证配置）
docker exec spiritlens-backend-1 python -c "from app.services.file_storage import is_oss_enabled; print(is_oss_enabled())"

# 重启单个服务（仅改 .env 后不生效——必须 up -d 重建注入环境变量）
docker compose -f docker-compose.prod.yml -p spiritlens up -d backend

# 横向扩展生成能力（多 worker 实例）
docker compose -f docker-compose.prod.yml -p spiritlens up -d --scale celery-video=2
```

## 排障

| 现象 | 原因/处理 |
|------|----------|
| 改了代码重启后行为没变 | 用了 `restart` —— 必须 `build + up -d`（代码在镜像里） |
| 改了 .env 不生效 | `restart` 不重新注入环境变量 —— 必须 `up -d` 重建容器 |
| COS 文件匿名访问 403 | 桶权限被改回私有 / CDN 回源鉴权开启 |
| 主站打不开 | EdgeOne 里主域 `yhanm.cn`/`@` 被加了 CNAME（主域必须保持 A 记录指向服务器） |
| 镜像构建卡在 pip 下载 | 已解决：Dockerfile 配了清华 pip 源（见上）；若仍慢检查服务器到清华源的网络 |
| 生成任务状态卡 running 不结束 | worker 崩溃遗留 —— 重启 worker 时自动清扫 30 分钟以上滞留任务。⚠️ 部署重建 celery 容器不再丢任务（`task_acks_late`，2026-08-11），但历史遗留的 PROCESSING 卡死任务需手动标记失败或前端重跑 |
| 部署后视频任务消失/卡 PROCESSING | 2026-08-11 前默认 ack 会在 worker 重启时丢弃已取任务；已修复（acks_late），新任务不再丢。遗留卡死任务：`_mark_failed_sync` 标记或用户前端「重跑」 |
| 参考音频报「超时或提交失败」 | 参考图超过 12 张上限（422）——已修复：前端自动截取前 12 张并提示；提交失败现在显示真实原因 |

## 端口对照

| 服务 | 监听端口 | 对外暴露 | 说明 |
|------|:--------:|:--------:|------|
| nginx | 80 | ✅ | 统一入口 |
| SpiritLens Backend | 8085 | ❌ nginx 内部 | FastAPI（4 workers） |
| SpiritLens Frontend | 3005 | ❌ nginx 内部 | Next.js |
| celery-image / celery-video | — | ❌ | Redis broker |
| PostgreSQL | 5432 | ❌ Docker 内部 | |
| Redis | 6379 | ❌ Docker 内部 | |
