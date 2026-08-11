"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Heart,
  Eye,
  Sparkles,
  TrendingUp,
  Clock,
  Flame,
  MessageCircle,
  Loader2,
} from "lucide-react";
import Button from "@/components/ui/Button";
import { api } from "@/services/api";

const TABS = [
  { label: "最新", icon: Clock, sort: "latest" },
  { label: "热门", icon: Flame, sort: "popular" },
  { label: "推荐", icon: Sparkles, sort: "featured" },
  { label: "关注", icon: TrendingUp, sort: "" },
];

interface PostItem {
  id: string;
  title: string;
  cover_url: string | null;
  cover_width: number | null;
  cover_height: number | null;
  like_count: number;
  view_count: number;
  comment_count: number;
  user_id: string;
  user_nickname: string;
  created_at: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

function imgUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path}`;
}

export default function CommunityGallery() {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [imgRatios, setImgRatios] = useState<Record<string, number>>({});
  const pageSize = 20;

  useEffect(() => {
    setLoading(true);
    setPosts([]);
    setPage(1);
    const sort = activeTab.sort;
    api
      .get<{ total: number; posts: PostItem[] }>(
        `/api/v1/community/posts?page=1&page_size=${pageSize}&sort=${sort}`,
      )
      .then((res) => {
        setPosts(res.posts);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeTab]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const next = page + 1;
    const sort = activeTab.sort;
    try {
      const res = await api.get<{ total: number; posts: PostItem[] }>(
        `/api/v1/community/posts?page=${next}&page_size=${pageSize}&sort=${sort}`,
      );
      setPosts((prev) => [...prev, ...res.posts]);
      setPage(next);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  const handleLike = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (likingIds.has(postId)) return;
    setLikingIds((prev) => new Set(prev).add(postId));
    // Optimistic update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, like_count: p.like_count + 1 } : p,
      ),
    );
    try {
      const res = await api.post<{ liked: boolean; like_count: number }>(
        `/api/v1/community/posts/${postId}/like`,
      );
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, like_count: res.like_count } : p,
        ),
      );
    } catch {
      // Revert
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, like_count: Math.max(0, p.like_count - 1) } : p,
        ),
      );
    } finally {
      setLikingIds((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  };

  return (
    <div className="w-full px-4 sm:px-8 py-8 flex-1">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          灵感社区
        </h1>
        <p className="text-text-muted text-sm">
          探索来自大家的创意作品，发现无限灵感
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab.label === tab.label;
          return (
            <button
              key={tab.label}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-medium transition-all whitespace-nowrap",
                isActive
                  ? "bg-brand-cyan/10 text-brand-cyan"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-light",
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-6 animate-spin text-text-muted" />
        </div>
      ) : posts.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-white/[0.04]">
            <Sparkles className="size-6 text-text-muted" />
          </div>
          <h3 className="text-base font-semibold text-text-primary mb-1">
            还没有作品
          </h3>
          <p className="text-sm text-text-muted">
            第一个发布作品的人就是你
          </p>
        </div>
      ) : (
        <>
          {/* Waterfall masonry layout — CSS columns */}
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 sm:gap-4">
            {posts.map((post, i) => {
              // Calculate aspect ratio for padding-bottom trick
              const hasDims = post.cover_width && post.cover_height;
              const imgKey = post.cover_url || post.id;
              const knownRatio = hasDims
                ? Math.min(post.cover_height! / post.cover_width!, 2)
                : imgRatios[imgKey] || 0;
              const paddingBottom = knownRatio
                ? `${knownRatio * 100}%`
                : ["75%", "100%", "133%", "56%"][i % 4];

              return (
                <Link
                  key={post.id}
                  href={`/community/${post.id}`}
                  className="break-inside-avoid mb-3 sm:mb-4 group cursor-pointer block"
                >
                  <div className="relative overflow-hidden rounded-2xl bg-surface-card transition-all duration-200 hover:ring-1 hover:ring-brand-cyan/30 hover:shadow-lg hover:shadow-brand-cyan/5">
                    {/* Image container with aspect ratio padding */}
                    <div style={{ paddingBottom }}>
                      {post.cover_url ? (
                        <img
                          src={imgUrl(post.cover_url)}
                          alt={post.title}
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                          onLoad={(e) => {
                            // Detect natural ratio when dimensions are unknown
                            if (!hasDims) {
                              const img = e.currentTarget;
                              const ratio = img.naturalHeight / img.naturalWidth;
                              setImgRatios((prev) => ({
                                ...prev,
                                [imgKey]: Math.min(ratio, 2),
                              }));
                            }
                          }}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-purple/10 to-brand-cyan/10">
                          <Sparkles className="size-8 text-muted/20" />
                        </div>
                      )}
                    </div>

                    {/* Gradient overlay at bottom */}
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

                    {/* Info overlay */}
                    <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                      <p className="text-white font-semibold text-sm leading-tight line-clamp-2 drop-shadow-sm">
                        {post.title}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-white/60 text-xs">
                        {/* Like button */}
                        <button
                          onClick={(e) => handleLike(e, post.id)}
                          className="flex items-center gap-1 hover:text-red-400 transition-colors"
                        >
                          <Heart className="w-3.5 h-3.5" />
                          {post.like_count}
                        </button>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-3.5 h-3.5" />
                          {post.comment_count}
                        </span>
                      </div>
                      <p className="text-white/40 text-[10px] mt-1">
                        {post.user_nickname}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Load More */}
          {posts.length < total && (
            <div className="flex justify-center mt-8 sm:mt-10">
              <Button variant="secondary" size="lg" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <><Loader2 className="size-4 animate-spin" />加载中...</>
                ) : (
                  "加载更多作品"
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
