"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Film, Loader2, AlertCircle, CheckCircle, XCircle,
  Clock, Download, GripVertical, Play, Pause,
  SkipForward, SkipBack, ListVideo, StepForward,
} from "lucide-react";
import { cn, resolveImageUrl } from "@/lib/utils";
import { api } from "@/services/api";

interface Props {
  projectId: string;
  episodeId: string;
  projectName?: string;
  episodeTitle?: string;
}

interface ExportItem {
  id: string;
  sequence: number;
  actionSummary: string;
  videoUrl: string;
  status: "completed" | "pending" | "failed";
  duration: number;
  videoPrompt: string;
}

interface ExportData {
  total: number;
  items: ExportItem[];
  aspectRatio: string;
  episodeTitle: string;
}

type LoadState = "loading" | "loaded" | "error" | "empty";

const STATUS_CONFIG = {
  completed: { icon: CheckCircle, label: "已完成", className: "text-accent-green bg-accent-green/10" },
  pending: { icon: Clock, label: "待生成", className: "text-yellow-400 bg-yellow-400/10" },
  failed: { icon: XCircle, label: "失败", className: "text-red-400 bg-red-400/10" },
} as const;

export default function StageExport({ projectId, episodeId }: Props) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [items, setItems] = useState<ExportItem[]>([]);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoadState("loading");
    try {
      const data = await api.get<ExportData>(
        `/api/v1/projects/${projectId}/episodes/${episodeId}/export`
      );
      if (!data.items || data.items.length === 0) {
        setLoadState("empty");
        return;
      }
      setItems(data.items);
      setAspectRatio(data.aspectRatio || "16:9");
      setEpisodeTitle(data.episodeTitle || "");
      setLoadState("loaded");
    } catch (e) {
      console.warn("[StageExport] Failed to load export data", e);
      setLoadState("error");
    }
  }, [projectId, episodeId]);

  useEffect(() => { loadData(); }, [loadData]);

  const completedItems = items.filter(i => i.status === "completed");
  const completedCount = completedItems.length;
  const currentItem = items[currentIndex];

  // ── Auto-play next ──────────────────────────────────────
  const playNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [currentIndex, items.length]);

  const playPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsPlaying(true);
    }
  }, [currentIndex]);

  const handleVideoEnd = () => {
    playNext();
  };

  // When currentIndex changes, auto-play if isPlaying
  useEffect(() => {
    if (videoRef.current && isPlaying) {
      videoRef.current.play().catch(() => {});
    }
  }, [currentIndex, isPlaying]);

  const startPlayAll = () => {
    // Find first completed video
    const firstIdx = items.findIndex(i => i.status === "completed");
    if (firstIdx >= 0) {
      setCurrentIndex(firstIdx);
      setIsPlaying(true);
    }
  };

  // ── Persist order ───────────────────────────────────────
  const saveOrder = useCallback(async (orderedItems: ExportItem[]) => {
    setSavingOrder(true);
    try {
      await api.put(
        `/api/v1/projects/${projectId}/episodes/${episodeId}/export/order`,
        { shotOrder: orderedItems.map(i => i.id) }
      );
    } catch { /* silent */ }
    finally { setSavingOrder(false); }
  }, [projectId, episodeId]);

  const handleMove = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= items.length) return;
    const newItems = [...items];
    const [moved] = newItems.splice(fromIdx, 1);
    newItems.splice(toIdx, 0, moved);
    const reindexed = newItems.map((item, i) => ({ ...item, sequence: i + 1 }));
    setItems(reindexed);
    saveOrder(reindexed);
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); };
  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== dropIdx) handleMove(dragIdx, dropIdx);
    setDragIdx(null);
  };

  const handleDownload = (url: string, label: string) => {
    const a = document.createElement("a");
    a.href = resolveImageUrl(url);
    a.download = `${label}.mp4`;
    a.click();
  };

  const handleDownloadAll = () => {
    completedItems.forEach((item, idx) => {
      setTimeout(() => handleDownload(item.videoUrl, `shot-${item.sequence}`), idx * 500);
    });
  };

  const goToItem = (idx: number) => {
    setCurrentIndex(idx);
    setIsPlaying(true);
  };

  // ── Render states ───────────────────────────────────────

  if (loadState === "loading") {
    return (
      <div className="h-full flex items-center justify-center bg-surface-base">
        <Loader2 className="size-6 text-text-muted animate-spin" />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="h-full flex items-center justify-center bg-surface-base">
        <div className="text-center max-w-sm px-8">
          <AlertCircle className="size-12 text-red-400/50 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">加载失败</h3>
          <p className="text-sm text-text-muted mb-6">无法获取导出数据，请检查网络后重试。</p>
          <button onClick={loadData}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan/20 transition-all border border-brand-cyan/20"
          >重新加载</button>
        </div>
      </div>
    );
  }

  if (loadState === "empty") {
    return (
      <div className="h-full flex items-center justify-center bg-surface-base">
        <div className="text-center max-w-md px-8">
          <Film className="size-12 text-text-muted/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">暂无分镜数据</h3>
          <p className="text-sm text-text-muted">请先在「导演工作台」生成视频后，再来此导出。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface-base overflow-hidden">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="h-14 px-6 border-b border-border-subtle bg-surface-card flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Film className="size-4 text-brand-cyan" />
          <span className="text-sm font-bold text-text-primary">成片播放</span>
          {episodeTitle && (
            <span className="text-[10px] font-mono text-text-muted">{episodeTitle}</span>
          )}
          <span className="text-[10px] font-mono text-text-muted bg-surface-elevated px-2 py-0.5 rounded">
            {aspectRatio}
          </span>
          <span className={cn(
            "text-[10px] font-mono px-2 py-0.5 rounded",
            completedCount === items.length
              ? "text-accent-green bg-accent-green/10"
              : "text-yellow-400 bg-yellow-400/10"
          )}>
            {completedCount}/{items.length} 已完成
          </span>
        </div>

        <div className="flex items-center gap-2">
          {completedCount > 0 && (
            <>
              <button onClick={handleDownloadAll}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan/20 border border-brand-cyan/20 transition-all"
              >
                <Download className="size-3.5" />
                全部下载
              </button>
            </>
          )}
          {savingOrder && <span className="text-[10px] text-text-muted animate-pulse">保存中...</span>}
        </div>
      </div>

      {/* ── Body: Player + Playlist ──────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Player */}
        <div ref={playerRef} className="flex-1 flex flex-col items-center justify-center p-6 bg-black/40 min-w-0">
          {currentItem && currentItem.status === "completed" ? (
            <div className="w-full max-w-3xl space-y-4">
              <video
                key={currentItem.id}
                ref={videoRef}
                src={resolveImageUrl(currentItem.videoUrl)}
                onEnded={handleVideoEnd}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                controls
                className="w-full rounded-xl bg-black max-h-[60vh]"
                autoPlay={isPlaying}
              />
              {/* Progress indicator */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted font-mono">
                  #{String(currentItem.sequence).padStart(2, "0")} · {currentItem.actionSummary || "未命名镜头"}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-text-muted">{currentItem.duration} 秒</span>
                  <button onClick={() => handleDownload(currentItem.videoUrl, `shot-${currentItem.sequence}`)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-brand-cyan transition-colors"
                    title="下载当前视频"
                  >
                    <Download className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <ListVideo className="size-16 text-text-muted/20 mx-auto mb-4" />
              <p className="text-text-muted/60 text-sm">
                {currentItem
                  ? `#${currentItem.sequence} ${currentItem.actionSummary} — 暂无视频`
                  : "选择一个分镜播放"}
              </p>
            </div>
          )}
        </div>

        {/* Playlist sidebar */}
        <div className="w-80 border-l border-border-subtle bg-surface-card shrink-0 flex flex-col">
          <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
            <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-text-muted">
              播放列表
            </span>
            <button
              onClick={startPlayAll}
              disabled={completedCount === 0}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan/20 disabled:opacity-30 transition-all"
            >
              <Play className="size-3" />
              顺序播放
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {items.map((item, idx) => {
              const status = STATUS_CONFIG[item.status];
              const StatusIcon = status.icon;
              const isActive = currentIndex === idx;

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={(e) => handleDrop(e, idx)}
                  onClick={() => item.status === "completed" && goToItem(idx)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 border-b border-border-subtle/50 cursor-pointer transition-all group",
                    isActive
                      ? "bg-brand-cyan/8 border-l-2 border-l-brand-cyan"
                      : "border-l-2 border-l-transparent hover:bg-surface-elevated"
                  )}
                >
                  {/* Drag handle */}
                  <GripVertical className="size-3 text-text-muted/20 group-hover:text-text-muted/50 shrink-0 transition-colors" />

                  {/* Sequence */}
                  <span className={cn(
                    "text-[10px] font-bold font-mono w-6 shrink-0",
                    isActive ? "text-brand-cyan" : "text-text-muted"
                  )}>
                    #{String(item.sequence).padStart(2, "0")}
                  </span>

                  {/* Summary */}
                  <span className="flex-1 text-xs text-text-primary truncate min-w-0">
                    {item.actionSummary || "未命名"}
                  </span>

                  {/* Status */}
                  <span className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold shrink-0",
                    status.className
                  )}>
                    <StatusIcon className="size-2.5" />
                  </span>

                  {/* Play button (only for completed) */}
                  {item.status === "completed" && (
                    <Play className={cn(
                      "size-3 shrink-0",
                      isActive ? "text-brand-cyan" : "text-text-muted/0 group-hover:text-text-muted/70 transition-all"
                    )} />
                  )}
                </div>
              );
            })}
          </div>

          {items.length > 0 && (
            <div className="px-4 py-2 border-t border-border-subtle">
              <p className="text-[9px] text-text-muted/40 font-mono text-center">
                拖拽调整顺序 · 点击播放
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
