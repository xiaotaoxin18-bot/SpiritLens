"use client";

import { useState, useRef, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Clapperboard, ChevronDown, Loader2, Trash2, Wand2, Pencil, RefreshCw,
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
  onGenerate?: () => void;
  onDelete?: () => void;
  inputImageUrl?: string;
  inputImageSize?: string;
  upstreamPrompts?: string[];
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

export function VideoNode({ data: rawData, selected }: NodeProps) {
  const data = rawData as unknown as VideoNodeData;
  const models = data.canvasModels || [];
  const model = models.find((m) => m.id === data.modelId) ?? models[0] ?? { id: "", name: "加载中" };
  const isRunning = data.status === "running";
  const videoAspect = videoAspectStyle(data.inputImageSize);
  const isFailed = data.status === "failed";
  const isSucceeded = data.status === "succeeded";
  const isIdle = data.status === "idle";
  const cover = data.videoPosterUrl ?? data.inputImageUrl;
  const progress = Math.round(data.progress ?? 0);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const modelPopRef = useRef<HTMLDivElement | null>(null);

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

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      data.onGenerate?.();
    }
  };

  const canGenerate = !!data.inputImageUrl && !!data.prompt.trim() && !isRunning;

  return (
    <div
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

      {/* Header — cyan accent */}
      <div className="flex items-center gap-1.5 border-b border-brand-cyan/20 bg-gradient-to-r from-brand-cyan/15 via-brand-cyan/5 to-transparent light:bg-black/[0.03] px-2 py-1.5 rounded-t-2xl">
        <div className="relative" ref={modelPopRef}>
          <button
            type="button"
            onClick={() => setModelOpen((v) => !v)}
            className="nodrag inline-flex h-6 items-center gap-1 rounded-full border border-white/[0.08] light:border-black/[0.08] bg-white/[0.08] light:bg-black/[0.05] px-2 text-[11px] hover:bg-white/[0.08] transition-colors"
          >
            <Clapperboard className="size-3 text-brand-cyan" />
            <span className="max-w-[100px] truncate text-primary/70">{model.name}</span>
            <ChevronDown className="size-2.5 text-muted" />
          </button>
          {modelOpen && (
            <div className="nodrag absolute left-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-surface-overlay/[0.98] shadow-xl backdrop-blur-xl">
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

      {/* Preview frame */}
      <div className="relative w-full bg-white/[0.06] light:bg-black/[0.03]" style={videoAspect}>
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

      {/* Prompt area */}
      <div className="px-3 py-2.5 nodrag">
        {(isIdle || editingPrompt || isFailed) ? (
          <>
            <textarea
              value={data.prompt}
              onChange={(e) => { e.stopPropagation(); data.onPromptChange?.(e.target.value); }}
              onKeyDown={onKey}
              onPointerDown={(e) => e.stopPropagation()}
              autoFocus={editingPrompt || (isIdle && data.prompt === "")}
              placeholder={data.upstreamPrompts?.length ? `↑ 上游：${data.upstreamPrompts[0]}` : "镜头与动作 · 例如：相机缓慢左移，云层快速流动"}
              className="nodrag nowheel min-h-14 w-full resize-none border-0 bg-transparent p-0 text-[12px] leading-snug text-primary/70 placeholder:text-muted focus:outline-none focus:ring-0"
            />
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted">
                {data.inputImageUrl ? "Enter 生成 · Shift+Enter 换行" : "需要先连入图像"}
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
                {isRunning ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
                {isFailed ? "重试" : "生成"}
              </button>
            </div>
          </>
        ) : (
          <div className="group flex items-start gap-2">
            <p className="line-clamp-2 flex-1 text-[11px] leading-snug text-muted">
              {data.prompt || "（无提示词）"}
            </p>
            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => setEditingPrompt(true)}
                className="text-muted hover:text-secondary transition-colors"
              >
                <Pencil className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => data.onGenerate?.()}
                className="text-muted hover:text-secondary transition-colors"
              >
                <RefreshCw className="size-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      <Handle
        id="video-source"
        type="source"
        position={Position.Right}
        className="!size-3.5 !border-2 !border-[#0d0d0e] !bg-brand-cyan transition-transform hover:!scale-125"
      />
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
