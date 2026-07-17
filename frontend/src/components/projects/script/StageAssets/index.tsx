"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users, MapPin, Package, Loader2, Sparkles, RefreshCw,
  Search, X, Archive, Link2, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
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
    apiEndpoint: "characters", emptyMsg: "暂无角色，请先在剧本阶段运行 AI 拆解",
  },
  scenes: {
    label: "场景概念", sub: "Locations", icon: MapPin, color: "bg-accent-green",
    apiEndpoint: "scenes", emptyMsg: "暂无场景数据",
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
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Record<AssetTab, StructureItem[]>>({
    characters: [], scenes: [], props: [],
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [pickerTarget, setPickerTarget] = useState<{ tab: AssetTab; idx: number } | null>(null);
  const [activeTab, setActiveTab] = useState<AssetTab>("characters");
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [imageModels, setImageModels] = useState<{ id: string; name: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [variationsTarget, setVariationsTarget] = useState<{ name: string; prompt: string; extra: Record<string, string>; imageUrl?: string } | null>(null);
  const [turnaroundTarget, setTurnaroundTarget] = useState<{ name: string; prompt: string; extra: Record<string, string>; imageUrl?: string } | null>(null);

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
            results[t] = items.map((i: any) => ({ id: i.id, name: i.name, description: i.description || "", image_url: i.image_url || "", prompt: i.prompt || "" }));
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
      for (const t of types) {
        if (results[t].length > 0) {
          merged[t] = results[t];
        } else if (sd && sd[t] && sd[t].length > 0) {
          merged[t] = sd[t].map((i: any) => ({ ...i, image_url: i.image_url || "" }));
        }
      }
      setItems(merged as any);
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

  const handleDelete = (tab: AssetTab, idx: number) => () => {
    const item = items[tab][idx];
    if (item?.id) {
      // Also delete from backend
      api.delete(`/api/v1/projects/${projectId}/${SECTION_META[tab].apiEndpoint}/${item.id}`).catch(() => {});
    }
    setItems(p => ({ ...p, [tab]: p[tab].filter((_, i) => i !== idx) }));
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
          { prompt, model_id: selectedModel || "doubao-seedream-4-5-251128", size: imgSize, batch: 1 }
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

  const isAllEmpty = !items.characters.length && !items.scenes.length && !items.props.length;

  if (isAllEmpty) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md px-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-purple/20 to-brand-cyan/20 flex items-center justify-center mx-auto mb-6">
            <Users className="size-8 text-brand-cyan" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">暂无资产数据</h3>
          <p className="text-sm text-text-muted leading-relaxed">请先在「剧本与故事」阶段运行 AI 结构化解构。</p>
        </div>
      </div>
    );
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
          {/* 添加按钮 */}
          <button
            onClick={async () => {
              const name = prompt(`输入${SECTION_META[activeTab].label}名称：`);
              if (!name?.trim()) return;
              const newItem: StructureItem = { name: name.trim(), description: "" };
              // Save to backend
              try {
                const saved = await api.post<any>(`/api/v1/projects/${projectId}/${SECTION_META[activeTab].apiEndpoint}`, {
                  name: name.trim(), description: "",
                });
                if (saved?.id) newItem.id = saved.id;
              } catch (e) { console.warn("[StageAssets] Failed to save new item", e); }
              setItems(p => ({ ...p, [activeTab]: [...p[activeTab], newItem] }));
            }}
            className="px-3 py-1.5 rounded-lg bg-accent-green/10 text-accent-green hover:bg-accent-green/20 text-[10px] font-bold uppercase tracking-wider border border-accent-green/30 hover:border-accent-green/50 transition-all flex items-center gap-1.5"
          >
            <Plus className="size-3.5" />
            添加
          </button>
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
              onClick={() => setActiveTab(tab)}
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
        {items[activeTab].length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-muted">{SECTION_META[activeTab].emptyMsg}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {items[activeTab].map((item, idx) => {
              if (activeTab === "characters") {
                return (
                  <CharacterCard
                    key={idx} character={item}
                    isGenerating={!!generating[`characters-${idx}`]}
                    onUpload={handleUpload("characters", idx)}
                    onUploadShapeRef={handleUploadShapeRef("characters", idx)}
                    onClearShapeRef={handleClearShapeRef("characters", idx)}
                    onPromptSave={handlePromptSave("characters", idx)}
                    onGenerate={handleGenerate("characters", idx)}
                    onVariations={handleVariations("characters", idx)}
                    onTurnaround={handleTurnaround("characters", idx)}
                    onImageClick={setPreviewUrl}
                    onDelete={handleDelete("characters", idx)}
                    onUpdateInfo={handleUpdateInfo("characters", idx)}
                    onSaveToLibrary={handleSaveToLibrary("characters", idx)}
                    onReplaceFromLibrary={handleReplaceFromLibrary("characters", idx)}
                  />
                );
              }
              if (activeTab === "scenes") {
                return (
                  <SceneCard
                    key={idx} scene={item}
                    isGenerating={!!generating[`scenes-${idx}`]}
                    onUpload={handleUpload("scenes", idx)}
                    onUploadShapeRef={handleUploadShapeRef("scenes", idx)}
                    onClearShapeRef={handleClearShapeRef("scenes", idx)}
                    onPromptSave={handlePromptSave("scenes", idx)}
                    onGenerate={handleGenerate("scenes", idx)}
                    onImageClick={setPreviewUrl}
                    onDelete={handleDelete("scenes", idx)}
                    onUpdateInfo={handleUpdateInfo("scenes", idx)}
                    onSaveToLibrary={handleSaveToLibrary("scenes", idx)}
                  />
                );
              }
              return (
                <PropCard
                  key={idx} prop={item}
                  isGenerating={!!generating[`props-${idx}`]}
                  onUpload={handleUpload("props", idx)}
                  onPromptSave={handlePromptSave("props", idx)}
                  onGenerate={handleGenerate("props", idx)}
                  onImageClick={setPreviewUrl}
                  onDelete={handleDelete("props", idx)}
                  onUpdateInfo={handleUpdateInfo("props", idx)}
                  onSaveToLibrary={handleSaveToLibrary("props", idx)}
                />
              );
            })}
          </div>
        )}
      </div>

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
