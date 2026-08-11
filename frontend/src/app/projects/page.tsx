"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Folder, Trash2, Loader2, Search, AlertTriangle, X,
  HelpCircle, Cpu, Sun, Moon, Database, ChevronRight,
  Film, Clock, Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/store/theme";
import { api } from "@/services/api";
import { useToast } from "@/components/ui/Toast";

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string | null;
  episode_count?: number;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { theme, toggle: toggleTheme } = useTheme();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !isAuthenticated) router.push("/auth/login");
  }, [mounted, isAuthenticated, router]);

  useEffect(() => {
    loadProjects();
  }, [mounted, isAuthenticated]);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: "1", page_size: "100" };
      if (search) params.q = search;
      const data = await api.get<{ total: number; projects: Project[] }>("/api/v1/projects", params);
      // Fetch episode counts for each project
      const withCounts = await Promise.all(
        (data.projects || []).map(async (p) => {
          try {
            const eps = await api.get<{ total: number }>(`/api/v1/projects/${p.id}/episodes`);
            return { ...p, episode_count: eps.total };
          } catch {
            return { ...p, episode_count: 0 };
          }
        })
      );
      setProjects(withCounts);
    } catch {
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && mounted) loadProjects();
  }, [search]);

  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const res = await api.post<{ id: string }>("/api/v1/projects", {
        name: "未命名项目",
        aspect_ratio: "16:9",
      });
      toast("项目创建成功", "success");
      router.push(`/projects/${res.id}`);
    } catch (e: any) {
      toast(e?.message || "创建失败", "error");
    } finally {
      setIsCreating(false);
    }
  };

  const confirmDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await api.delete(`/api/v1/projects/${id}`);
      setDeleteConfirmId(null);
      toast("项目已删除", "success");
      loadProjects();
    } catch (e: any) {
      toast(e?.message || "删除失败", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (ts: string | null) => {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleDateString("zh-CN", {
        year: "numeric", month: "2-digit", day: "2-digit",
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
    <div className="h-full overflow-y-auto bg-surface-base">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold text-text-primary tracking-wide">项目列表</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 px-4 py-3 border border-border-subtle text-text-tertiary hover:text-text-primary hover:border-border-glow transition-colors rounded-xl"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              <span className="font-medium text-xs tracking-widest uppercase">{theme === "dark" ? "亮色" : "暗色"}</span>
            </button>
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white hover:shadow-glow-md transition-all"
              title="返回首页"
            >
              <Home className="size-4" />
              <span className="font-bold text-xs tracking-widest uppercase">返回首页</span>
            </button>
          </div>
        </header>

        {/* Search */}
        <div className="relative max-w-md mb-6">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索项目…"
            className="w-full rounded-xl border border-border-subtle bg-surface-card py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 transition-all"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-6 text-text-muted animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {/* Create New Card */}
            <div
              onClick={handleCreate}
              className={cn(
                "group cursor-pointer rounded-2xl border-2 border-dashed border-brand-cyan/30 hover:border-brand-cyan/60 bg-brand-cyan/[0.03] hover:bg-brand-cyan/[0.08] flex flex-col items-center justify-center min-h-[280px] transition-all",
                isCreating && "opacity-60 pointer-events-none"
              )}
            >
              <div className="w-12 h-12 rounded-xl border-2 border-dashed border-brand-cyan/30 group-hover:border-brand-cyan/60 flex items-center justify-center mb-6 transition-colors">
                {isCreating ? (
                  <Loader2 className="size-5 text-brand-cyan animate-spin" />
                ) : (
                  <Plus className="size-5 text-brand-cyan/60 group-hover:text-brand-cyan" />
                )}
              </div>
              <span className="text-brand-cyan/80 font-mono text-[10px] uppercase tracking-widest group-hover:text-brand-cyan">{isCreating ? "创建中…" : "创建新项目"}</span>
            </div>

            {/* Project Cards */}
            {projects.map((proj) => (
              <div
                key={proj.id}
                onClick={() => { if (deleteConfirmId !== proj.id) router.push(`/projects/${proj.id}`); }}
                className="group relative rounded-2xl border border-border-subtle hover:border-border-glow bg-surface-card flex flex-col cursor-pointer transition-all overflow-hidden min-h-[280px]"
              >
                {deleteConfirmId === proj.id && (
                  <div
                    className="absolute inset-0 z-20 bg-surface-card flex flex-col items-center justify-center p-6 space-y-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                      <AlertTriangle className="size-5 text-red-400" />
                    </div>
                    <div className="text-center space-y-2">
                      <p className="text-text-primary font-bold text-xs uppercase tracking-widest">确认删除项目？</p>
                      <p className="text-text-muted text-[10px] font-mono">将删除所有剧集和关联数据</p>
                    </div>
                    <div className="flex gap-2 w-full pt-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                        className="flex-1 py-3 rounded-xl bg-surface-elevated text-text-muted hover:text-text-primary text-[10px] font-bold uppercase tracking-wider transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); confirmDelete(proj.id); }}
                        disabled={deletingId === proj.id}
                        className="flex-1 py-3 rounded-xl bg-red-500/10 text-red-400 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {deletingId === proj.id ? <Loader2 className="size-3 animate-spin" /> : null}
                        {deletingId === proj.id ? "删除中…" : "永久删除"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex-1 p-6 relative flex flex-col">
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(proj.id); }}
                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-2 hover:bg-surface-elevated text-text-muted hover:text-red-400 transition-all rounded-xl z-10"
                    title="删除项目"
                  >
                    <Trash2 className="size-4" />
                  </button>

                  <div className="flex-1">
                    <Folder className="size-8 text-text-muted mb-6 group-hover:text-text-tertiary transition-colors" />
                    <h3 className="text-sm font-bold text-text-primary mb-2 line-clamp-1 tracking-wide">{proj.name}</h3>
                    <div className="flex flex-wrap gap-2 mb-4">
                      <span className="text-[9px] font-mono text-text-muted border border-border-subtle px-1.5 py-0.5 rounded uppercase tracking-wider">
                        {proj.status === "completed" ? "已完结" : "进行中"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] font-mono text-text-muted pt-4 border-t border-border-subtle">
                    <span className="flex items-center gap-1">
                      <Film className="size-3" />
                      {(proj as any).episode_count ?? "-"} 集
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatDate(proj.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
