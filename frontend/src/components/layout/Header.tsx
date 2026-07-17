"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/store/theme";
import Button from "@/components/ui/Button";
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
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { theme, toggle: toggleTheme } = useTheme();

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
    </header>
  );
}
