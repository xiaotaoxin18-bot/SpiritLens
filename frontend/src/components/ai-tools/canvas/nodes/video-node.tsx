"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Handle, Position, type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import {
  Clapperboard, ChevronDown, Loader2, Trash2, Wand2, Pencil, RefreshCw,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasNodeData } from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
function imgUrl(path: string | undefined | null): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) return path;
  return `${API_BASE}${path}`;
}

type VideoNodeData = CanvasNodeData & {
  onPromptChange?: (p: string) => void;
  onModelChange?: (id: string) => void;
  onDurationChange?: (d: number) => void;
  onVideoSizeChange?: (size: string) => void;
  onGenerate?: () => void;
  onDelete?: () => void;
  inputImageUrl?: string;
  inputImageSize?: string;
  videoSize?: string;
  isDragging?: boolean;
  isMultiSelect?: boolean;
  upstreamPrompts?: string[];
  upstreamImageUrls?: string[];
  videoDuration?: number;
  canvasModels?: Array<{ id: string; name: string; vendor?: string; cost_per_unit?: number }>;
};

function videoAspectStyle(size: string | undefined): React.CSSProperties | undefined {
  if (!size) return undefined;
  const parts = size.split("x");
  if (parts.length !== 2) return undefined;
  const w = parseInt(parts[0]);
  const h = parseInt(parts[1]);
  if (!w || !h) return undefined;
  return { aspectRatio: `${w} / ${h}` };
}

/* ─── Numbered labels for upstream images ─── */
const NUM_LABELS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫"];

/* ─── Derive display label from size string like "1440x2560" ─── */
const SIZE_LABELS: Record<string, string> = {
  "1920x1920": "1:1",
  "2560x1440": "16:9",
  "1440x2560": "9:16",
  "2304x1728": "4:3",
  "1728x2304": "3:4",
  "2496x1664": "3:2",
  "3024x1296": "21:9",
};
function sizeLabel(size: string | undefined): string | null {
  if (!size) return null;
  return SIZE_LABELS[size] ?? null;
}

/* ─── Video size presets for ratio selector ─── */
const VIDEO_SIZE_PRESETS = [
  { label: "16:9 横屏", value: "1280x720" },
  { label: "9:16 竖屏", value: "720x1280" },
  { label: "1:1 方屏", value: "720x720" },
  { label: "4:3 横屏", value: "960x720" },
  { label: "3:4 竖屏", value: "720x960" },
];
function videoSizeLabel(size: string): string {
  return VIDEO_SIZE_PRESETS.find((s) => s.value === size)?.label ?? size;
}
function videoSizeDisplay(size: string): string {
  const m = size.match(/(\d+)x(\d+)/);
  if (!m) return size;
  const w = parseInt(m[1]), h = parseInt(m[2]);
  const g = gcd(w, h);
  return `${w/g}:${h/g}`;
}
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

export function VideoNode({ id, data: rawData, selected }: NodeProps) {
  const data = rawData as unknown as VideoNodeData;
  const updateNodeInternals = useUpdateNodeInternals();
  const models = data.canvasModels || [];
  const model = models.find((m) => m.id === data.modelId) ?? models[0] ?? { id: "", name: "加载中" };
  const isRunning = data.status === "running";
  const videoAspect = videoAspectStyle(data.inputImageSize);
  const isFailed = data.status === "failed";
  const isIdle = data.status === "idle";
  const cover = data.videoPosterUrl ?? data.inputImageUrl;
  const progress = Math.round(data.progress ?? 0);
  const cardRef = useRef<HTMLDivElement>(null);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const modelPopRef = useRef<HTMLDivElement | null>(null);
  const sizePopRef = useRef<HTMLDivElement | null>(null);

  // Upstream images from connected nodes
  const upstreamImages = data.upstreamImageUrls ?? [];
  const hasUpstreamImages = upstreamImages.length > 0;

  // Current video duration & size
  const videoDuration = data.videoDuration ?? 5;
  const videoSize = data.videoSize ?? "1280x720";
  const previewAspect = videoAspectStyle(videoSize);

  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelPopRef.current && !modelPopRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelOpen]);

  useEffect(() => {
    if (!sizeOpen) return;
    const handler = (e: MouseEvent) => {
      if (sizePopRef.current && !sizePopRef.current.contains(e.target as Node)) {
        setSizeOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sizeOpen]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      data.onGenerate?.();
    }
  };

  const canGenerate = !!data.inputImageUrl && !!data.prompt.trim() && !isRunning;

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [
    id,
    updateNodeInternals,
    data.inputImageUrl,
    data.videoPosterUrl,
    data.videoUrl,
    data.upstreamPrompts?.length,
    upstreamImages.length,
    videoDuration,
    videoSize,
    isIdle,
    isRunning,
    isFailed,
  ]);

  return (
    <div className="contents">
    <div
      ref={cardRef}
      className={cn(
        "w-80 overflow-visible rounded-2xl border shadow-lg transition-all",
        selected
          ? "border-brand-cyan/50 ring-2 ring-brand-cyan/20"
          : "border-white/[0.14] light:border-black/[0.08]",
        "bg-[#1f1f24] light:bg-surface-card shadow-md shadow-black/25 light:shadow-black/5 backdrop-blur-xl text-primary"
      )}
    >
      <Handle
        id="video-target"
        type="target"
        position={Position.Left}
        className="!size-3.5 !border-2 !border-[#0d0d0e] !bg-brand-cyan/60 transition-transform hover:!scale-125"
      />

      {/* Header — model + duration + status + delete */}
      <div className="flex items-center gap-1.5 border-b border-brand-cyan/20 bg-gradient-to-r from-brand-cyan/15 via-brand-cyan/5 to-transparent light:bg-black/[0.03] px-2 py-1.5 rounded-t-2xl">
        {/* Model selector */}
        <div className="relative" ref={modelPopRef}>
          <button
            type="button"
            onClick={() => setModelOpen((v) => !v)}
            className="nodrag inline-flex h-6 items-center gap-1 rounded-full border border-white/[0.08] light:border-black/[0.08] bg-white/[0.08] light:bg-black/[0.05] px-2 text-[11px] hover:bg-white/[0.08] transition-colors"
          >
            <Clapperboard className="size-3 text-brand-cyan" />
            <span className="max-w-[80px] truncate text-primary/70">{model.name}</span>
            <ChevronDown className="size-2.5 text-muted" />
          </button>
          {modelOpen && (
            <div className="nodrag absolute left-0 top-full z-30 mt-1 w-48 overflow-visible rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-surface-overlay/[0.98] shadow-xl backdrop-blur-xl">
              <div className="max-h-56 overflow-y-auto p-1">
                {models.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { data.onModelChange?.(m.id); setModelOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                      m.id === data.modelId ? "bg-white/[0.08] text-primary" : "text-secondary hover:bg-white/[0.04] light:bg-black/[0.03]"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Duration stepper — inline in header */}
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); data.onDurationChange?.(Math.max(1, videoDuration - 1)); }}
            className="nodrag size-5 rounded-full bg-white/[0.06] text-muted hover:bg-white/[0.15] hover:text-primary/80 flex items-center justify-center text-xs font-bold transition-colors"
          >
            −
          </button>
          <span className="inline-flex items-center gap-0.5 text-[11px] text-primary/70 min-w-[2ch] justify-center tabular-nums">
            <Clock className="size-3 text-amber-400" />
            {videoDuration}s
          </span>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); data.onDurationChange?.(Math.min(15, videoDuration + 1)); }}
            className="nodrag size-5 rounded-full bg-white/[0.06] text-muted hover:bg-white/[0.15] hover:text-primary/80 flex items-center justify-center text-xs font-bold transition-colors"
          >
            +
          </button>
        </div>

        {/* Aspect ratio selector */}
        <div className="relative" ref={sizePopRef}>
          <button
            type="button"
            onClick={() => setSizeOpen((v) => !v)}
            className="nodrag inline-flex h-6 items-center gap-1 rounded-full border border-white/[0.08] light:border-black/[0.08] bg-white/[0.08] light:bg-black/[0.05] px-2 text-[11px] hover:bg-white/[0.08] transition-colors"
          >
            <span className="text-brand-cyan/80 tabular-nums">{videoSizeDisplay(videoSize)}</span>
            <ChevronDown className="size-2.5 text-muted" />
          </button>
          {sizeOpen && (
            <div className="nodrag absolute left-0 top-full z-30 mt-1 w-44 overflow-visible rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-surface-overlay/[0.98] shadow-xl backdrop-blur-xl">
              <div className="p-1">
                {VIDEO_SIZE_PRESETS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => { data.onVideoSizeChange?.(s.value); setSizeOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                      s.value === videoSize ? "bg-white/[0.08] text-primary" : "text-secondary hover:bg-white/[0.04]"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <VideoStatusBadge
          status={data.status}
          progress={progress}
          hasInput={!!data.inputImageUrl}
        />
        <div className="flex-1" />
        {data.onDelete && (
          <button
            type="button"
            onClick={data.onDelete}
            className="nodrag text-muted hover:text-red-400 transition-colors"
            aria-label="删除节点"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      {/* ── Upstream image preview grid ── */}
      {hasUpstreamImages && (
        <div className="border-b border-white/[0.06] px-2 py-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[10px] font-medium text-muted uppercase tracking-wider">上游参考图</span>
            <span className="text-[10px] text-text-muted/60">{upstreamImages.length} 张</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {upstreamImages.map((url, i) => (
              <div key={i} className="relative group">
                <div className="size-14 rounded-lg overflow-visible border border-white/[0.08] bg-white/[0.04]">
                  <img
                    src={imgUrl(url)}
                    alt={`上游图${i + 1}`}
                    className="size-full object-cover"
                    draggable={false}
                  />
                </div>
                {/* Numbered label */}
                <div className="absolute -top-1.5 -left-1.5 size-5 rounded-full bg-brand-cyan text-[10px] font-bold text-black flex items-center justify-center shadow-md">
                  {NUM_LABELS[i] ?? i + 1}
                </div>
                {/* Tooltip: full URL on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-40">
                  <div className="bg-black/80 text-[10px] text-white px-2 py-1 rounded whitespace-nowrap shadow">
                    图{i + 1}
                    {data.prompt.includes(`图${i + 1}`) || data.prompt.includes(`@${i + 1}`) || data.prompt.includes(NUM_LABELS[i])
                      ? " · 已引用"
                      : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview frame — uses selected aspect ratio */}
      <div className="relative w-full bg-white/[0.06] light:bg-black/[0.03]" style={previewAspect}>
        {cover ? (
          <img
            src={imgUrl(cover)}
            alt={data.prompt}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-cyan/[0.03] via-brand-mid/[0.03] to-brand-purple/[0.03]">
            <div className="text-[11px] text-muted">从左侧连入图像</div>
          </div>
        )}
        {isRunning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45">
            <Loader2 className="size-6 animate-spin text-brand-cyan" />
            <div className="text-lg font-bold tracking-tight">{progress}%</div>
          </div>
        )}
        {isFailed && (
          <div className="absolute inset-x-2 bottom-2 rounded-lg bg-red-500/60 px-2 py-1 text-[11px] text-white">
            {data.errorMessage ?? "生成失败"}
          </div>
        )}
      </div>

      {selected && !isRunning && !data.isMultiSelect && (() => {
        const r = cardRef.current?.getBoundingClientRect();
        if (!r) return null;
        return (
          <div
            style={{
              position: 'fixed',
              left: r.left + r.width / 2 - 400,
              top: r.bottom + 8,
              zIndex: 30,
            }}
            className="nodrag w-[800px] rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-surface-overlay/[0.98] shadow-xl backdrop-blur-xl overflow-hidden"
          >
            {(editingPrompt || isIdle || isFailed || !data.prompt.trim()) ? (
              <div className="p-2.5">
                <textarea
                  value={data.prompt}
                  onChange={(e) => { e.stopPropagation(); data.onPromptChange?.(e.target.value); }}
                  onKeyDown={onKey}
                  onPointerDown={(e) => e.stopPropagation()}
                  autoFocus={editingPrompt}
                  placeholder={
                    hasUpstreamImages
                      ? "用 @1 @2 或 图1 图2 引用上游图片 · 例如：@1 坐着，@2 站着"
                      : "镜头与动作 · 例如：相机缓慢左移，云层快速流动"
                  }
                  className="nodrag nowheel min-h-[100px] w-full resize-none border-0 bg-transparent p-0 text-[12px] leading-snug text-primary/70 placeholder:text-muted focus:outline-none focus:ring-0"
                />
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted">
                    {hasUpstreamImages
                      ? "已传入 ${upstreamImages.length} 张图片 · Enter 生成"
                      : data.inputImageUrl ? "Enter 生成 · Shift+Enter 换行" : "需要先连入图像"}
                  </span>
                  <button
                    type="button"
                    onClick={() => { data.onGenerate?.(); setEditingPrompt(false); }}
                    disabled={!canGenerate}
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition-all",
                      canGenerate
                        ? "bg-brand-cyan text-black hover:brightness-110 active:scale-95"
                        : "bg-white/[0.08] light:bg-black/[0.05] text-muted cursor-not-allowed"
                    )}
                  >
                    <Wand2 className="size-3" />
                    {isFailed ? "重试" : "生成"}
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="group flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-white/[0.04] transition-colors"
                onClick={() => setEditingPrompt(true)}
              >
                <p className="line-clamp-3 flex-1 text-[11px] leading-snug text-muted">
                  {data.prompt || "（无提示词）"}
                </p>
                <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
                  <span className="text-[10px] text-muted">编辑</span>
                  <Pencil className="size-3 text-muted" />
                </div>
              </div>
            )}
          </div>
        );
      })()}
      <Handle
        id="video-source"
        type="source"
        position={Position.Right}
        className="!size-3.5 !border-2 !border-[#0d0d0e] !bg-brand-cyan transition-transform hover:!scale-125"
      />
    </div>
    </div>
  );
}

function VideoStatusBadge({
  status, progress, hasInput,
}: {
  status: string;
  progress: number;
  hasInput: boolean;
}) {
  const map: Record<string, { label: string; className: string }> = {
    idle: { label: hasInput ? "待生成" : "缺输入", className: "bg-white/[0.08] light:bg-black/[0.05] text-muted" },
    running: { label: `${progress}%`, className: "bg-brand-cyan/10 text-brand-cyan" },
    succeeded: { label: "完成", className: "bg-accent-green/10 text-accent-green" },
    failed: { label: "失败", className: "bg-red-500/10 text-red-400" },
  };
  const s = map[status] ?? map.idle;
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", s.className)}>
      {s.label}
    </span>
  );
}