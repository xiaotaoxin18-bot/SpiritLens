"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Heart, MessageCircle, Eye, Clock, Loader2,
  Sparkles, Send, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthGuard } from "@/components/auth/AuthGuard";
import Button from "@/components/ui/Button";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

function imgUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path}`;
}

interface PostDetail {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  cover_width: number | null;
  cover_height: number | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  is_featured: boolean;
  user_id: string;
  user_nickname: string;
  user_avatar: string | null;
  liked: boolean;
  created_at: string;
}

interface CommentItem {
  id: string;
  content: string;
  user_id: string;
  user_nickname: string;
  user_avatar: string | null;
  created_at: string;
}

export default function CommunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params.id as string;
  const { user } = useAuthStore();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  // Fetch post details
  const fetchPost = useCallback(async () => {
    try {
      const data = await api.get<PostDetail>(`/api/v1/community/posts/${postId}`);
      setPost(data);
      setLiked(data.liked);
      setLikeCount(data.like_count);
    } catch {
      setError("作品不存在或已删除");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      const data = await api.get<{ comments: CommentItem[] }>(
        `/api/v1/community/posts/${postId}/comments`,
      );
      setComments(data.comments);
    } catch {
      // ignore
    }
  }, [postId]);

  useEffect(() => {
    fetchPost();
    fetchComments();
  }, [fetchPost, fetchComments]);

  // Toggle like
  const handleLike = async () => {
    if (likeBusy) return;
    setLikeBusy(true);
    // Optimistic update
    setLiked((v) => !v);
    setLikeCount((v) => (liked ? v - 1 : v + 1));
    try {
      const data = await api.post<{ liked: boolean; like_count: number }>(
        `/api/v1/community/posts/${postId}/like`,
      );
      setLiked(data.liked);
      setLikeCount(data.like_count);
    } catch {
      // Revert
      setLiked((v) => !v);
      setLikeCount((v) => (liked ? v + 1 : v - 1));
    } finally {
      setLikeBusy(false);
    }
  };

  // Submit comment
  const handleComment = async () => {
    if (!commentText.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      const data = await api.post<{ id: string }>(
        `/api/v1/community/posts/${postId}/comments`,
        { content: commentText.trim() },
      );
      setCommentText("");
      // Refresh comments and count
      await fetchComments();
      setLikeCount((v) => v); // comment_count incremented server-side
      fetchPost(); // refresh counts
    } catch {
      // ignore
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleComment();
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (deletingCommentId) return;
    setDeletingCommentId(commentId);
    try {
      await api.delete(`/api/v1/community/posts/${postId}/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      if (post) setPost({ ...post, comment_count: Math.max(0, post.comment_count - 1) });
    } catch {
      // ignore
    } finally {
      setDeletingCommentId(null);
    }
  };

  const formatDate = (iso: string) => {
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
      year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  // Loading state
  if (loading) {
    return (
      <AuthGuard>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="size-8 animate-spin text-text-muted" />
        </div>
      </AuthGuard>
    );
  }

  // Error state
  if (error || !post) {
    return (
      <AuthGuard>
        <div className="w-full px-4 sm:px-8 py-10 flex-1">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-6"
          >
            <ArrowLeft className="size-4" />
            返回
          </button>
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-white/[0.04]">
              <Sparkles className="size-6 text-text-muted" />
            </div>
            <h3 className="text-base font-semibold text-text-primary mb-1">
              {error || "作品不存在"}
            </h3>
            <p className="text-sm text-text-muted mb-6">
              该作品可能已被作者删除
            </p>
            <Button variant="secondary" onClick={() => router.push("/community")}>
              返回社区
            </Button>
          </div>
        </div>
      </AuthGuard>
    );
  }

  // Compute aspect ratio for cover image
  let coverPadding = "56.25%"; // 16:9 default
  if (post.cover_width && post.cover_height) {
    const ratio = post.cover_height / post.cover_width;
    coverPadding = `${Math.min(ratio * 100, 200)}%`;
  }

  return (
    <AuthGuard>
      <div className="w-full px-4 sm:px-8 py-10 flex-1 max-w-5xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-6"
        >
          <ArrowLeft className="size-4" />
          返回社区
        </button>

        {/* Post content */}
        <div className="rounded-3xl border border-white/[0.08] light:border-black/[0.08] bg-surface-card overflow-hidden">
          {/* Cover image */}
          {post.cover_url ? (
            <div className="relative w-full" style={{ paddingBottom: coverPadding }}>
              <img
                src={imgUrl(post.cover_url)}
                alt={post.title}
                className="absolute inset-0 h-full w-full object-contain bg-black/20"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center py-24 bg-gradient-to-br from-brand-purple/10 to-brand-cyan/10">
              <Sparkles className="size-16 text-text-muted/20" />
            </div>
          )}

          {/* Post info */}
          <div className="px-6 sm:px-8 py-6">
            {/* Author + date */}
            <div className="flex items-center gap-3 mb-4">
              <div className="size-10 rounded-full bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center text-white text-sm font-medium">
                {post.user_nickname.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {post.user_nickname}
                </p>
                <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {formatDate(post.created_at)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="size-3" />
                    {post.view_count} 次浏览
                  </span>
                </div>
              </div>
            </div>

            {/* Title + description */}
            <h1 className="text-2xl font-bold text-text-primary mb-3">
              {post.title}
            </h1>
            {post.description && (
              <p className="text-text-secondary text-sm leading-relaxed mb-6 whitespace-pre-wrap">
                {post.description}
              </p>
            )}

            {/* Action bar */}
            <div className="flex items-center gap-4 pt-4 border-t border-white/[0.06] light:border-black/[0.06]">
              {/* Like button */}
              <button
                onClick={handleLike}
                disabled={likeBusy}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition-all",
                  liked
                    ? "bg-red-500/10 text-red-400 hover:bg-red-500/15"
                    : "bg-white/[0.04] light:bg-black/[0.03] text-text-secondary hover:bg-white/[0.08] light:hover:bg-black/[0.05]",
                )}
              >
                <Heart
                  className={cn("size-4", liked && "fill-red-400")}
                />
                {likeCount > 0 ? likeCount : "点赞"}
              </button>

              {/* Comment count */}
              <div className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-text-secondary bg-white/[0.04] light:bg-black/[0.03]">
                <MessageCircle className="size-4" />
                {comments.length > 0 ? `${comments.length} 条评论` : "评论"}
              </div>
            </div>
          </div>
        </div>

        {/* Comment section */}
        <div className="mt-6 rounded-3xl border border-white/[0.08] light:border-black/[0.08] bg-surface-card px-6 sm:px-8 py-6">
          <h2 className="text-base font-semibold text-text-primary mb-6">
            评论 ({comments.length})
          </h2>

          {/* Comment input */}
          {user && (
            <div className="flex items-start gap-3 mb-6">
              <div className="size-9 shrink-0 rounded-full bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center text-white text-xs font-medium">
                {user.nickname?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="写下你的评论... Enter 发送，Shift+Enter 换行"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-white/[0.03] light:bg-black/[0.02] px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-cyan/40 transition-colors"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-text-muted">
                    {commentText.length > 0
                      ? `${commentText.length} 字`
                      : "文明发言，友善交流"}
                  </span>
                  <button
                    onClick={handleComment}
                    disabled={!commentText.trim() || submittingComment}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-medium transition-all",
                      commentText.trim()
                        ? "bg-brand-cyan text-black hover:brightness-110"
                        : "bg-white/[0.05] light:bg-black/[0.04] text-text-muted cursor-not-allowed",
                    )}
                  >
                    {submittingComment ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                    发送
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Comments list */}
          {comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageCircle className="size-10 text-text-muted/30 mb-3" />
              <p className="text-sm text-text-muted">还没有评论，来说点什么吧</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="flex items-start gap-3 py-3"
                >
                  <div className="size-9 shrink-0 rounded-full bg-gradient-to-br from-brand-purple/60 to-brand-cyan/60 flex items-center justify-center text-white text-xs font-medium">
                    {comment.user_nickname.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-text-primary">
                        {comment.user_nickname}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        {formatDate(comment.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed">
                      {comment.content}
                    </p>
                  </div>
                  {/* Delete own comment */}
                  {user?.id === comment.user_id && (
                    <button
                      onClick={() => handleDeleteComment(comment.id)}
                      disabled={deletingCommentId === comment.id}
                      className="shrink-0 p-1 text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                      title="删除"
                    >
                      {deletingCommentId === comment.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
