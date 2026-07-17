"use client";

import { useState } from "react";
import { X, Sparkles, Loader2 } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
  title: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showAIGenerate?: boolean;
  onAIGenerate?: () => void;
  isAIGenerating?: boolean;
  rows?: number;
}

export default function EditModal({
  isOpen, onClose, onSave, title, value, onChange,
  placeholder, showAIGenerate, onAIGenerate, isAIGenerating, rows = 5,
}: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-card border border-border-subtle rounded-2xl max-w-xl w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h3 className="text-sm font-bold text-text-primary">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            placeholder={placeholder}
            className="w-full bg-surface-elevated border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/30 outline-none focus:border-brand-cyan/30 transition-colors resize-none"
          />
          <div className="flex items-center justify-between mt-4">
            <div>
              {showAIGenerate && (
                <button
                  onClick={onAIGenerate}
                  disabled={isAIGenerating}
                  className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white text-[10px] font-bold uppercase tracking-wider hover:shadow-glow-sm disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {isAIGenerating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                  AI 生成建议
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-surface-elevated text-text-muted hover:text-text-primary text-xs font-bold border border-border-subtle transition-all">
                取消
              </button>
              <button onClick={() => onSave(value)} className="px-4 py-1.5 rounded-lg bg-brand-cyan/10 text-brand-cyan text-xs font-bold border border-brand-cyan/30 hover:bg-brand-cyan/20 transition-all">
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
