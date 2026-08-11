"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Layout,
  Trash2,
  Loader2,
  Clock,
  AlertTriangle,
  ImageDown,
  Palette,
  HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import {
  getCanvasProjects,
  createCanvasProject,
  deleteCanvasProject,
  getCanvasStorageUsage,
  type CanvasProject,
} from "@/lib/canvas-storage";
import { api } from "@/services/api";

export default function CanvasListingPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [projects, setProjects] = useState<CanvasProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [storage, setStorage] = useState({ usedMB: "0", percent: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isAuthenticated) router.push("/auth/login");
  }, [mounted, isAuthenticated, router]);

  useEffect(() => {
    if (mounted && isAuthenticated) {
      loadProjects();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, isAuthenticated]);

  const loadProjects = () => {
    setIsLoading(true);
    try {
      const list = getCanvasProjects();
      setProjects(list);
      const usage = getCanvasStorageUsage();
      setStorage({ usedMB: usage.usedMB, percent: usage.percent });
    } catch {
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (creating) return;
    setCreating(true);
    const project = createCanvasProject(projectName.trim() || undefined);
    setShowCreateDialog(false);
    setProjectName("");
    router.push(`/ai-tool/canvas/${project.id}`);
  };

  const confirmDelete = (id: string) => {
    deleteCanvasProject(id);
    setDeleteConfirmId(null);
    loadProjects();
  };

  const formatDate = (ts: string) => {
    try {
      return new Date(ts).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return "";
    }
  };

  if (!mounted || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-surface-base flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-brand-cyan" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-base">
      {/* Subtle gradient background */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 -right-40 size-96 rounded-full bg-brand-purple/[0.03] blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 size-96 rounded-full bg-brand-cyan/[0.03] blur-[120px]" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-amber to-accent-green flex items-center justify-center">
                <Layout className="size-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-text-primary tracking-wide">
                  智能画布
                </h1>
                <p className="text-sm text-text-muted mt-0.5">
                  节点式工作流 · 无限画布 · AI 融合
                </p>
              </div>
            </div>
          </div>
          {/* Storage indicator */}
          <div className="flex items-center gap-2" title={`本地存储 ${storage.usedMB} MB / ~5 MB`}>
            <HardDrive className="size-3.5 text-text-muted" />
            <div className="w-20 h-1.5 rounded-full bg-white/[0.08] light:bg-black/[0.06] overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  storage.percent > 90
                    ? "bg-red-500"
                    : storage.percent > 70
                      ? "bg-amber-500"
                      : "bg-brand-cyan"
                )}
                style={{ width: `${Math.min(100, storage.percent)}%` }}
              />
            </div>
            <span className={cn(
              "text-[10px] font-mono",
              storage.percent > 90 ? "text-red-400" : "text-text-muted"
            )}>
              {storage.usedMB}MB
            </span>
          </div>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-6 text-text-muted animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {/* Create New Card */}
              <button
                onClick={() => setShowCreateDialog(true)}
                className={cn(
                  "group relative rounded-2xl border-2 border-dashed border-border-subtle",
                  "hover:border-brand-cyan/40 hover:bg-brand-cyan/[0.02]",
                  "flex flex-col items-center justify-center min-h-[260px] transition-all cursor-pointer"
                )}
              >
                <div className="w-14 h-14 rounded-xl bg-surface-elevated border border-border-subtle flex items-center justify-center mb-4 group-hover:border-brand-cyan/30 group-hover:bg-brand-cyan/[0.05] transition-all">
                  <Plus className="size-6 text-text-muted group-hover:text-brand-cyan transition-colors" />
                </div>
                <span className="text-sm font-medium text-text-muted group-hover:text-text-secondary transition-colors">
                  新建画布
                </span>
                <span className="text-[10px] text-text-muted/60 mt-1 font-mono">
                  从空白开始创作
                </span>
              </button>

              {/* Existing Projects */}
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  onClick={() => {
                    if (deleteConfirmId !== proj.id)
                      router.push(`/ai-tool/canvas/${proj.id}`);
                  }}
                  className="group relative rounded-2xl border border-border-subtle hover:border-border-glow bg-surface-card cursor-pointer transition-all overflow-hidden"
                >
                  {/* Delete button — top-right */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(proj.id);
                    }}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all z-10"
                    title="删除画布"
                  >
                    <Trash2 className="size-3.5" />
                  </button>

                  {/* Delete overlay */}
                  {deleteConfirmId === proj.id && (
                    <div
                      className="absolute inset-0 z-20 bg-surface-card/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 space-y-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                        <AlertTriangle className="size-5 text-red-400" />
                      </div>
                      <div className="text-center space-y-2">
                        <p className="text-text-primary font-bold text-xs uppercase tracking-widest">
                          确认删除画布？
                        </p>
                        <p className="text-text-muted text-[10px] font-mono">
                          将删除所有节点和数据
                        </p>
                      </div>
                      <div className="flex gap-2 w-full pt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(null);
                          }}
                          className="flex-1 py-3 rounded-xl bg-surface-elevated text-text-muted hover:text-text-primary text-[10px] font-bold uppercase tracking-wider transition-colors"
                        >
                          取消
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDelete(proj.id);
                          }}
                          className="flex-1 py-3 rounded-xl bg-red-500/10 text-red-400 text-[10px] font-bold uppercase tracking-wider transition-colors"
                        >
                          永久删除
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Title + date */}
                  <div className="p-5 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-bold text-text-primary line-clamp-1 tracking-wide flex-1 min-w-0">
                        {proj.title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted">
                      <Clock className="size-3" />
                      <span>{formatDate(proj.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {!isLoading && projects.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-surface-elevated border border-border-subtle flex items-center justify-center mx-auto mb-4">
                  <ImageDown className="size-7 text-text-muted" />
                </div>
                <p className="text-text-muted text-sm">
                  还没有画布项目，点击上方「新建画布」开始创作
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => {
            setShowCreateDialog(false);
            setProjectName("");
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-text-primary mb-2">
              新建画布
            </h2>
            <p className="text-sm text-text-muted mb-6">
              给你的画布取个名字，或者直接创建
            </p>
            <form onSubmit={handleCreate}>
              <input
                autoFocus
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="画布名称（可选）"
                className="w-full rounded-xl border border-border-subtle bg-surface-elevated px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 transition-all mb-6"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateDialog(false);
                    setProjectName("");
                  }}
                  className="flex-1 py-3 rounded-xl border border-border-subtle text-text-muted hover:text-text-primary text-sm font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex flex-1 items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white text-sm font-bold transition-all hover:shadow-glow-md disabled:opacity-60"
                >
                  {creating && <Loader2 className="size-4 animate-spin" />}
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
