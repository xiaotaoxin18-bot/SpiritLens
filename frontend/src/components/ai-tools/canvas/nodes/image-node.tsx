"use client";

import { useState, useRef, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Sparkles, ChevronDown, Trash2, Loader2, Maximize2, ImagePlus,
  UploadCloud, ArrowUp, ArrowDownToLine, Type, Lock, Unlock, Dice5, MinusSquare,
  Hash, Languages, Clapperboard, UserPlus, Download, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasNodeData, ImageParams } from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
function imgUrl(path: string | undefined | null): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) return path;
  return `${API_BASE}${path}`;
}

/** Derive aspect ratio style from a size string like "1920x1080" */
function aspectStyle(size: string | undefined): React.CSSProperties | undefined {
  if (!size) return undefined;
  const parts = size.split("x");
  if (parts.length !== 2) return undefined;
  const w = parseInt(parts[0]);
  const h = parseInt(parts[1]);
  if (!w || !h) return undefined;
  return { aspectRatio: `${w} / ${h}` };
}

type ImageNodeData = CanvasNodeData & {
  onPromptChange?: (p: string) => void;
  onModelChange?: (id: string) => void;
  onParamsChange?: (patch: Partial<ImageParams>) => void;
  onGenerate?: () => void;
  onDelete?: () => void;
  onSaveAsSubject?: (name: string) => void;
  onSendToVideo?: () => void;
  onSetUploadedImage?: (url: string) => void;
  upstreamPrompts?: string[];
  inputImageUrl?: string;
  canvasModels?: Array<{ id: string; name: string; vendor?: string; cost_per_unit?: number }>;
  supportedSizes?: Array<{ label: string; value: string }>;
};

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function ImageNode({ data: rawData, selected }: NodeProps) {
  const data = rawData as unknown as ImageNodeData;
  const models = data.canvasModels || [];
  const model = models.find((m) => m.id === data.modelId) ?? models[0] ?? { id: "", name: "加载中" };
  const isRunning = data.status === "running";
  const isFailed = data.status === "failed";
  const isSucceeded = data.status === "succeeded";
  const isIdle = data.status === "idle";

  const currentSize = data.imageParams?.size;
  const aspect = aspectStyle(currentSize);
  const allImages = data.imageUrls ?? [];
  const [primaryIdx, setPrimaryIdx] = useState(0);
  const [lastImageUrls, setLastImageUrls] = useState(data.imageUrls);
  if (lastImageUrls !== data.imageUrls) {
    setLastImageUrls(data.imageUrls);
    setPrimaryIdx(0);
  }
  const cover = allImages[Math.min(primaryIdx, allImages.length - 1)];
  const progress = Math.round(data.progress ?? 0);

  const [wantWriting, setWantWriting] = useState(false);
  const [lastIsIdle, setLastIsIdle] = useState(isIdle);
  if (lastIsIdle !== isIdle) {
    setLastIsIdle(isIdle);
    if (!isIdle) setWantWriting(false);
  }

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showChoicePicker = selected && isIdle && !wantWriting;
  const showBottomPanel = selected && !isRunning && !showChoicePicker;
  const showTopToolbar = selected && isSucceeded && !!cover;

  // Loading image from uploaded file
  const onPickFile = (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) return;
    const reader = new FileReader();
    reader.onload = () => data.onSetUploadedImage?.(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div
      className={cn(
        "relative w-72 overflow-visible rounded-2xl border shadow-lg transition-all",
        selected ? "border-brand-purple/50 ring-2 ring-brand-purple/20" : "border-white/[0.14] light:border-black/[0.08]",
        "bg-[#1f1f24] light:bg-surface-card shadow-md shadow-black/25 light:shadow-black/5 backdrop-blur-xl text-primary"
      )}
    >
      <Handle
        id="image-target"
        type="target"
        position={Position.Left}
        className="!size-3.5 !border-2 !border-[#0d0d0e] !bg-white/40 transition-transform hover:!scale-125"
      />

      {/* Header — purple accent */}
      <div className="flex items-center gap-1.5 border-b border-brand-purple/20 bg-gradient-to-r from-brand-purple/15 via-brand-purple/5 to-transparent light:bg-black/[0.03] px-2 py-1.5 rounded-t-2xl">
        <ModelSelector
          models={models}
          currentId={data.modelId}
          onChange={(id) => data.onModelChange?.(id)}
        />
        <StatusBadge status={data.status} progress={progress} />
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

      {/* Result area */}
      {(isRunning || isSucceeded || isFailed) && (
        <>
          <div className="relative w-full bg-white/[0.06] light:bg-black/[0.03]" style={aspect}>
            {cover ? (
              <img
                src={imgUrl(cover)}
                alt={data.prompt}
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-brand-purple/5 via-brand-mid/5 to-brand-cyan/5" />
            )}
            {isRunning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
                <Loader2 className="size-6 animate-spin text-brand-cyan" />
                <div className="text-lg font-bold tracking-tight">{progress}%</div>
              </div>
            )}
            {isFailed && data.errorMessage && (
              <div className="absolute inset-x-2 bottom-2 rounded-lg bg-red-500/60 px-2 py-1 text-[11px] text-white">
                {data.errorMessage}
              </div>
            )}
            {allImages.length > 1 && !isRunning && (
              <div className="absolute right-2 top-2 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-mono text-white/80">
                {primaryIdx + 1}/{allImages.length}
              </div>
            )}
          </div>
          {allImages.length > 1 && !isRunning && (
            <div className="nodrag flex gap-1 border-b border-white/[0.10] bg-white/[0.05] p-1.5">
              {allImages.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPrimaryIdx(i)}
                  className={cn(
                    "relative size-12 shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
                    i === primaryIdx ? "border-brand-cyan" : "border-transparent hover:border-white/20"
                  )}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Reference image preview when idle but has upstream image */}
      {isIdle && data.inputImageUrl && (
        <div className="relative w-full bg-white/[0.06] light:bg-black/[0.03]" style={aspect}>
          <img
            src={imgUrl(data.inputImageUrl)}
            alt="参考图"
            className="absolute inset-0 h-full w-full object-cover opacity-60"
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-brand-purple/20 via-brand-mid/10 to-brand-cyan/20" />
          <div className="absolute left-2 top-2 rounded-full bg-brand-cyan/80 px-2 py-0.5 text-[10px] font-medium text-white">
            参考图
          </div>
        </div>
      )}

      {/* Body placeholder when idle */}
      {isIdle && (
        <div className="flex flex-col items-center justify-center rounded-b-2xl px-3 py-6 text-[11px] text-muted">
          {data.prompt ? (
            <span className="line-clamp-2 text-center italic">「{data.prompt}」</span>
          ) : data.upstreamPrompts?.length ? (
            data.upstreamPrompts.length === 1 ? (
              <span className="line-clamp-2 text-center leading-snug">
                <span className="text-brand-purple/60">↑</span> {data.upstreamPrompts[0]}
              </span>
            ) : (
              <span className="text-center leading-snug">
                <span className="text-brand-purple/60">↑↑</span> {data.upstreamPrompts.length} 个文本源已连接
              </span>
            )
          ) : (
            "未生成 · 选中节点开始创作"
          )}
        </div>
      )}
      {isSucceeded && (
        <div className="rounded-b-2xl px-3 py-2 text-[11px] text-muted nodrag">
          <p className="line-clamp-2 leading-snug">{data.prompt || "（无提示词）"}</p>
        </div>
      )}

      <Handle
        id="image-source"
        type="source"
        position={Position.Right}
        className="!size-3.5 !border-2 !border-[#0d0d0e] !bg-brand-purple transition-transform hover:!scale-125"
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickFile(f);
          e.target.value = "";
        }}
      />

      {/* Choice picker (idle, first time) */}
      {showChoicePicker && (
        <div className="nodrag absolute left-1/2 top-full z-[60] mt-3 flex -translate-x-1/2 items-stretch gap-2 rounded-2xl border border-white/[0.08] light:border-black/[0.08] bg-surface-overlay/[0.98] p-2 shadow-xl backdrop-blur-xl">
          <ChoiceCard
            icon={<Type className="size-5 text-brand-purple" />}
            title="文生图"
            hint="写一段提示词，由模型生成"
            onClick={() => setWantWriting(true)}
          />
          {data.inputImageUrl && (
            <ChoiceCard
              icon={<ImagePlus className="size-5 text-brand-cyan" />}
              title="图生图"
              hint="基于参考图和提示词生成新图"
              onClick={() => setWantWriting(true)}
            />
          )}
          <ChoiceCard
            icon={<UploadCloud className="size-5 text-brand-cyan" />}
            title="上传图片"
            hint="跳过生成，把现有图片放上来"
            onClick={() => fileInputRef.current?.click()}
          />
        </div>
      )}

      {/* Floating top toolbar (succeeded, selected) */}
      {showTopToolbar && (
        <div className="nodrag absolute bottom-full left-1/2 z-30 mb-3 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-white/[0.08] light:border-black/[0.08] bg-surface-overlay/[0.98] p-1 shadow-xl backdrop-blur-xl">
          <ToolBtn icon={<Maximize2 className="size-3.5" />} label="高清放大" onClick={() => {
            const u = imgUrl(cover);
            if (u) window.open(u, "_blank");
          }} />
          <ToolBtn icon={<Clapperboard className="size-3.5" />} label="送到视频" onClick={() => data.onSendToVideo?.()} />
          <ToolBtn icon={<UserPlus className="size-3.5" />} label="存为主体" onClick={() => data.onSaveAsSubject?.("subject")} />
          <div className="mx-1 h-5 w-px bg-white/[0.08]" />
          <ToolBtn icon={<Download className="size-3.5" />} label="下载" onClick={() => {
            const u = imgUrl(cover);
            if (u) { const a = document.createElement("a"); a.href = u; a.download = `spiritlens-${data.generationId || "image"}.png`; a.click(); }
          }} />
        </div>
      )}

      {/* Bottom expanded panel */}
      {showBottomPanel && (
        <ExpandedPanel
          data={data}
          cover={cover}
          isRunning={isRunning}
          model={model}
          onPromptChange={(p) => data.onPromptChange?.(p)}
          onModelChange={(m) => data.onModelChange?.(m)}
          onParamsChange={(p) => data.onParamsChange?.(p)}
          onGenerate={() => data.onGenerate?.()}
        />
      )}
    </div>
  );
}

/* ─── Sub-Components ─── */

function ModelSelector({
  models, currentId, onChange,
}: {
  models: { id: string; name: string }[];
  currentId: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = models.find((m) => m.id === currentId) ?? models[0] ?? { id: "", name: "加载中" };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="nodrag inline-flex h-6 items-center gap-1 rounded-full border border-white/[0.08] light:border-black/[0.08] bg-white/[0.08] light:bg-black/[0.05] px-2 text-[11px] hover:bg-white/[0.08] transition-colors"
      >
        <Sparkles className="size-3 text-brand-purple" />
        <span className="max-w-[100px] truncate text-primary/70">{current.name}</span>
        <ChevronDown className="size-2.5 text-muted" />
      </button>
      {open && (
        <div className="nodrag absolute left-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-surface-overlay/[0.98] shadow-xl backdrop-blur-xl">
          <div className="max-h-56 overflow-y-auto p-1">
            {models.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { onChange(m.id); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                  m.id === currentId ? "bg-white/[0.08] text-primary" : "text-secondary hover:bg-white/[0.04] light:bg-black/[0.03]"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, progress }: { status: string; progress: number }) {
  const map: Record<string, { label: string; className: string }> = {
    idle: { label: "待生成", className: "bg-white/[0.08] light:bg-black/[0.05] text-muted" },
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

function ChoiceCard({
  icon, title, hint, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-44 flex-col items-start gap-1.5 rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-white/[0.06] light:bg-black/[0.03] p-3 text-left transition-colors hover:border-brand-purple/30 hover:bg-white/[0.06]"
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-white/[0.08] light:bg-black/[0.05] transition-colors group-hover:bg-white/[0.08]">
        {icon}
      </span>
      <span className="text-[13px] font-medium text-primary/80">{title}</span>
      <span className="text-[11px] leading-snug text-muted">{hint}</span>
    </button>
  );
}

function ToolBtn({
  icon, label, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-[11px] text-secondary transition-colors hover:bg-white/[0.06] hover:text-primary/80"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/* ─── Expanded Panel ─── */

function ExpandedPanel({
  data, cover, isRunning, model, onPromptChange, onModelChange, onParamsChange, onGenerate,
}: {
  data: ImageNodeData;
  cover?: string;
  isRunning: boolean;
  model: { id: string; name: string; cost_per_unit?: number };
  onPromptChange: (p: string) => void;
  onModelChange: (id: string) => void;
  onParamsChange: (patch: Partial<ImageParams>) => void;
  onGenerate: () => void;
}) {
  const params = data.imageParams ?? { size: "1024x1024", batch: 1 as const, style: "general" };
  const batch = (params.batch ?? 1) as 1 | 2 | 3 | 4;
  const seed = params.seed;
  const negative = params.negativePrompt ?? "";
  const quality = params.quality ?? 7; // 1-10, default 7
  const totalCost = (model.cost_per_unit ?? 0) * batch;
  const expandedModels: Array<{ id: string; name: string; vendor?: string; cost_per_unit?: number }> = (data as ImageNodeData).canvasModels || [];

  // Seed lock toggle — independent UI state, initialised from params
  const [seedLocked, setSeedLocked] = useState(typeof seed === "number");

  const [modelOpen, setModelOpen] = useState(false);
  const [aspectOpen, setAspectOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [negativeOpen, setNegativeOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const open = modelOpen || aspectOpen || batchOpen || seedOpen || qualityOpen || negativeOpen;
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setModelOpen(false); setAspectOpen(false); setBatchOpen(false);
        setSeedOpen(false); setQualityOpen(false); setNegativeOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelOpen, aspectOpen, batchOpen, seedOpen, qualityOpen, negativeOpen]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onGenerate();
    }
  };

  return (
    <div
      ref={panelRef}
      className="nodrag absolute left-1/2 top-full z-30 mt-3 w-[24rem] -translate-x-1/2 rounded-2xl border border-white/[0.08] light:border-black/[0.08] bg-surface-overlay/[0.98] shadow-xl backdrop-blur-xl"
    >
      {/* Top: thumbnail + upstream text boxes */}
      <div className="flex items-start gap-2 px-3 pt-3">
        {cover ? (
          <img src={imgUrl(cover)} alt="" className="size-12 shrink-0 rounded-lg border border-white/[0.08] light:border-black/[0.08] object-cover" draggable={false} />
        ) : data.inputImageUrl ? (
          <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-brand-cyan/40">
            <img src={imgUrl(data.inputImageUrl)} alt="参考图" className="h-full w-full object-cover opacity-70" draggable={false} />
            <div className="absolute inset-x-0 bottom-0 bg-brand-cyan/80 text-center text-[7px] font-medium text-white leading-tight">
              参考
            </div>
          </div>
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/[0.08] light:border-black/[0.08] bg-white/[0.06] light:bg-black/[0.03] text-[10px] text-muted">
            未生成
          </div>
        )}
        {data.upstreamPrompts && data.upstreamPrompts.length > 0
          ? (
            <>
              {data.upstreamPrompts.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPromptChange(p)}
                  className={cn(
                    "nodrag flex size-12 shrink-0 items-center justify-center rounded-lg border text-center text-[9px] leading-tight transition-colors overflow-hidden",
                    data.prompt === p
                      ? "border-brand-purple/50 bg-brand-purple/15 text-brand-purple"
                      : "border-white/[0.08] light:border-black/[0.08] bg-white/[0.04] light:bg-black/[0.03] text-muted hover:border-brand-purple/30 hover:text-secondary"
                  )}
                  title={`来源 ${i + 1} · 点击导入`}
                >
                  <span className="line-clamp-3 px-1">{p}</span>
                </button>
              ))}
              {data.upstreamPrompts.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const merged = data.upstreamPrompts!
                      .map((t, j) => `${j + 1}. ${t}`)
                      .join('\n');
                    onPromptChange(merged);
                  }}
                  className="nodrag flex size-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-brand-purple/40 bg-brand-purple/10 text-[9px] text-brand-purple leading-tight transition-colors hover:bg-brand-purple/20"
                  title="合并全部上游文本"
                >
                  合并({data.upstreamPrompts.length})
                </button>
              )}
            </>
          )
          : (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/[0.08] light:border-black/[0.08] bg-white/[0.06] light:bg-black/[0.03] text-[10px] text-muted">
              无来源
            </div>
          )}
        <div className="flex-1" />
        {cover && (
          <button type="button" className="text-muted hover:text-secondary transition-colors" title="放大" onClick={() => window.open(imgUrl(cover), "_blank")}>
            <Maximize2 className="size-3.5" />
          </button>
        )}
      </div>

      {/* Prompt editor */}
      <div className="px-3 py-2.5">
        <textarea
          value={data.prompt}
          onChange={(e) => { e.stopPropagation(); onPromptChange(e.target.value); }}
          onKeyDown={onKey}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder={
            data.inputImageUrl && !data.prompt.trim()
              ? "基于参考图输入提示词 · 按 Enter 生成新图"
              : data.upstreamPrompts && data.upstreamPrompts.length > 1 && !data.prompt.trim()
              ? `已连接 ${data.upstreamPrompts.length} 个上游文本源 · 点击「合并」或直接输入`
              : data.upstreamPrompts && data.upstreamPrompts.length > 0 && !data.prompt.trim()
              ? "点击「导入」使用上游提示词，或直接输入"
              : "编辑提示词后按 Enter 发送即可生成"
          }
          className="nodrag nowheel min-h-24 w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-relaxed text-primary/70 placeholder:text-muted focus:outline-none focus:ring-0"
        />
      </div>

      {/* Bottom toolbar */}
      <div className="border-t border-white/[0.10] px-2 py-1.5 space-y-1.5">
        <div className="grid grid-cols-3 gap-1 justify-items-center">
        <PopChip
          open={modelOpen} setOpen={setModelOpen}
          icon={<Sparkles className="size-3 text-brand-purple" />}
          label={model.name}
        >
          <div className="w-48 p-1">
            {expandedModels.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { onModelChange(m.id); setModelOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                  m.id === data.modelId ? "bg-white/[0.08] text-primary" : "text-secondary hover:bg-white/[0.04] light:bg-black/[0.03]"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted">{m.cost_per_unit ?? "?"} cr</span>
              </button>
            ))}
          </div>
        </PopChip>

        <PopChip
          open={aspectOpen} setOpen={setAspectOpen}
          icon={<MinusSquare className="size-3" />}
          label={data.supportedSizes?.find((a) => a.value === params.size)?.label ?? params.size}
        >
          <div className="w-44 p-1">
            {(data.supportedSizes?.length ? data.supportedSizes : [{ label: params.size || "1920x1920", value: params.size || "1920x1920" }]).map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => { onParamsChange({ size: a.value }); setAspectOpen(false); }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                  params.size === a.value ? "bg-white/[0.08] text-primary" : "text-secondary hover:bg-white/[0.04] light:bg-black/[0.03]"
                )}
              >
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        </PopChip>

        <PopChip
          open={batchOpen} setOpen={setBatchOpen}
          icon={<Hash className="size-3" />}
          label={`${batch} 张`}
        >
          <div className="grid w-32 grid-cols-4 gap-1 p-2">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => { onParamsChange({ batch: n as 1 | 2 | 3 | 4 }); setBatchOpen(false); }}
                className={cn(
                  "flex h-8 items-center justify-center rounded-lg text-sm transition-colors",
                  batch === n ? "bg-brand-purple text-white" : "bg-white/[0.08] light:bg-black/[0.05] text-secondary hover:bg-white/[0.08]"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </PopChip>

        <PopChip
          open={qualityOpen} setOpen={setQualityOpen}
          icon={<Zap className="size-3" />}
          label={`画质 ${quality}`}
        >
          <div className="w-[220px] space-y-2 p-2">
            <div className="text-[10px] font-medium uppercase tracking-widest text-muted">
              画质强度 · {quality <= 3 ? "低" : quality <= 6 ? "中" : quality <= 8 ? "高" : "极致"}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted">1</span>
              <input
                type="range"
                min={1} max={10} step={1}
                value={quality}
                onChange={(e) => { e.stopPropagation(); onParamsChange({ quality: Number(e.target.value) }); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="nodrag h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/[0.08] light:bg-black/[0.06] accent-brand-purple [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-purple [&::-webkit-slider-thumb]:shadow"
              />
              <span className="text-[10px] text-muted">10</span>
            </div>
            <div className="flex justify-between">
              {[1, 3, 5, 7, 10].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onParamsChange({ quality: v })}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] transition-colors",
                    quality === v
                      ? "bg-brand-purple/20 text-brand-purple"
                      : "text-muted hover:bg-white/[0.04] light:hover:bg-black/[0.02]"
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </PopChip>

        <PopChip
          open={seedOpen} setOpen={setSeedOpen}
          icon={seedLocked && typeof seed === "number" ? <Lock className="size-3" /> : <Dice5 className="size-3" />}
          label={seedLocked && typeof seed === "number" ? `种子 ${seed}` : "随机"}
        >
          <div className="w-[280px] space-y-2 p-2">
            <div className="text-[10px] font-medium uppercase tracking-widest text-muted">
              种子 · {seedLocked && typeof seed === "number" ? "已锁定" : "可编辑"}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const newSeed = Math.floor(Math.random() * 1_000_000);
                  onParamsChange({ seed: newSeed });
                }}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs transition-colors",
                  seedLocked
                    ? "border-white/[0.04] light:border-black/[0.02] bg-white/[0.05] light:bg-black/[0.01] text-muted cursor-not-allowed"
                    : "border-white/[0.08] light:border-black/[0.08] bg-white/[0.04] light:bg-black/[0.03] text-secondary hover:bg-white/[0.08]"
                )}
                disabled={seedLocked}
                title="随机生成种子"
              >
                <Dice5 className="size-3" />
              </button>
              <input
                type="number"
                value={seed ?? ""}
                placeholder="随机"
                disabled={seedLocked}
                onChange={(e) => {
                  const v = e.target.value;
                  onParamsChange({ seed: v === "" ? undefined : Number(v) });
                }}
                onKeyDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className={cn(
                  "nodrag h-8 flex-1 min-w-0 rounded-lg border px-2 text-xs outline-none transition-colors",
                  seedLocked
                    ? "border-white/[0.04] light:border-black/[0.02] bg-white/[0.05] light:bg-black/[0.01] text-primary/50 cursor-not-allowed"
                    : "border-white/[0.08] light:border-black/[0.08] bg-white/[0.06] light:bg-black/[0.03] text-primary/70"
                )}
              />
              <button
                type="button"
                onClick={() => setSeedLocked((v) => !v)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs transition-all",
                  seedLocked
                    ? "border-brand-purple/30 bg-brand-purple/15 text-brand-purple hover:bg-brand-purple/25"
                    : "border-white/[0.08] light:border-black/[0.08] bg-white/[0.04] light:bg-black/[0.03] text-secondary hover:bg-white/[0.08]"
                )}
                title={seedLocked ? "解锁种子" : "锁定种子"}
              >
                {seedLocked
                  ? <><Lock className="size-3" />锁定</>
                  : <><Unlock className="size-3" />解锁</>}
              </button>
            </div>
          </div>
        </PopChip>

        <PopChip
          open={negativeOpen} setOpen={setNegativeOpen}
          icon={<MinusSquare className="size-3" />}
          label={negative ? `负向 ${negative.length}字` : "负向词"}
        >
          <div className="w-72 space-y-1 p-2">
            <div className="text-[10px] font-medium tracking-widest text-muted">负向提示词</div>
            <textarea
              value={negative}
              onChange={(e) => { e.stopPropagation(); onParamsChange({ negativePrompt: e.target.value }); }}
              onKeyDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="例如：低质量、模糊、多余手指"
              className="nodrag nowheel min-h-16 w-full resize-none rounded-lg border border-white/[0.08] light:border-black/[0.08] bg-white/[0.06] light:bg-black/[0.03] px-2 py-1.5 text-xs text-secondary placeholder:text-muted outline-none"
            />
          </div>
        </PopChip>

        </div>
        <div className="flex items-center justify-end gap-1">
          <span className="inline-flex h-7 items-center gap-0.5 rounded-lg px-1.5 text-[11px] text-muted">
            <Sparkles className="size-3 text-brand-purple" />
            {totalCost} cr
          </span>
          <button
            type="button"
            onClick={onGenerate}
            disabled={isRunning || (!data.prompt.trim() && !data.upstreamPrompts?.length)}
            className={cn(
              "ml-0.5 flex size-8 items-center justify-center rounded-full transition-all",
              (data.prompt.trim() || data.upstreamPrompts?.length) && !isRunning
                ? "bg-brand-purple text-white shadow hover:brightness-110 active:scale-95"
                : "bg-white/[0.08] light:bg-black/[0.05] text-muted cursor-not-allowed"
            )}
          >
            {isRunning ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function PopChip({
  open, setOpen, icon, label, children,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  icon: React.ReactNode;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[11px] text-secondary hover:bg-white/[0.06] transition-colors"
      >
        {icon}
        <span className="truncate max-w-[70px]">{label}</span>
        <ChevronDown className="size-2.5 text-muted" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 overflow-hidden rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-surface-overlay/[0.98] shadow-xl backdrop-blur-xl">
          {children}
        </div>
      )}
    </div>
  );
}
