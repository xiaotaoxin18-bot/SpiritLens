import httpx, asyncio, os
k = os.environ.get("XINGHE_API_KEY", "")
async def t():
    async with httpx.AsyncClient(timeout=30) as c:
        url = "https://xinghezhiyun.com/v1/videos"
        h = {"Authorization": f"Bearer {k}", "Content-Type": "application/json"}

        # Our image with object format
        r = await c.post(url, headers=h, json={"model":"doubao-seedance-2-0-260128","prompt":"t","seconds":5,"size":"1280x720","generate_audio":True,"return_last_frame":True,"watermark":False,"input_references":[{"type":"image_url","image_url":{"url":"https://yhanm.cn/spiritlens/uploads/2026-07-03/a530b70c492a735b.jpg"}}]})
        print(f"OBJ+OUR: {r.status_code} {r.text[:300]}")

        # Picsum with object format
        r = await c.post(url, headers=h, json={"model":"doubao-seedance-2-0-260128","prompt":"t","seconds":5,"size":"1280x720","generate_audio":True,"return_last_frame":True,"watermark":False,"input_references":[{"type":"image_url","image_url":{"url":"https://picsum.photos/500/500"}}]})
        print(f"OBJ+PIC: {r.status_code} {r.text[:300]}")
asyncio.run(t())
