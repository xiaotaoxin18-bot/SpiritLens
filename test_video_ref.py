#!/usr/bin/env python3
"""Test video API with different reference image formats."""
import httpx, asyncio, os

with open("/tmp/xk", "r") as f:
    KEY = f.read().strip()

BASE = "https://xinghezhiyun.com/v1/videos"
HEADERS = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

# Test URLs
PICSUM = "https://picsum.photos/500/500"
OUR_IMAGE = "https://yhanm.cn/spiritlens/uploads/2026-07-03/a530b70c492a735b.jpg"
EXTERNAL_JPG = "https://upload.wikimedia.org/wikipedia/en/7/7d/Lenna_%28test_image%29.png"

base_body = {
    "model": "doubao-seedance-2-0-260128",
    "prompt": "test video reference image format",
    "seconds": 5,
    "size": "1280x720",
    "generate_audio": True,
    "return_last_frame": True,
    "watermark": False,
}

async def test(name, body):
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(BASE, headers=HEADERS, json=body)
        print(f"{name}: {r.status_code} {r.text[:300]}")

async def main():
    # Test 1: no refs (baseline)
    await test("NO REFS", base_body)

    # Test 2: object format, our image
    b2 = dict(base_body)
    b2["input_references"] = [{"type": "image_url", "image_url": {"url": OUR_IMAGE}}]
    await test("OBJ+OUR", b2)

    # Test 3: string format, our image
    b3 = dict(base_body)
    b3["input_references"] = [{"type": "image_url", "image_url": OUR_IMAGE}]
    await test("STR+OUR", b3)

    # Test 4: object format, picsum
    b4 = dict(base_body)
    b4["input_references"] = [{"type": "image_url", "image_url": {"url": PICSUM}}]
    await test("OBJ+PIC", b4)

    # Test 5: string format, external JPG
    b5 = dict(base_body)
    b5["input_references"] = [{"type": "image_url", "image_url": EXTERNAL_JPG}]
    await test("STR+EXT", b5)

    # Test 6: object format, external JPG
    b6 = dict(base_body)
    b6["input_references"] = [{"type": "image_url", "image_url": {"url": EXTERNAL_JPG}}]
    await test("OBJ+EXT", b6)

asyncio.run(main())
