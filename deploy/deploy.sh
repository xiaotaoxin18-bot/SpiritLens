#!/bin/bash
# ==========================================================
# SpiritLens 一键部署脚本
# 用法: bash deploy/deploy.sh
#
# 前提条件:
#   - 服务器已安装 Docker + Docker Compose
#   - 已 SSH 登录到服务器
#   - 当前在项目根目录 (D:/SpiritLens)
# ==========================================================

set -e

# ─── 颜色 ─────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  SpiritLens 部署脚本${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# ─── 1. 检查 Docker ───────────────────────────────────
echo -e "${YELLOW}[1/6] 检查 Docker 环境...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker 未安装！正在安装...${NC}"
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo -e "${GREEN}Docker 安装完成，请重新登录后再运行此脚本。${NC}"
    exit 1
fi
echo -e "  Docker: ${GREEN}$(docker --version)${NC}"

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
    echo -e "${RED}Docker Compose 未安装！${NC}"
    exit 1
fi
COMPOSE_CMD="docker compose"
if ! docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
fi
echo -e "  Compose: ${GREEN}$($COMPOSE_CMD version)${NC}"

# ─── 2. 配置询问 ───────────────────────────────────────
echo ""
echo -e "${YELLOW}[2/6] 配置部署参数...${NC}"

# 域名
read -p "  请输入 SpiritLens 域名（留空用 IP）: " DOMAIN
if [ -z "$DOMAIN" ]; then
    DOMAIN=$(curl -s ifconfig.me 2>/dev/null || echo "localhost")
    echo -e "  ${YELLOW}未输入域名，使用服务器 IP: $DOMAIN${NC}"
fi

# 后端端口
read -p "  后端端口 [8085]: " BACKEND_PORT
BACKEND_PORT=${BACKEND_PORT:-8085}

# 前端端口
read -p "  前端端口 [3005]: " FRONTEND_PORT
FRONTEND_PORT=${FRONTEND_PORT:-3005}

# 数据库密码
read -sp "  数据库密码（留空默认 postgres）: " DB_PASSWORD
DB_PASSWORD=${DB_PASSWORD:-postgres}
echo ""

# 服务器 IP（自动获取）
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "129.28.122.183")
NEXT_PUBLIC_API_URL="/spiritlens"
echo -e "  前端 API 基础路径: ${CYAN}/spiritlens${NC}"

echo -e "${GREEN}  配置完成${NC}"

# ─── 3. 创建上传目录 ───────────────────────────────────
echo ""
echo -e "${YELLOW}[3/6] 创建必要目录...${NC}"
mkdir -p backend/uploads
echo -e "  ${GREEN}backend/uploads/ ✅${NC}"

# ─── 4. 确保 .env 存在 ─────────────────────────────────
echo ""
echo -e "${YELLOW}[4/6] 检查环境变量...${NC}"
if [ ! -f backend/.env ]; then
    echo -e "  ${YELLOW}backend/.env 不存在，创建默认配置...${NC}"
    cat > backend/.env << EOF
# SpiritLens Backend Configuration
DATABASE_URL=postgresql+asyncpg://postgres:${DB_PASSWORD}@postgres:5432/spiritlens
REDIS_URL=redis://redis:6379/0
SECRET_KEY=$(openssl rand -hex 32)
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7
CORS_ORIGINS=${CORS_ORIGINS}
PUBLIC_URL=${NEXT_PUBLIC_API_URL}
ENVIRONMENT=production
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/1

# AI Provider API Keys
XINGHE_API_KEY=
XINGHE_API_BASE=https://xinghezhiyun.com/api/v3
EOF
    echo -e "  ${YELLOW}⚠️  请编辑 backend/.env 填入 XINGHE_API_KEY${NC}"
else
    echo -e "  ${GREEN}backend/.env 已存在${NC}"
fi

# ─── 5. 部署 ───────────────────────────────────────────
echo ""
echo -e "${YELLOW}[5/6] 启动服务...${NC}"

export DOMAIN BACKEND_PORT FRONTEND_PORT DB_PASSWORD CORS_ORIGINS NEXT_PUBLIC_API_URL

$COMPOSE_CMD -f docker-compose.prod.yml -p spiritlens up -d --build

echo -e "  ${GREEN}服务已启动${NC}"

# ─── 6. 检查状态 ───────────────────────────────────────
echo ""
echo -e "${YELLOW}[6/6] 检查服务状态...${NC}"
sleep 5

if curl -s -o /dev/null -w "%{http_code}" http://localhost:${BACKEND_PORT}/health 2>/dev/null | grep -q "200"; then
    echo -e "  ✅ 后端: ${GREEN}http://localhost:${BACKEND_PORT} (正常)${NC}"
else
    echo -e "  ❌ 后端: ${RED}未响应${NC}"
fi

if curl -s -o /dev/null -w "%{http_code}" http://localhost:${FRONTEND_PORT} 2>/dev/null | grep -q "200"; then
    echo -e "  ✅ 前端: ${GREEN}http://localhost:${FRONTEND_PORT} (正常)${NC}"
else
    echo -e "  ❌ 前端: ${RED}未响应${NC}"
fi

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}  部署完成！${NC}"
echo ""
echo -e "  服务访问:"
echo -e "    - SpiritLens: ${CYAN}http://${DOMAIN}/spiritlens${NC}"
echo -e "    - ClawShop:   ${CYAN}http://${DOMAIN}/clawshop${NC}"
echo ""
echo -e "  管理命令:"
echo -e "    - 查看日志: ${YELLOW}$COMPOSE_CMD -f docker-compose.prod.yml -p spiritlens logs -f${NC}"
echo -e "    - 重启:     ${YELLOW}$COMPOSE_CMD -f docker-compose.prod.yml -p spiritlens restart${NC}"
echo -e "    - 停止:     ${YELLOW}$COMPOSE_CMD -f docker-compose.prod.yml -p spiritlens down${NC}"
echo ""
echo -e "  ⚠️  重要提醒:"
echo -e "    1. 在 backend/.env 中填入 XINGHE_API_KEY"
echo -e "    2. 配置 nginx（替换默认站点配置）:"
echo -e "       sudo cp deploy/nginx-spiritlens.conf /etc/nginx/sites-available/default"
echo -e "       sudo nginx -t && sudo systemctl reload nginx"
echo -e "    3. 注意：ClawShop 的 nginx 配置也需要合并到这个文件中"
