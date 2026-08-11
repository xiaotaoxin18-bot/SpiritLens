"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Settings, Loader2, ArrowLeft, Sun, Moon, Sparkles,
  Check, X, Shield, Activity, Database, Server, Globe, Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/store/theme";
import { api } from "@/services/api";
import { useToast } from "@/components/ui/Toast";

interface SystemConfig {
  app_name: string;
  app_version: string;
  environment: string;
  debug: boolean;
  cors_origins: string;
  public_url: string;
  token_expire_minutes: number;
  refresh_token_expire_days: number;
  upload_max_size_mb: number;
  xinghe_configured: boolean;
  tianyi_configured: boolean;
  stability_configured: boolean;
  bfl_configured: boolean;
}

const SIDEBAR = [
  { label: "仪表盘", icon: Sparkles, href: "/admin" },
  { label: "模型管理", icon: Sparkles, href: "/admin/models" },
  { label: "用户管理", icon: Sparkles, href: "/admin/users" },
  { label: "使用记录", icon: Sparkles, href: "/admin/logs" },
  { label: "社区管理", icon: Sparkles, href: "/admin/community" },
  { label: "系统设置", icon: Settings, href: "/admin/settings" },
];

export default function AdminSettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { theme, toggle: toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && (!isAuthenticated || !user?.is_admin)) {
      router.push("/auth/admin/login");
    }
  }, [mounted, isAuthenticated, user, router]);

  const [editToken, setEditToken] = useState(60);
  const [editRefresh, setEditRefresh] = useState(7);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!isAuthenticated || !user?.is_admin) return;
    api.get<SystemConfig>("/api/v1/admin/settings")
      .then((cfg) => {
        setConfig(cfg);
        setEditToken(cfg.token_expire_minutes);
        setEditRefresh(cfg.refresh_token_expire_days);
      })
      .catch(() => setConfig(null))
      .finally(() => setLoading(false));
  }, [isAuthenticated, user]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await api.put("/api/v1/admin/settings", {
        token_expire_minutes: editToken,
        refresh_token_expire_days: editRefresh,
      });
      toast("设置已保存，新 Token 立即生效", "success");
    } catch {
      toast("保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || !isAuthenticated || !user?.is_admin) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base">
        <Loader2 className="size-8 animate-spin text-brand-cyan" />
      </div>
    );
  }

  const InfoRow = ({ label, value, status }: { label: string; value: string; status?: "ok" | "warn" | "off" }) => (
    <div className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-white/[0.02] light:hover:bg-black/[0.02] transition-colors">
      <span className="text-sm text-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        {status && (
          <span className={cn(
            "size-2 rounded-full",
            status === "ok" ? "bg-accent-green" : status === "warn" ? "bg-accent-amber" : "bg-red-500"
          )} />
        )}
        <span className="text-sm text-text-primary font-mono">{value}</span>
      </div>
    </div>
  );

  const SectionCard = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <div className="rounded-2xl border border-border-subtle bg-surface-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border-subtle">
        <div className="flex size-7 items-center justify-center rounded-lg bg-brand-cyan/10">
          {icon}
        </div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      <div className="divide-y divide-border-subtle/50">
        {children}
      </div>
    </div>
  );

  const providerStatus = (name: string, configured: boolean) => {
    if (configured) return { value: "已配置", status: "ok" as const };
    return { value: "未配置", status: "off" as const };
  };

  return (
    <div className="flex h-screen bg-surface-base">
      <aside className="w-56 flex-shrink-0 border-r border-border-subtle bg-surface-elevated/60 backdrop-blur-xl flex flex-col">
        <div className="flex items-center gap-2 px-5 h-16 border-b border-border-subtle">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-text-primary">管理后台</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {SIDEBAR.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === "/admin/settings";
            return (
              <button key={item.href} onClick={() => router.push(item.href)}
                className={cn("flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                  isActive ? "bg-brand-cyan/10 text-brand-cyan" : "text-text-secondary hover:text-text-primary hover:bg-surface-light"
                )}>
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
          <div className="border-t border-border-subtle my-2" />
          <button onClick={() => router.push("/")}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-text-secondary hover:text-brand-cyan hover:bg-brand-cyan/10 transition-colors">
            <ArrowLeft className="size-4" />返回前台
          </button>
        </nav>
        <div className="p-3 border-t border-border-subtle">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[10px] text-text-muted">{theme === "dark" ? "深色模式" : "浅色模式"}</span>
            <button onClick={toggleTheme}
              className="flex size-7 items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-light transition-all">
              {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </button>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center text-white text-xs font-medium">
              {user.nickname.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-primary truncate">{user.nickname}</p>
              <p className="text-[10px] text-text-muted">管理员</p>
            </div>
          </div>
          <button onClick={() => { logout(); router.push("/auth/admin/login"); }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors">退出登录</button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-3xl">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-text-primary">系统设置</h1>
            <p className="text-sm text-text-muted mt-1">查看系统配置与服务状态</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="size-6 animate-spin text-text-muted" />
            </div>
          ) : !config ? (
            <div className="flex flex-col items-center justify-center py-24 text-text-muted">
              <Settings className="size-10 mb-3 opacity-30" />
              <p className="text-sm">加载配置失败</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Application Info */}
              <SectionCard title="应用信息" icon={<Server className="size-4 text-brand-cyan" />}>
                <InfoRow label="应用名称" value={config.app_name} />
                <InfoRow label="版本" value={config.app_version} />
                <InfoRow label="运行环境" value={config.environment} status={config.environment === "production" ? "ok" : "warn"} />
                <InfoRow label="调试模式" value={config.debug ? "开启" : "关闭"} status={config.debug ? "warn" : "ok"} />
              </SectionCard>

              {/* Network */}
              <SectionCard title="网络配置" icon={<Globe className="size-4 text-brand-cyan" />}>
                <InfoRow label="公网地址" value={config.public_url} />
                <InfoRow label="CORS 允许源" value={config.cors_origins} />
              </SectionCard>

              {/* Auth */}
              <SectionCard title="认证配置" icon={<Shield className="size-4 text-brand-cyan" />}>
                <div className="flex items-center justify-between py-2 px-4">
                  <span className="text-sm text-text-secondary">Token 有效期</span>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} max={525600}
                      value={editToken}
                      onChange={(e) => setEditToken(parseInt(e.target.value) || 60)}
                      className="w-24 rounded-lg border border-border-subtle bg-surface-base px-3 py-1.5 text-sm text-text-primary text-right outline-none focus:border-brand-cyan/50" />
                    <span className="text-sm text-text-muted">分钟</span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-2 px-4">
                  <span className="text-sm text-text-secondary">Refresh Token 有效期</span>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} max={365}
                      value={editRefresh}
                      onChange={(e) => setEditRefresh(parseInt(e.target.value) || 7)}
                      className="w-24 rounded-lg border border-border-subtle bg-surface-base px-3 py-1.5 text-sm text-text-primary text-right outline-none focus:border-brand-cyan/50" />
                    <span className="text-sm text-text-muted">天</span>
                  </div>
                </div>
                <div className="flex justify-end px-4 py-2">
                  <button onClick={handleSaveSettings} disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan px-4 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50 transition-all">
                    {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                    保存
                  </button>
                </div>
              </SectionCard>

              {/* Storage */}
              <SectionCard title="存储配置" icon={<Database className="size-4 text-brand-cyan" />}>
                <InfoRow label="上传限制" value={`最大 ${config.upload_max_size_mb} MB`} />
              </SectionCard>

              {/* AI Providers */}
              <SectionCard title="AI Provider" icon={<Activity className="size-4 text-brand-cyan" />}>
                {(() => {
                  const x = providerStatus("星河智云", config.xinghe_configured);
                  return <InfoRow label="星河智云" value={x.value} status={x.status} />;
                })()}
                {(() => {
                  const t = providerStatus("天翼云", config.tianyi_configured);
                  return <InfoRow label="天翼云" value={t.value} status={t.status} />;
                })()}
                {(() => {
                  const s = providerStatus("Stability AI", config.stability_configured);
                  return <InfoRow label="Stability AI" value={s.value} status={s.status} />;
                })()}
                {(() => {
                  const b = providerStatus("BFL FLUX", config.bfl_configured);
                  return <InfoRow label="Black Forest Lab (FLUX)" value={b.value} status={b.status} />;
                })()}
              </SectionCard>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
