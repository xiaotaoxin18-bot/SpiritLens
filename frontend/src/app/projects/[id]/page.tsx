"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Plus, Film, Trash2, Edit2, Check, X,
  Loader2, ChevronRight, FileText, Users, UserPlus, UserX, Search,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import { useToast } from "@/components/ui/Toast";

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
  assignee_id?: string | null;
}

interface Member {
  user_id: string;
  role: string;
  nickname: string;
  username: string;
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolved = use(params);
  const navigate = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { toast } = useToast();
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
  const [customEpSeriesId, setCustomEpSeriesId] = useState<string | null>(null);
  const [customEpInput, setCustomEpInput] = useState("");
  const [customEpError, setCustomEpError] = useState("");

  // Busy states for async buttons
  const [creatingSeries, setCreatingSeries] = useState(false);
  const [creatingEpisodeId, setCreatingEpisodeId] = useState<string | null>(null);
  const [customEpBusySeriesId, setCustomEpBusySeriesId] = useState<string | null>(null);
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  // Collaboration state
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [availableUsers, setAvailableUsers] = useState<{ user_id: string; nickname: string; username: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

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

  const loadMembers = useCallback(async () => {
    try {
      const data = await api.get<Member[]>(`/api/v1/projects/${resolved.id}/members`);
      setMembers(data);
    } catch { /* ignore */ }
  }, [resolved.id]);

  useEffect(() => {
    if (isAuthenticated && mounted) { loadData(); loadMembers(); }
  }, [loadData, loadMembers, isAuthenticated, mounted]);

  const handleInvite = async (userId: string) => {
    if (invitingUserId) return;
    setInvitingUserId(userId);
    try {
      const res = await api.post(`/api/v1/projects/${resolved.id}/members`, { user_id: userId, role: "editor" });
      console.log("Invite success:", res);
      toast("邀请成功", "success");
      loadMembers();
      loadAvailableUsers();
    } catch (e: any) {
      console.error("Invite failed:", e);
      toast(e?.message || "邀请失败", "error");
    } finally {
      setInvitingUserId(null);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!window.confirm("确定移除该成员？")) return;
    if (removingMemberId) return;
    setRemovingMemberId(userId);
    try {
      await api.delete(`/api/v1/projects/${resolved.id}/members/${userId}`);
      toast("成员已移除", "success");
      loadMembers();
      loadAvailableUsers();
    } catch (e: any) {
      toast(e?.message || "移除失败", "error");
    } finally {
      setRemovingMemberId(null);
    }
  };

  const loadAvailableUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await api.get<{ users: { user_id: string; nickname: string; username: string }[] }>(`/api/v1/projects/${resolved.id}/available-users`);
      setAvailableUsers(data.users);
    } catch { setAvailableUsers([]); }
    setLoadingUsers(false);
  }, [resolved.id]);

  const openInvite = () => {
    loadAvailableUsers();
    setInviteSearch("");
    setInviteOpen(true);
  };

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
    if (!newSeriesName.trim() || creatingSeries) return;
    setCreatingSeries(true);
    try {
      await api.post(`/api/v1/projects/${resolved.id}/seasons`, {
        title: newSeriesName.trim(),
        sort_order: allSeries.length,
      });
      setNewSeriesName("");
      setShowNewSeries(false);
      toast("剧集创建成功", "success");
      loadData();
      setExpandedSeries((prev) => new Set(prev));
    } catch (e: any) {
      toast(e?.message || "创建失败", "error");
    } finally {
      setCreatingSeries(false);
    }
  };

  const handleCreateEpisode = async (seriesId: string) => {
    if (creatingEpisodeId) return;
    const episodes = getEpisodesForSeries(seriesId);
    setCreatingEpisodeId(seriesId);
    try {
      await api.post(`/api/v1/projects/${resolved.id}/episodes`, {
        episode_number: episodes.length + 1,
        title: `第${episodes.length + 1}集`,
        season_id: seriesId,
      });
      toast("集数已添加", "success");
      loadData();
    } catch (e: any) {
      toast(e?.message || "添加失败", "error");
    } finally {
      setCreatingEpisodeId(null);
    }
  };

  const handleDeleteSeries = async (id: string) => {
    if (!window.confirm("确定删除该剧集？其下所有集数将被一并删除")) return;
    try {
      await api.delete(`/api/v1/projects/${resolved.id}/seasons/${id}`);
      toast("剧集已删除", "success");
      loadData();
    } catch (e: any) {
      toast(e?.message || "删除失败", "error");
    }
  };

  const handleDeleteEpisode = async (id: string) => {
    if (!window.confirm("确定删除该集？")) return;
    try {
      await api.delete(`/api/v1/projects/${resolved.id}/episodes/${id}`);
      toast("集数已删除", "success");
      loadData();
    } catch (e: any) {
      toast(e?.message || "删除失败", "error");
    }
  };

  const toggleSeries = (id: string) => {
    setExpandedSeries((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ─── 自定义集数添加 ──────────────────────
  const CN_NUMS: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  };
  const parseEpInput = (s: string): number[] => {
    const t = s.trim();
    // 第1集-第3集 / 1-3 / 第1-3集
    const rangeMatch = t.match(/^(?:第)?(\d+|[一-鿿]+)(?:集)?\s*[-~至到]\s*(?:第)?(\d+|[一-鿿]+)(?:集)?$/);
    if (rangeMatch) {
      const a = parseInt(rangeMatch[1], 10) || CN_NUMS[rangeMatch[1]] || 0;
      const b = parseInt(rangeMatch[2], 10) || CN_NUMS[rangeMatch[2]] || 0;
      if (a > 0 && b > 0 && a <= b) return Array.from({ length: b - a + 1 }, (_, i) => a + i);
    }
    // 第四集 / 第4集 / 4
    const singleMatch = t.match(/^(?:第)?(\d+|[一-鿿]+)(?:集)?$/);
    if (singleMatch) {
      const n = parseInt(singleMatch[1], 10) || CN_NUMS[singleMatch[1]] || 0;
      if (n > 0) return [n];
    }
    return [];
  };

  const handleCustomCreateEpisode = async (seriesId: string) => {
    const nums = parseEpInput(customEpInput);
    if (nums.length === 0) { setCustomEpError('请输入有效集数，如"第4集"或"1-3"'); return; }
    if (customEpBusySeriesId) return;
    setCustomEpError("");
    setCustomEpSeriesId(null);
    setCustomEpInput("");
    setCustomEpBusySeriesId(seriesId);
    try {
      for (const n of nums) {
        await api.post(`/api/v1/projects/${resolved.id}/episodes`, {
          episode_number: n,
          title: `第${n}集`,
          season_id: seriesId,
        });
      }
      toast(`已创建 ${nums.length} 集`, "success");
      loadData();
    } catch (e: any) {
      toast(e?.message || "创建失败", "error");
    } finally {
      setCustomEpBusySeriesId(null);
    }
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
    <div className="h-screen overflow-y-auto bg-surface-base">
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
                      disabled={creatingEpisodeId === series.id}
                      className="rounded-xl p-2 text-text-muted hover:text-brand-cyan hover:bg-brand-cyan/10 transition-all disabled:opacity-40"
                      title="添加集数"
                    >
                      {creatingEpisodeId === series.id ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
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
                        {customEpSeriesId === series.id ? (
                          <div className="max-w-xs mx-auto space-y-3">
                            <input
                              value={customEpInput}
                              onChange={(e) => { setCustomEpInput(e.target.value); setCustomEpError(""); }}
                              onKeyDown={(e) => { if (e.key === "Enter") handleCustomCreateEpisode(series.id); if (e.key === "Escape") setCustomEpSeriesId(null); }}
                              placeholder="输入集数，如「第4集」或「1-3」"
                              className="w-full px-4 py-2.5 text-sm text-text-primary bg-surface-card border border-border-subtle rounded-xl outline-none focus:border-brand-cyan/50 transition-all placeholder:text-text-muted/50"
                              autoFocus
                            />
                            {customEpError && <p className="text-xs text-red-400 text-left">{customEpError}</p>}
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleCustomCreateEpisode(series.id)}
                                disabled={customEpBusySeriesId === series.id}
                                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white text-xs font-bold hover:shadow-glow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                              >
                                {customEpBusySeriesId === series.id && <Loader2 className="size-3 animate-spin" />}
                                创建
                              </button>
                              <button
                                onClick={() => setCustomEpSeriesId(null)}
                                className="flex-1 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-primary text-xs font-bold transition-all"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setCustomEpSeriesId(series.id); setCustomEpInput(""); setCustomEpError(""); }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-primary hover:border-border-glow transition-all text-xs font-bold uppercase tracking-wider"
                          >
                            <Plus className="size-3.5" />
                            添加集数
                          </button>
                        )}
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

        {/* ── Members section ── */}
        <div className="mt-10 pt-6 border-t border-border-subtle">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-brand-cyan" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-primary">项目成员</h2>
              <span className="text-[10px] font-mono text-text-muted border border-border-subtle px-1.5 py-0.5 rounded">{members.length} 人</span>
            </div>
            <button
              onClick={openInvite}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-brand-cyan hover:bg-brand-cyan/10 transition-all"
            >
              <UserPlus className="size-3.5" />
              邀请成员
            </button>
          </div>

          {/* Invite: show all available users */}
          {inviteOpen && (
            <div className="mb-4 rounded-xl border border-border-subtle bg-surface-card p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">选择要邀请的用户</p>
                <button onClick={() => setInviteOpen(false)} className="text-xs text-text-muted hover:text-text-primary">
                  关闭
                </button>
              </div>
              {/* Search */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={inviteSearch}
                  onChange={(e) => setInviteSearch(e.target.value)}
                  placeholder="搜索昵称或账号…"
                  className="w-full rounded-lg border border-border-subtle bg-surface-elevated/50 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 transition-all"
                />
              </div>
              {loadingUsers ? (
                <p className="text-xs text-text-muted px-1">加载中...</p>
              ) : availableUsers.length === 0 ? (
                <p className="text-xs text-text-muted px-1">没有可邀请的用户（所有用户已是成员）</p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {availableUsers.filter((u) =>
                    !inviteSearch ||
                    (u.nickname || "").toLowerCase().includes(inviteSearch.toLowerCase()) ||
                    (u.username || "").toLowerCase().includes(inviteSearch.toLowerCase())
                  ).length === 0 && inviteSearch && (
                    <p className="text-xs text-text-muted px-1">未找到匹配的用户</p>
                  )}
                  {availableUsers
                    .filter((u) =>
                      !inviteSearch ||
                      (u.nickname || "").toLowerCase().includes(inviteSearch.toLowerCase()) ||
                      (u.username || "").toLowerCase().includes(inviteSearch.toLowerCase())
                    )
                    .map((u) => (
                    <div key={u.user_id} className="flex items-center justify-between py-2 px-2 hover:bg-surface-elevated/30 rounded-lg transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-purple to-brand-cyan-dim flex items-center justify-center text-[10px] font-bold text-white">
                          {u.nickname?.charAt(0) || "?"}
                        </div>
                        <div>
                          <p className="text-sm text-text-primary">{u.nickname}</p>
                          <p className="text-[10px] text-text-muted font-mono">@{u.username}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleInvite(u.user_id)}
                        disabled={invitingUserId === u.user_id}
                        className="rounded-lg px-3 py-1 text-xs font-medium text-brand-cyan hover:bg-brand-cyan/10 transition-all disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {invitingUserId === u.user_id && <Loader2 className="size-3 animate-spin" />}
                        邀请
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Member list */}
          <div className="space-y-1">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-surface-card/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-purple to-brand-cyan-dim flex items-center justify-center text-[10px] font-bold text-white">
                    {m.nickname?.charAt(0) || "?"}
                  </div>
                  <div>
                    <p className="text-sm text-text-primary">{m.nickname}</p>
                    <p className="text-[10px] font-mono text-text-muted">
                      {m.role === "OWNER" ? "所有者" : m.role === "EDITOR" ? "编辑者" : "查看者"}
                      {m.role === "OWNER" && " · 不可移除"}
                    </p>
                  </div>
                </div>
                {m.role !== "OWNER" && (
                  <button
                    onClick={() => handleRemoveMember(m.user_id)}
                    disabled={removingMemberId === m.user_id}
                    className="rounded-lg p-1.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-40"
                    title="移除成员"
                  >
                    {removingMemberId === m.user_id ? <Loader2 className="size-3.5 animate-spin" /> : <UserX className="size-3.5" />}
                  </button>
                )}
              </div>
            ))}
          </div>
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
                  placeholder="请输入剧名，xxx/xxx-第x季"
                  className="flex-1 rounded-xl border border-border-subtle bg-surface-base px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 transition-all"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateSeries(); if (e.key === "Escape") setShowNewSeries(false); }}
                />
                <button
                  onClick={handleCreateSeries}
                  disabled={!newSeriesName.trim() || creatingSeries}
                  className="rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan-dim px-5 py-2.5 text-sm font-medium text-white hover:shadow-glow-md disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {creatingSeries && <Loader2 className="size-3.5 animate-spin" />}
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
