"use client";

import { Package, Check, Trash2, AlertCircle, Upload, ImageIcon, Loader2, Sparkles, FolderPlus, X } from "lucide-react";
import { cn, resolveImageUrl } from "@/lib/utils";
import InlineEditableText from "./InlineEditableText";
import PromptEditor from "./PromptEditor";
import ImageUploadButton from "./ImageUploadButton";

interface PropData {
  id?: string;
  name: string;
  category?: string;
  description?: string;
  image_url?: string;
  prompt?: string;
  status?: string;
}

interface Props {
  prop: PropData;
  isGenerating: boolean;
  onUpload: (file: File) => void;
  onPromptSave: (prompt: string) => void;
  onGenerate: () => void;
  onImageClick: (url: string) => void;
  onDelete: () => void;
  onUpdateInfo: (updates: Partial<PropData>) => void;
  onSaveToLibrary: () => void;
}

const PROP_CATEGORIES = ["武器", "文件/书信", "食物/饮品", "交通工具", "装饰品", "科技设备", "自然物品", "其他"];

export default function PropCard({
  prop, isGenerating, onUpload, onPromptSave, onGenerate, onImageClick, onDelete, onUpdateInfo, onSaveToLibrary,
}: Props) {
  const hasImage = !!prop.image_url;

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-card overflow-hidden flex flex-col hover:border-border-glow transition-all">
      <div className="flex gap-4 p-4">
        <div className="w-36 shrink-0">
          <div className="aspect-square bg-surface-elevated rounded-xl overflow-hidden relative cursor-pointer group/image"
            onClick={() => hasImage && onImageClick(prop.image_url!)}
          >
            {hasImage ? (
              <>
                <img src={resolveImageUrl(prop.image_url)} alt={prop.name} className="w-full h-full object-cover" />
                <div className="absolute top-1.5 right-1.5 p-1 bg-accent-green rounded-full shadow"><Check className="size-3 text-white" /></div>
                {/* Hover overlay for regenerate */}
                <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/50 transition-all flex items-center justify-center gap-2">
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
              <div className="w-full h-full flex flex-col items-center justify-center text-text-muted p-2 text-center gap-2">
                <Package className="size-6 opacity-20" />
                <ImageUploadButton onUpload={onUpload} onGenerate={onGenerate} isGenerating={isGenerating} size="small" />
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <InlineEditableText value={prop.name} onSave={(v) => onUpdateInfo({ name: v })} className="text-sm font-bold text-text-primary" inputClassName="font-bold text-sm" />
              <select
                value={prop.category || ""}
                onChange={(e) => onUpdateInfo({ category: e.target.value })}
                className="mt-1 text-[10px] font-mono text-text-muted bg-surface-elevated border border-border-subtle rounded px-1.5 py-0.5 outline-none focus:border-brand-cyan/30"
              >
                <option value="">选择分类</option>
                {PROP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button onClick={onDelete} className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
          </div>

          <textarea
            value={prop.description || ""}
            onChange={(e) => onUpdateInfo({ description: e.target.value })}
            rows={2}
            placeholder="道具描述..."
            className="w-full bg-transparent text-xs text-text-secondary placeholder:text-text-muted/30 outline-none resize-none border border-transparent focus:border-brand-cyan/20 rounded-lg px-2 py-1 transition-colors"
          />

          <PromptEditor prompt={prop.prompt || ""} onSave={onPromptSave} label="道具提示词" placeholder="输入道具视觉描述..." />

          <button onClick={onSaveToLibrary} className="w-full py-2 rounded-lg bg-surface-elevated text-text-muted hover:text-text-primary border border-border-subtle text-[9px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:border-border-glow">
            <FolderPlus className="size-3" /> 加入资产库
          </button>
        </div>
      </div>
    </div>
  );
}
