"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Loader2, Trash2, ArrowLeft, Sun, Moon,
  Image as ImageIcon, Sparkles,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/store/theme";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";

interface PostItem {
  id: string;
  title: string;
  cover_url: string | null;
  like_count: number;
  view_count: number;
  comment_count: number;
  user_nickname: string;
  user_id: string;
  created_at: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

function imgUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path}`;
}

const SIDEBAR = [
  { label: "仪表盘", icon: Sparkles, href: "/admin" },
  { label: "模型管理", icon: Sparkles, href: "/admin/models" },
  { label: "用户管理", icon: Sparkles, href: "/admin/users" },
  { label: "使用记录", icon: Sparkles, href: "/admin/logs" },
  { label: "社区管理", icon: Sparkles, href: "/admin/community" },
];

export default function AdminCommunityPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { theme, toggle: toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && (!isAuthenticated || !user?.is_admin)) {
      router.push("/auth/admin/login");
    }
  }, [mounted, isAuthenticated, user, router]);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ posts: PostItem[] }>("/api/v1/community/posts?page_size=100");
      setPosts(res.posts);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !user?.is_admin) return;
    loadPosts();
  }, [isAuthenticated, user]);

  const handleDelete = async (postId: string, title: string) => {
    if (!confirm(`确定删除作品「${title.slice(0, 30)}」？此操作不可撤销。`)) return;
    setDeleting(postId);
    try {
      await api.delete(`/api/v1/community/posts/${postId}`);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "未知错误";
      alert("删除失败: " + msg);
    } finally {
      setDeleting(null);
    }
  };

  const filtered = search
    ? posts.filter(
        (p) =>
          p.title.toLowerCase().includes(search.toLowerCase()) ||
          p.user_nickname.toLowerCase().includes(search.toLowerCase()),
      )
    : posts;

  if (!mounted || !isAuthenticated || !user?.is_admin) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base">
        <Loader2 className="size-8 animate-spin text-brand-cyan" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-surface-base">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-border-subtle bg-surface-elevated/60 backdrop-blur-xl flex flex-col">
        <div className="flex items-center gap-2 px-5 h-16 border-b border-border-subtle">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-text-primary">管理后台</span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {SIDEBAR.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === "/admin/community";
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-brand-cyan/10 text-brand-cyan"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-light",
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
            <span className="text-[10px] text-text-muted">{theme === "dark" ? "深色模式" : "浅色模式"}</span>
            <button onClick={toggleTheme} className="flex size-7 items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-light transition-all">
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
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
            退出登录
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">社区管理</h1>
              <p className="text-sm text-text-muted mt-1">
                管理所有用户发布的作品，共 {posts.length} 个作品
              </p>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索作品标题或作者..."
                className="w-full rounded-xl border border-border-subtle bg-surface-card py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 transition-colors"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="size-6 animate-spin text-text-muted" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-text-muted">
              <ImageIcon className="size-10 mb-3 opacity-30" />
              <p className="text-sm">{search ? "没有匹配的作品" : "暂无发布的作品"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((post) => (
                <div key={post.id}
                  className="flex items-center gap-4 rounded-2xl border border-border-subtle bg-surface-card p-4"
                >
                  {/* Thumbnail */}
                  <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-surface-light">
                    {post.cover_url ? (
                      <img src={imgUrl(post.cover_url)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="size-5 text-text-muted/30" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{post.title}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {post.user_nickname} · {post.like_count} 赞 · {post.comment_count} 评论 · {post.view_count} 浏览
                    </p>
                    <p className="text-[10px] text-text-muted/60 mt-0.5">
                      {post.created_at ? new Date(post.created_at).toLocaleString("zh-CN") : "—"}
                    </p>
                  </div>

                  {/* Actions */}
                  <button
                    onClick={() => handleDelete(post.id, post.title)}
                    disabled={deleting === post.id}
                    className="flex shrink-0 size-9 items-center justify-center rounded-xl text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
