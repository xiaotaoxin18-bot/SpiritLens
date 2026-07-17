"use client";

import { ImageIcon, Clapperboard, Type, ImagePlus, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AddNodeAction, TemplateId } from "./types";

interface Props {
  onPick: (action: AddNodeAction) => void;
  className?: string;
}

interface NodeOption {
  kind: AddNodeAction["kind"];
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "node" | "asset";
  badge?: string;
}

const OPTIONS: NodeOption[] = [
  { kind: "image", label: "图像", hint: "用提示词生成一张或多张图像", icon: ImageIcon, group: "node" },
  { kind: "video", label: "视频", hint: "从一张静帧延展成短视频", icon: Clapperboard, group: "node" },
  { kind: "text", label: "文本", hint: "脚本 / 提示词模板", icon: Type, group: "node" },
  { kind: "upload", label: "上传图片", hint: "把现有图作为参考放到画布", icon: ImagePlus, group: "asset" },
];

const TEMPLATES: Array<{
  id: TemplateId;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "text-to-image", label: "文生图", hint: "1 个图像节点", icon: ImageIcon },
  { id: "image-to-video", label: "图生视频", hint: "图像 → 视频 已连好", icon: Clapperboard },
  { id: "text-to-video", label: "文字生视频", hint: "文本 → 图像 → 视频 链", icon: Wand2 },
];

export function AddNodePanel({ onPick, className }: Props) {
  const nodeOptions = OPTIONS.filter((o) => o.group === "node");
  const assetOptions = OPTIONS.filter((o) => o.group === "asset");

  return (
    <div
      className={cn(
        "w-64 overflow-hidden rounded-2xl border border-white/[0.08] light:border-black/[0.08] bg-surface-overlay/[0.98] shadow-2xl backdrop-blur-xl",
        className,
      )}
    >
      <div className="px-3 pt-3 pb-1 text-[11px] font-medium tracking-widest text-muted">
        添加节点
      </div>
      <div className="space-y-0.5 px-1.5 pb-2">
        {nodeOptions.map((o) => (
          <PanelRow
            key={o.kind}
            icon={o.icon}
            label={o.label}
            hint={o.hint}
            badge={o.badge}
            onClick={() => onPick({ kind: o.kind } as AddNodeAction)}
          />
        ))}
      </div>

      <div className="border-t border-white/[0.06]" />

      <div className="px-3 pt-3 pb-1 text-[11px] font-medium tracking-widest text-muted">
        添加资源
      </div>
      <div className="space-y-0.5 px-1.5 pb-2">
        {assetOptions.map((o) => (
          <PanelRow
            key={o.kind}
            icon={o.icon}
            label={o.label}
            hint={o.hint}
            onClick={() => onPick({ kind: o.kind } as AddNodeAction)}
          />
        ))}
      </div>

      <div className="border-t border-white/[0.06]" />

      <div className="px-3 pt-3 pb-1 text-[11px] font-medium tracking-widest text-muted">
        快捷模板
      </div>
      <div className="space-y-0.5 px-1.5 pb-2">
        {TEMPLATES.map((t) => (
          <PanelRow
            key={t.id}
            icon={t.icon}
            label={t.label}
            hint={t.hint}
            onClick={() => onPick({ kind: "template", templateId: t.id })}
          />
        ))}
      </div>
    </div>
  );
}

function PanelRow({
  icon: Icon, label, hint, badge, onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06]"
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] light:bg-black/[0.04] text-secondary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] font-medium leading-tight text-primary/80">
          {label}
          {badge && (
            <span className="rounded bg-brand-purple/20 px-1 text-[9px] font-medium text-brand-purple">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted">{hint}</span>
      </span>
    </button>
  );
}
