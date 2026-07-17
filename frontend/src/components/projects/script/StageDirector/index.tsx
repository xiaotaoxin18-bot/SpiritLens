"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutGrid, Loader2, AlertCircle, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { Shot } from "./types";
import ShotCard from "./ShotCard";
import ShotWorkbench from "./ShotWorkbench";
import ImagePreviewModal from "./ImagePreviewModal";

interface Props {
  projectId: string;
  episodeId: string;
  projectName?: string;
  episodeTitle?: string;
}

interface EpisodeData {
  id: string;
  config?: Record<string, any> | null;
  script_content?: string | null;
}

interface StructureData {
  characters?: any[];
  scenes?: any[];
  props?: any[];
  shots?: Shot[];
}

const ASPECT_RATIOS = ["16:9", "9:16", "1:1"];

// ─── Script → Shots parsing ──────────────────────────────

/**
 * Derive shots from script content — replicating BigBanana's approach:
 * 1. Parse script into story paragraphs (by scene headers or blank lines)
 * 2. Map paragraphs to scenes
 * 3. Generate multiple shots per scene with varied camera movements
 * 4. Assign character and prop IDs based on scene context
 */
function deriveShotsFromScript(scriptContent: string, sd: StructureData): Shot[] {
  const scenes = sd.scenes || [];
  const characters = sd.characters || [];
  const props = sd.props || [];
  if (!scenes.length) return [];

  // ── Step 1: Split script into story paragraphs ─────────────
  const storyParagraphs: { text: string; sceneId: string | number }[] = [];

  if (scriptContent) {
    // Split by scene headers first (e.g. "1-1 顶层暗房 内 夜")
    const sceneHeaderPattern = /(\d+(?:[\.-]\d+)?)\s+(.+?)(?:\s+(内|外)\s+(?:日|夜|晨|昏|黎明|黄昏))?/g;
    const lines = scriptContent.split("\n").map(l => l.trim()).filter(Boolean);
    const sceneNameToId = new Map(scenes.map(s => [s.name, s.id || s.name]));

    let currentSceneId = scenes[0]?.id || scenes[0]?.name || "";
    let buffer: string[] = [];

    for (const line of lines) {
      // Detect scene header
      const headerMatch = sceneHeaderPattern.exec(line);
      sceneHeaderPattern.lastIndex = 0;

      if (headerMatch) {
        if (buffer.length > 10) { // Only save substantial paragraphs
          storyParagraphs.push({ text: buffer.join("\n").slice(0, 300), sceneId: currentSceneId });
        }
        buffer = [];
        // Extract scene name from header and find matching scene
        const headerName = headerMatch[2]?.trim();
        const matched = scenes.find(s => headerName?.includes(s.name) || s.name.includes(headerName));
        currentSceneId = matched?.id || matched?.name || currentSceneId;
        buffer.push(line);
      } else {
        // Check if this line references a scene name
        const matchedScene = scenes.find(s => line.includes(s.name));
        if (matchedScene && buffer.length > 10) {
          storyParagraphs.push({ text: buffer.join("\n").slice(0, 300), sceneId: currentSceneId });
          buffer = [];
          currentSceneId = matchedScene.id || matchedScene.name;
        }
        buffer.push(line);
      }
    }
    if (buffer.length > 0) {
      storyParagraphs.push({ text: buffer.join("\n").slice(0, 300), sceneId: currentSceneId });
    }
  }

  // ── Step 2: If no paragraphs from script, split by blank lines ──
  if (storyParagraphs.length < 2 && scriptContent) {
    const paragraphs = scriptContent
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 20 && !p.startsWith("（") && !p.startsWith("("));

    paragraphs.forEach((para, i) => {
      const sceneIdx = Math.min(i, scenes.length - 1);
      storyParagraphs.push({
        text: para.slice(0, 300),
        sceneId: scenes[sceneIdx]?.id || scenes[sceneIdx]?.name || "",
      });
    });
  }

  // ── Step 3: If still no paragraphs, create from scene descriptions ──
  if (storyParagraphs.length < 2) {
    const CAMERA_VARIANTS: { movement: CameraMovement; desc: string }[] = [
      { movement: "fixed", desc: "固定机位" },
      { movement: "pan", desc: "从左到右平移" },
      { movement: "zoom", desc: "缓慢推近" },
      { movement: "tilt", desc: "从上到下俯仰" },
      { movement: "track", desc: "跟随角色运动" },
    ];

    for (const scene of scenes) {
      const sceneName = scene.name || "";
      const desc = scene.description || "";
      const loc = (scene as any).location || "";
      const atmos = (scene as any).atmosphere || "";

      // Create 3-5 shots per scene
      const shotCount = Math.min(5, Math.max(3, Math.ceil((desc.length + loc.length) / 40 || 3)));
      for (let j = 0; j < shotCount; j++) {
        const variant = CAMERA_VARIANTS[j % CAMERA_VARIANTS.length];
        storyParagraphs.push({
          text: `[${sceneName}] ${desc}（${loc}·${atmos}）- ${variant.desc}`,
          sceneId: scene.id || scene.name || "",
        });
      }
    }
  }

  // ── Step 4: Convert paragraphs to Shots ──────────────────────
  const cameraMovements: CameraMovement[] = ["fixed", "pan", "tilt", "zoom", "track", "dolly", "handheld", "crane"];
  const charIdSet = new Set(characters.map(c => c.id || c.name));
  const propIdSet = new Set(props.map(p => p.id || p.name));

  // Track seen scene+text combos to deduplicate
  const seen = new Set<string>();
  const shots: Shot[] = [];

  for (const para of storyParagraphs) {
    const scene = scenes.find(s => (s.id || s.name) === para.sceneId) || scenes[0];
    if (!scene) continue;

    // Derive scene-relevant characters and props
    const sceneChars = characters
      .filter(c => para.text.includes(c.name))
      .map(c => c.id || c.name);

    const sceneProps = props
      .filter(p => para.text.includes(p.name))
      .map(p => p.id || p.name);

    // Create 1-2 shots per paragraph with different camera angles
    const subShotCount = para.text.length > 100 ? 2 : 1;
    for (let s = 0; s < subShotCount; s++) {
      const cm = cameraMovements[(shots.length + s) % cameraMovements.length];

      // Clean and shorten action text
      let actionText = para.text
        .replace(/^△/, "")
        .replace(/[：:].*?[。！？]/g, "")
        .trim()
        .slice(0, 120);

      if (s === 1) {
        // Second sub-shot: use a different angle description
        actionText = `${actionText}（${cm === "zoom" ? "近景" : cm === "pan" ? "全景" : cm === "track" ? "跟拍" : "中景"}）`;
      }

      const dedupKey = `${scene.name}:${actionText.slice(0, 30)}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      shots.push({
        id: `shot-${shots.length + 1}`,
        sceneId: scene.id || scene.name || "",
        sceneName: scene.name || "",
        actionSummary: actionText || scene.name || "未知镜头",
        cameraMovement: cm,
        characters: sceneChars,
        props: sceneProps,
        keyframes: [],
      });
    }
  }

  return shots.length > 0 ? shots : [{
    id: "shot-1",
    sceneId: scenes[0]?.id || "",
    sceneName: scenes[0]?.name || "",
    actionSummary: "开场镜头",
    cameraMovement: "fixed",
    characters: [],
    props: [],
    keyframes: [],
  }];
}

export default function StageDirector({ projectId, episodeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [shots, setShots] = useState<Shot[]>([]);
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [scriptData, setScriptData] = useState<StructureData | null>(null);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [selectedModel, setSelectedModel] = useState("");
  const [videoModels, setVideoModels] = useState<{ id: string; name: string }[]>([]);
  const [selectedVideoModel, setSelectedVideoModel] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const ep = await api.get<EpisodeData>(`/api/v1/projects/${projectId}/episodes/${episodeId}`);
      const sd = (ep?.config?.structureData || {}) as StructureData;
      // Restore aspect ratio from episode config (persisted from Script stage)
      if (ep?.config?.aspectRatio) {
        setAspectRatio(ep.config.aspectRatio);
      }

      // ── Load Stage 2 asset images and merge into structureData ──
      try {
        type Res = { total: number; characters?: any[]; scenes?: any[]; props?: any[] };
        const [charsRes, scenesRes, propsRes] = await Promise.all([
          api.get<Res>(`/api/v1/projects/${projectId}/characters`).catch(() => null),
          api.get<Res>(`/api/v1/projects/${projectId}/scenes`).catch(() => null),
          api.get<Res>(`/api/v1/projects/${projectId}/props`).catch(() => null),
        ]);

        if (charsRes?.characters) {
          const imgMap = new Map(charsRes.characters.map((c: any) => [c.name, c.image_url]));
          sd.characters = (sd.characters || []).map((ch: any) => ({
            ...ch,
            image_url: ch.image_url || imgMap.get(ch.name) || "",
          }));
        }
        if (scenesRes?.scenes) {
          const imgMap = new Map(scenesRes.scenes.map((s: any) => [s.name, s.image_url]));
          sd.scenes = (sd.scenes || []).map((sc: any) => ({
            ...sc,
            image_url: sc.image_url || imgMap.get(sc.name) || "",
          }));
        }
        if (propsRes?.props) {
          const imgMap = new Map(propsRes.props.map((p: any) => [p.name, p.image_url]));
          sd.props = (sd.props || []).map((pr: any) => ({
            ...pr,
            image_url: pr.image_url || imgMap.get(pr.name) || "",
          }));
        }
      } catch (e) {
        console.warn("Failed to merge Stage 2 asset images", e);
      }

      setScriptData(sd);

      // ── Step A: Load models (must happen BEFORE storyboard early return) ──
      try {
        const [imgRes, vidRes] = await Promise.all([
          api.get<{ models: any[] }>("/api/v1/models", { type: "image" }),
          api.get<{ models: any[] }>("/api/v1/models", { type: "video" }).catch(() => null),
        ]);
        const enabledImg = (imgRes.models || []).filter((m) => m.is_enabled);
        if (enabledImg.length > 0 && !selectedModel) setSelectedModel(enabledImg[0].id);
        if (vidRes) {
          const enabledVid = (vidRes.models || []).filter((m) => m.is_enabled);
          setVideoModels(enabledVid);
          if (enabledVid.length > 0 && !selectedVideoModel) setSelectedVideoModel(enabledVid[0].id);
        }
      } catch (e) {
        console.warn("[StageDirector] Failed to load models", e);
      }

      // ── Step B: Load storyboards from API (generated by StageScript) ──
      // Build a lookup of saved shots from config so we can restore interval (videoUrl etc.)
      const ALL_SAVED_SHOTS = (ep?.config?.structureData?.shots || []) as Shot[];
      const savedShotMap = new Map<string, Shot>();
      for (const ss of ALL_SAVED_SHOTS) {
        if (ss.id) savedShotMap.set(ss.id, ss);
      }

      let mergedShots: Shot[] = [];
      try {
        const sbRes = await api.get<{ total: number; storyboards: any[] }>(
          `/api/v1/projects/${projectId}/episodes/${episodeId}/storyboards`
        );
        if (sbRes.storyboards && sbRes.storyboards.length > 0) {
          mergedShots = sbRes.storyboards.map((sb: any, i: number) => {
            const shotId = `shot-${sb.sequence_number || i + 1}`;
            const saved = savedShotMap.get(shotId);
            return {
              id: shotId,
              sceneId: sb.scene_description || "",
              sceneName: "",
              actionSummary: sb.action_description || sb.scene_description || "",
              cameraMovement: sb.shot_type === "wide" ? "pan" :
                             sb.shot_type === "closeup" ? "zoom" :
                             sb.shot_type === "full" ? "fixed" :
                             sb.shot_type === "medium" ? "track" : "fixed" as any,
              characters: (() => { try { return JSON.parse(sb.characters || "[]"); } catch { return []; } })(),
              props: (() => { try { return JSON.parse(sb.props || "[]"); } catch { return []; } })(),
              keyframes: [],
              // Restore interval (videoUrl etc.) from saved config — survives refresh
              interval: saved?.interval,
              dubbing: saved?.dubbing,
              uploadedRefImages: saved?.uploadedRefImages,
              hiddenRefImageUrls: saved?.hiddenRefImageUrls,
            };
          });
        }
      } catch (e) {
        console.warn("Failed to load storyboards", e);
      }

      // Merge custom (user-added) shots after storyboard shots
      for (const cs of ALL_SAVED_SHOTS) {
        if (cs.id && cs.id.startsWith("custom-") && !mergedShots.find(s => s.id === cs.id)) {
          mergedShots.push(cs);
        }
      }

      if (mergedShots.length > 0) {
        setShots(mergedShots);
        setLoading(false);
        return;
      }

      // ── Step C: Fallback → generate shots from scenes ──
      if (sd?.scenes && sd.scenes.length > 0) {
        const fallbackShots = deriveShotsFromScript(ep?.script_content || "", sd);
        setShots(fallbackShots);
      }
    } catch (e) {
      console.error("Failed to load director data", e);
    } finally {
      setLoading(false);
    }
  };

  // Persist shots + aspect ratio to episode config (merge to preserve other fields)
  // Serialized via saveQueueRef to avoid GET+PUT race conditions on rapid updates
  const persistShots = useCallback(async (newShots: Shot[]) => {
    const prev = saveQueueRef.current;
    const next = (async () => {
      await prev;
      try {
        const ep = await api.get<EpisodeData>(`/api/v1/projects/${projectId}/episodes/${episodeId}`);
        await api.put(`/api/v1/projects/${projectId}/episodes/${episodeId}`, {
          config: { ...(ep?.config || {}), aspectRatio, structureData: { ...scriptData, shots: newShots } },
        });
      } catch (e) {
        console.warn("[StageDirector] Failed to persist shots", e);
      }
    })();
    saveQueueRef.current = next;
  }, [projectId, episodeId, scriptData, aspectRatio]);

  // Save aspect ratio changes to episode config
  const handleAspectRatioChange = (ratio: string) => {
    setAspectRatio(ratio);
    persistShots(shots); // persist immediately to save the new ratio
  };

  const updateShots = (newShots: Shot[]) => {
    setShots(newShots);
    persistShots(newShots);
  };

  const updateShot = (shotId: string, updates: Partial<Shot>) => {
    const newShots = shots.map(s => s.id === shotId ? { ...s, ...updates } : s);
    updateShots(newShots);
  };

  const deleteShot = (shotId: string) => {
    const newShots = shots.filter(s => s.id !== shotId);
    if (activeShotId === shotId) setActiveShotId(null);
    updateShots(newShots);
  };

  // ─── Add a new empty shot ────────────────────────────

  const handleAddShot = () => {
    const nextNum = (shots.filter(s => s.id.startsWith("custom-")).length) + 1;
    const newShot: Shot = {
      id: `custom-${Date.now()}`,
      sceneId: "",
      sceneName: "",
      actionSummary: `新增镜头 ${nextNum}`,
      cameraMovement: "fixed",
      characters: [],
      props: [],
      keyframes: [],
    };
    const newShots = [...shots, newShot];
    updateShots(newShots);
    setActiveShotId(newShot.id);
  };

  // ─── Get reference images with names for workbench ──

  const getShotRefImagesWithNames = (shot: Shot): { name: string; url: string }[] => {
    const refs: { name: string; url: string }[] = [];
    if (scriptData?.characters && shot.characters) {
      shot.characters.forEach(charId => {
        const ch = scriptData.characters.find((c: any) => String(c.id || c.name) === String(charId));
        if (ch?.image_url) refs.push({ name: ch.name || "角色", url: ch.image_url });
      });
    }
    if (scriptData?.scenes) {
      const sc = scriptData.scenes.find((s: any) => String(s.id || s.name) === String(shot.sceneId));
      if (sc?.image_url) refs.push({ name: sc.name || "场景", url: sc.image_url });
    }
    if (scriptData?.props && shot.props) {
      shot.props.forEach(propId => {
        const p = scriptData.props.find((pr: any) => String(pr.id || pr.name) === String(propId));
        if (p?.image_url) refs.push({ name: p.name || "道具", url: p.image_url });
      });
    }
    return refs;
  };

  // ─── Upload / delete ref images ────────────────────

  const handleUploadRefImage = async (shotId: string, file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append("files", file);
      const auth = (() => { try { return JSON.parse(localStorage.getItem("spiritlens-auth") || "{}")?.state?.accessToken || ""; } catch { return ""; } })();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "/spiritlens"}/api/v1/upload`, {
        method: "POST",
        headers: auth ? { Authorization: `Bearer ${auth}` } : {},
        body: formData,
      });
      if (!res.ok) return null;
      const data = await res.json();
      const url = data.urls?.[0];
      if (!url) return null;

      updateShot(shotId, {
        uploadedRefImages: [
          ...(shots.find(s => s.id === shotId)?.uploadedRefImages || []),
          { name: file.name.split(".")[0] || "参考图", url },
        ],
      });
      return url;
    } catch { return null; }
  };

  const handleDeleteUploadedImage = (shotId: string, index: number) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot?.uploadedRefImages) return;
    const newList = [...shot.uploadedRefImages];
    newList.splice(index, 1);
    updateShot(shotId, { uploadedRefImages: newList });
  };

  // ─── Generate video ────────────────────────────────

  const handleGenerateVideo = async (shotId: string, promptText: string, duration: number = 5, refImageUrls: string[] = [], videoResolution?: string) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    // Use shot-level resolution if provided, otherwise derive from global aspect ratio
    const effectiveSize = videoResolution || (
      aspectRatio === "16:9" ? "1280x720" :
      aspectRatio === "9:16" ? "720x1280" :
      aspectRatio === "1:1" ? "1024x1024" : "1280x720"
    );

    updateShot(shotId, {
      interval: {
        id: `int-${shot.id}`,
        startKeyframeId: "",
        endKeyframeId: "",
        duration,
        videoPrompt: promptText,
        resolution: effectiveSize,
        status: "generating",
      },
    });

    try {
      const body: Record<string, any> = {
        prompt: promptText,
        model_id: selectedVideoModel || "seedance-2-0",
        duration,
        size: effectiveSize,
      };
      if (refImageUrls.length > 0) {
        body.reference_images = refImageUrls;
      }
      const videoRes = await api.post<{ task_id: string }>("/api/v1/video/generate", body);

      if (!videoRes.task_id) throw new Error("no task_id");

      for (let i = 0; i < 400; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const st = await api.get<{ status: string; video_url?: string }>(`/api/v1/video/status/${videoRes.task_id}`);
        if (st.status === "completed" && st.video_url) {
          updateShot(shotId, {
            interval: {
              id: `int-${shot.id}`,
              startKeyframeId: "",
              endKeyframeId: "",
              duration,
              videoPrompt: promptText,
              resolution: effectiveSize,
              videoUrl: st.video_url,
              status: "completed",
            },
          });
          return;
        }
        if (st.status === "failed") break;
      }
    } catch (e) {
      console.warn("[StageDirector] Video generation failed", e);
    }

    updateShot(shotId, {
      interval: {
        id: `int-${shot.id}`,
        startKeyframeId: "",
        endKeyframeId: "",
        duration,
        videoPrompt: promptText,
        resolution: effectiveSize,
        status: "failed",
      },
    });
  };

  const activeShot = shots.find(s => s.id === activeShotId);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="size-6 text-text-muted animate-spin" />
      </div>
    );
  }

  if (!shots.length) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-base">
        <div className="text-center max-w-md px-8">
          <AlertCircle className="size-12 text-text-muted/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">暂无镜头数据</h3>
          <p className="text-sm text-text-muted mb-6">请先在「剧本与故事」阶段运行 AI 结构化解构，或手动添加新镜头。</p>
          <button
            onClick={handleAddShot}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold
                       bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan/20 transition-all border border-brand-cyan/20"
          >
            <Plus className="size-4" />
            新增镜头
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface-base overflow-hidden relative">
      {/* Toolbar */}
      <div className="h-16 px-6 border-b border-border-subtle bg-surface-card flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <LayoutGrid className="size-4 text-brand-cyan" />
          <span className="text-sm font-bold text-text-primary">导演工作台</span>
          <span className="text-[10px] font-mono text-text-muted uppercase bg-surface-elevated px-2 py-0.5 rounded">
            Director Workbench
          </span>
          <div className="w-px h-4 bg-border-subtle mx-1" />
          <button
            onClick={handleAddShot}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider
                       bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan/20 transition-all border border-brand-cyan/20"
          >
            <Plus className="size-3" />
            新增镜头
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Video model selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-muted uppercase">视频模型</span>
            <select
              value={selectedVideoModel}
              onChange={(e) => setSelectedVideoModel(e.target.value)}
              className="text-[10px] font-mono bg-surface-card border border-border-subtle rounded px-2 py-1 text-text-primary outline-none focus:border-brand-cyan/50"
            >
              {videoModels.length === 0 ? (
                <option>无可用模型</option>
              ) : (
                videoModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))
              )}
            </select>
          </div>
          {/* Aspect ratio */}
          <div className="flex gap-0.5 rounded-lg border border-border-subtle overflow-hidden">
            {ASPECT_RATIOS.map((r) => (
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
          <div className="w-px h-5 bg-border-subtle" />
          <span className="text-[10px] font-mono text-text-muted">
            {shots.filter(s => s.interval?.videoUrl).length}/{shots.length} 完成
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Shot grid */}
        <div className={cn(
          "overflow-y-auto p-6 transition-all duration-300",
          activeShotId ? "flex-1" : "flex-1"
        )}>
          <div className={cn(
            "grid gap-4",
            activeShotId
              ? "grid-cols-1 md:grid-cols-2"
              : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          )}>
            {shots.map((shot, i) => (
              <ShotCard
                key={shot.id}
                shot={shot}
                index={i}
                isActive={activeShotId === shot.id}
                onClick={() => setActiveShotId(shot.id)}
                onDelete={deleteShot}
              />
            ))}
          </div>
        </div>

        {/* Workbench */}
        {activeShotId && activeShot && (
          <ShotWorkbench
            shot={activeShot}
            shotIndex={shots.findIndex(s => s.id === activeShotId)}
            totalShots={shots.length}
            scriptData={scriptData}
            aspectRatio={aspectRatio}
            refImages={getShotRefImagesWithNames(activeShot)}
            uploadedImages={activeShot.uploadedRefImages || []}
            onClose={() => setActiveShotId(null)}
            onPrevious={() => {
              const idx = shots.findIndex(s => s.id === activeShotId);
              if (idx > 0) setActiveShotId(shots[idx - 1].id);
            }}
            onNext={() => {
              const idx = shots.findIndex(s => s.id === activeShotId);
              if (idx < shots.length - 1) setActiveShotId(shots[idx + 1].id);
            }}
            onUploadRefImage={handleUploadRefImage}
            onDeleteUploadedImage={handleDeleteUploadedImage}
            onHideAutoImage={(shotId, imgUrl) => updateShot(shotId, { hiddenRefImageUrls: [...(shots.find(s => s.id === shotId)?.hiddenRefImageUrls || []), imgUrl] })}
            projectId={projectId}
            selectedVideoModel={selectedVideoModel}
            onGenerateVideo={handleGenerateVideo}
          />
        )}
      </div>

      {/* Image preview */}
      <ImagePreviewModal imageUrl={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
}
