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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import {
  getCanvasProjects,
  createCanvasProject,
  deleteCanvasProject,
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
    } catch {
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = (e?: React.FormEvent) => {
    e?.preventDefault();
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
                  className="group relative rounded-2xl border border-border-subtle hover:border-border-glow bg-surface-card flex flex-col cursor-pointer transition-all overflow-hidden min-h-[260px]"
                >
                  {/* Thumbnail area */}
                  <div className="h-32 bg-surface-elevated flex items-center justify-center overflow-hidden">
                    {proj.thumbnailUrl ? (
                      <img
                        src={proj.thumbnailUrl}
                        alt={proj.title}
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-text-muted/40">
                        <Palette className="size-8" />
                        <span className="text-[10px] font-mono">暂无预览</span>
                      </div>
                    )}
                  </div>

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

                  {/* Content */}
                  <div className="flex-1 p-5 relative flex flex-col">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(proj.id);
                      }}
                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-2 hover:bg-surface-elevated text-text-muted hover:text-red-400 transition-all rounded-xl z-10"
                      title="删除画布"
                    >
                      <Trash2 className="size-3.5" />
                    </button>

                    <div className="flex-1">
                      <h3 className="text-sm font-bold text-text-primary mb-1.5 line-clamp-1 tracking-wide">
                        {proj.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted pt-3 border-t border-border-subtle">
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
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white text-sm font-bold transition-all hover:shadow-glow-md"
                >
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
