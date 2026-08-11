"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Loader2,
  Plus,
  Trash2,
  Edit3,
  ToggleLeft,
  ToggleRight,
  Cpu,
  Image,
  Video,
  FileText,
  Check,
  X,
  AlertCircle,
  Wifi,
  ArrowLeft,
  Sun,
  Moon,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/store/theme";
import { api } from "@/services/api";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

interface ModelItem {
  id: string;
  name: string;
  vendor: string;
  type: "image" | "video" | "text";
  api_endpoint: string | null;
  api_key: string | null;
  is_enabled: boolean;
  sort_order: number;
  cost_per_unit: number;
  params: Record<string, unknown> | null;
  created_at: string | null;
}

interface ModelForm {
  name: string;
  vendor: string;
  type: "image" | "video" | "text";
  api_endpoint: string;
  api_key: string;
  cost_per_unit: number;
  is_enabled: boolean;
}

const EMPTY_FORM: ModelForm = {
  name: "",
  vendor: "",
  type: "image",
  api_endpoint: "",
  api_key: "",
  cost_per_unit: 1,
  is_enabled: true,
};

export default function AdminModelsPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const { theme, toggle: toggleTheme } = useTheme();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "image" | "video" | "text">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ModelForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; detail: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ModelItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && (!isAuthenticated || !user?.is_admin)) {
      router.push("/auth/admin/login");
    }
  }, [mounted, isAuthenticated, user, router]);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterType !== "all") params.type = filterType;
      const res = await api.get<{ models: ModelItem[] }>("/api/v1/admin/models", params);
      setModels(res.models);
    } catch {
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    if (isAuthenticated && user?.is_admin) {
      fetchModels();
    }
  }, [fetchModels, isAuthenticated, user]);

  const filtered = models.filter((m) =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.vendor.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setTestResult(null);
    setShowForm(true);
  };

  const openEdit = (m: ModelItem) => {
    setForm({
      name: m.name,
      vendor: m.vendor,
      type: m.type,
      api_endpoint: m.api_endpoint || "",
      api_key: m.api_key || "",
      cost_per_unit: m.cost_per_unit,
      is_enabled: m.is_enabled,
    });
    setEditingId(m.id);
    setTestResult(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/api/v1/admin/models/${editingId}`, form);
      } else {
        await api.post("/api/v1/admin/models", form);
      }
      setShowForm(false);
      fetchModels();
      toast(editingId ? "模型已更新" : "模型已添加", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (m: ModelItem) => {
    setTogglingId(m.id);
    try {
      await api.put(`/api/v1/admin/models/${m.id}/toggle`);
      fetchModels();
      toast(m.is_enabled ? "已停用" : "已启用", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "操作失败", "error");
    } finally {
      setTogglingId(null);
    }
  };

  const handleTestConnection = async () => {
    if (!form.api_endpoint) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post<{ success: boolean; detail: string }>(
        "/api/v1/admin/models/test-connection",
        { api_endpoint: form.api_endpoint }
      );
      setTestResult(res);
    } catch (err) {
      setTestResult({
        success: false,
        detail: err instanceof Error ? err.message : "请求失败",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/api/v1/admin/models/${confirmDelete.id}`);
      toast("模型已删除", "success");
      setConfirmDelete(null);
      fetchModels();
    } catch (err) {
      toast(err instanceof Error ? err.message : "删除失败", "error");
    } finally {
      setDeleting(false);
    }
  };

  if (!mounted || !isAuthenticated || !user?.is_admin) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base">
        <Loader2 className="size-8 animate-spin text-brand-cyan" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header row — fixed */}
      <div className="shrink-0 px-8 pt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">模型管理</h1>
            <p className="text-sm text-text-muted mt-1">
              管理 AI 模型配置，共 {models.length} 个模型
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
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-accent-amber to-accent-pink px-4 py-2 text-sm font-medium text-white hover:brightness-110 transition-all"
            >
              <Plus className="size-4" />
              添加模型
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable: Filters + Table */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索模型名称或厂商…"
              className="w-full rounded-xl border border-border-subtle bg-surface-card py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 focus:ring-2 focus:ring-brand-cyan/10 transition-all"
            />
          </div>
          <div className="flex rounded-xl border border-border-subtle p-0.5 bg-surface-card">
            {(["all", "image", "video", "text"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors",
                  filterType === t
                    ? "bg-surface-elevated text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                )}
              >
                {t === "image" && <Image className="size-3.5" />}
                {t === "video" && <Video className="size-3.5" />}
                {t === "all" ? "全部" : t === "image" ? "图片" : t === "video" ? "视频" : "文本"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border-subtle bg-surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-elevated/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[22%]">模型名称</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[14%]">厂商</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[10%]">类型</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[10%]">消耗</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted w-[10%]">状态</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted w-[34%]">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-20 text-center text-text-muted">
                      <Loader2 className="size-5 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-20 text-center text-text-muted">
                      <Cpu className="size-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">暂无模型</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-border-subtle last:border-0 hover:bg-surface-elevated/30 transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "size-8 rounded-lg flex items-center justify-center",
                            m.type === "image"
                              ? "bg-gradient-to-br from-brand-purple to-brand-cyan"
                              : m.type === "video"
                              ? "bg-gradient-to-br from-accent-pink to-accent-amber"
                              : "bg-gradient-to-br from-brand-cyan to-accent-green"
                          )}>
                            {m.type === "image"
                              ? <Image className="size-4 text-white" />
                              : m.type === "video"
                              ? <Video className="size-4 text-white" />
                              : <FileText className="size-4 text-white" />
                            }
                          </div>
                          <div>
                            <p className="font-medium text-text-primary">{m.name}</p>
                            {m.api_endpoint && (
                              <p className="text-[10px] text-text-muted truncate max-w-[200px]">{m.api_endpoint}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-text-secondary text-xs">{m.vendor}</td>
                      <td className="px-4 py-3.5">
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          m.type === "image"
                            ? "bg-brand-purple/10 text-brand-purple"
                            : m.type === "video"
                            ? "bg-accent-pink/10 text-accent-pink"
                            : "bg-brand-cyan/10 text-brand-cyan"
                        )}>
                          {m.type === "image" ? "图片" : m.type === "video" ? "视频" : "文本"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-text-muted text-xs">{m.cost_per_unit} cr</td>
                      <td className="px-4 py-3.5">
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          m.is_enabled
                            ? "bg-accent-green/10 text-accent-green"
                            : "bg-red-500/10 text-red-400"
                        )}>
                          {m.is_enabled ? "启用" : "停用"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleToggle(m)}
                            disabled={togglingId !== null}
                            title={m.is_enabled ? "停用" : "启用"}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                              m.is_enabled
                                ? "text-accent-amber hover:bg-accent-amber/10"
                                : "text-accent-green hover:bg-accent-green/10"
                            )}
                          >
                            {togglingId === m.id ? <Loader2 className="size-3.5 animate-spin" /> : m.is_enabled ? <ToggleRight className="size-3.5" /> : <ToggleLeft className="size-3.5" />}
                            {m.is_enabled ? "停用" : "启用"}
                          </button>
                          <button
                            onClick={() => openEdit(m)}
                            title="编辑"
                            className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-light transition-colors"
                          >
                            <Edit3 className="size-3.5" />
                            编辑
                          </button>
                          <button
                            onClick={() => setConfirmDelete(m)}
                            title="删除"
                            className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="size-3.5" />
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create/Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { if (!saving) setShowForm(false); }} />
          <div className="relative w-full max-w-lg rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-text-primary">
                {editingId ? "编辑模型" : "添加模型"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="text-text-muted hover:text-text-primary disabled:opacity-50"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary">模型名称 *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="例如：FLUX Pro"
                    className="w-full rounded-xl border border-border-subtle bg-surface-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary">厂商</label>
                  <input
                    value={form.vendor}
                    onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                    placeholder="例如：Black Forest Lab"
                    className="w-full rounded-xl border border-border-subtle bg-surface-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary">类型</label>
                  <div className="flex rounded-xl border border-border-subtle p-0.5 bg-surface-base">
                    {(["image", "video", "text"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setForm({ ...form, type: t })}
                        className={cn(
                          "flex-1 rounded-lg px-3 py-1.5 text-xs transition-colors",
                          form.type === t
                            ? "bg-surface-card text-text-primary"
                            : "text-text-muted"
                        )}
                      >
                        {t === "image" ? "图片" : t === "video" ? "视频" : "文本"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary">消耗 (cr)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.cost_per_unit}
                    onChange={(e) => setForm({ ...form, cost_per_unit: parseInt(e.target.value) || 1 })}
                    className="w-full rounded-xl border border-border-subtle bg-surface-base px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-cyan/50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">API Endpoint</label>
                <div className="flex gap-2">
                  <input
                    value={form.api_endpoint}
                    onChange={(e) => setForm({ ...form, api_endpoint: e.target.value })}
                    placeholder="https://api.example.com/v1/generate"
                    className="flex-1 rounded-xl border border-border-subtle bg-surface-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50"
                  />
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={!form.api_endpoint || testing}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle px-3 py-2 text-xs text-text-secondary hover:bg-surface-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Wifi className="size-3.5" />}
                    测试
                  </button>
                </div>
                {testResult && (
                  <div className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs",
                    testResult.success
                      ? "bg-accent-green/10 text-accent-green"
                      : "bg-red-500/10 text-red-400"
                  )}>
                    {testResult.success ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                    {testResult.detail}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">API Key</label>
                <input
                  type="password"
                  value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                  placeholder="sk-..."
                  className="w-full rounded-xl border border-border-subtle bg-surface-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="rounded-xl px-4 py-2 text-sm text-text-secondary hover:bg-surface-light disabled:opacity-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-accent-amber to-accent-pink px-5 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {editingId ? "保存修改" : "添加模型"}
              </button>
            </div>
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
                  确定要删除模型 <span className="font-medium text-text-primary">{confirmDelete.name}</span> 吗？
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="rounded-xl px-4 py-2 text-sm text-text-secondary hover:bg-surface-light disabled:opacity-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
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
  );
}