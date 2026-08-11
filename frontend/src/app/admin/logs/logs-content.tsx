"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Loader2,
  Image,
  Video,
  AlertCircle,
  ArrowLeft,
  Sun,
  Moon,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/store/theme";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";

interface LogItem {
  id: string;
  user_id: string;
  user_nickname: string;
  type: "image" | "video";
  title: string;
  prompt: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  model_id: string;
  task_id: string;
  error_message: string | null;
  created_at: string | null;
}

interface LogsResponse {
  total: number;
  page: number;
  page_size: number;
  logs: LogItem[];
}

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { label: "全部", value: "" },
  { label: "成功", value: "completed" },
  { label: "处理中", value: "processing" },
  { label: "失败", value: "failed" },
  { label: "等待中", value: "pending" },
];

const TYPE_OPTIONS = [
  { label: "全部类型", value: "" },
  { label: "图片", value: "image" },
  { label: "视频", value: "video" },
];

export default function AdminLogsContent() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const { theme, toggle: toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const firstDayOfWeek = new Date(calYear, calMonth - 1, 1).getDay();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && (!isAuthenticated || !user?.is_admin)) {
      router.push("/auth/admin/login");
    }
  }, [mounted, isAuthenticated, user, router]);

  // Reset logs when filters change
  const resetFilters = useCallback((type: string, status: string, q: string, date?: string) => {
    setFilterType(type);
    setFilterStatus(status);
    setSearch(q);
    if (date !== undefined) setFilterDate(date);
    setLogs([]);
    setPage(1);
    setTotal(0);
  }, []);

  const fetchLogs = useCallback(async (pageNum: number, append: boolean) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      const params: Record<string, string> = {
        page: String(pageNum),
        page_size: String(PAGE_SIZE),
      };
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      if (search) params.q = search;
      if (filterDate) params.date = filterDate;
      const res = await api.get<LogsResponse>("/api/v1/admin/logs", params);
      if (append) {
        setLogs((prev) => [...prev, ...res.logs]);
      } else {
        setLogs(res.logs);
      }
      setTotal(res.total);
    } catch {
      if (!append) setLogs([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filterType, filterStatus, filterDate, search]);

  // Initial load + reload on filter change
  useEffect(() => {
    if (isAuthenticated && user?.is_admin) {
      fetchLogs(1, false);
    }
  }, [fetchLogs, isAuthenticated, user]);

  // Infinite scroll: IntersectionObserver on sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !loading && !loadingMore && logs.length < total) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchLogs(nextPage, true);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, loadingMore, logs.length, total, page, fetchLogs]);

  if (!mounted || !isAuthenticated || !user?.is_admin) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base">
        <Loader2 className="size-8 animate-spin text-brand-cyan" />
      </div>
    );
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-accent-green/10 text-accent-green";
      case "failed":
        return "bg-red-500/10 text-red-400";
      case "processing":
        return "bg-accent-amber/10 text-accent-amber";
      default:
        return "bg-text-muted/10 text-text-muted";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "completed": return "成功";
      case "failed": return "失败";
      case "processing": return "处理中";
      case "pending": return "等待中";
      default: return status;
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-8 pt-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">使用记录</h1>
            <p className="text-sm text-text-muted mt-1">
              共 {total ?? "…"} 条生成记录
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="inline-flex size-8 items-center justify-center rounded-xl border border-border-subtle text-text-muted hover:text-text-primary hover:bg-surface-light transition-all"
              title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
            >
              {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </button>
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle px-3 py-2 text-xs text-text-secondary hover:text-brand-cyan hover:border-brand-cyan/30 transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              返回前台
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                resetFilters(filterType, filterStatus, e.target.value);
              }}
              placeholder="搜索用户昵称…"
              className="w-full rounded-xl border border-border-subtle bg-surface-card py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 focus:ring-2 focus:ring-brand-cyan/10 transition-all"
            />
          </div>

          {/* Type filter */}
          <div className="flex rounded-xl border border-border-subtle p-0.5 bg-surface-card">
            {TYPE_OPTIONS.map((t) => (
              <button
                key={t.value}
                onClick={() => { resetFilters(t.value, filterStatus, search); }}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors",
                  filterType === t.value
                    ? "bg-surface-elevated text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                )}
              >
                {t.value === "image" && <Image className="size-3.5" />}
                {t.value === "video" && <Video className="size-3.5" />}
                {t.label}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex rounded-xl border border-border-subtle p-0.5 bg-surface-card">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => { resetFilters(filterType, s.value, search); }}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs transition-colors",
                  filterStatus === s.value
                    ? "bg-surface-elevated text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Month calendar picker */}
          <div className="relative">
            <button
              onClick={() => setShowCalendar(!showCalendar)}
              className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-card px-3 py-2 text-xs text-text-primary hover:border-brand-cyan/30 transition-colors"
            >
              {filterDate || "选择日期"}
              {filterDate && (
                <span
                  onClick={(e) => { e.stopPropagation(); resetFilters(filterType, filterStatus, search, ""); }}
                  className="ml-1 text-text-muted hover:text-text-primary"
                >
                  ✕
                </span>
              )}
            </button>
            {showCalendar && (
              <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-border-subtle bg-surface-overlay/95 p-3 shadow-xl backdrop-blur-xl">
                {/* Month header */}
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => setCalMonth(calMonth - 1)} className="rounded-lg p-1 text-text-muted hover:text-text-primary hover:bg-surface-light transition-colors">
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="text-sm font-medium text-text-primary">{calYear}年{calMonth}月</span>
                  <button onClick={() => setCalMonth(calMonth + 1)} className="rounded-lg p-1 text-text-muted hover:text-text-primary hover:bg-surface-light transition-colors">
                    <ChevronRight className="size-4" />
                  </button>
                </div>
                {/* Day-of-week header */}
                <div className="grid grid-cols-7 mb-1">
                  {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
                    <div key={d} className="text-center text-[10px] font-medium text-text-muted py-1">{d}</div>
                  ))}
                </div>
                {/* Days grid */}
                <div className="grid grid-cols-7">
                  {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                    const dateStr = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const isSelected = filterDate === dateStr;
                    const isToday = dateStr === todayStr;
                    return (
                      <button
                        key={day}
                        onClick={() => {
                          if (filterDate === dateStr) {
                            resetFilters(filterType, filterStatus, search, "");
                          } else {
                            resetFilters(filterType, filterStatus, search, dateStr);
                          }
                          setShowCalendar(false);
                        }}
                        className={cn(
                          "rounded-lg py-1.5 text-xs transition-colors",
                          isSelected
                            ? "bg-brand-cyan/20 text-brand-cyan font-bold"
                            : isToday
                              ? "text-brand-cyan"
                              : "text-text-secondary hover:bg-surface-light hover:text-text-primary"
                        )}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable table area */}
      <div className="flex-1 overflow-y-auto min-h-0 px-8 pb-8">
        <div className="rounded-2xl border border-border-subtle bg-surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-elevated/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[12%]">用户</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[9%]">类型</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[24%]">内容</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[11%]">模型</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[13%]">任务ID</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[9%]">状态</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted w-[13%]">时间</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[9%]">详情</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-20 text-center text-text-muted">
                      <Loader2 className="size-5 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-20 text-center text-text-muted">
                      <Sparkles className="size-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">暂无使用记录</p>
                      <p className="text-xs mt-1 opacity-60">用户使用 AI 生成模型后将在这里显示</p>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-border-subtle last:border-0 hover:bg-surface-elevated/30 transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="size-7 rounded-full bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center text-xs font-medium text-white shrink-0">
                            {log.user_nickname.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-text-primary truncate">{log.user_nickname}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          log.type === "image"
                            ? "bg-brand-purple/10 text-brand-purple"
                            : "bg-accent-pink/10 text-accent-pink"
                        )}>
                          {log.type === "image" ? <Image className="size-3" /> : <Video className="size-3" />}
                          {log.type === "image" ? "图片" : "视频"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-text-primary truncate">{log.title}</p>
                        {log.prompt && (
                          <p className="text-[10px] text-text-muted truncate mt-0.5">{log.prompt}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-text-secondary text-xs truncate">
                        {log.model_id || "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        {log.task_id ? (
                          <button
                            className="block max-w-[120px] truncate font-mono text-[10px] text-text-muted hover:text-brand-cyan transition-colors"
                            title={`${log.task_id}（点击复制）`}
                            onClick={() => { navigator.clipboard.writeText(log.task_id).catch(() => {}); }}
                          >
                            {log.task_id}
                          </button>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                          statusBadge(log.status)
                        )}>
                          {statusLabel(log.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-text-muted text-xs text-right">
                        {log.created_at
                          ? new Date(log.created_at).toLocaleString("zh-CN", {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        {log.status === "failed" && log.error_message && (
                          <div
                            className="group relative inline-flex cursor-help"
                            title={log.error_message}
                          >
                            <AlertCircle className="size-3.5 text-red-400" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                              <div className="bg-red-500/90 text-white text-[10px] rounded-lg px-3 py-1.5 max-w-[240px] whitespace-normal shadow-lg">
                                {log.error_message}
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="flex items-center justify-center py-4">
            {loadingMore && (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <Loader2 className="size-4 animate-spin" />
                加载更多…
              </div>
            )}
            {!loading && logs.length >= total && total > 0 && (
              <span className="text-xs text-text-muted">已加载全部 {total} 条记录</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
