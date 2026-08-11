FROM python:3.12-slim

# ffmpeg 独立 apt 层（放在 pip 层之前，避免 pip 缓存失效）：
# 参考音频压缩（任意格式 → mp3 mono）依赖；清华 debian 源加速
RUN sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g; s|security.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
# 清华镜像源：服务器 PyPI 直连极慢（大包卡 2~5 分钟），国内源秒级
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

# Pillow 独立安装层：保持 requirements.txt 不变，避免 pip 层缓存失效
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple "Pillow>=10.0.0"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
