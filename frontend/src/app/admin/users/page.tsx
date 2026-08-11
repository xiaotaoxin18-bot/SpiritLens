"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Shield,
  ShieldOff,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  AlertCircle,
  ArrowLeft,
  Sun,
  Moon,
  KeyRound,
  CheckCircle2,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/store/theme";
import { api } from "@/services/api";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

interface UserItem {
  id: string;
  username: string | null;
  nickname: string;
  email: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_admin: boolean;
  status: string;
  created_at: string | null;
}

interface UsersResponse {
  total: number;
  page: number;
  page_size: number;
  users: UserItem[];
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const { theme, toggle: toggleTheme } = useTheme();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<UserItem | null>(null);
  const [resetTarget, setResetTarget] = useState<UserItem | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Auto-dismiss reset success toast
  useEffect(() => {
    if (!resetSuccess) return;
    const t = setTimeout(() => setResetSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [resetSuccess]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && (!isAuthenticated || !user?.is_admin)) {
      router.push("/auth/admin/login");
    }
  }, [mounted, isAuthenticated, user, router]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<UsersResponse>("/api/v1/admin/users", {
        page: String(page),
        page_size: "20",
        ...(search ? { q: search } : {}),
      });
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    if (isAuthenticated && user?.is_admin) {
      fetchUsers();
    }
  }, [fetchUsers, isAuthenticated, user]);

  const handleToggleAdmin = async (u: UserItem) => {
    const wasAdmin = u.is_admin;
    try {
      await api.put(`/api/v1/admin/users/${u.id}/toggle-admin`);
      fetchUsers();
      toast(wasAdmin ? "已取消管理员" : "已设为管理员", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "操作失败", "error");
    }
  };

  const handleDeleteUser = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/api/v1/admin/users/${confirmDelete.id}`);
      toast("用户已删除", "success");
      setConfirmDelete(null);
      fetchUsers();
    } catch (err) {
      toast(err instanceof Error ? err.message : "删除失败", "error");
    } finally {
      setDeleting(false);
    }
  };

  const openResetDialog = (u: UserItem) => {
    setResetTarget(u);
    setNewPassword("");
    setConfirmPassword("");
    setResetError(null);
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    if (newPassword.length < 6) {
      setResetError("密码至少 6 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("两次输入的密码不一致");
      return;
    }
    setResetSubmitting(true);
    setResetError(null);
    try {
      await api.post(`/api/v1/admin/users/${resetTarget.id}/reset-password`, {
        new_password: newPassword,
      });
      setResetTarget(null);
      setResetSuccess(`已重置 ${resetTarget.nickname} 的密码`);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "重置失败，请重试");
    } finally {
      setResetSubmitting(false);
    }
  };

  if (!mounted || !isAuthenticated || !user?.is_admin) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base">
        <Loader2 className="size-8 animate-spin text-brand-cyan" />
      </div>
    );
  }

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 1;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">用户管理</h1>
          <p className="text-sm text-text-muted mt-1">
            共 {data?.total ?? "…"} 位用户
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

      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="搜索用户名、昵称或邮箱…"
          className="w-full rounded-xl border border-border-subtle bg-surface-card py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 focus:ring-2 focus:ring-brand-cyan/10 transition-all"
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border-subtle bg-surface-card overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table className="w-full text-sm table-fixed min-w-[900px]">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-elevated sticky top-0 z-10">
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[22%]">用户</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[12%]">账号</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[18%]">邮箱</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[10%]">角色</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[10%]">状态</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-text-muted w-[13%]">注册时间</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-text-muted w-[15%]">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-20 text-center text-text-muted">
                    <Loader2 className="size-5 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : data?.users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-20 text-center text-text-muted">
                    暂无用户
                  </td>
                </tr>
              ) : (
                data?.users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border-subtle last:border-0 hover:bg-surface-elevated/30 transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "size-8 rounded-full flex items-center justify-center text-sm font-medium text-white",
                          u.is_admin
                            ? "bg-gradient-to-br from-accent-amber to-accent-pink"
                            : "bg-gradient-to-br from-brand-purple to-brand-cyan"
                        )}>
                          {u.nickname.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-text-primary">
                          {u.nickname}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-text-secondary">
                      {u.username || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-text-secondary">
                      {u.email || "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      {u.is_admin ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent-amber/10 px-2.5 py-0.5 text-xs font-medium text-accent-amber">
                          <Shield className="size-3" />
                          管理员
                        </span>
                      ) : (
                        <span className="text-text-muted text-xs">用户</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        u.status === "active"
                          ? "bg-accent-green/10 text-accent-green"
                          : "bg-red-500/10 text-red-400"
                      )}>
                        {u.status === "active" ? "正常" : "已禁用"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-text-muted text-xs text-right">
                      {u.created_at
                        ? new Date(u.created_at).toLocaleDateString("zh-CN")
                        : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleToggleAdmin(u)}
                          disabled={u.id === user?.id}
                          title={u.id === user?.id ? "不能修改自己的权限" : u.is_admin ? "取消管理员" : "设为管理员"}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs transition-colors",
                            u.id === user?.id
                              ? "text-text-muted cursor-not-allowed"
                              : u.is_admin
                                ? "text-red-400 hover:bg-red-500/10"
                                : "text-accent-amber hover:bg-accent-amber/10"
                          )}
                        >
                          {u.is_admin ? <ShieldOff className="size-3.5" /> : <Shield className="size-3.5" />}
                          {u.is_admin ? "取消管理" : "设为管理"}
                        </button>
                        {u.id !== user?.id && (
                          <>
                            <button
                              onClick={() => openResetDialog(u)}
                              title="重置密码"
                              className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs text-brand-cyan hover:bg-brand-cyan/10 transition-colors"
                            >
                              <KeyRound className="size-3.5" />
                              重置密码
                            </button>
                            <button
                              onClick={() => setConfirmDelete(u)}
                              title="删除用户"
                              className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="size-3.5" />
                              删除
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > data.page_size && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle">
            <span className="text-xs text-text-muted">
              第 {data.page}/{totalPages} 页，共 {data.total} 条
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex size-8 items-center justify-center rounded-lg border border-border-subtle text-text-secondary hover:bg-surface-light disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex size-8 items-center justify-center rounded-lg border border-border-subtle text-text-secondary hover:bg-surface-light disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reset password dialog */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setResetTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex size-10 items-center justify-center rounded-xl bg-brand-cyan/10">
                <KeyRound className="size-5 text-brand-cyan" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-text-primary">重置密码</h3>
                <p className="text-sm text-text-muted mt-0.5">
                  为 <span className="font-medium text-text-primary">{resetTarget.nickname}</span> 设置新密码
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">新密码</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少 6 位"
                  className="w-full rounded-xl border border-border-subtle bg-surface-elevated px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 focus:ring-2 focus:ring-brand-cyan/10 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleResetPassword();
                  }}
                  className="w-full rounded-xl border border-border-subtle bg-surface-elevated px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 focus:ring-2 focus:ring-brand-cyan/10 transition-all"
                />
              </div>
              {resetError && (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-xs text-red-400">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{resetError}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setResetTarget(null)}
                disabled={resetSubmitting}
                className="rounded-xl px-4 py-2 text-sm text-text-secondary hover:bg-surface-light disabled:opacity-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetSubmitting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-cyan px-4 py-2 text-sm font-medium text-[#0d0d0e] hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {resetSubmitting && <Loader2 className="size-3.5 animate-spin" />}
                确认重置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset success toast */}
      {resetSuccess && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-accent-green/30 bg-surface-overlay/95 px-5 py-3 text-sm text-text-secondary shadow-lg backdrop-blur-xl">
            <CheckCircle2 className="size-4 text-accent-green" />
            <span>{resetSuccess}</span>
          </div>
        </div>
      )}

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex size-10 items-center justify-center rounded-xl bg-red-500/10">
                <AlertCircle className="size-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-text-primary">确认删除</h3>
                <p className="text-sm text-text-muted mt-0.5">
                  确定要删除用户 <span className="font-medium text-text-primary">{confirmDelete.nickname}</span> 吗？
                </p>
              </div>
            </div>
            <p className="text-xs text-red-400/80 mb-5 bg-red-500/5 rounded-xl px-3 py-2">
              此操作不可撤销，该用户的所有数据将被永久删除。
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="rounded-xl px-4 py-2 text-sm text-text-secondary hover:bg-surface-light disabled:opacity-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting && <Loader2 className="size-3.5 animate-spin" />}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
