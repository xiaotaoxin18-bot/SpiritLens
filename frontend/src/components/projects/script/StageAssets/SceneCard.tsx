"use client";

import { useState } from "react";
import { MapPin, Check, Trash2, AlertCircle, Upload, ImageIcon, Loader2, Sparkles, FolderPlus, X } from "lucide-react";
import { cn, resolveImageUrl } from "@/lib/utils";
import InlineEditableText from "./InlineEditableText";
import PromptEditor from "./PromptEditor";
import ImageUploadButton from "./ImageUploadButton";

interface SceneData {
  id?: string;
  name: string;
  location?: string;
  time?: string;
  atmosphere?: string;
  description?: string;
  image_url?: string;
  shapeRefImage?: string;
  prompt?: string;
  status?: string;
}

interface Props {
  scene: SceneData;
  isGenerating: boolean;
  onUpload: (file: File) => void;
  onUploadShapeRef: (file: File) => void;
  onClearShapeRef: () => void;
  onPromptSave: (prompt: string) => void;
  onGenerate: () => void;
  onImageClick: (url: string) => void;
  onDelete: () => void;
  onUpdateInfo: (updates: Partial<SceneData>) => void;
  onSaveToLibrary: () => void;
}

export default function SceneCard({
  scene, isGenerating, onUpload, onUploadShapeRef, onClearShapeRef,
  onPromptSave, onGenerate, onImageClick, onDelete, onUpdateInfo, onSaveToLibrary,
}: Props) {
  const hasImage = !!scene.image_url;

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-card overflow-hidden flex flex-col hover:border-border-glow transition-all">
      <div className="relative aspect-video bg-surface-elevated cursor-pointer group/image"
        onClick={() => hasImage && onImageClick(scene.image_url!)}
      >
        {hasImage ? (
          <>
            <img src={resolveImageUrl(scene.image_url)} alt={scene.name} className="w-full h-full object-cover" />
            <div className="absolute top-2 right-2 p-1 bg-accent-green rounded-full shadow"><Check className="size-3 text-white" /></div>
            <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/50 transition-all flex items-center justify-center gap-2">
              <label className="hidden group-hover/image:flex cursor-pointer px-3 py-1.5 rounded-lg bg-white/20 text-white text-[10px] backdrop-blur-sm hover:bg-white/30 transition-all gap-1.5 items-center">
                <Upload className="size-3" /> 更换 <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
              </label>
              <button
                onClick={(e) => { e.stopPropagation(); onGenerate(); }}
                disabled={isGenerating}
                className="hidden group-hover/image:flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/20 text-white text-[10px] backdrop-blur-sm hover:bg-white/30 transition-all disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                重新生成
              </button>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-text-muted p-4 text-center gap-2">
            <MapPin className="size-8 opacity-20" />
            <ImageUploadButton onUpload={onUpload} onGenerate={onGenerate} isGenerating={isGenerating} uploadLabel="上传" generateLabel="生成" />
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <InlineEditableText value={scene.name} onSave={(v) => onUpdateInfo({ name: v })} className="text-sm font-bold text-text-primary" inputClassName="font-bold text-sm" />
            <div className="flex flex-wrap gap-1.5 mt-1">
              <InlineEditableText value={scene.time || ""} onSave={(v) => onUpdateInfo({ time: v })} className="text-[10px] font-mono text-text-muted bg-surface-elevated px-2 py-0.5 rounded" inputClassName="w-16 text-[10px]" placeholder="时间" />
              <InlineEditableText value={scene.location || ""} onSave={(v) => onUpdateInfo({ location: v })} className="text-[10px] font-mono text-text-muted bg-surface-elevated px-2 py-0.5 rounded" inputClassName="w-24 text-[10px]" placeholder="地点" />
            </div>
          </div>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
        </div>

        <textarea
          value={scene.atmosphere || scene.description || ""}
          onChange={(e) => onUpdateInfo({ atmosphere: e.target.value })}
          rows={2}
          placeholder="氛围描述..."
          className="w-full bg-transparent text-xs text-text-secondary placeholder:text-text-muted/30 outline-none resize-none border border-transparent focus:border-brand-cyan/20 rounded-lg px-2 py-1 transition-colors"
        />

        <PromptEditor prompt={scene.prompt || ""} onSave={onPromptSave} label="场景提示词" placeholder="输入场景视觉描述..." />

        {/* Shape ref */}
        <div className="border border-border-subtle rounded-xl p-2.5 bg-surface-elevated/30">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider">场景参考图</span>
            {scene.shapeRefImage && <button onClick={onClearShapeRef} className="text-text-muted hover:text-text-primary"><X className="size-3" /></button>}
          </div>
          <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-surface-elevated border border-border-subtle text-[9px] font-bold uppercase tracking-wider text-text-muted hover:text-text-primary cursor-pointer transition-colors">
            <Upload className="size-3" /> 上传参考图
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadShapeRef(f); }} />
          </label>
          {scene.shapeRefImage && <img src={resolveImageUrl(scene.shapeRefImage)} alt="ref" className="mt-2 w-16 h-16 rounded object-cover cursor-pointer" onClick={() => onImageClick(scene.shapeRefImage!)} />}
        </div>

        <button onClick={onSaveToLibrary} className="w-full py-2 rounded-lg bg-surface-elevated text-text-muted hover:text-text-primary border border-border-subtle text-[9px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:border-border-glow">
          <FolderPlus className="size-3" /> 加入资产库
        </button>
      </div>
    </div>
  );
}
