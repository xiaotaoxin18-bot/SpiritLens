"use client";

import { useEffect, useState, useCallback, type ChangeEvent } from "react";
import {
  Users, MapPin, Package, Loader2, Sparkles, RefreshCw,
  Search, X, Archive, Link2, Plus, Upload, ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { useToast } from "@/components/ui/Toast";
import CharacterCard from "./CharacterCard";
import SceneCard from "./SceneCard";
import PropCard from "./PropCard";
import ImagePreviewModal from "./ImagePreviewModal";
import AssetLibraryPicker from "./AssetLibraryPicker";
import VariationsModal from "./VariationsModal";
import TurnaroundModal from "./TurnaroundModal";

// ─── Types ──────────────────────────────────────────────────────

interface EpisodeData {
  id: string;
  config?: Record<string, any> | null;
}

interface StructureItem {
  id?: string;
  name: string;
  description?: string;
  gender?: string;
  personality?: string;
  age?: string;
  location?: string;
  time?: string;
  atmosphere?: string;
  category?: string;
  image_url?: string;
  prompt?: string;
  shapeRefImage?: string;
  status?: string;
  libraryId?: string;
  turnaround_status?: string;
  turnaroundImages?: string[];
  variationImages?: string[];
  variations?: number;
}

interface Props {
  projectId: string;
  episodeId: string;
}

type AssetTab = "characters" | "scenes" | "props";

const SECTION_META: Record<AssetTab, {
  label: string; sub: string; icon: any; color: string; apiEndpoint: string; emptyMsg: string;
}> = {
  characters: {
    label: "角色定妆", sub: "Casting", icon: Users, color: "bg-brand-cyan",
    apiEndpoint: "characters", emptyMsg: "暂无角色，点击右上角「添加」创建",
  },
  scenes: {
    label: "场景概念", sub: "Locations", icon: MapPin, color: "bg-accent-green",
    apiEndpoint: "scenes", emptyMsg: "暂无场景，点击右上角「添加」创建",
  },
  props: {
    label: "道具清单", sub: "Props", icon: Package, color: "bg-yellow-500",
    apiEndpoint: "props", emptyMsg: "暂无道具数据",
  },
};

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/spiritlens";
const imgUrl = (url: string | null | undefined) => url ? (url.startsWith("/uploads/") ? `${BASE_URL}${url}` : url) : "";

// Module-level cache persists across all component instances
const _cache: { variations: Record<string, string[]>; turnaround: Record<string, string[]> } = {
  variations: {}, turnaround: {},
};

export default function StageAssets({ projectId, episodeId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Record<AssetTab, StructureItem[]>>({
    characters: [], scenes: [], props: [],
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [pickerTarget, setPickerTarget] = useState<{ tab: AssetTab; idx: number } | null>(null);
  const [activeTab, setActiveTab] = useState<AssetTab>("characters");

  // Persist activeTab across navigation (detail page → back)
  useEffect(() => {
    const saved = sessionStorage.getItem("spiritlens-stage-tab");
    if (saved === "characters" || saved === "scenes" || saved === "props") {
      setActiveTab(saved);
    }
    sessionStorage.removeItem("spiritlens-stage-tab");
  }, []);
  const handleTabChange = (tab: AssetTab) => {
    setActiveTab(tab);
    sessionStorage.setItem("spiritlens-stage-tab", tab);
  };
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [imageModels, setImageModels] = useState<{ id: string; name: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [variationsTarget, setVariationsTarget] = useState<{ name: string; prompt: string; extra: Record<string, string>; imageUrl?: string } | null>(null);
  const [turnaroundTarget, setTurnaroundTarget] = useState<{ name: string; prompt: string; extra: Record<string, string>; imageUrl?: string } | null>(null);
  const [variantCounts, setVariantCounts] = useState<Record<string, number>>({});
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemName, setAddItemName] = useState("");
  const [addItemDesc, setAddItemDesc] = useState("");
  const [addItemImages, setAddItemImages] = useState<File[]>([]);
  const [addItemPreviews, setAddItemPreviews] = useState<string[]>([]);
  const [addingItem, setAddingItem] = useState(false);

  // ── Save aspect ratio changes to episode config ────────
  const saveAspectRatio = useCallback(async (ratio: string) => {
    try {
      const ep = await api.get<EpisodeData>(`/api/v1/projects/${projectId}/episodes/${episodeId}`);
      await api.put(`/api/v1/projects/${projectId}/episodes/${episodeId}`, {
        config: { ...(ep?.config || {}), aspectRatio: ratio },
      });
    } catch (e) {
      console.warn("[StageAssets] Failed to save aspect ratio", e);
    }
  }, [projectId, episodeId]);

  const handleAspectRatioChange = (ratio: string) => {
    setAspectRatio(ratio);
    saveAspectRatio(ratio);
  };

  // ── Load ──────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load from project-level tables (saved by script/structure API)
      const types = ["characters", "scenes", "props"] as const;
      const results: Record<string, any[]> = { characters: [], scenes: [], props: [] };
      let hasData = false;

      for (const t of types) {
        try {
          const res = await api.get<{ total: number; [key: string]: any }>(`/api/v1/projects/${projectId}/${t}`);
          const items = res[t] || [];
          if (items.length > 0) {
            results[t] = items.map((i: any) => ({ id: i.id, name: i.name, description: i.description || "", image_url: i.image_url || "", prompt: i.prompt || "", group_id: i.group_id || null }));
            hasData = true;
          }
        } catch (e) { console.warn("[StageAssets] Failed to load " + t, e); }
      }

      // Load episode config for aspect ratio (persisted from Script stage)
      const ep = await api.get<EpisodeData>(`/api/v1/projects/${projectId}/episodes/${episodeId}`);
      if (ep?.config?.aspectRatio) {
        setAspectRatio(ep.config.aspectRatio);
      }

      // Merge: API data takes priority, fallback to episode config for empty types
      const sd = ep?.config?.structureData;
      const merged: Record<string, any[]> = { characters: [], scenes: [], props: [] };
      const counts: Record<string, number> = {};
      for (const t of types) {
        let allItems = results[t];
        if (allItems.length === 0 && sd && sd[t]) {
          allItems = sd[t].map((i: any) => ({ ...i, image_url: i.image_url || "", group_id: null }));
        }
        // 计算每个主条目（group_id=null）的变体数量
        const groupMap: Record<string, any[]> = {};
        for (const item of allItems) {
          const gid = item.group_id || item.id; // 无 group_id 的用自己的 id
          if (!groupMap[gid]) groupMap[gid] = [];
          groupMap[gid].push(item);
        }
        // 只显示主条目（group_id=null 或用自己 id 作为组的第一个）
        for (const [gid, items] of Object.entries(groupMap)) {
          const main = items.find((i: any) => !i.group_id) || items[0];
          if (!merged[t].some((e: any) => e.id === main.id)) {
            merged[t].push(main);
            counts[main.id] = items.length - 1; // 变体数（减掉自身）
          }
        }
      }
      setItems(merged as any);
      setVariantCounts(counts);
      // Load image models
      try {
        const modelData = await api.get<{ models: { id: string; name: string; type: string; is_enabled: boolean }[] }>("/api/v1/models", { type: "image" });
        const enabled = (modelData.models || []).filter((m) => m.is_enabled);
        setImageModels(enabled);
        if (enabled.length > 0 && !selectedModel) setSelectedModel(enabled[0].id);
      } catch (e) { console.warn("[StageAssets] Failed to load image models", e); }
    } catch (e) { console.warn("[StageAssets] loadData failed", e); }
    finally { setLoading(false); }
  }, [projectId, episodeId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Image upload ─────────────────────────────────────────

  const uploadFile = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData(); formData.append("files", file);
      const token = (() => { try { const r = localStorage.getItem("spiritlens-auth"); return r ? JSON.parse(r)?.state?.accessToken || "" : ""; } catch { return ""; } })();
      const res = await fetch(`${BASE_URL}/api/v1/upload`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData });
      if (res.ok) { const d = await res.json(); return d.urls?.[0] || null; }
    } catch (e) { console.warn("[StageAssets] Upload failed", e); }
    return null;
  };

  const handleUpload = (tab: AssetTab, idx: number) => async (file: File) => {
    const url = await uploadFile(file);
    if (url) setItems(p => { const u = [...p[tab]]; u[idx] = { ...u[idx], image_url: url }; return { ...p, [tab]: u }; });
  };

  const handleUploadShapeRef = (tab: AssetTab, idx: number) => async (file: File) => {
    const url = await uploadFile(file);
    if (url) setItems(p => { const u = [...p[tab]]; u[idx] = { ...u[idx], shapeRefImage: url }; return { ...p, [tab]: u }; });
  };

  const handleClearShapeRef = (tab: AssetTab, idx: number) => () => {
    setItems(p => { const u = [...p[tab]]; u[idx] = { ...u[idx], shapeRefImage: "" }; return { ...p, [tab]: u }; });
  };

  // ── Actions ──────────────────────────────────────────────

  // 乐观删除：先删 UI 后调后端（调用处已有 confirm 确认）；失败时 toast 提示并重新加载恢复
  const handleDelete = (tab: AssetTab, idx: number) => () => {
    const item = items[tab][idx];
    if (!item?.id) {
      setItems(p => ({ ...p, [tab]: p[tab].filter((_, i) => i !== idx) }));
      return;
    }
    setItems(p => ({ ...p, [tab]: p[tab].filter((_, i) => i !== idx) }));
    api.delete(`/api/v1/projects/${projectId}/${SECTION_META[tab].apiEndpoint}/${item.id}`)
      .then(() => toast("删除成功", "success"))
      .catch((e: any) => {
        toast(e?.message || "删除失败", "error");
        loadData(); // 失败后重新加载数据，恢复被乐观删除的卡片
      });
  };

  const handleUpdateInfo = (tab: AssetTab, idx: number) => (updates: Partial<StructureItem>) => {
    setItems(p => { const u = [...p[tab]]; u[idx] = { ...u[idx], ...updates }; return { ...p, [tab]: u }; });
  };

  const handlePromptSave = (tab: AssetTab, idx: number) => (prompt: string) => {
    setItems(p => { const u = [...p[tab]]; u[idx] = { ...u[idx], prompt }; return { ...p, [tab]: u }; });
  };

  const handleGenerate = (tab: AssetTab, idx: number) => async () => {
    const key = `${tab}-${idx}`;
    setGenerating(g => ({ ...g, [key]: true }));
    try {
      const item = items[tab][idx];
      // Build extra metadata for visual prompt generation
      const extra: Record<string, string> = {};
      if (tab === "characters") {
        if (item.gender) extra.gender = item.gender;
        if (item.personality) extra.personality = item.personality;
        if (item.age) extra.age = item.age;
      } else if (tab === "scenes") {
        if (item.location) extra.location = item.location;
        if (item.time) extra.time = item.time;
        if (item.atmosphere) extra.atmosphere = item.atmosphere;
      } else if (tab === "props") {
        if (item.category) extra.category = item.category;
      }

      // 1. Generate concise visual prompt via dedicated endpoint
      let prompt = item.prompt || "";
      if (!prompt) {
        try {
          const genRes = await api.post<{ prompt: string }>(
            `/api/v1/image/prompt`,
            {
              name: item.name,
              description: item.description || "",
              asset_type: tab === "characters" ? "character" : tab === "scenes" ? "scene" : "prop",
              extra,
            }
          );
          prompt = genRes.prompt || "";
        } catch (e) { console.warn("[StageAssets] Prompt enhancement failed, using fallback", e); }
      }

      // Fallback: construct a basic prompt from name + description
      if (!prompt) {
        prompt = item.description
          ? `${item.name}，${item.description}`
          : `${item.name}`;
      }

      // Set prompt immediately
      setItems(p => { const u = [...p[tab]]; u[idx] = { ...u[idx], prompt }; return { ...p, [tab]: u }; });

      // 2. Submit image generation task + poll
      try {
        const imgSize = aspectRatio === "9:16" ? "768x1344" : aspectRatio === "1:1" ? "1024x1024" : "1344x768";
        const taskRes = await api.post<{ task_id: string; status: string }>(
          `/api/v1/image/generate`,
          { prompt, model_id: selectedModel || "doubao-seedream-4-5-251128", size: imgSize, batch: 1, source: "project" }
        );
        if (taskRes.task_id) {
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const st = await api.get<{ status: string; image_urls?: string[] }>(`/api/v1/image/status/${taskRes.task_id}`);
            if (st.status === "completed" && st.image_urls?.length) {
              const imgUrl = st.image_urls[0];
              setItems(p => { const u = [...p[tab]]; u[idx] = { ...u[idx], image_url: imgUrl }; return { ...p, [tab]: u }; });
              // Persist image_url to DB
              if (item.id) {
                try { await api.put(`/api/v1/projects/${projectId}/${SECTION_META[tab].apiEndpoint}/${item.id}`, { image_url: imgUrl }); } catch (e2) { console.warn("[StageAssets] Failed to persist image URL", e2); }
              }
              return;
            }
            if (st.status === "failed") break;
          }
        }
      } catch (e) { console.warn("[StageAssets] Image generation failed (prompt already saved)", e); }
    } catch (e) { console.warn("[StageAssets] generateImage failed", e); }
    finally { setGenerating(g => ({ ...g, [key]: false })); }
  };

  const handleSaveToLibrary = (tab: AssetTab, idx: number) => async () => {
    const item = items[tab][idx];
    try {
      await api.post(`/api/v1/projects/${projectId}/${SECTION_META[tab].apiEndpoint}`, {
        name: item.name, description: item.description || "", image_url: item.image_url || "", prompt: item.prompt || "",
      });
      setItems(p => { const u = [...p[tab]]; u[idx] = { ...u[idx], libraryId: "saved" }; return { ...p, [tab]: u }; });
    } catch (e) { console.warn("[StageAssets] Failed to save to library", e); }
  };

  const handleReplaceFromLibrary = (tab: AssetTab, idx: number) => () => setPickerTarget({ tab, idx });

  const handlePickerSelect = (item: any) => {
    if (!pickerTarget) return;
    const { tab, idx } = pickerTarget;
    setItems(p => {
      const u = [...p[tab]];
      u[idx] = { ...u[idx], name: item.name, description: item.description || u[idx].description, image_url: item.image_url || u[idx].image_url, prompt: item.prompt || u[idx].prompt, libraryId: item.id };
      return { ...p, [tab]: u };
    });
    setPickerTarget(null);
  };

  // ── Variations & Turnaround ──────────────────────────────

  const handleVariations = (tab: AssetTab, idx: number) => () => {
    const item = items[tab][idx];
    const extra: Record<string, string> = {};
    if (item.gender) extra.gender = item.gender;
    if (item.personality) extra.personality = item.personality;
    if (item.age) extra.age = item.age;
    setVariationsTarget({
      name: item.name, prompt: item.prompt || "", extra,
      imageUrl: item.image_url || undefined,
    });
  };

  const handleTurnaround = (tab: AssetTab, idx: number) => () => {
    const item = items[tab][idx];
    const extra: Record<string, string> = {};
    if (item.gender) extra.gender = item.gender;
    if (item.personality) extra.personality = item.personality;
    if (item.age) extra.age = item.age;
    setTurnaroundTarget({
      name: item.name, prompt: item.prompt || "", extra,
      imageUrl: item.image_url || undefined,
    });
  };


  // ── 内联添加 ────────────────────────────────────────────

  const MAX_ADD_IMAGES = 15;
  const resetAddForm = () => {
    setAddItemName("");
    setAddItemDesc("");
    setAddItemImages([]);
    setAddItemPreviews([]);
  };

  // 多选图片：追加到列表（保留已选的），软上限 15 张
  const handleAddFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    const remaining = MAX_ADD_IMAGES - addItemImages.length;
    if (remaining <= 0) {
      toast(`一次最多上传 ${MAX_ADD_IMAGES} 张图片`, "error");
      return;
    }
    const taken = files.slice(0, remaining);
    if (files.length > remaining) toast(`最多上传 ${MAX_ADD_IMAGES} 张，已截取前 ${remaining} 张`, "error");
    setAddItemImages(prev => [...prev, ...taken]);
    setAddItemPreviews(prev => [...prev, ...taken.map(f => URL.createObjectURL(f))]);
  };

  const handleRemoveAddImage = (idx: number) => {
    setAddItemImages(prev => prev.filter((_, i) => i !== idx));
    setAddItemPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddItem = async () => {
    const name = addItemName.trim();
    if (!name || addingItem) return;
    setAddingItem(true);
    try {
      // 逐张上传，第一张作为主记录，其余作为变体（group_id 关联主记录）
      const urls: string[] = [];
      for (const f of addItemImages) {
        const url = await uploadFile(f);
        if (url) urls.push(url);
      }
      let savedId: string | undefined;
      try {
        const saved = await api.post<any>(`/api/v1/projects/${projectId}/${SECTION_META[activeTab].apiEndpoint}`, {
          name, description: addItemDesc.trim(), image_url: urls[0] || "",
        });
        if (saved?.id) savedId = saved.id;
        if (savedId) {
          for (let i = 1; i < urls.length; i++) {
            try {
              await api.post(`/api/v1/projects/${projectId}/${SECTION_META[activeTab].apiEndpoint}`, {
                name, description: addItemDesc.trim(), image_url: urls[i], group_id: savedId,
              });
            } catch (e) {
              console.warn("[StageAssets] Failed to save variant", e);
            }
          }
        }
        toast(urls.length > 1 ? `添加成功（${urls.length} 张图片）` : "添加成功", "success");
      } catch (e: any) {
        console.warn("[StageAssets] Failed to save new item", e);
        toast(e?.message || "保存失败，已保留本地卡片", "error");
      }
      const newItem: StructureItem = { name, description: addItemDesc.trim(), image_url: urls[0] || undefined };
      if (savedId) newItem.id = savedId;
      setItems(p => ({ ...p, [activeTab]: [...p[activeTab], newItem] }));
      resetAddForm();
      setAddItemOpen(false);
    } finally {
      setAddingItem(false);
    }
  };

  // ── Batch generate ───────────────────────────────────────

  const handleBatchGenerate = async (tab: AssetTab) => {
    const list = items[tab];
    for (let i = 0; i < list.length; i++) {
      const key = `${tab}-${i}`;
      setGenerating(g => ({ ...g, [key]: true }));
      try {
        const item = list[i];
        // Build extra attributes
        const extra: Record<string, string> = {};
        if (tab === "characters") {
          if (item.gender) extra.gender = item.gender;
          if (item.personality) extra.personality = item.personality;
          if (item.age) extra.age = item.age;
        } else if (tab === "scenes") {
          if (item.location) extra.location = item.location;
          if (item.time) extra.time = item.time;
          if (item.atmosphere) extra.atmosphere = item.atmosphere;
        } else if (tab === "props") {
          if (item.category) extra.category = item.category;
        }

        let prompt = "";
        try {
          const genRes = await api.post<{ prompt: string }>(
            `/api/v1/image/prompt`,
            {
              name: item.name,
              description: item.description || "",
              asset_type: tab === "characters" ? "character" : tab === "scenes" ? "scene" : "prop",
              extra,
            }
          );
          prompt = genRes.prompt || "";
        } catch (e) { console.warn("[StageAssets] Prompt enhancement (tab) failed", e); }

        if (!prompt) {
          prompt = item.description ? `${item.name}，${item.description}` : item.name;
        }

        if (prompt) {
          setItems(p => { const u = [...p[tab]]; u[i] = { ...u[i], prompt }; return { ...p, [tab]: u }; });
        }
      } catch (e) { console.warn("[StageAssets] Batch prompt generation failed", e); }
      finally { setGenerating(g => ({ ...g, [key]: false })); }
    }
  };

  // ── Render helpers ───────────────────────────────────────

  const allCharsReady = items.characters.length > 0 && items.characters.every(c => c.image_url);
  const allScenesReady = items.scenes.length > 0 && items.scenes.every(s => s.image_url);
  const isGeneratingAny = Object.values(generating).some(v => v);

  if (loading) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="size-6 text-text-muted animate-spin" /></div>;
  }

  return (
    <div className="h-full flex flex-col bg-surface-base overflow-hidden">
      {/* Top header bar */}
      <div className="h-16 px-8 border-b border-border-subtle bg-surface-card flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Users className="size-4 text-brand-cyan" />
          <span className="text-sm font-bold text-text-primary tracking-wide">角色与场景</span>
        </div>
        <div className="flex items-center gap-3">
          {/* 资产库按钮 */}
          <button
            onClick={() => setShowLibraryModal(true)}
            className="px-3 py-1.5 rounded-lg bg-surface-elevated text-text-muted hover:text-text-primary text-[10px] font-bold uppercase tracking-wider border border-border-subtle hover:border-border-glow transition-all flex items-center gap-1.5"
          >
            <Archive className="size-3.5" />
            资产库
          </button>
          {/* 模型选择 */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-muted uppercase">模型</span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="text-[10px] font-mono bg-surface-card border border-border-subtle rounded px-2 py-1 text-text-primary outline-none focus:border-brand-cyan/50"
            >
              {imageModels.length === 0 ? (
                <option>无可用模型</option>
              ) : (
                imageModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))
              )}
            </select>
          </div>
          {/* 比例选择器 */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-muted uppercase">比例</span>
            <div className="flex gap-0.5 rounded-lg border border-border-subtle overflow-hidden">
              {["16:9", "9:16", "1:1"].map((r) => (
                <button
                  key={r}
                  onClick={() => handleAspectRatioChange(r)}
                  className={cn(
                    "px-2 py-1 text-[10px] font-mono font-bold tracking-wider transition-all",
                    aspectRatio === r
                      ? "bg-brand-cyan/10 text-brand-cyan"
                      : "bg-surface-card text-text-muted hover:text-text-secondary"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="w-px h-5 bg-border-subtle" />
          {/* 批量生成 */}
          <button
            onClick={() => handleBatchGenerate(activeTab)}
            disabled={isGeneratingAny || items[activeTab].length === 0}
            className="px-3 py-1.5 rounded-lg bg-surface-elevated text-text-muted hover:text-text-primary text-[10px] font-bold uppercase tracking-wider border border-border-subtle hover:border-border-glow transition-all disabled:opacity-30 flex items-center gap-1.5"
          >
            <Sparkles className="size-3.5" />
            批量生成
          </button>
          {/* 统计标签 */}
          <div className="flex gap-2">
            <span className="px-2 py-1 bg-surface-elevated border border-border-subtle rounded text-[10px] font-mono text-text-muted">{items.characters.length} 角色</span>
            <span className="px-2 py-1 bg-surface-elevated border border-border-subtle rounded text-[10px] font-mono text-text-muted">{items.scenes.length} 场景</span>
            <span className="px-2 py-1 bg-surface-elevated border border-border-subtle rounded text-[10px] font-mono text-text-muted">{items.props.length} 道具</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-subtle bg-surface-card/50 shrink-0">
        {(["characters", "scenes", "props"] as AssetTab[]).map((tab) => {
          const meta = SECTION_META[tab];
          const Icon = meta.icon;
          return (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={cn(
                "flex items-center gap-2 px-6 py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all",
                activeTab === tab
                  ? "border-brand-cyan text-brand-cyan bg-brand-cyan/5"
                  : "border-transparent text-text-muted hover:text-text-secondary"
              )}
            >
              <Icon className="size-3.5" />
              {meta.label}
              <span className="text-[10px] font-mono ml-1">({items[tab].length})</span>
            </button>
          );
        })}
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {/* 添加卡片 — 占第一个位置 */}
          <div className="relative w-full" style={{ paddingBottom: "100%" }}>
            <button
              onClick={() => { setAddItemOpen(true); resetAddForm(); }}
              className="absolute inset-0 rounded-2xl border-2 border-dashed border-brand-cyan/30 hover:border-brand-cyan/60 bg-brand-cyan/[0.03] hover:bg-brand-cyan/[0.08] transition-all flex flex-col items-center justify-center gap-1.5 text-text-muted hover:text-brand-cyan group"
            >
              <div className="size-8 rounded-lg border-2 border-dashed border-brand-cyan/30 group-hover:border-brand-cyan/60 flex items-center justify-center text-brand-cyan/60 group-hover:text-brand-cyan">
                <Plus className="size-4" />
              </div>
              <span className="text-[11px] font-bold text-brand-cyan/80 group-hover:text-brand-cyan">
                添加{activeTab === "characters" ? "角色" : activeTab === "scenes" ? "场景" : "道具"}
              </span>
            </button>
          </div>

          {items[activeTab].map((item, idx) => {
              const vc = variantCounts[item.id] ?? 0;
              if (activeTab === "characters") {
                return (
                  <CharacterCard
                    key={idx} projectId={projectId} character={item}
                    isGenerating={!!generating[`characters-${idx}`]}
                    onUpload={handleUpload("characters", idx)}
                    onGenerate={handleGenerate("characters", idx)}
                    onDelete={() => { if (confirm("确认删除？")) handleDelete("characters", idx)(); }}
                    variantCount={vc}
                  />
                );
              }
              if (activeTab === "scenes") {
                return (
                  <SceneCard
                    key={idx} projectId={projectId} scene={item}
                    isGenerating={!!generating[`scenes-${idx}`]}
                    onUpload={handleUpload("scenes", idx)}
                    onGenerate={handleGenerate("scenes", idx)}
                    onDelete={() => { if (confirm("确认删除？")) handleDelete("scenes", idx)(); }}
                    variantCount={vc}
                  />
                );
              }
              return (
                <PropCard
                  key={idx} projectId={projectId} prop={item}
                  isGenerating={!!generating[`props-${idx}`]}
                  onUpload={handleUpload("props", idx)}
                  onGenerate={handleGenerate("props", idx)}
                  onDelete={() => { if (confirm("确认删除？")) handleDelete("props", idx)(); }}
                  variantCount={vc}
                />
              );
            })}
          </div>
      </div>

      {/* 添加弹窗 */}
      {addItemOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setAddItemOpen(false); resetAddForm(); }} />
          <div className="relative w-full max-w-xl mx-4 rounded-2xl border border-border-subtle bg-surface-card shadow-2xl p-10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold text-text-primary">
                添加{activeTab === "characters" ? "角色" : activeTab === "scenes" ? "场景" : "道具"}
              </h3>
              <button
                onClick={() => { setAddItemOpen(false); resetAddForm(); }}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-5">
              {/* 名称 */}
              <div>
                <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-text-muted mb-1.5 block">名称</label>
                <input
                  value={addItemName}
                  onChange={(e) => setAddItemName(e.target.value)}
                  placeholder={`输入${activeTab === "characters" ? "角色" : activeTab === "scenes" ? "场景" : "道具"}名称`}
                  className="w-full rounded-xl border border-border-subtle bg-surface-base px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-brand-cyan/50 transition-all"
                  autoFocus
                />
              </div>

              {/* 描述 */}
              <div>
                <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-text-muted mb-1.5 block">描述</label>
                <textarea
                  value={addItemDesc}
                  onChange={(e) => setAddItemDesc(e.target.value)}
                  rows={5}
                  placeholder={`输入${activeTab === "characters" ? "角色" : activeTab === "scenes" ? "场景" : "道具"}描述...`}
                  className="w-full rounded-xl border border-border-subtle bg-surface-base px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-brand-cyan/50 transition-all resize-none"
                />
              </div>

              {/* 图片上传（可多选，最多 15 张） */}
              <div>
                <label className="text-[10px] font-bold font-mono uppercase tracking-wider text-text-muted mb-1.5 block">
                  参考图{addItemImages.length > 0 ? `（已选 ${addItemImages.length} 张）` : ""}
                </label>
                {addItemImages.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {addItemPreviews.map((p, i) => (
                      <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border-subtle">
                        <img src={p} alt={`preview-${i}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => handleRemoveAddImage(i)}
                          className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white hover:bg-red-500 transition-colors"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                    <label className="flex flex-col items-center justify-center w-20 h-20 rounded-xl border-2 border-dashed border-border-subtle hover:border-brand-cyan/30 bg-surface-base cursor-pointer transition-all">
                      <Plus className="size-4 text-text-muted" />
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddFiles} />
                    </label>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-44 rounded-xl border-2 border-dashed border-border-subtle hover:border-brand-cyan/30 bg-surface-base cursor-pointer transition-all">
                    <Upload className="size-6 text-text-muted mb-2" />
                    <span className="text-sm text-text-muted">点击上传图片（可多选）</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddFiles} />
                  </label>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddItem}
                disabled={!addItemName.trim() || addingItem}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white text-xs font-bold hover:shadow-glow-sm transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {addingItem ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {addingItem ? "添加中…" : "确认添加"}
              </button>
              <button
                onClick={() => { setAddItemOpen(false); resetAddForm(); }}
                className="flex-1 py-2.5 rounded-xl border border-border-subtle text-text-muted hover:text-text-primary text-xs font-bold transition-all"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <ImagePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
      {showLibraryModal && (
        <AssetLibraryPicker
          projectId={projectId}
          type={activeTab}
          onSelect={() => setShowLibraryModal(false)}
          onClose={() => setShowLibraryModal(false)}
        />
      )}
      {pickerTarget && (
        <AssetLibraryPicker
          projectId={projectId}
          type={pickerTarget.tab}
          onSelect={handlePickerSelect}
          onClose={() => setPickerTarget(null)}
        />
      )}
      {variationsTarget && (
        <VariationsModal
          key={`var-${variationsTarget.name}`}
          characterName={variationsTarget.name}
          basePrompt={variationsTarget.prompt}
          characterExtra={variationsTarget.extra}
          modelId={selectedModel || "doubao-seedream-4-5-251128"}
          size={aspectRatio === "9:16" ? "768x1344" : aspectRatio === "1:1" ? "1024x1024" : "1344x768"}
          referenceImage={variationsTarget.imageUrl}
          existingImages={_cache.variations[variationsTarget.name]}
          onSave={(images) => { _cache.variations[variationsTarget.name] = images; }}
          onClose={() => setVariationsTarget(null)}
        />
      )}
      {turnaroundTarget && (
        <TurnaroundModal
          key={`turn-${turnaroundTarget.name}`}
          characterName={turnaroundTarget.name}
          basePrompt={turnaroundTarget.prompt}
          characterExtra={turnaroundTarget.extra}
          modelId={selectedModel || "doubao-seedream-4-5-251128"}
          size={aspectRatio === "9:16" ? "768x1344" : aspectRatio === "1:1" ? "1024x1024" : "1344x768"}
          referenceImage={turnaroundTarget.imageUrl}
          existingImages={_cache.turnaround[turnaroundTarget.name]}
          onSave={(images) => { _cache.turnaround[turnaroundTarget.name] = images; }}
          onClose={() => setTurnaroundTarget(null)}
        />
      )}
    </div>
  );
}
