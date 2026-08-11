"""Tencent Cloud COS (S3-compatible) object storage integration.

Zero-dependency: uploads via httpx with a hand-rolled AWS Signature V4,
which Tencent Cloud COS fully supports. When unconfigured or on upload
failure the caller falls back to local storage (see file_storage.py).

Bucket must be "public read / private write": PUTs are signed, GETs are
anonymous so the returned URL works directly in <img>/<video> tags.
"""

import hashlib
import hmac
import logging
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_SERVICE = "cos"
_ALGO = "AWS4-HMAC-SHA256"


def is_enabled() -> bool:
    """True when OSS is configured and ready to use."""
    s = get_settings()
    return bool(
        s.OSS_ENABLED
        and s.OSS_BUCKET
        and s.OSS_SECRET_ID
        and s.OSS_SECRET_KEY
        and s.OSS_REGION
    )


def build_key(date: str, unique_name: str) -> str:
    """COS object key, mirroring the local uploads/<date>/<name> layout."""
    return f"spiritlens/{date}/{unique_name}"


def _signature_key(secret_key: str, date_stamp: str, region: str) -> bytes:
    """Derive the SigV4 signing key: kSecret → kDate → kRegion → kService → kSigning."""
    def _hmac(key: bytes, msg: str) -> bytes:
        return hmac.new(key, msg.encode(), hashlib.sha256).digest()

    k_date = _hmac(("AWS4" + secret_key).encode(), date_stamp)
    k_region = _hmac(k_date, region)
    k_service = _hmac(k_region, _SERVICE)
    return _hmac(k_service, "aws4_request")


def _canonical_request(method: str, uri: str, headers: dict, payload_hash: str) -> str:
    """SigV4 canonical request; headers must be lowercased and name-sorted."""
    items = sorted((k, v.strip()) for k, v in headers.items())
    canonical_headers = "".join(f"{k}:{v}\n" for k, v in items)
    signed_headers = ";".join(k for k, _ in items)
    return f"{method}\n{uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}"


async def upload_file(path: Path, content_type: str, key: str) -> str:
    """Upload a local file to COS with SigV4 auth. Returns the public URL.

    Raises RuntimeError on failure — callers fall back to local storage.
    """
    s = get_settings()
    if not is_enabled():
        raise RuntimeError("Object storage not configured")

    region, bucket = s.OSS_REGION, s.OSS_BUCKET
    host = f"{bucket}.cos.{region}.myqcloud.com"
    uri = "/" + quote(key, safe="/")
    url = f"https://{host}{uri}"

    data = path.read_bytes()
    payload_hash = hashlib.sha256(data).hexdigest()

    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    headers = {
        "host": host,
        "x-amz-date": amz_date,
        "x-amz-content-sha256": payload_hash,
        "content-type": content_type,
    }

    scope = f"{date_stamp}/{region}/{_SERVICE}/aws4_request"
    canonical = _canonical_request("PUT", uri, headers, payload_hash)
    string_to_sign = (
        f"{_ALGO}\n{amz_date}\n{scope}\n"
        f"{hashlib.sha256(canonical.encode()).hexdigest()}"
    )
    signature = hmac.new(
        _signature_key(s.OSS_SECRET_KEY, date_stamp, region),
        string_to_sign.encode(),
        hashlib.sha256,
    ).hexdigest()
    signed_headers = ";".join(sorted(headers))
    auth = (
        f"{_ALGO} Credential={s.OSS_SECRET_ID}/{scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.put(url, content=data, headers={**headers, "Authorization": auth})
    if resp.status_code not in (200, 201, 204):
        raise RuntimeError(f"COS upload failed: HTTP {resp.status_code} {resp.text[:200]}")

    base = s.OSS_PUBLIC_URL.rstrip("/") if s.OSS_PUBLIC_URL else f"https://{host}"
    logger.info("Uploaded to COS: %s", uri)
    return f"{base}{uri}"


def key_from_url(url: str) -> str | None:
    """从公开媒体 URL 提取 COS 对象 key。

    生成的 URL 形如 {OSS_PUBLIC_URL}/spiritlens/YYYY-MM-DD/<hash>.<ext>。
    外部（提供商 CDN 等）URL 返回 None —— 不属于我们管理的对象。
    """
    s = get_settings()
    base = s.OSS_PUBLIC_URL.rstrip("/") if s.OSS_PUBLIC_URL else None
    if base and url.startswith(base + "/"):
        return url[len(base) + 1:]
    return None


async def delete_object(key: str) -> bool:
    """按 key 删除 COS 对象（SigV4 DELETE）。已删除/不存在返回 True。"""
    s = get_settings()
    if not is_enabled():
        return False

    region, bucket = s.OSS_REGION, s.OSS_BUCKET
    host = f"{bucket}.cos.{region}.myqcloud.com"
    uri = "/" + quote(key, safe="/")
    url = f"https://{host}{uri}"

    payload_hash = hashlib.sha256(b"").hexdigest()
    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    headers = {
        "host": host,
        "x-amz-date": amz_date,
        "x-amz-content-sha256": payload_hash,
    }
    scope = f"{date_stamp}/{region}/{_SERVICE}/aws4_request"
    canonical = _canonical_request("DELETE", uri, headers, payload_hash)
    string_to_sign = (
        f"{_ALGO}\n{amz_date}\n{scope}\n"
        f"{hashlib.sha256(canonical.encode()).hexdigest()}"
    )
    signature = hmac.new(
        _signature_key(s.OSS_SECRET_KEY, date_stamp, region),
        string_to_sign.encode(),
        hashlib.sha256,
    ).hexdigest()
    signed_headers = ";".join(sorted(headers))
    auth = (
        f"{_ALGO} Credential={s.OSS_SECRET_ID}/{scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.delete(url, headers={**headers, "Authorization": auth})
    except Exception as e:
        logger.warning("COS delete request failed for %s: %s", uri, e)
        return False
    if resp.status_code in (200, 204, 404):
        logger.info("Deleted COS object: %s", uri)
        return True
    logger.warning("COS delete failed: HTTP %s %s", resp.status_code, resp.text[:200])
    return False
