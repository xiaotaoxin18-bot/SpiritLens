"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Users,
  Cpu,
  BarChart3,
  LogOut,
  Sparkles,
  Activity,
  Settings,
  UserPlus,
  Loader2,
  ArrowLeft,
  Sun,
  Moon,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/store/theme";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";
import { ModelTrendChart } from "@/components/admin/ModelTrendChart";

interface DashboardData {
  total_users: number;
  today_users: number;
  total_creations: number;
  today_creations: number;
  model_count: number;
  recent_users: Array<{
    id: string;
    username: string | null;
    nickname: string;
    is_admin: boolean;
    created_at: string | null;
  }>;
}

const SIDEBAR = [
  { label: "仪表盘", icon: BarChart3, href: "/admin" },
  { label: "模型管理", icon: Cpu, href: "/admin/models" },
  { label: "用户管理", icon: Users, href: "/admin/users" },
  { label: "使用记录", icon: Activity, href: "/admin/logs" },
  { label: "社区管理", icon: Sparkles, href: "/admin/community" },
  { label: "系统设置", icon: Settings, href: "/admin/settings" },
];

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { theme, toggle: toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && (!isAuthenticated || !user?.is_admin)) {
      router.push("/auth/admin/login");
    }
  }, [mounted, isAuthenticated, user, router]);

  useEffect(() => {
    if (!isAuthenticated || !user?.is_admin) return;
    const load = () => api.get<DashboardData>("/api/v1/admin/dashboard")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    load();
    // Refresh on focus (tab switch back)
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [isAuthenticated, user]);

  if (!mounted || !isAuthenticated || !user?.is_admin) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base">
        <Loader2 className="size-8 animate-spin text-brand-cyan" />
      </div>
    );
  }

  const stats = [
    {
      label: "注册用户",
      value: data?.total_users ?? "—",
      sub: data ? `今日 +${data.today_users}` : "",
      icon: Users,
      color: "from-brand-purple to-brand-cyan",
    },
    {
      label: "AI 模型",
      value: data?.model_count ?? "—",
      sub: "已接入",
      icon: Cpu,
      color: "from-accent-amber to-accent-pink",
    },
    {
      label: "今日调用",
      value: data?.today_creations ?? "—",
      sub: data ? `累计 ${data.total_creations}` : "",
      icon: Activity,
      color: "from-accent-green to-brand-cyan",
    },
    {
      label: "总生成量",
      value: data?.total_creations ?? "—",
      sub: "全部作品",
      icon: Sparkles,
      color: "from-brand-cyan to-accent-pink",
    },
  ];

  return (
    <div className="flex h-screen bg-surface-base">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-border-subtle bg-surface-elevated/60 backdrop-blur-xl flex flex-col">
        <div className="flex items-center gap-2 px-5 h-16 border-b border-border-subtle">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-amber to-accent-pink flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-text-primary">管理后台</span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {SIDEBAR.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === "/admin";
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent-amber/10 text-accent-amber"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-light"
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
          <div className="border-t border-border-subtle my-2" />
          <button
            onClick={() => router.push("/")}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-text-secondary hover:text-brand-cyan hover:bg-brand-cyan/10 transition-colors"
          >
            <ArrowLeft className="size-4" />
            返回前台
          </button>
        </nav>

        <div className="p-3 border-t border-border-subtle">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[10px] text-text-muted">
              {theme === "dark" ? "深色模式" : "浅色模式"}
            </span>
            <button
              onClick={toggleTheme}
              className="flex size-7 items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-light transition-all"
              title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
            >
              {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </button>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-amber to-accent-pink flex items-center justify-center text-white text-xs font-medium">
              {user.nickname.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-primary truncate">
                {user.nickname}
              </p>
              <p className="text-[10px] text-text-muted">管理员</p>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              router.push("/auth/admin/login");
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="size-3.5" />
            退出登录
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-text-primary">仪表盘</h1>
            <p className="text-sm text-text-muted mt-1">
              欢迎回来，{user.nickname}
            </p>
          </div>

          {/* Stats cards */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-text-muted" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {stats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div
                      key={stat.label}
                      className="rounded-2xl border border-border-subtle bg-surface-card p-5"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs text-text-muted">{stat.label}</span>
                        <div
                          className={cn(
                            "w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center",
                            stat.color
                          )}
                        >
                          <Icon className="size-4 text-white" />
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-text-primary">
                        {stat.value}
                      </p>
                      {stat.sub && (
                        <p className="text-xs text-text-muted mt-1">{stat.sub}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Recent users */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-border-subtle bg-surface-card p-6">
                  <h2 className="text-base font-semibold text-text-primary mb-4">
                    最近注册
                  </h2>
                  {data?.recent_users && data.recent_users.length > 0 ? (
                    <div className="space-y-3">
                      {data.recent_users.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center gap-3 py-2"
                        >
                          <div className={cn(
                            "size-8 rounded-full flex items-center justify-center text-xs font-medium text-white",
                            u.is_admin
                              ? "bg-gradient-to-br from-accent-amber to-accent-pink"
                              : "bg-gradient-to-br from-brand-purple to-brand-cyan"
                          )}>
                            {u.nickname.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">
                              {u.nickname}
                            </p>
                            <p className="text-xs text-text-muted truncate">
                              {u.username || "—"}
                            </p>
                          </div>
                          <div className="text-xs text-text-muted">
                            {u.created_at
                              ? new Date(u.created_at).toLocaleDateString("zh-CN")
                              : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                      <UserPlus className="size-10 mb-3 opacity-30" />
                      <p className="text-sm">暂无用户注册</p>
                    </div>
                  )}
                </div>

                {/* Model activity chart */}
                <div className="rounded-2xl border border-border-subtle bg-surface-card p-6">
                  <h2 className="text-base font-semibold text-text-primary mb-4">
                    模型调用趋势
                  </h2>
                  <ModelTrendChart />
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
