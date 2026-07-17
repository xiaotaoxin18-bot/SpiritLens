"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X, Loader2, ImagePlus, ExternalLink, Sparkles, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface SearchResult {
  url: string;
  thumbnail: string;
  title: string;
  source: string;
  width: number;
  height: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAddReference: (url: string) => void;
  maxRefs: number;
  currentRefs: number;
}

export function SearchPanel({ open, onClose, onAddReference, maxRefs, currentRefs }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setResults([]);
      setSearched(false);
    }
  }, [open]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const url = `${API_BASE}/api/v1/search/images?q=${encodeURIComponent(query.trim())}&count=24`;
      console.log("Search URL:", url);
      const res = await fetch(url);
      console.log("Search status:", res.status);
      const data = await res.json();
      console.log("Search data:", data);
      setResults(data.results || []);
    } catch (e) {
      console.error("Search failed:", e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePick = async (item: SearchResult) => {
    if (currentRefs >= maxRefs) return;
    setDownloading(item.url);
    try {
      const res = await fetch(`${API_BASE}/api/v1/search/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url }),
      });
      const data = await res.json();
      onAddReference(data.url);
    } catch {
      // fallback: use original URL
      onAddReference(item.url);
    } finally {
      setDownloading(null);
    }
  };

  if (!open) return null;

  const remaining = maxRefs - currentRefs;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-3xl max-h-[85vh] mx-4 rounded-2xl border border-white/[0.08] light:border-black/[0.08] bg-surface-card shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] light:border-black/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center">
              <Search className="size-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">搜索参考图</h2>
              <p className="text-[11px] text-text-muted">从全网搜索灵感素材</p>
            </div>
          </div>
          <button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-light transition-colors">
            <X className="size-4" />
          </button>
        </div>

        {/* Search input */}
        <div className="px-5 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              placeholder="搜索图片关键词，如：赛博朋克城市、水墨山水..."
              className="w-full rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-surface-base py-3 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-purple/40 focus:ring-2 focus:ring-brand-purple/10 transition-all"
            />
            <button onClick={handleSearch} disabled={!query.trim() || loading}
              className={cn(
                "absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-all",
                query.trim()
                  ? "bg-brand-purple text-white hover:brightness-110"
                  : "bg-white/[0.05] light:bg-black/[0.04] text-text-muted cursor-not-allowed"
              )}>
              {loading ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
              搜索
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-[200px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-3">
              <Loader2 className="size-8 animate-spin text-brand-cyan" />
              <p className="text-sm">搜索中...</p>
            </div>
          ) : searched && results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-2">
              <Search className="size-10 opacity-30" />
              <p className="text-sm">没有找到相关图片</p>
              <p className="text-xs opacity-60">试试其他关键词</p>
            </div>
          ) : results.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] text-text-muted">共找到 {results.length} 张图片</span>
                {remaining > 0 && (
                  <span className="text-[11px] text-text-muted">还可添加 {remaining} 张参考图</span>
                )}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {results.map((item, i) => {
                  const isFull = currentRefs >= maxRefs;
                  const isDownloading = downloading === item.url;
                  return (
                    <button
                      key={i}
                      onClick={() => !isFull && !isDownloading && handlePick(item)}
                      disabled={isFull}
                      className={cn(
                        "group relative aspect-[4/3] overflow-hidden rounded-xl border border-white/[0.06] light:border-black/[0.06] bg-surface-base transition-all",
                        isFull ? "opacity-40 cursor-not-allowed" : "hover:border-brand-purple/30 hover:shadow-lg hover:shadow-brand-purple/5 cursor-pointer"
                      )}
                    >
                      <div className="h-full w-full relative">
                        <img
                          src={item.thumbnail}
                          alt={item.title || "搜索结果"}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            const el = e.target as HTMLImageElement;
                            el.style.display = "none";
                            el.parentElement!.querySelector(".img-fallback")?.classList.remove("hidden");
                          }}
                        />
                        <div className="img-fallback hidden absolute inset-0 flex items-center justify-center bg-surface-base text-text-muted">
                          <ImageOff className="size-5" />
                        </div>
                      </div>
                      {/* Overlay */}
                      <div className={cn(
                        "absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity",
                        (isDownloading || !isFull) && "group-hover:opacity-100"
                      )}>
                        {isDownloading ? (
                          <Loader2 className="size-6 animate-spin text-white" />
                        ) : !isFull ? (
                          <span className="flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-sm px-3 py-1.5 text-xs text-white font-medium">
                            <ImagePlus className="size-3.5" />
                            作为参考图
                          </span>
                        ) : null}
                      </div>
                      {/* Size badge */}
                      {item.width > 0 && (
                        <div className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white/70">
                          {item.width}×{item.height}
                        </div>
                      )}
                      {/* Source */}
                      {item.source && (
                        <div className="absolute top-1.5 left-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[9px] text-white/60 truncate max-w-[80%]">
                          {item.source.replace(/^https?:\/\//, "").split("/")[0]}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          ) : !searched ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-3">
              <Search className="size-12 opacity-20" />
              <p className="text-sm">输入关键词，搜索全网参考图</p>
              <p className="text-xs opacity-60">支持中文、英文、中英文混合搜索</p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.06] light:border-black/[0.06] flex items-center justify-between">
          <span className="text-[10px] text-text-muted">搜索结果来自公开搜索引擎</span>
          <span className="text-[10px] text-text-muted">{currentRefs}/{maxRefs} 张已添加</span>
        </div>
      </div>
    </div>
  );
}
