"use client";

import { useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { UploadCloud, Trash2, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasNodeData } from "../types";

type UploadNodeData = CanvasNodeData & {
  onDelete?: () => void;
  onSetUploadedImage?: (url: string) => void;
  upstreamImageUrls?: string[];
};

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

export function UploadNode({ data: rawData, selected }: NodeProps) {
  const data = rawData as unknown as UploadNodeData;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const cover = data.imageUrls?.[0] ?? data.upstreamImageUrls?.[0];
  const hasImage = !!cover;

  const onPickFile = (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) return;
    const reader = new FileReader();
    reader.onload = () => data.onSetUploadedImage?.(reader.result as string);
    reader.readAsDataURL(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (f) onPickFile(f);
  };

  return (
    <div
      className={cn(
        "relative w-72 overflow-visible rounded-2xl border shadow-lg transition-all",
        selected
          ? "border-brand-purple/50 ring-2 ring-brand-purple/20"
          : "border-white/[0.14] light:border-black/[0.08]",
        "bg-[#1f1f24] light:bg-surface-card shadow-md shadow-black/25 light:shadow-black/5 backdrop-blur-xl text-primary",
      )}
    >
      <Handle
        id="upload-target"
        type="target"
        position={Position.Left}
        className="!size-3.5 !border-2 !border-[#0d0d0e] !bg-white/40 transition-transform hover:!scale-125"
      />

      {/* Header — cyan accent */}
      <div className="flex items-center gap-1.5 border-b border-brand-cyan/20 bg-gradient-to-r from-brand-cyan/15 via-brand-cyan/5 to-transparent light:bg-black/[0.03] px-2 py-1.5 rounded-t-2xl">
        <ImagePlus className="size-3.5 text-brand-cyan" />
        <span className="text-[11px] font-medium text-primary/70">上传图片</span>
        <div className="flex-1" />
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            hasImage
              ? "bg-accent-green/10 text-accent-green"
              : "bg-white/[0.05] light:bg-black/[0.04] text-muted",
          )}
        >
          {hasImage ? "已上传" : "待上传"}
        </span>
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

      {/* Image area */}
      <div
        className="relative aspect-square w-full bg-white/[0.06] light:bg-black/[0.03]"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {cover ? (
          <img
            src={cover}
            alt="上传的图片"
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="nodrag absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted hover:bg-white/[0.04] light:hover:bg-black/[0.02] transition-colors group"
          >
            <UploadCloud className="size-8 opacity-30 group-hover:opacity-60 transition-opacity" />
            <span className="text-[11px]">点击或拖拽上传</span>
            <span className="text-[10px] opacity-50">PNG / JPG / WebP ≤ 20MB</span>
          </button>
        )}
      </div>

      {/* Bottom info */}
      <div className="rounded-b-2xl px-3 py-2 text-[11px] text-muted">
        {cover ? (
          <p className="line-clamp-1">已上传 · 可连接到下游节点</p>
        ) : data.upstreamImageUrls?.length ? (
          <p className="line-clamp-1">
            <span className="text-brand-purple/60">↑</span> 上游图片已传入
          </p>
        ) : (
          <p className="line-clamp-1">上传图片后连接到下游</p>
        )}
      </div>

      <Handle
        id="upload-source"
        type="source"
        position={Position.Right}
        className="!size-3.5 !border-2 !border-[#0d0d0e] !bg-brand-cyan transition-transform hover:!scale-125"
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
    </div>
  );
}
