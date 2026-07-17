# SpiritLens 閮ㄧ讲鎸囧崡

## 鏈嶅姟鍣ㄧ幇鐘?
| 椤圭洰 | 璁块棶鍦板潃 | 鎶€鏈爤 | 绔彛 |
|------|---------|--------|:----:|
| **ClawShop** | http://129.28.122.183:3000 | Express | 3000 |
| **SpiritLens** | 寰呴儴缃?| Next.js + FastAPI + Docker | 8085/3005 |
| **nginx** | 80/443 | 缁熶竴鍏ュ彛 | 80 |

## 鏈€缁堣闂湴鍧€

```
http://129.28.122.183/                鈫?404
http://129.28.122.183/clawshop/...    鈫?ClawShop
http://129.28.122.183/spiritlens      鈫?SpiritLens 棣栭〉
http://129.28.122.183/spiritlens/ai-tool/image  鈫?AI 鍥剧墖
http://129.28.122.183/spiritlens/admin          鈫?绠＄悊鍚庡彴
```

## 鏋舵瀯

```
                          nginx (80)
                          鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?                          鈹?             鈹?  / 鈫?404                 鈹?             鈹?  /clawshop/*             鈹? 鈫?:3000     鈹? ClawShop (Express)
  /spiritlens/api/*       鈹? 鈫?:8085     鈹? SpiritLens 鍚庣 (FastAPI)
  /spiritlens/ws/*        鈹? 鈫?:8085     鈹? WebSocket
  /spiritlens/uploads/*   鈹? 鈫?:8085     鈹? 鏂囦欢
  /spiritlens/*           鈹? 鈫?:3005     鈹? SpiritLens 鍓嶇 (Next.js)
                          鈹?             鈹?                          鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

**闅旂鏂瑰紡:**
- 鎵€鏈夐」鐩€氳繃 nginx 璺緞鍓嶇紑鍒嗘祦锛?*涓嶅崰鐙珛鍩熷悕**
- 鏂伴」鐩彧瑕佸湪 nginx 鍔犱竴鏉?`location /鏂伴」鐩?` 鍗冲彲

## 閮ㄧ讲姝ラ

### 1. 涓婁紶椤圭洰鍒版湇鍔″櫒

```bash
# 鍦ㄦ湰鍦版墦鍖咃紙寮€鍙戞満鎵ц锛?cd D:/SpiritLens
tar czf spiritlens.tar.gz \
  backend/ frontend/ docker-compose.prod.yml \
  deploy/ docker/ docker-compose.yml \
  --exclude='backend/venv' --exclude='frontend/node_modules' \
  --exclude='backend/__pycache__' --exclude='frontend/.next'

# 涓婁紶鍒版湇鍔″櫒
scp spiritlens.tar.gz root@129.28.122.183:/root/

# SSH 鐧诲綍鏈嶅姟鍣?ssh root@129.28.122.183
tar xzf spiritlens.tar.gz
cd spiritlens
```

### 2. 閮ㄧ讲 SpiritLens

```bash
bash deploy/deploy.sh
```

### 3. 閰嶇疆 nginx锛堝叧閿楠わ級

鎶婃湇鍔″櫒涓婄幇鏈夌殑 nginx 閰嶇疆**鏇挎崲**涓?`deploy/nginx-spiritlens.conf`锛?
```bash
# 澶囦唤 ClawShop 鍘熸湁 nginx 閰嶇疆
sudo cp /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/default.bak

# 澶嶅埗鏂伴厤缃紙宸插寘鍚?ClawShop + SpiritLens锛?sudo cp deploy/nginx-spiritlens.conf /etc/nginx/sites-available/default

# 妫€鏌ラ厤缃苟閲嶈浇
sudo nginx -t && sudo systemctl reload nginx
```

**閲嶈锛?* 濡傛灉 ClawShop 鍘熸湁 nginx 閰嶇疆涓湁棰濆璁剧疆锛圫SL銆佺壒娈婂ご绛夛級锛岄渶瑕佹墜宸ュ悎骞跺埌鏂伴厤缃腑銆?
### 4. 閰嶇疆 API Key

```bash
nano backend/.env
# 濉叆 XINGHE_API_KEY
docker compose -f docker-compose.prod.yml -p spiritlens restart backend celery
```

## 甯哥敤绠＄悊鍛戒护

```bash
# 鏌ョ湅鏃ュ織
docker compose -f docker-compose.prod.yml -p spiritlens logs -f

# 閲嶅惎鏌愪釜鏈嶅姟
docker compose -f docker-compose.prod.yml -p spiritlens restart backend

# 鏇存柊浠ｇ爜鍚庨噸鏂伴儴缃?docker compose -f docker-compose.prod.yml -p spiritlens up -d --build
```

## 绔彛瀵圭収

| 鏈嶅姟 | 鐩戝惉绔彛 | 鏄惁瀵瑰鏆撮湶 | 璇存槑 |
|------|:--------:|:----------:|------|
| nginx | 80 | 鉁?瀵瑰 | 缁熶竴鍏ュ彛 |
| ClawShop | 3000 | 鉂?nginx 鍐呴儴 | Express |
| SpiritLens Backend | 8085 | 鉂?nginx 鍐呴儴 | FastAPI |
| SpiritLens Frontend | 3005 | 鉂?nginx 鍐呴儴 | Next.js |
| PostgreSQL | 5432 | 鉂?Docker 鍐呴儴 | |
| Redis | 6379 | 鉂?Docker 鍐呴儴 | |
