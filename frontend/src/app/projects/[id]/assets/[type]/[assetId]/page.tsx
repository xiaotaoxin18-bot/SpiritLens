"use client";

import { useEffect, useState, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, Upload, X, Loader2, Plus,
  Edit3, FolderPlus, Trash2, Sparkles, Check, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { downloadMedia } from "@/lib/download";
import { useToast } from "@/components/ui/Toast";

interface SizeOption { value: string; label: string; }
interface ModelInfo { id: string; name: string; vendor: string; cost: number; }
interface ModelCapability {
  id: string; type: string; name: string; vendor: string;
  supported_sizes: SizeOption[]; cost_per_unit: number;
}

const DEFAULT_MODELS: ModelInfo[] = [
  { id: "doubao-seedream-4-5-251128", name: "Doubao-Seedream-4.5", vendor: "星河智云", cost: 5 },
  { id: "doubao-seedream-5-0-260128", name: "Doubao-Seedream-5.0", vendor: "星河智云", cost: 8 },
];

type AssetType = "characters" | "scenes" | "props";
const LABELS: Record<AssetType, string> = { characters: "角色", scenes: "场景", props: "道具" };

interface AssetItem {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  prompt?: string;
  group_id?: string | null;
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/spiritlens";
const imgUrl = (url: string | null | undefined) => url ? (url.startsWith("/uploads/") ? `${BASE_URL}${url}` : url) : "";

export default function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string; type: string; assetId: string }>;
}) {
  const { id: projectId, type, assetId } = use(params);
  const navigate = useRouter();
  const { toast } = useToast();
  const assetType = type as AssetType;

  const [mainAsset, setMainAsset] = useState<AssetItem | null>(null);
  const [variants, setVariants] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingToLibraryId, setSavingToLibraryId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Model / size state
  const [models, setModels] = useState<ModelInfo[]>(DEFAULT_MODELS);
  const [capabilities, setCapabilities] = useState<Record<string, ModelCapability>>({});
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODELS[0].id);
  const [selectedSize, setSelectedSize] = useState("1344x768");

  const currentCap = capabilities[selectedModel];
  const availableSizes: SizeOption[] = currentCap?.supported_sizes ?? [];

  // Load models from backend
  useEffect(() => {
    api.get<{ models: ModelCapability[] }>("/api/v1/models")
      .then((res) => {
        const capMap: Record<string, ModelCapability> = {};
        const modelList: ModelInfo[] = [];
        for (const cap of res.models) {
          if (cap.type === "image") {
            capMap[cap.id] = cap;
            modelList.push({ id: cap.id, name: cap.name, vendor: cap.vendor, cost: cap.cost_per_unit });
          }
        }
        setCapabilities(capMap);
        if (modelList.length > 0) {
          setModels(modelList);
          setSelectedModel(modelList[0].id);
          const firstSizes = modelList[0] ? capMap[modelList[0].id]?.supported_sizes : undefined;
          if (firstSizes?.length) setSelectedSize(firstSizes[0].value);
        }
      })
      .catch(() => { /* use defaults */ });
  }, []);

  // Prompt modal state
  const [promptTarget, setPromptTarget] = useState<AssetItem | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ total: number; [key: string]: any }>(
        `/api/v1/projects/${projectId}/${assetType}`
      );
      const items: AssetItem[] = (res[assetType] || []).map((i: any) => ({
        id: i.id, name: i.name, description: i.description || "",
        image_url: i.image_url || "", prompt: i.prompt || "",
        group_id: i.group_id || null,
      }));

      const main = items.find(i => i.id === assetId);
      setMainAsset(main || null);
      if (main) {
        // 按 group_id 分组：主角色的 group_id=null，变体的 group_id=主角色id
        const mainId = main.id;
        setVariants(items.filter(i => i.id === mainId || i.group_id === mainId));
      }
    } catch (e) {
      console.warn("[AssetDetail] Failed to load", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, assetType, assetId]);

  useEffect(() => { loadData(); }, [loadData]);

  const uploadFile = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append("files", file);
      const token = (() => { try { const r = localStorage.getItem("spiritlens-auth"); return r ? JSON.parse(r)?.state?.accessToken || "" : ""; } catch { return ""; } })();
      const res = await fetch(`${BASE_URL}/api/v1/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (res.ok) { const d = await res.json(); return d.urls?.[0] || null; }
    } catch { /* ignore */ }
    return null;
  };

  const handleReplaceImage = async (variant: AssetItem, file: File) => {
    const url = await uploadFile(file);
    if (!url) return;
    try {
      await api.put(`/api/v1/projects/${projectId}/${assetType}/${variant.id}`, { image_url: url });
      await loadData();
    } catch (e) {
      console.warn("[AssetDetail] Replace image failed", e);
    }
  };

  const handleGenerateImage = async (variant: AssetItem) => {
    setGeneratingId(variant.id);
    try {
      const prompt = variant.prompt || variant.name;
      const taskRes = await api.post<{ task_id: string }>("/api/v1/image/generate", {
        prompt, model_id: selectedModel, size: selectedSize, batch: 1, source: "project",
      });
      if (taskRes.task_id) {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const st = await api.get<{ status: string; image_urls?: string[] }>(`/api/v1/image/status/${taskRes.task_id}`);
          if (st.status === "completed" && st.image_urls?.length) {
            await api.put(`/api/v1/projects/${projectId}/${assetType}/${variant.id}`, { image_url: st.image_urls[0] });
            await loadData();
            return;
          }
          if (st.status === "failed") break;
        }
      }
    } catch (e) {
      console.warn("[AssetDetail] Generate failed", e);
    } finally {
      setGeneratingId(null);
    }
  };

  // 批量上传新形象：逐张上传，每张创建一个变体（group_id 关联主记录）
  const handleUploadBatch = async (files: File[]) => {
    if (!mainAsset || files.length === 0) return;
    setUploading(true);
    let okCount = 0;
    let lastCreated: { id?: string; name?: string } | null = null;
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("files", file);
        const token = (() => { try { const r = localStorage.getItem("spiritlens-auth"); return r ? JSON.parse(r)?.state?.accessToken || "" : ""; } catch { return ""; } })();
        const uploadRes = await fetch(`${BASE_URL}/api/v1/upload`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        const uploadData = await uploadRes.json();
        const imageUrl = uploadData.urls?.[0] || "";
        if (!imageUrl) continue;

        const created = await api.post<any>(`/api/v1/projects/${projectId}/${assetType}`, {
          name: mainAsset.name,
          description: mainAsset.description || "",
          image_url: imageUrl,
          group_id: mainAsset.id,
        });
        if (created?.id) { okCount++; lastCreated = created; }
      }
    } catch (e) {
      console.warn("[AssetDetail] Upload failed", e);
    } finally {
      setUploading(false);
    }
    await loadData();
    // 新上传的变体自动进入名称编辑模式（最后一个）
    if (lastCreated?.id) {
      setEditingNameId(lastCreated.id);
      setNameDraft(lastCreated.name || "");
    }
    if (okCount > 0) toast(`已上传 ${okCount} 个${LABELS[assetType]}`, "success");
  };

  const handleRenameVariant = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      await api.put(`/api/v1/projects/${projectId}/${assetType}/${id}`, { name: newName.trim() });
      await loadData();
    } catch (e) {
      console.warn("[AssetDetail] Rename failed", e);
    }
    setEditingNameId(null);
  };

  const handleGenerateWithPrompt = async (variant: AssetItem, prompt: string) => {
    setGeneratingId(variant.id);
    try {
      // 先保存提示词
      await api.put(`/api/v1/projects/${projectId}/${assetType}/${variant.id}`, { prompt });
      // 用弹窗中选的模型和尺寸生成图片
      const taskRes = await api.post<{ task_id: string }>("/api/v1/image/generate", {
        prompt, model_id: selectedModel, size: selectedSize, batch: 1, source: "project",
      });
      if (taskRes.task_id) {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const st = await api.get<{ status: string; image_urls?: string[] }>(`/api/v1/image/status/${taskRes.task_id}`);
          if (st.status === "completed" && st.image_urls?.length) {
            await api.put(`/api/v1/projects/${projectId}/${assetType}/${variant.id}`, { image_url: st.image_urls[0] });
            await loadData();
            return;
          }
          if (st.status === "failed") break;
        }
      }
    } catch (e) {
      console.warn("[AssetDetail] Generate failed", e);
    } finally {
      setGeneratingId(null);
      setPromptTarget(null);
    }
  };

  const handleSaveToLibrary = async (variant: AssetItem) => {
    if (savingToLibraryId) return;
    setSavingToLibraryId(variant.id);
    try {
      await api.put(`/api/v1/projects/${projectId}/${assetType}/${variant.id}`, {
        name: variant.name,
        description: variant.description || "",
        image_url: variant.image_url || "",
        prompt: variant.prompt || "",
      });
      toast("已保存到资产库", "success");
    } catch (e: any) {
      console.warn("[AssetDetail] Save to library failed", e);
      toast(e?.message || "保存失败", "error");
    } finally {
      setSavingToLibraryId(null);
    }
  };

  const handleDeleteVariant = async (id: string) => {
    try {
      await api.delete(`/api/v1/projects/${projectId}/${assetType}/${id}`);
      await loadData();
      toast("删除成功", "success");
    } catch (e: any) {
      console.warn("[AssetDetail] Delete failed", e);
      toast(e?.message || "删除失败", "error");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-base flex items-center justify-center">
        <Loader2 className="size-6 text-text-muted animate-spin" />
      </div>
    );
  }

  if (!mainAsset) {
    return (
      <div className="min-h-screen bg-surface-base flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-muted text-sm mb-4">未找到该{LABELS[assetType]}</p>
          <button onClick={() => navigate.back()} className="text-brand-cyan text-xs hover:underline">返回</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-surface-base">
      {/* Top bar */}
      <div className="border-b border-border-subtle bg-surface-card">
        <div className="px-6 flex items-center h-14">
          <button onClick={() => navigate.back()} className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-text-muted hover:text-text-primary transition-colors">
            <ChevronLeft className="size-3" />
            返回
          </button>
          <div className="ml-auto text-xs text-text-muted">
            <span className="font-bold text-text-primary">{mainAsset.name}</span>
            <span className="ml-2">{variants.length} 个{LABELS[assetType]}</span>
          </div>
        </div>
      </div>

      <div className="px-6 py-8">
        {/* Entity info */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary">{mainAsset.name}</h1>
          {mainAsset.description && (
            <p className="text-sm text-text-secondary mt-1">{mainAsset.description}</p>
          )}
        </div>

        {/* Variant grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {variants.map((item) => (
            <div key={item.id} className="rounded-2xl border border-border-subtle bg-surface-card overflow-hidden flex flex-col">
              {/* Image with padding-bottom 4:3 */}
              <div className="relative w-full" style={{ paddingBottom: "100%" }}>
                <div className="absolute inset-0 bg-surface-elevated group/image cursor-pointer">
                  {item.image_url ? (
                    <>
                      <img
                        src={imgUrl(item.image_url)} alt={item.name}
                        className="w-full h-full object-cover"
                        onClick={() => setPreviewUrl(imgUrl(item.image_url!))}
                      />
                      <div className="absolute top-1.5 right-1.5 p-1 bg-accent-green rounded-full shadow"><Check className="size-3 text-white" /></div>
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/50 transition-all flex items-center justify-center gap-2 pointer-events-none">
                        <label
                          onClick={(e) => e.stopPropagation()}
                          className="hidden group-hover/image:flex cursor-pointer px-3 py-1.5 rounded-lg bg-white/20 text-white text-[10px] backdrop-blur-sm hover:bg-white/30 transition-all gap-1.5 items-center pointer-events-auto"
                        >
                          <Upload className="size-3" /> 更换
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleReplaceImage(item, f); e.target.value = ""; } }} />
                        </label>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleGenerateImage(item); }}
                          disabled={generatingId === item.id}
                          className="hidden group-hover/image:flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/20 text-white text-[10px] backdrop-blur-sm hover:bg-white/30 transition-all disabled:opacity-50 pointer-events-auto"
                        >
                          {generatingId === item.id ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                          重新生成
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-text-muted/30 gap-2" onClick={() => fileRef.current?.click()}>
                      <Plus className="size-6" />
                      <span className="text-[10px]">点击上传</span>
                    </div>
                  )}
                  {variants.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); if (window.confirm("确定删除该变体？")) handleDeleteVariant(item.id); }}
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/50 text-white opacity-0 hover:opacity-100 hover:bg-red-500 transition-all"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Name — editable for new variants */}
              <div className="px-2.5 pt-2 pb-1">
                {editingNameId === item.id ? (
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={() => handleRenameVariant(item.id, nameDraft)}
                    onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
                    className="w-full text-xs font-bold text-text-primary bg-surface-elevated border border-brand-cyan/50 rounded px-1.5 py-0.5 outline-none"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <p
                    className="text-xs font-medium text-text-primary truncate cursor-pointer hover:text-brand-cyan"
                    onClick={(e) => {
                      if (item.id !== mainAsset!.id) {
                        e.stopPropagation();
                        setEditingNameId(item.id);
                        setNameDraft(item.name);
                      }
                    }}
                  >
                    {item.id === mainAsset!.id ? (
                      <span className="text-text-primary">{item.name} <span className="text-[9px] text-text-muted font-normal">(原始)</span></span>
                    ) : (
                      item.name
                    )}
                  </p>
                )}
              </div>

              {/* Three buttons */}
              <div className="flex items-stretch border-t border-border-subtle divide-x divide-border-subtle mt-auto">
                <button
                  onClick={() => { setPromptDraft(item.prompt || ""); setPromptTarget(item); }}
                  className="flex-1 flex items-center justify-center gap-1 py-2 text-[8px] font-bold text-text-muted hover:text-brand-cyan hover:bg-brand-cyan/5 transition-all"
                >
                  <Edit3 className="size-2.5" />
                  提示词
                </button>
                <button
                  onClick={() => handleSaveToLibrary(item)}
                  disabled={savingToLibraryId === item.id}
                  className="flex-1 flex items-center justify-center gap-1 py-2 text-[8px] font-bold text-text-muted hover:text-brand-cyan hover:bg-brand-cyan/5 transition-all disabled:opacity-50"
                >
                  {savingToLibraryId === item.id ? <Loader2 className="size-2.5 animate-spin" /> : <FolderPlus className="size-2.5" />}
                  资产库
                </button>
                <button
                  onClick={() => { if (confirm("确认删除？")) handleDeleteVariant(item.id); }}
                  className="flex-1 flex items-center justify-center gap-1 py-2 text-[8px] font-bold text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  <Trash2 className="size-2.5" />
                  删除
                </button>
              </div>
            </div>
          ))}

          {/* Upload placeholder */}
          <div className="relative w-full" style={{ paddingBottom: "100%" }}>
            <div
              onClick={() => fileRef.current?.click()}
              className="absolute inset-0 rounded-2xl border-2 border-dashed border-brand-cyan/30 hover:border-brand-cyan/60 bg-brand-cyan/[0.03] hover:bg-brand-cyan/[0.08] transition-all flex flex-col items-center justify-center gap-2 text-brand-cyan/60 hover:text-brand-cyan cursor-pointer"
            >
              {uploading ? (
                <Loader2 className="size-6 animate-spin" />
              ) : (
                <>
                  <Plus className="size-6" />
                  <span className="text-xs font-bold">上传新{LABELS[assetType]}形象（可多选）</span>
                </>
              )}
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              if (files.length === 0) return;
              if (files.length > 15) {
                toast("一次最多上传 15 张图片，请分批上传", "error");
                return;
              }
              handleUploadBatch(files);
            }}
          />
        </div>
      </div>

      {/* 图片预览 */}
      {previewUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80" onClick={() => setPreviewUrl(null)} />
          <div className="relative max-w-4xl max-h-[90vh] mx-4">
            <div className="absolute -top-10 right-0 flex items-center gap-3">
              <a
                href={previewUrl}
                download
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-all text-xs"
                onClick={(e) => {
                  e.preventDefault();
                  downloadMedia(previewUrl, previewUrl.split("/").pop() || "image.png");
                }}
              >
                <Download className="size-3.5" />
                下载
              </a>
              <button onClick={() => setPreviewUrl(null)} className="text-white/60 hover:text-white transition-colors">
                <X className="size-6" />
              </button>
            </div>
            <img src={previewUrl} alt="preview" className="max-w-full max-h-[90vh] rounded-2xl object-contain" />
          </div>
        </div>
      )}

      {/* 提示词弹窗 */}
      {promptTarget && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center pb-8">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPromptTarget(null)} />
          <div className="relative w-full max-w-6xl mx-4 rounded-2xl border border-border-subtle bg-surface-card shadow-2xl p-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-text-primary">
                {promptTarget.name} — 提示词
              </h3>
              <button onClick={() => setPromptTarget(null)} className="p-1 rounded-lg text-text-muted hover:text-text-primary">
                <X className="size-4" />
              </button>
            </div>
            <textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              rows={12}
              placeholder={`输入${LABELS[assetType]}视觉描述...`}
              className="w-full rounded-xl border border-border-subtle bg-surface-base px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-brand-cyan/50 transition-all resize-none"
            />
            {/* 模型 + 尺寸 一行 */}
            <div className="mt-3 flex gap-6">
              <div className="space-y-2 min-w-0">
                <span className="text-[11px] font-medium text-text-muted">模型</span>
                <div className="flex flex-wrap gap-1.5">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedModel(m.id); setSelectedSize(""); }}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[11px] transition-colors border",
                        selectedModel === m.id
                          ? "bg-brand-purple/15 text-brand-purple border-brand-purple/20"
                          : "bg-white/[0.04] light:bg-black/[0.03] text-text-muted border-white/[0.06] light:border-black/[0.06] hover:bg-white/[0.08]"
                      )}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
              {availableSizes.length > 0 && (
                <div className="space-y-2 min-w-0">
                  <span className="text-[11px] font-medium text-text-muted">尺寸</span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableSizes.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => setSelectedSize(s.value)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[11px] transition-colors border",
                          selectedSize === s.value
                            ? "bg-brand-purple/15 text-brand-purple border-brand-purple/20"
                            : "bg-white/[0.04] light:bg-black/[0.03] text-text-muted border-white/[0.06] light:border-black/[0.06] hover:bg-white/[0.08]"
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => handleGenerateWithPrompt(promptTarget, promptDraft)}
                disabled={!promptDraft.trim() || generatingId === promptTarget.id}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white text-sm font-bold hover:shadow-glow-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {generatingId === promptTarget.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {generatingId === promptTarget.id ? "生成中..." : "生成"}
              </button>
              <button
                onClick={() => setPromptTarget(null)}
                disabled={generatingId !== null}
                className="flex-1 py-3 rounded-xl border border-border-subtle text-text-muted hover:text-text-primary text-sm font-bold transition-all disabled:opacity-30"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
