"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";




import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/store/theme";
import Button from "@/components/ui/Button";
import { api } from "@/services/api";
import {
  Sparkles,
  Menu,
  X,
  Image,
  Video,
  Layout,
  User,
  Users,
  LogOut,
  ChevronDown,
  Sun,
  Moon,
  Shield,
  UserCog,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "AI 图片", href: "/ai-tool/image", icon: Image },
  { label: "AI 视频", href: "/ai-tool/video", icon: Video },
  { label: "智能画布", href: "/ai-tool/canvas", icon: Layout },
  { label: "资产库", href: "/assets", icon: Image },
  { label: "灵感社区", href: "/community", icon: Users },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [pwdOld, setPwdOld] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const pathname = usePathname();
  const { user, isAuthenticated, logout, updateUser } = useAuthStore();
  const { theme, toggle: toggleTheme } = useTheme();

  const openProfile = () => {
    setNickname(user?.nickname || "");
    setSaveError(null);
    setSaveSuccess(false);
    setPwdOld("");
    setPwdNew("");
    setPwdConfirm("");
    setPwdError(null);
    setPwdSuccess(false);
    setUserMenuOpen(false);
    setProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    const name = nickname.trim();
    if (!name) {
      setSaveError("昵称不能为空");
      return;
    }
    if (name === user?.nickname) {
      setProfileOpen(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.put<{
        id: string; nickname: string; avatar_url?: string; bio?: string; is_admin?: boolean;
      }>("/api/v1/auth/me", { nickname: name });
      updateUser(updated);
      setSaveSuccess(true);
      setTimeout(() => { setSaveSuccess(false); setProfileOpen(false); }, 800);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePassword = async () => {
    if (!pwdOld || !pwdNew || !pwdConfirm) {
      setPwdError("请填写完整密码信息");
      return;
    }
    if (pwdNew.length < 6) {
      setPwdError("新密码至少 6 位");
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdError("两次输入的新密码不一致");
      return;
    }
    setSavingPwd(true);
    setPwdError(null);
    try {
      await api.post("/api/v1/auth/change-password", { old_password: pwdOld, new_password: pwdNew });
      setPwdSuccess(true);
      setPwdOld("");
      setPwdNew("");
      setPwdConfirm("");
      setTimeout(() => setPwdSuccess(false), 1500);
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : "修改失败，请重试");
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 glass border-b border-border-subtle">
      <div className="w-full px-4 sm:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-gradient hidden sm:block">
              SpiritLens
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-medium transition-all duration-200",
                    isActive
                      ? "text-brand-cyan bg-brand-cyan/10"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-light"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="text-text-secondary hover:text-text-primary p-2 rounded-lg hover:bg-surface-light transition-all"
              title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            {isAuthenticated && user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] hover:bg-surface-light transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center text-white text-sm font-medium">
                    {user.nickname.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-text-primary hidden sm:block">
                    {user.nickname}
                  </span>
                  <ChevronDown className="w-4 h-4 text-text-muted" />
                </button>

                {userMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setUserMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-48 glass rounded-card border border-border-subtle py-2 z-20 animate-fade-in">
                      {user.is_admin && (
                        <Link
                          href="/admin"
                          className="flex items-center gap-2 px-4 py-2 text-sm text-accent-amber hover:text-accent-amber/80 hover:bg-accent-amber/10 transition-colors"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <Shield className="w-4 h-4" />
                          管理后台
                        </Link>
                      )}
                      <Link
                        href="/workspace"
                        className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-light transition-colors"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <User className="w-4 h-4" />
                        我的工作台
                      </Link>
                      <button
                        onClick={openProfile}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-light w-full transition-colors"
                      >
                        <UserCog className="w-4 h-4" />
                        个人管理
                      </button>
                      <hr className="border-border-subtle my-1" />
                      <button
                        onClick={() => {
                          logout();
                          setUserMenuOpen(false);
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 w-full transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        退出登录
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/auth/login">
                  <Button variant="ghost" size="sm">
                    登录
                  </Button>
                </Link>
                <Link href="/auth/register">
                  <Button variant="primary" size="sm">
                    注册
                  </Button>
                </Link>
              </div>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 text-text-secondary hover:text-text-primary"
            >
              {mobileOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border-subtle animate-fade-in">
          <nav className="px-4 py-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-colors",
                    isActive
                      ? "text-brand-cyan bg-brand-cyan/10"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-light"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      {/* Profile modal */}
      {profileOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => { if (saving) return; setProfileOpen(false); }}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-brand-purple/15">
                <UserCog className="size-5 text-brand-purple" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-text-primary">个人管理</h3>
                <p className="text-sm text-text-muted mt-0.5">修改昵称与密码</p>
              </div>
            </div>

            <label className="block text-xs font-medium text-text-secondary mb-1.5">昵称</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveProfile(); }}
              placeholder="请输入昵称"
              maxLength={100}
              className="w-full rounded-xl border border-border-subtle bg-surface-elevated px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 focus:ring-2 focus:ring-brand-cyan/10 transition-all"
            />

            {saveError && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-xs text-red-400">
                <AlertCircle className="size-4 shrink-0" />
                <span>{saveError}</span>
              </div>
            )}
            {saveSuccess && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-accent-green/20 bg-accent-green/5 px-3 py-2.5 text-xs text-accent-green">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>昵称已更新</span>
              </div>
            )}

            {/* 修改密码 */}
            <div className="mt-6 pt-5 border-t border-border-subtle">
              <h4 className="text-xs font-semibold text-text-primary mb-3">修改密码</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">当前密码</label>
                  <input
                    type="password"
                    value={pwdOld}
                    onChange={(e) => setPwdOld(e.target.value)}
                    placeholder="请输入当前密码"
                    className="w-full rounded-xl border border-border-subtle bg-surface-elevated px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 focus:ring-2 focus:ring-brand-cyan/10 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">新密码</label>
                  <input
                    type="password"
                    value={pwdNew}
                    onChange={(e) => setPwdNew(e.target.value)}
                    placeholder="至少 6 位"
                    className="w-full rounded-xl border border-border-subtle bg-surface-elevated px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 focus:ring-2 focus:ring-brand-cyan/10 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">确认新密码</label>
                  <input
                    type="password"
                    value={pwdConfirm}
                    onChange={(e) => setPwdConfirm(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSavePassword(); }}
                    placeholder="再次输入新密码"
                    className="w-full rounded-xl border border-border-subtle bg-surface-elevated px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 focus:ring-2 focus:ring-brand-cyan/10 transition-all"
                  />
                </div>
                {pwdError && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-xs text-red-400">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{pwdError}</span>
                  </div>
                )}
                {pwdSuccess && (
                  <div className="flex items-center gap-2 rounded-xl border border-accent-green/20 bg-accent-green/5 px-3 py-2.5 text-xs text-accent-green">
                    <CheckCircle2 className="size-4 shrink-0" />
                    <span>密码已更新</span>
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    onClick={handleSavePassword}
                    disabled={savingPwd || !pwdOld || !pwdNew || !pwdConfirm}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-brand-cyan/40 text-brand-cyan px-4 py-2 text-sm font-medium hover:bg-brand-cyan/10 disabled:opacity-50 transition-all"
                  >
                    {savingPwd && <Loader2 className="size-3.5 animate-spin" />}
                    修改密码
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-5">
              <button
                onClick={() => setProfileOpen(false)}
                disabled={saving}
                className="rounded-xl px-4 py-2 text-sm text-text-secondary hover:bg-surface-light disabled:opacity-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={saving || !nickname.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-cyan px-4 py-2 text-sm font-medium text-[#0d0d0e] hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {saving && <Loader2 className="size-3.5 animate-spin" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
