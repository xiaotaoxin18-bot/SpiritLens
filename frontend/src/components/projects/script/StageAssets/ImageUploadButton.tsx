"use client";

import { Loader2, Upload, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onUpload?: (file: File) => void;
  onGenerate?: () => void;
  isGenerating?: boolean;
  hasImage?: boolean;
  uploadLabel?: string;
  generateLabel?: string;
  size?: "small" | "normal";
  variant?: "inline" | "separate";
}

export default function ImageUploadButton({
  onUpload,
  onGenerate,
  isGenerating,
  hasImage,
  uploadLabel = "上传",
  generateLabel = "生成",
  size = "small",
  variant = "inline",
}: Props) {
  return (
    <div className={cn("flex gap-1.5", variant === "separate" && "flex-col")}>
      {onUpload && (
        <label className={cn(
          "flex items-center justify-center gap-1.5 rounded-lg border transition-all cursor-pointer",
          size === "small" ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[10px]",
          "bg-surface-elevated border-border-subtle text-text-muted hover:text-text-primary hover:border-border-glow font-bold uppercase tracking-wider"
        )}>
          <Upload className={size === "small" ? "size-3" : "size-3.5"} />
          {uploadLabel}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
        </label>
      )}
      {onGenerate && (
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg border transition-all",
            size === "small" ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[10px]",
            "bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white font-bold uppercase tracking-wider hover:shadow-glow-sm disabled:opacity-50"
          )}
        >
          {isGenerating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
          {isGenerating ? "生成中" : generateLabel}
        </button>
      )}
    </div>
  );
}
