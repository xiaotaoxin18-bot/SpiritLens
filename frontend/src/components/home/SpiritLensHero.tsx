"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Box,
  ChevronDown,
  Image,
  LayoutGrid,
  LogOut,
  Moon,
  Shield,
  Sparkles,
  Sun,
  User,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import { useTheme } from "@/store/theme";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";

const basePath = "/spiritlens";

const navItems = [
  { label: "AI 图片", href: "/ai-tool/image", icon: Image },
  { label: "AI 视频", href: "/ai-tool/video", icon: Video },
  { label: "智能画布", href: "/ai-tool/canvas", icon: LayoutGrid },
  { label: "资产库", href: "/assets", icon: Box },
  { label: "灵感社区", href: "/community", icon: Users },
];

function layerPath(name: string, theme: "dark" | "light") {
  return `${basePath}/spiritlens-hero/layers/${name}-${theme}.png`;
}

export default function SpiritLensHero() {
  const { theme, toggle } = useTheme();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const isLight = theme === "light";
  const assetTheme = isLight ? "light" : "dark";

  return (
    <section className="spirit-code-hero" data-theme={theme}>
      <div className="hero-bitmap-art" aria-hidden="true">
        <img className="hero-layer hero-layer-sky" src={layerPath("sky", assetTheme)} alt="" draggable={false} />
        <img className="hero-layer hero-layer-mountains" src={layerPath("mountains", assetTheme)} alt="" draggable={false} />
        <span className="hero-mountain-reflection" />
        <img className="hero-layer hero-layer-platform" src={layerPath("platform", assetTheme)} alt="" draggable={false} />
        <img className="hero-layer hero-layer-crystals" src={layerPath("crystals", assetTheme)} alt="" draggable={false} />
        <span className="hero-orbit-shimmer" />
        <span className="hero-platform-pulse" />
        <span className="hero-particle-field particle-a" />
        <span className="hero-particle-field particle-b" />
        <span className="hero-art-vignette" />
      </div>

      <header className="hero-nav">
        <Link className="hero-brand" href="/" aria-label="SpiritLens 首页">
          <span className="brand-icon">
            <Sparkles size={21} />
          </span>
          <span>SpiritLens</span>
        </Link>

        <nav className="hero-menu" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link href={item.href} key={item.href}>
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="hero-actions">
          <button type="button" className="round-control" onClick={toggle} aria-label="切换深浅色主题">
            {isLight ? <Sun size={18} /> : <Moon size={20} />}
          </button>

          {isAuthenticated && user ? (
            <div className="relative">
              <button
                type="button"
                className="admin-control"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <span className="admin-avatar">
                  <UserRound size={17} />
                </span>
                <span>{user.nickname || "用户"}</span>
                <ChevronDown size={15} className={cn("transition-transform", menuOpen && "rotate-180")} />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-48 glass rounded-card border border-border-subtle py-2 z-20 animate-fade-in">
                    {user.is_admin && (
                      <Link
                        href="/admin"
                        className="flex items-center gap-2 px-4 py-2 text-sm text-accent-amber hover:text-accent-amber/80 hover:bg-accent-amber/10 transition-colors"
                        onClick={() => setMenuOpen(false)}
                      >
                        <Shield className="w-4 h-4" />
                        管理后台
                      </Link>
                    )}
                    <Link
                      href="/workspace"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-light transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <User className="w-4 h-4" />
                      我的工作台
                    </Link>
                    <hr className="border-border-subtle my-1" />
                    <button
                      onClick={() => {
                        logout();
                        setMenuOpen(false);
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
              <Link href="/auth/login" className="hero-button secondary !w-auto !h-8 !min-w-0 !py-1 !px-4 !text-[11px] !rounded-lg">
                登录
              </Link>
              <Link href="/auth/register" className="hero-button primary !w-auto !h-8 !min-w-0 !py-1 !px-4 !text-[11px] !rounded-lg">
                注册
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="hero-copy">
        <div className="hero-badge">
          <Sparkles size={16} />
          <span>一站式 AI 创作平台 · 即点即用</span>
        </div>

        <h1 className="hero-title">
          <span>释放你的</span>
          <strong>无限想象力</strong>
        </h1>

        <p className="hero-subtitle">
          AI 图片生成 · AI 视频生成 · 智能画布 · 数字人
          <br />
          输入创意描述，秒级生成你的专属作品
        </p>

        <Link className="hero-prompt" href="/ai-tool/image">
          <Sparkles size={18} />
          <span>试试输入：</span>
          <strong>赛博城市，未来世界</strong>
        </Link>

        <div className="hero-cta">
          <Link className="hero-button primary" href="/ai-tool/image">
            开始创作
            <ArrowRight size={19} />
          </Link>
          <Link className="hero-button secondary" href="/community">
            探索灵感
          </Link>
        </div>
      </main>
    </section>
  );
}
