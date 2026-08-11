/**
 * 媒体文件下载工具（跨域 CDN 资源）。
 *
 * 问题背景：视频/图片存于跨域 CDN（media.yhanm.cn），`<a download>` 对跨域
 * 链接会被浏览器忽略 download 属性 → 直接打开资源（"放大"），所以需要特殊处理。
 *
 * 策略（两级）：
 * 1. fetch blob 直连 CDN（依赖已配置的 CORS 头）—— 下载走 CDN 带宽，快且不占服务器
 * 2. 失败回退同源代理接口（/api/v1/video/download、/api/v1/image/download）—— 流式，保证可用
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export async function downloadMedia(
  url: string,
  filename: string,
  opts?: { isVideo?: boolean },
): Promise<boolean> {
  // 1) CDN 直连：fetch blob（跨域 fetch 依赖 CDN 的 Access-Control-Allow-Origin）
  try {
    const res = await fetch(url, {
      headers: { Accept: "video/mp4,image/*,*/*" },
    });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0) {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
        return true;
      }
    }
  } catch {
    // 跨域被拒等 —— 走回退
  }

  // 2) 回退：同源代理（流式转发，下载栏立即出现）
  try {
    const endpoint = opts?.isVideo ? "video/download" : "image/download";
    const a = document.createElement("a");
    a.href = `${API_BASE}/api/v1/${endpoint}?url=${encodeURIComponent(url)}`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch {
    return false;
  }
}
