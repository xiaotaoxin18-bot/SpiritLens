"use client";

import { useState, useRef, useEffect } from "react";
import { Save, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  prompt: string;
  onSave: (prompt: string) => void;
  onGenerate?: () => void;
  isGenerating?: boolean;
  label?: string;
  placeholder?: string;
  rows?: number;
}

export default function PromptEditor({
  prompt, onSave, onGenerate, isGenerating, label = "提示词", placeholder = "输入视觉描述...", rows = 2,
}: Props) {
  const [value, setValue] = useState(prompt);
  const [saved, setSaved] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from prop when prompt changes externally
  useEffect(() => {
    setValue(prompt);
  }, [prompt]);

  const handleChange = (v: string) => {
    setValue(v);
    setSaved(false);
    // Auto-save after 600ms debounce
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSave(v);
      setSaved(true);
    }, 600);
  };

  const handleSave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onSave(value);
    setSaved(true);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[9px] font-mono uppercase tracking-widest text-text-muted">{label}</label>
        <div className="flex items-center gap-1">
          {!saved && (
            <button onClick={handleSave} className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent-green/10 text-accent-green text-[8px] font-bold uppercase tracking-wider hover:bg-accent-green/20 transition-colors">
              <Save className="size-2.5" /> 保存
            </button>
          )}
          {onGenerate && (
            <button onClick={onGenerate} disabled={isGenerating} className="flex items-center gap-1 px-2 py-0.5 rounded bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white text-[8px] font-bold uppercase tracking-wider hover:shadow-glow-sm disabled:opacity-50 transition-all">
              {isGenerating ? <Loader2 className="size-2.5 animate-spin" /> : <Sparkles className="size-2.5" />}
              AI
            </button>
          )}
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted/30 outline-none focus:border-brand-cyan/30 transition-colors resize-none"
      />
    </div>
  );
}
