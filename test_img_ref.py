import httpx, asyncio

with open("/tmp/ak", "r") as f:
    KEY = f.read().strip()

async def t():
    base = {
        "model": "doubao-seedream-5-0-260128",
        "prompt": "test",
        "size": "1024x1024",
        "response_format": "url",
        "stream": False,
        "watermark": False,
    }

    # Test 1: no ref
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            "https://xinghezhiyun.com/api/v3/images/generations",
            headers={"Authorization": f"Bearer {KEY}"},
            json=base,
        )
        print("NO REF:", r.status_code, r.text[:200])

    # Test 2: with ref as URL string
    body2 = dict(base)
    body2["image"] = "https://yhanm.cn/spiritlens/uploads/2026-07-03/f9a52df9eab81209.jpg"
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            "https://xinghezhiyun.com/api/v3/images/generations",
            headers={"Authorization": f"Bearer {KEY}"},
            json=body2,
        )
        print("REF STR:", r.status_code, r.text[:300])

    # Test 3: with ref + strength
    body3 = dict(body2)
    body3["strength"] = 0.7
    body3["guidance_scale"] = 2.5
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            "https://xinghezhiyun.com/api/v3/images/generations",
            headers={"Authorization": f"Bearer {KEY}"},
            json=body3,
        )
        print("REF+STR:", r.status_code, r.text[:300])

asyncio.run(t())
