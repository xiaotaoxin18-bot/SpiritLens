"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Plus, Film, Trash2, Edit2, Check, X,
  Loader2, FolderOpen, ChevronRight, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";

interface Project {
  id: string;
  name: string;
  status: string;
}

interface Season {
  id: string;
  project_id: string;
  title: string;
  sort_order: number;
}

interface Episode {
  id: string;
  project_id: string;
  season_id: string | null;
  episode_number: number;
  title: string;
  status: string;
  script_content: string | null;
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolved = use(params);
  const navigate = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [allSeries, setAllSeries] = useState<Season[]>([]);
  const [allEpisodes, setAllEpisodes] = useState<Episode[]>([]);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [newSeriesName, setNewSeriesName] = useState("");
  const [showNewSeries, setShowNewSeries] = useState(false);
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set());

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !isAuthenticated) navigate.push("/auth/login");
  }, [mounted, isAuthenticated, navigate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [proj, seriesData, epsData] = await Promise.all([
        api.get<Project>(`/api/v1/projects/${resolved.id}`),
        api.get<{ total: number; seasons: Season[] }>(`/api/v1/projects/${resolved.id}/seasons`),
        api.get<{ total: number; episodes: Episode[] }>(`/api/v1/projects/${resolved.id}/episodes`),
      ]);
      setProject(proj);
      setAllSeries(seriesData.seasons);
      setAllEpisodes(epsData.episodes);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [resolved.id]);

  useEffect(() => {
    if (isAuthenticated && mounted) loadData();
  }, [loadData, isAuthenticated, mounted]);

  const getEpisodesForSeries = (seriesId: string) =>
    allEpisodes.filter((e) => e.season_id === seriesId);

  const handleSaveTitle = async () => {
    if (titleDraft.trim()) {
      try {
        await api.put(`/api/v1/projects/${resolved.id}`, { name: titleDraft.trim() });
        setProject((prev) => prev ? { ...prev, name: titleDraft.trim() } : prev);
      } catch { /* ignore */ }
    }
    setEditingTitle(false);
  };

  const handleCreateSeries = async () => {
    if (!newSeriesName.trim()) return;
    try {
      await api.post(`/api/v1/projects/${resolved.id}/seasons`, {
        title: newSeriesName.trim(),
        sort_order: allSeries.length,
      });
      setNewSeriesName("");
      setShowNewSeries(false);
      loadData();
      setExpandedSeries((prev) => new Set(prev));
    } catch { /* ignore */ }
  };

  const handleCreateEpisode = async (seriesId: string) => {
    const episodes = getEpisodesForSeries(seriesId);
    try {
      await api.post(`/api/v1/projects/${resolved.id}/episodes`, {
        episode_number: episodes.length + 1,
        title: `第${episodes.length + 1}集`,
        season_id: seriesId,
      });
      loadData();
    } catch { /* ignore */ }
  };

  const handleDeleteSeries = async (id: string) => {
    try {
      await api.delete(`/api/v1/projects/${resolved.id}/seasons/${id}`);
      loadData();
    } catch { /* ignore */ }
  };

  const handleDeleteEpisode = async (id: string) => {
    try {
      await api.delete(`/api/v1/projects/${resolved.id}/episodes/${id}`);
      loadData();
    } catch { /* ignore */ }
  };

  const toggleSeries = (id: string) => {
    setExpandedSeries((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const formatDate = (ts: string | null) => {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
    } catch { return ""; }
  };

  const firstSeries = allSeries[0];
  const firstEpisode = firstSeries ? getEpisodesForSeries(firstSeries.id)[0] : null;

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-surface-base flex items-center justify-center">
        <Loader2 className="size-6 text-text-muted animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-base">
      {/* Top bar */}
      <div className="border-b border-border-subtle bg-surface-card">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link href="/projects" className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-text-muted hover:text-text-primary transition-colors">
              <ChevronLeft className="size-3" />
              返回项目列表
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {firstEpisode && (
              <button
                onClick={() => navigate.push(`/projects/${resolved.id}/episodes/${firstEpisode.id}`)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white text-xs font-bold uppercase tracking-wider hover:shadow-glow-md transition-all"
              >
                <FileText className="size-3.5" />
                开始创作
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Project title */}
        <div className="mb-8">
          {editingTitle ? (
            <div className="flex items-center gap-3">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="text-2xl font-bold text-text-primary bg-surface-card border border-border-subtle rounded-xl px-4 py-2 outline-none focus:border-brand-cyan/50 w-full max-w-md"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
              />
              <button onClick={handleSaveTitle} className="rounded-xl p-2 text-accent-green hover:bg-accent-green/10"><Check className="size-4" /></button>
              <button onClick={() => setEditingTitle(false)} className="rounded-xl p-2 text-text-muted hover:bg-surface-light"><X className="size-4" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-text-primary">{project.name}</h1>
              <button onClick={() => { setEditingTitle(true); setTitleDraft(project.name); }} className="rounded-xl p-2 text-text-muted hover:text-text-primary hover:bg-surface-light transition-all">
                <Edit2 className="size-3.5" />
              </button>
            </div>
          )}
          <p className="text-xs text-text-muted mt-2 font-mono">创建于 {formatDate(project.status)}</p>
        </div>

        {/* Series list */}
        {allSeries.length === 0 ? (
          <div className="text-center py-20">
            <Film className="size-12 text-text-muted/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">暂无剧集</h3>
            <p className="text-sm text-text-muted mb-6 max-w-sm mx-auto">
              创建第一季，然后添加集数，即可开始创作
            </p>
          </div>
        ) : null}

        <div className="space-y-4">
          {allSeries.map((series) => {
            const episodes = getEpisodesForSeries(series.id);
            const isExpanded = expandedSeries.has(series.id);

            return (
              <div key={series.id} className="rounded-2xl border border-border-subtle bg-surface-card overflow-hidden">
                {/* Series header */}
                <div
                  onClick={() => toggleSeries(series.id)}
                  className="flex items-center justify-between px-6 py-4 hover:bg-surface-elevated/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronRight className="size-4 text-text-muted rotate-90 transition-transform" /> : <ChevronRight className="size-4 text-text-muted" />}
                    <Film className="size-4 text-brand-cyan" />
                    <span className="text-sm font-medium text-text-primary">{series.title}</span>
                    <span className="text-[10px] font-mono text-text-muted border border-border-subtle px-1.5 py-0.5 rounded">{episodes.length} 集</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCreateEpisode(series.id); }}
                      className="rounded-xl p-2 text-text-muted hover:text-brand-cyan hover:bg-brand-cyan/10 transition-all"
                      title="添加集数"
                    >
                      <Plus className="size-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSeries(series.id); }}
                      className="rounded-xl p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                      title="删除剧集"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Episodes */}
                {isExpanded && (
                  <div className="border-t border-border-subtle">
                    {episodes.length === 0 ? (
                      <div className="px-6 py-8 text-center">
                        <p className="text-sm text-text-muted mb-4">暂无集数</p>
                        <button
                          onClick={() => handleCreateEpisode(series.id)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-primary hover:border-border-glow transition-all text-xs font-bold uppercase tracking-wider"
                        >
                          <Plus className="size-3.5" />
                          添加第一集
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-border-subtle">
                        {episodes.map((ep) => (
                          <div
                            key={ep.id}
                            onClick={() => navigate.push(`/projects/${resolved.id}/episodes/${ep.id}`)}
                            className="flex items-center justify-between px-6 py-3.5 hover:bg-surface-elevated/20 transition-colors cursor-pointer group"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-lg bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center text-sm font-bold text-brand-cyan">
                                {String(ep.episode_number).padStart(2, "0")}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-text-primary">{ep.title || `第${ep.episode_number}集`}</p>
                                <p className="text-[10px] font-mono text-text-muted mt-0.5">
                                  剧本: {ep.script_content ? "已上传" : "未上传"}
                                  {ep.status === "published" && " · 已发布"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate.push(`/projects/${resolved.id}/episodes/${ep.id}`); }}
                                className="rounded-xl px-3 py-1.5 text-xs font-medium text-brand-cyan hover:bg-brand-cyan/10 transition-all"
                              >
                                进入
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteEpisode(ep.id); }}
                                className="rounded-xl p-1.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* New series form */}
        <div className="mt-6">
          {showNewSeries ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-card p-5">
              <div className="flex items-center gap-3">
                <Film className="size-4 text-brand-cyan shrink-0" />
                <input
                  value={newSeriesName}
                  onChange={(e) => setNewSeriesName(e.target.value)}
                  placeholder="输入季名称，例如：第一季"
                  className="flex-1 rounded-xl border border-border-subtle bg-surface-base px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 transition-all"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateSeries(); if (e.key === "Escape") setShowNewSeries(false); }}
                />
                <button
                  onClick={handleCreateSeries}
                  disabled={!newSeriesName.trim()}
                  className="rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan-dim px-5 py-2.5 text-sm font-medium text-white hover:shadow-glow-md disabled:opacity-50 transition-all"
                >
                  创建
                </button>
                <button onClick={() => setShowNewSeries(false)} className="rounded-xl px-4 py-2.5 text-sm text-text-muted hover:text-text-primary transition-all">
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewSeries(true)}
              className="flex items-center justify-center gap-2 w-full rounded-2xl border-2 border-dashed border-border-subtle px-6 py-5 text-sm text-text-muted hover:text-text-primary hover:border-brand-cyan/30 hover:bg-brand-cyan/5 transition-all"
            >
              <Plus className="size-4" />
              添加剧集（季）
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
