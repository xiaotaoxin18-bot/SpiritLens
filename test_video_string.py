import httpx, asyncio
with open("/tmp/xk", "r") as f:
    KEY = f.read().strip()
async def t():
    url = "https://xinghezhiyun.com/v1/videos"
    h = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    b = {"model":"doubao-seedance-2-0-260128","prompt":"test","seconds":5,"size":"1280x720","generate_audio":True,"return_last_frame":True,"watermark":False,"input_references":[{"type":"image_url","image_url":"https://yhanm.cn/spiritlens/uploads/2026-07-03/f9a52df9eab81209.jpg"}]}
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(url, headers=h, json=b)
        print(r.status_code, r.text[:300])
asyncio.run(t())
