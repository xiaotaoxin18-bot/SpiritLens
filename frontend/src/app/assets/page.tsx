"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Loader2, Image as ImageIcon, Clock, Trash2, Download, Sparkles,
  Heart, CheckSquare, Square, Check,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/services/api";
import { downloadMedia } from "@/lib/download";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface AssetItem {
  id: string;
  type: string;
  status: string;
  media_url: string | null;
  thumbnail_url: string | null;
  prompt: string;
  width: number | null;
  height: number | null;
  image_urls: string[];
  is_favorited: boolean;
  created_at: string;
}

function imgUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path}`;
}

export default function AssetsPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [favoritingIds, setFavoritingIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"image" | "video">("image");
  const [previewDownloading, setPreviewDownloading] = useState(false);

  const load = useCallback(() => {
    api.get<{ items: AssetItem[]; total: number }>("/api/v1/user/assets?page_size=100")
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  // ─── Batch operations ─────────────────────────────────────

  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`确定删除选中的 ${selected.size} 个作品？此操作不可撤销。`)) return;
    setBusy(true);
    let ok = 0;
    const ids = Array.from(selected);
    for (let i = 0; i < ids.length; i++) {
      setBatchProgress(`${i + 1}/${ids.length}`);
      try { await api.delete("/api/v1/user/assets/" + ids[i]); ok++; } catch { /* skip */ }
    }
    setBatchProgress("");
    setBusy(false);
    exitSelectMode();
    load();
    toast(`已删除 ${ok} 个作品`, ok > 0 ? "success" : "error");
  };

  const handleBatchDownload = async () => {
    if (busy || selected.size === 0) return;
    setBusy(true);
    try {
      let ok = 0;
      for (const id of selected) {
        const item = items.find((i) => i.id === id);
        const raw = item?.image_urls?.[0] || item?.media_url;
        if (!raw) continue;
        const url = raw.startsWith("http") ? raw : `${API_BASE}${raw}`;
        const isVideo = item.type === "video";
        const done = await downloadMedia(url, `spiritlens-${id}.${isVideo ? "mp4" : "png"}`, { isVideo });
        if (done) ok++;
      }
      toast(`开始下载 ${ok} 个文件`, "success");
    } finally {
      setBusy(false);
    }
  };

  const handleBatchPublish = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    setBatchProgress("发布中…");
    try {
      const res = await api.post<{ published: number }>("/api/v1/user/assets/batch/publish", {
        ids: Array.from(selected),
      });
      exitSelectMode();
      load();
      toast(`已发布 ${res.published} 个作品到社区`, "success");
    } catch {
      toast("发布失败，请重试", "error");
    } finally {
      setBatchProgress("");
      setBusy(false);
    }
  };

  const handleToggleFavorite = async (id: string) => {
    if (favoritingIds.has(id)) return;
    setFavoritingIds((prev) => new Set(prev).add(id));
    try {
      const res = await api.post<{ favorited: boolean }>(
        `/api/v1/user/assets/${id}/favorite`,
      );
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, is_favorited: res.favorited } : i,
        ),
      );
    } catch {
      toast("操作失败，请重试", "error");
    } finally {
      setFavoritingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const selCount = selected.size;

  return (
    <AuthGuard>
      <div className={cn("w-full px-4 sm:px-8 flex-1", selectMode ? "pb-24" : "py-8")}>
        {/* Header (sticky when in select mode) */}
        <div className={cn("flex items-center justify-between mb-6", selectMode && "sticky top-0 z-10 bg-surface-base -mx-4 sm:-mx-8 px-4 sm:px-8 py-4 -mt-4 border-b border-border-subtle")}>
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-1">
              我的资产库
            </h1>
            <p className="text-text-muted text-sm">
              {selectMode ? `已选 ${selCount} 个` : `共 ${total} 个作品`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectMode ? (
              <button onClick={exitSelectMode}
                className="inline-flex h-9 items-center rounded-xl border border-border-subtle px-3 text-xs text-text-muted hover:text-text-secondary transition-colors">
                取消
              </button>
            ) : (
              <button onClick={() => setSelectMode(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border-subtle px-3 text-xs text-text-secondary hover:bg-surface-light transition-colors">
                <CheckSquare className="size-3.5" />
                批量操作
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="size-6 animate-spin text-text-muted" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-white/[0.04] light:bg-black/[0.03]">
              <ImageIcon className="size-6 text-text-muted" />
            </div>
            <h3 className="text-base font-semibold text-text-primary mb-1">
              还没有作品
            </h3>
            <p className="text-sm text-text-muted">
              生成图片或视频后，作品会自动保存在这里
            </p>
          </div>
        ) : null}

        {/* Fixed batch action bar */}
        {selectMode && (
          <div className="fixed top-16 left-0 right-0 z-50 border-b border-border-subtle bg-surface-base/95 backdrop-blur-md px-4 sm:px-8 py-3 flex items-center gap-2 shadow-md">
            <button onClick={exitSelectMode}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border-subtle px-3 text-xs text-text-muted hover:text-text-secondary transition-colors">
              <span className="text-base leading-none mr-0.5">&larr;</span>
              退出
            </button>
            <div className="w-px h-5 bg-border-subtle" />
            <button onClick={() => {
              if (selCount === items.length) setSelected(new Set());
              else setSelected(new Set(items.map(i => i.id)));
            }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border-subtle px-3 text-xs text-text-secondary hover:bg-surface-light transition-colors">
              {selCount === items.length ? <Square className="size-3.5" /> : <CheckSquare className="size-3.5" />}
              {selCount === items.length ? "取消全选" : "全选"}
            </button>

            <button onClick={handleBatchDownload} disabled={selCount === 0 || busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border-subtle px-3 text-xs text-text-secondary hover:bg-surface-light transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              下载
            </button>

            <button onClick={handleBatchPublish} disabled={selCount === 0 || busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-cyan/10 px-3 text-xs text-brand-cyan hover:bg-brand-cyan/20 transition-colors disabled:opacity-50">
              <Sparkles className="size-3.5" />
              发布
            </button>

            <button onClick={handleBatchDelete} disabled={selCount === 0 || busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-red-500/10 px-3 text-xs text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              删除{batchProgress ? ` (${batchProgress})` : ""}
            </button>

            <span className="text-xs text-text-muted ml-auto">{selCount} 个已选</span>
          </div>
        )}

          <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 sm:gap-4">
            {items.map((item, i) => {
              const displayUrl = item.image_urls?.[0] || item.thumbnail_url || item.media_url;
              const isSelected = selected.has(item.id);

              let paddingBottom = "75%";
              if (item.width && item.height) {
                const ratio = item.height / item.width;
                paddingBottom = `${Math.min(ratio * 100, 200)}%`;
              } else {
                paddingBottom = ["75%", "100%", "133%", "56%"][i % 4];
              }

              const isProcessing = item.status === "processing" || item.status === "pending";
              const isFailed = item.status === "failed";

              return (
                <div key={item.id}
                  className={cn("break-inside-avoid mb-3 sm:mb-4 group cursor-pointer", isSelected && "relative")}
                  onClick={() => {
                    if (selectMode) { toggleSelect(item.id); return; }
                    if (displayUrl && !isProcessing) {
                      setPreviewUrl(imgUrl(displayUrl));
                      setPreviewType(item.type === "video" ? "video" : "image");
                    }
                  }}>
                  <div className={cn("relative overflow-hidden rounded-2xl bg-surface-card transition-all", isSelected && "ring-2 ring-brand-cyan")}>
                    {/* Selection checkbox */}
                    {selectMode && (
                      <div onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
                        className={cn("absolute left-2 top-2 z-10 flex size-7 items-center justify-center rounded-lg border-2 transition-all",
                          isSelected ? "border-brand-cyan bg-brand-cyan text-white" : "border-white/60 bg-black/30 text-transparent hover:bg-black/50")}>
                        {isSelected && <Check className="size-4" />}
                      </div>
                    )}

                    {/* Favorite heart — visible on hover outside select mode */}
                    {!selectMode && !isProcessing && !isFailed && (
                      <button onClick={(e) => { e.stopPropagation(); handleToggleFavorite(item.id); }}
                        className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-full bg-black/40 text-white/60 opacity-0 transition-all hover:bg-red-500/60 hover:text-white group-hover:opacity-100">
                        {favoritingIds.has(item.id) ? <Loader2 className="size-3.5 animate-spin" /> : <Heart className={cn("size-3.5", item.is_favorited && "fill-red-400 text-red-400")} />}
                      </button>
                    )}

                    {/* Image / Video */}
                    <div style={{ paddingBottom }}>
                      {displayUrl && !isProcessing ? (
                        item.type === "video" ? (
                          <div className="absolute inset-0">
                            <video
                              src={imgUrl(displayUrl)}
                              className="h-full w-full object-cover"
                              preload="metadata"
                              muted
                              playsInline
                            />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="size-10 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm">
                                <svg className="size-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z"/>
                                </svg>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <img src={imgUrl(displayUrl)} alt={item.prompt}
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                        )
                      ) : (
                        <div className={cn("absolute inset-0 flex items-center justify-center",
                          isFailed ? "bg-red-500/5" : "bg-gradient-to-br from-brand-purple/10 to-brand-cyan/10")}>
                          {isProcessing ? <Loader2 className="size-8 animate-spin text-brand-cyan/50" />
                            : isFailed ? <span className="text-xs text-red-400/60">生成失败</span>
                            : <ImageIcon className="size-8 text-text-muted/20" />}
                        </div>
                      )}
                    </div>

                    {/* Status badge */}
                    {isProcessing && <div className="absolute top-2 left-2 rounded-full bg-brand-cyan/80 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">生成中</div>}
                    {isFailed && <div className="absolute top-2 left-2 rounded-full bg-red-500/80 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">失败</div>}

                    {/* Gradient overlay */}
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

                    {/* Info overlay */}
                    <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                      <p className="text-white text-xs leading-tight line-clamp-2 drop-shadow-sm">{item.prompt || "未命名作品"}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-white/50 text-[10px]">
                        <Clock className="size-3" />
                        {item.created_at ? new Date(item.created_at).toLocaleDateString("zh-CN") : "—"}
                        <span className="ml-auto">{item.type === "image" ? "图片" : "视频"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        {/* Preview modal */}
        {previewUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={() => setPreviewUrl(null)}
          >
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
            >
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <a
              href={`${API_BASE}/api/v1/${previewType === "video" ? "video" : "image"}/download?url=${encodeURIComponent(previewUrl)}`}
              download
              className="absolute right-16 top-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
              title="下载"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (previewDownloading) return;
                setPreviewDownloading(true);
                downloadMedia(previewUrl, `spiritlens-${previewType}.${previewType === "video" ? "mp4" : "png"}`, { isVideo: previewType === "video" })
                  .finally(() => setPreviewDownloading(false));
              }}
            >
              {previewDownloading ? <Loader2 className="size-5 animate-spin" /> : <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
            </a>
            <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] max-w-[90vw]">
              {previewType === "video" ? (
                <video
                  src={previewUrl}
                  className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-2xl"
                  controls
                  autoPlay
                  playsInline
                >
                  您的浏览器不支持视频播放
                </video>
              ) : (
                <img
                  src={previewUrl}
                  alt="预览"
                  className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
