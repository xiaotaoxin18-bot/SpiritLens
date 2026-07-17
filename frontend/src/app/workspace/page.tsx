"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  FolderOpen, Image, Video, Plus, Loader2, Clock, Sparkles,
  ArrowRight, BarChart3, Palette,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import Button from "@/components/ui/Button";
import { api } from "@/services/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface AssetItem {
  id: string;
  type: string;
  status: string;
  media_url: string | null;
  thumbnail_url: string | null;
  prompt: string;
  width: number | null;
  height: number | null;
  image_urls: string[];
  created_at: string;
}

function imgUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  return d.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

export default function WorkspacePage() {
  const router = useRouter();
  const [items, setItems] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const load = useCallback(() => {
    api
      .get<{ items: AssetItem[]; total: number }>(
        "/api/v1/user/assets?page_size=50",
      )
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Compute stats
  const imageCount = items.filter((i) => i.type === "image").length;
  const videoCount = items.filter((i) => i.type === "video").length;
  const recentItems = items.slice(0, 12);

  const stats = [
    {
      label: "全部作品",
      value: total,
      icon: Palette,
      color: "from-brand-purple to-brand-cyan",
      sub: "累计创作",
    },
    {
      label: "图片作品",
      value: imageCount,
      icon: Image,
      color: "from-accent-amber to-accent-pink",
      sub:
        total > 0 ? `${Math.round((imageCount / total) * 100)}%` : "—",
    },
    {
      label: "视频作品",
      value: videoCount,
      icon: Video,
      color: "from-accent-green to-brand-cyan",
      sub:
        total > 0 ? `${Math.round((videoCount / total) * 100)}%` : "—",
    },
  ];

  return (
    <AuthGuard>
      <div className="w-full px-4 sm:px-8 py-10 flex-1">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">我的工作台</h1>
            <p className="text-text-muted text-sm mt-1">管理你的所有创作作品</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => router.push("/assets")}
              leftIcon={<FolderOpen className="w-4 h-4" />}
            >
              资产库
            </Button>
            <Button
              variant="primary"
              onClick={() => router.push("/ai-tool/image")}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              新建创作
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="size-8 animate-spin text-text-muted" />
          </div>
        ) : total === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-20 h-20 rounded-2xl glass flex items-center justify-center mb-6">
              <FolderOpen className="w-10 h-10 text-text-muted" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              还没有作品
            </h3>
            <p className="text-text-muted text-sm mb-6">
              开始你的第一个 AI 创作吧
            </p>
            <Button
              variant="primary"
              onClick={() => router.push("/ai-tool/image")}
              leftIcon={<Sparkles className="w-4 h-4" />}
            >
              去创作
            </Button>
          </div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-white/[0.08] light:border-black/[0.08] bg-surface-card p-5"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs text-text-muted">
                        {stat.label}
                      </span>
                      <div
                        className={cn(
                          "w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center",
                          stat.color,
                        )}
                      >
                        <Icon className="size-4 text-white" />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-text-primary">
                      {stat.value}
                    </p>
                    <p className="text-xs text-text-muted mt-1">{stat.sub}</p>
                  </div>
                );
              })}
            </div>

            {/* Recent creations */}
            <div className="rounded-2xl border border-white/[0.08] light:border-black/[0.08] bg-surface-card p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-text-primary">
                  最近创作
                </h2>
                <button
                  onClick={() => router.push("/assets")}
                  className="inline-flex items-center gap-1 text-xs text-brand-cyan hover:text-brand-cyan/80 transition-colors"
                >
                  查看全部
                  <ArrowRight className="size-3.5" />
                </button>
              </div>

              {recentItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                  <Image className="size-10 mb-3 opacity-30" />
                  <p className="text-sm">暂无作品</p>
                </div>
              ) : (
                <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 sm:gap-4">
                  {recentItems.map((item, i) => {
                    const displayUrl =
                      item.image_urls?.[0] ||
                      item.thumbnail_url ||
                      item.media_url;

                    let ratioPercent = "75%";
                    if (item.width && item.height) {
                      const ratio = item.height / item.width;
                      ratioPercent = `${Math.min(ratio * 100, 200)}%`;
                    } else {
                      ratioPercent = ["75%", "100%", "133%", "56%"][i % 4];
                    }

                    return (
                      <div
                        key={item.id}
                        onClick={() => router.push("/assets")}
                        className="break-inside-avoid mb-3 sm:mb-4 group cursor-pointer"
                      >
                        <div className="relative overflow-hidden rounded-xl bg-white/[0.03] light:bg-black/[0.02] transition-all duration-200 hover:ring-1 hover:ring-brand-cyan/30">
                          <div style={{ paddingBottom: ratioPercent }}>
                            {displayUrl ? (
                              item.type === "video" ? (
                                <div className="absolute inset-0">
                                  <video
                                    src={imgUrl(displayUrl)}
                                    className="h-full w-full object-cover"
                                    preload="metadata"
                                    muted
                                    playsInline
                                  />
                                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="size-8 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm">
                                      <svg className="size-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z"/>
                                      </svg>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <img
                                  src={imgUrl(displayUrl)}
                                  alt={item.prompt}
                                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                  loading="lazy"
                                />
                              )
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-purple/10 to-brand-cyan/10">
                                <Image className="size-6 text-text-muted/20" />
                              </div>
                            )}
                          </div>

                          {/* Type badge */}
                          <div className="absolute top-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                            {item.type === "image" ? "图片" : "视频"}
                          </div>

                          {/* Gradient overlay */}
                          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

                          {/* Info */}
                          <div className="absolute inset-x-0 bottom-0 p-2.5">
                            <p className="text-white text-xs leading-tight line-clamp-1 drop-shadow-sm">
                              {item.prompt || "未命名作品"}
                            </p>
                            <div className="flex items-center gap-1 mt-1 text-white/50 text-[10px]">
                              <Clock className="size-2.5" />
                              {formatDate(item.created_at)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => router.push("/ai-tool/image")}
                className="rounded-2xl border border-white/[0.08] light:border-black/[0.08] bg-surface-card p-5 text-left hover:bg-white/[0.03] light:hover:bg-black/[0.02] transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="size-12 rounded-xl bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center">
                    <Sparkles className="size-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary group-hover:text-brand-cyan transition-colors">
                      AI 图片生成
                    </h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      文生图 · 图生图 · 参考图
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-text-muted ml-auto group-hover:text-brand-cyan transition-colors" />
                </div>
              </button>

              <button
                onClick={() => router.push("/ai-tool/canvas")}
                className="rounded-2xl border border-white/[0.08] light:border-black/[0.08] bg-surface-card p-5 text-left hover:bg-white/[0.03] light:hover:bg-black/[0.02] transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="size-12 rounded-xl bg-gradient-to-br from-accent-amber to-accent-pink flex items-center justify-center">
                    <BarChart3 className="size-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary group-hover:text-brand-cyan transition-colors">
                      智能画布
                    </h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      节点式工作流 · 无限画布
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-text-muted ml-auto group-hover:text-brand-cyan transition-colors" />
                </div>
              </button>
            </div>
          </>
        )}
      </div>
    </AuthGuard>
  );
}
