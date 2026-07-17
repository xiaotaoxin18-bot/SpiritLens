"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Type, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasNodeData } from "../types";

type TextNodeData = CanvasNodeData & {
  onTextChange?: (text: string) => void;
  onDelete?: () => void;
};

export function TextNode({ data: rawData, selected }: NodeProps) {
  const data = rawData as unknown as TextNodeData;

  return (
    <div
      className={cn(
        "w-72 overflow-visible rounded-2xl border shadow-lg transition-all",
        selected
          ? "border-brand-cyan/50 ring-2 ring-brand-cyan/20"
          : "border-white/[0.14] light:border-black/[0.08]",
        "bg-[#1f1f24] light:bg-surface-card shadow-md shadow-black/25 light:shadow-black/5 backdrop-blur-xl text-primary"
      )}
    >
      <Handle
        id="text-target"
        type="target"
        position={Position.Left}
        className="!size-3.5 !border-2 !border-[#0d0d0e] !bg-white/40 transition-transform hover:!scale-125"
      />

      {/* Header — cyan accent */}
      <div className="flex items-center gap-1.5 border-b border-brand-cyan/20 bg-gradient-to-r from-brand-cyan/15 via-brand-cyan/5 to-transparent light:bg-black/[0.03] px-3 py-2 rounded-t-2xl">
        <span className="flex size-6 items-center justify-center rounded-md bg-white/[0.12]">
          <Type className="size-3.5 text-brand-cyan" />
        </span>
        <span className="text-[11px] font-medium text-secondary">文本</span>
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

      {/* Body */}
      <div className="px-3 py-2.5 nodrag">
        <textarea
          value={data.prompt}
          onChange={(e) => {
            e.stopPropagation();
            data.onTextChange?.(e.target.value);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder="脚本 / 提示词模板"
          className="nodrag nowheel min-h-24 w-full resize-none border-0 bg-transparent p-0 text-[12px] leading-snug text-primary/70 placeholder:text-muted focus:outline-none focus:ring-0"
        />
      </div>

      <Handle
        id="text-source"
        type="source"
        position={Position.Right}
        className="!size-3.5 !border-2 !border-[#0d0d0e] !bg-brand-cyan/60 transition-transform hover:!scale-125"
      />
    </div>
  );
}
