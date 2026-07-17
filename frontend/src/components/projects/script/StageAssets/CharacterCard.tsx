"use client";

import { useState, useRef } from "react";
import {
  User, Check, Shirt, Trash2, Edit2, AlertCircle, Grid3x3, Upload,
  ImageIcon, Sparkles, Loader2, FolderPlus, Link2, X,
} from "lucide-react";
import { cn, resolveImageUrl } from "@/lib/utils";
import InlineEditableText from "./InlineEditableText";
import PromptEditor from "./PromptEditor";
import ImageUploadButton from "./ImageUploadButton";

interface CharacterData {
  id?: string;
  name: string;
  gender?: string;
  age?: string;
  personality?: string;
  description?: string;
  image_url?: string;
  shapeRefImage?: string;
  prompt?: string;
  is_linked?: boolean;
  libraryId?: string;
  variations?: number;
  turnaround_status?: string;
  status?: string;
}

interface Props {
  character: CharacterData;
  isGenerating: boolean;
  onUpload: (file: File) => void;
  onUploadShapeRef: (file: File) => void;
  onClearShapeRef: () => void;
  onPromptSave: (prompt: string) => void;
  onGenerate: () => void;
  onVariations: () => void;
  onTurnaround: () => void;
  onImageClick: (url: string) => void;
  onDelete: () => void;
  onUpdateInfo: (updates: Partial<CharacterData>) => void;
  onSaveToLibrary: () => void;
  onReplaceFromLibrary: () => void;
}

export default function CharacterCard({
  character, isGenerating, onUpload, onUploadShapeRef, onClearShapeRef,
  onPromptSave, onGenerate, onVariations, onTurnaround, onImageClick, onDelete, onUpdateInfo, onSaveToLibrary,
  onReplaceFromLibrary,
}: Props) {
  const isLinked = !!character.libraryId;
  const hasImage = !!character.image_url;

  return (
    <div className={cn(
      "rounded-2xl border overflow-hidden flex flex-col transition-all",
      isLinked
        ? "border-brand-cyan/30 bg-surface-card"
        : "border-border-subtle bg-surface-card hover:border-border-glow"
    )}>
      {/* Library badge */}
      {isLinked && (
        <div className="px-4 py-1.5 bg-brand-cyan/5 border-b border-brand-cyan/20 flex items-center gap-1.5">
          <Link2 className="size-3 text-brand-cyan" />
          <span className="text-[9px] font-mono text-brand-cyan uppercase tracking-widest">项目角色</span>
        </div>
      )}

      <div className="flex gap-4 p-4 pb-0">
        {/* Image */}
        <div className="w-44 shrink-0">
          <div
            className="aspect-[4/3] bg-surface-elevated rounded-xl overflow-hidden relative cursor-pointer group/image"
            onClick={() => hasImage && onImageClick(character.image_url!)}
          >
            {hasImage ? (
              <>
                <img src={resolveImageUrl(character.image_url)} alt={character.name} className="w-full h-full object-cover" />
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
              <div className="w-full h-full flex flex-col items-center justify-center text-text-muted p-4 text-center gap-2">
                {character.status === "failed" ? (
                  <>
                    <AlertCircle className="size-8 text-red-400" />
                    <span className="text-[10px] text-red-400">生成失败</span>
                    <ImageUploadButton onUpload={onUpload} onGenerate={onGenerate} isGenerating={isGenerating} uploadLabel="上传" generateLabel="重试" />
                  </>
                ) : (
                  <>
                    <User className="size-8 opacity-10" />
                    <ImageUploadButton onUpload={onUpload} onGenerate={onGenerate} isGenerating={isGenerating} uploadLabel="上传" generateLabel="生成" />
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 flex flex-col min-w-0 gap-2">
          <div>
            <InlineEditableText
              value={character.name}
              onSave={(v) => onUpdateInfo({ name: v })}
              className="text-base font-bold text-text-primary"
              inputClassName="font-bold text-sm w-full"
            />
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <InlineEditableText
                value={character.gender || ""}
                onSave={(v) => onUpdateInfo({ gender: v })}
                className="text-[10px] font-mono text-text-muted bg-surface-elevated px-2 py-0.5 rounded"
                inputClassName="w-16 text-[10px]"
                placeholder="性别"
              />
              <InlineEditableText
                value={character.age || ""}
                onSave={(v) => onUpdateInfo({ age: v })}
                className="text-[10px] font-mono text-text-muted bg-surface-elevated px-2 py-0.5 rounded"
                inputClassName="w-16 text-[10px]"
                placeholder="年龄"
              />
              {character.personality && (
                <span className="text-[10px] font-mono text-text-muted bg-surface-elevated px-2 py-0.5 rounded">{character.personality}</span>
              )}
            </div>
          </div>

          {/* Description */}
          {character.description && (
            <p className="text-[11px] text-text-secondary leading-relaxed">{character.description}</p>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-1.5 mt-1">
            <button
              onClick={onVariations}
              disabled={isGenerating}
              className="w-full py-1.5 rounded-lg bg-surface-elevated text-text-muted hover:text-text-primary text-[9px] font-bold uppercase tracking-wider border border-border-subtle hover:border-border-glow transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <Shirt className="size-3" />
              服装变体
            </button>
            <button
              onClick={onTurnaround}
              disabled={isGenerating}
              className={cn(
                "w-full py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all flex items-center justify-center gap-1.5 disabled:opacity-40",
                character.turnaround_status === "completed"
                  ? "bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30"
                  : "bg-surface-elevated text-text-muted hover:text-text-primary border-border-subtle hover:border-border-glow"
              )}>
              <Grid3x3 className="size-3" />
              造型九宫格
              {character.turnaround_status === "completed" && <Check className="size-2.5" />}
            </button>
            {hasImage && (
              <ImageUploadButton onUpload={onUpload} isGenerating={isGenerating} variant="separate" uploadLabel="上传" />
            )}
            <button
              onClick={onReplaceFromLibrary}
              disabled={isGenerating}
              className="w-full py-1.5 rounded-lg bg-surface-elevated text-text-muted hover:text-text-primary text-[9px] font-bold uppercase tracking-wider border border-border-subtle hover:border-border-glow transition-all disabled:opacity-30 flex items-center justify-center gap-1.5"
            >
              <FolderPlus className="size-3" />
              从资产库替换
            </button>
          </div>
        </div>
      </div>

      {/* Prompt + Bottom */}
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex-1 mb-3">
          <PromptEditor prompt={character.prompt || ""} onSave={onPromptSave} label="角色提示词" placeholder="输入角色的视觉描述..." />
        </div>

        {/* Shape reference */}
        <div className="mb-3 border border-border-subtle rounded-xl p-2.5 bg-surface-elevated/30">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider">角色参考图</span>
            {character.shapeRefImage && (
              <button onClick={onClearShapeRef} className="text-text-muted hover:text-text-primary" title="清除参考图"><X className="size-3" /></button>
            )}
          </div>
          <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-surface-elevated border border-border-subtle text-[9px] font-bold uppercase tracking-wider text-text-muted hover:text-text-primary cursor-pointer transition-colors">
            <Upload className="size-3" />
            上传角色参考图
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadShapeRef(f); }} />
          </label>
          <p className="text-[9px] text-text-muted/60 mt-1">仅参考角色外形，风格遵循剧本</p>
          {character.shapeRefImage && (
            <img src={resolveImageUrl(character.shapeRefImage)} alt="ref" className="mt-2 w-16 h-16 rounded object-cover cursor-pointer" onClick={() => onImageClick(character.shapeRefImage!)} />
          )}
        </div>

        {/* Save to library */}
        <button
          onClick={onSaveToLibrary}
          disabled={isGenerating}
          className="w-full py-2 rounded-lg bg-surface-elevated text-text-muted hover:text-text-primary border border-border-subtle text-[9px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:border-border-glow disabled:opacity-30"
        >
          <FolderPlus className="size-3" />
          加入资产库
        </button>

        {/* Delete */}
        <button
          onClick={onDelete}
          disabled={isGenerating}
          className="w-full py-2 mt-2 rounded-lg bg-transparent text-red-400 hover:bg-red-500/10 border border-red-500/20 text-[9px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-30"
        >
          <Trash2 className="size-3" />
          删除角色
        </button>
      </div>
    </div>
  );
}
