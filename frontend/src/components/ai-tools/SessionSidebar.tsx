"use client";

import { useState } from "react";
import {
  Plus, MessageSquare, Trash2, PanelLeftClose, PanelLeft,
  Image as ImageIcon, Video, Clock, Home,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Session } from "@/store/sessions";

interface Props {
  sessions: Session[];
  activeId: string | null;
  kind: "image" | "video";
  onNew: () => void;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
}

export function SessionSidebar({
  sessions, activeId, kind, onNew, onSwitch, onDelete,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();

  const filtered = sessions.filter((s) => s.kind === kind);

  return (
    <div
      className={cn(
        "flex-shrink-0 border-r border-white/[0.06] light:border-black/[0.06] bg-surface-elevated/80 backdrop-blur-xl transition-all duration-300 flex flex-col",
        collapsed ? "w-12" : "w-60",
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center border-b border-white/[0.06] light:border-black/[0.06]",
        collapsed ? "justify-center py-3" : "justify-between px-3 py-3",
      )}>
        {!collapsed && (
          <span className="text-xs font-medium text-secondary/80 tracking-wider">
            对话历史
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-muted hover:text-secondary transition-colors"
          title={collapsed ? "展开" : "收起"}
        >
          {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* New conversation */}
          <div className="px-2 pt-2 pb-1">
            <button
              onClick={onNew}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-white/[0.08] light:border-black/[0.08] px-3 py-2 text-xs text-secondary hover:bg-white/[0.05] light:hover:bg-black/[0.03] transition-colors"
            >
              <Plus className="size-3.5" />
              <span>新对话</span>
            </button>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto px-1.5 py-1 space-y-0.5">
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center">
                <MessageSquare className="size-5 text-muted mx-auto mb-2" />
                <p className="text-[11px] text-muted">暂无对话记录</p>
              </div>
            )}
            {filtered.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                active={s.id === activeId}
                onSwitch={() => onSwitch(s.id)}
                onDelete={() => onDelete(s.id)}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-white/[0.06] light:border-black/[0.06] px-3 py-2 text-[10px] text-muted">
            {filtered.length} 个对话
          </div>
        </>
      )}

      {/* Home button — always visible at the bottom */}
      <div className="mt-auto border-t border-white/[0.06] light:border-black/[0.06] px-2 py-2">
        <button
          onClick={() => router.push("/")}
          className={cn(
            "flex w-full items-center gap-2 rounded-xl text-xs font-bold transition-all shadow-sm",
            collapsed
              ? "justify-center p-2 text-white bg-gradient-to-r from-brand-purple to-brand-cyan-dim hover:brightness-110"
              : "px-3 py-2.5 text-white bg-gradient-to-r from-brand-purple to-brand-cyan-dim hover:brightness-110",
          )}
          title="返回首页"
        >
          <Home className={cn("size-4", collapsed ? "" : "shrink-0")} />
          {!collapsed && <span>返回首页</span>}
        </button>
      </div>
    </div>
  );
}

function SessionItem({
  session, active, onSwitch, onDelete,
}: {
  session: Session;
  active: boolean;
  onSwitch: () => void;
  onDelete: () => void;
}) {
  const lastGen = session.generations[session.generations.length - 1];
  const preview = lastGen?.prompt?.slice(0, 30) || session.title;
  // 显示最后一条生成记录的时间（恢复的会话创建于合并当天，不能用会话创建时间）
  const time = new Date(lastGen?.createdAt ?? session.createdAt).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const Icon = session.kind === "image" ? ImageIcon : Video;
  const successCount = session.generations.filter((g) => g.status === "succeeded").length;

  return (
    <div
      className={cn(
        "group relative flex items-start gap-2.5 rounded-xl px-3 py-2.5 cursor-pointer transition-colors",
        active
          ? "bg-brand-purple/8 light:bg-brand-purple/10"
          : "hover:bg-white/[0.04] light:hover:bg-black/[0.03]",
      )}
      onClick={onSwitch}
    >
      <span className={cn(
        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
        active ? "bg-brand-purple/15 text-brand-purple" : "bg-white/[0.05] light:bg-black/[0.04] text-muted",
      )}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn(
          "text-xs truncate",
          active ? "text-primary font-medium" : "text-secondary",
        )}>
          {preview || session.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted flex items-center gap-1">
            <Clock className="size-3" />
            {time}
          </span>
          {successCount > 0 && (
            <span className="text-[10px] text-accent-green/70">{successCount} {session.kind === "video" ? "个" : "张"}</span>
          )}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute right-1.5 top-2 hidden size-6 items-center justify-center rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 group-hover:flex transition-colors"
        title="删除"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}
