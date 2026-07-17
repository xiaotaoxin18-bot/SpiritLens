"use client";

import { useState, useRef, useEffect } from "react";
import { Edit2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}

export default function InlineEditableText({ value, onSave, className, inputClassName, placeholder }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleSave = () => {
    onSave(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
          className={cn("bg-surface-elevated border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-brand-cyan/50", inputClassName)}
          placeholder={placeholder}
        />
        <button onClick={handleSave} className="p-1 text-accent-green hover:bg-accent-green/10 rounded"><Check className="size-3" /></button>
        <button onClick={handleCancel} className="p-1 text-text-muted hover:bg-surface-light rounded"><X className="size-3" /></button>
      </div>
    );
  }

  return (
    <div className={cn("group inline-flex items-center gap-1", className)}>
      <span className="cursor-default">{value || placeholder}</span>
      <button onClick={() => { setDraft(value); setEditing(true); }} className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-primary transition-all">
        <Edit2 className="size-3" />
      </button>
    </div>
  );
}
