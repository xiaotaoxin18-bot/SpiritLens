"""Audio compression utilities — 参考音频转 MP3 mono base64 data URI。

天翼云音频参考实测（2026-08-11）确认：
  content 元素格式 {"type": "audio_url", "audio_url": {"url": "data:audio/mpeg;base64,...", "format": "mp3"}}
  url 字段直接接受 data URI，format 接受 "mp3"。
请求体上限 20MB（安全阈值 19MB），base64 膨胀 4/3 → 原始音频预算约 13MB。
**音频时长上限 15.2 秒**（实测报错 `audio duration ... must be less than or equal to 15.2`）
→ 超时自动截取前 15.2s。

依赖 ffmpeg/ffprobe（Dockerfile apt 层安装）。ffmpeg 不可用时降级：mp3 原样透传，
非 mp3 抛错（生产容器必有 ffmpeg，此降级只服务本地开发）。
"""

import asyncio
import base64
import logging
import shutil
import subprocess

logger = logging.getLogger(__name__)

# 请求体安全阈值（tianyi.py 硬校验 19MB）留出的音频预算
DEFAULT_MAX_BYTES = 13_000_000
# 天翼云实测音频参考时长上限 15.2s（2026-08-11，doubao-seedance-2-0 r2v）。
# 截断值留 0.7s 余量：mp3 编码帧对齐（16kHz 下 72ms/帧）+ LAME padding 会让
# 解码时长略超 -t 值，15.2 压线曾被判超限（VIDEO_REQUEST_PARAMETER_INVALID）。
MAX_AUDIO_SECONDS = 14.5
_BITRATES = (128, 96, 64, 32)  # kbps，逐级降码率兜底
_MP3_MAGIC = (b"ID3", b"\xff\xfb", b"\xff\xf3", b"\xff\xf2")  # ID3v2 / MPEG frame sync


def _has_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def _is_mp3(data: bytes) -> bool:
    return data.startswith(_MP3_MAGIC)


async def _probe_duration(data: bytes) -> float | None:
    """ffprobe 探测音频时长（秒），失败返回 None。"""
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", "pipe:0",
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    out, _ = await proc.communicate(data)
    try:
        return float(out.decode().strip())
    except Exception:
        return None


async def _transcode_mp3(data: bytes, bitrate: int, max_seconds: float) -> bytes:
    """ffmpeg 转码：任意输入 → mp3 单声道 bitrate kbps，截断至 max_seconds（stdin/stdout 管道）。"""
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-loglevel", "error", "-i", "pipe:0",
        "-t", str(max_seconds),
        "-ac", "1", "-b:a", f"{bitrate}k", "-f", "mp3", "pipe:1",
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    out, err = await proc.communicate(data)
    if proc.returncode != 0 or not out:
        raise RuntimeError(f"ffmpeg 转码失败 ({proc.returncode}): {err.decode(errors='replace')[:200]}")
    return out


async def audio_to_mp3_data_uri(
    data: bytes,
    *,
    max_bytes: int = DEFAULT_MAX_BYTES,
    max_seconds: float = MAX_AUDIO_SECONDS,
) -> str:
    """压缩音频为 mp3 mono base64 data URI，超预算降码率、超时长截断。

    - 输入已是 mp3、时长 ≤ max_seconds 且大小达标 → 原样透传（省一次转码）
    - 其他情况 → ffmpeg 转 mp3 mono 128kbps（截断到 max_seconds），
      base64 超预算逐级降码率（128→96→64→32）
    - ffmpeg 不可用（本地开发）：mp3 原样透传；非 mp3 抛错
    """
    b64 = base64.b64encode(data).decode("ascii")
    if _is_mp3(data):
        if not _has_ffmpeg():
            return f"data:audio/mpeg;base64,{b64}"  # 本地开发降级：无法校验/截断
        if len(b64) <= max_bytes:
            dur = await _probe_duration(data)
            if dur is not None and dur <= max_seconds:
                return f"data:audio/mpeg;base64,{b64}"
            if dur is not None and dur > max_seconds:
                logger.warning("音频时长 %.1fs 超上限 %.1fs，自动截取前 %.1fs", dur, max_seconds, max_seconds)

    if not _has_ffmpeg():
        raise RuntimeError("服务器缺少 ffmpeg，无法处理非 mp3 音频")

    for bitrate in _BITRATES:
        mp3 = await _transcode_mp3(data, bitrate, max_seconds)
        b64 = base64.b64encode(mp3).decode("ascii")
        logger.info("音频转码 mp3 %dkbps mono: %dKB → %dKB base64", bitrate, len(data)//1024, len(b64)//1024)
        if len(b64) <= max_bytes or bitrate == _BITRATES[-1]:
            return f"data:audio/mpeg;base64,{b64}"
    raise RuntimeError("音频压缩失败")  # 不可达，兜底
