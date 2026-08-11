"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutGrid, Loader2, AlertCircle, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { Shot, VideoInterval } from "./types";
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
  // shots 的 ref 镜像：多视频并发轮询时 updateShot 必须基于最新状态，
  // 否则两个生成任务互相覆盖（闭包 shots 是旧快照）
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;
  const [selectedVideoModel, setSelectedVideoModel] = useState(() => {
    if (typeof window !== "undefined") {
      try { return localStorage.getItem(`director-model-${episodeId}`) || ""; } catch { return ""; }
    }
    return "";
  });

  const [activeShotId, setActiveShotId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      try { return localStorage.getItem(`director-shot-${episodeId}`); } catch { return null; }
    }
    return null;
  });
  const [scriptData, setScriptData] = useState<StructureData | null>(null);
  const [aspectRatio, setAspectRatio] = useState(() => {
    if (typeof window !== "undefined") {
      try { return localStorage.getItem(`director-ar-${episodeId}`) || "16:9"; } catch { return "16:9"; }
    }
    return "16:9";
  });
  const [selectedModel, setSelectedModel] = useState("");
  const [videoModels, setVideoModels] = useState<{ id: string; name: string; resolutions?: string[] }[]>([]);
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
          const enabledVid = (vidRes.models || []).filter((m: any) => m.is_enabled).map((m: any) => ({
            id: m.id,
            name: m.name,
            resolutions: m.resolutions as string[] | undefined,
          }));
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
        if (cs.id && (cs.id.startsWith("custom-") || !mergedShots.find(s => s.id === cs.id))) {
          mergedShots.push(cs);
        }
      }

      // storyboards API 为空/失败时，用 config 保存的完整 shots 兜底
      // （保留 uploadedRefImages 等用户数据，避免 fallback 重建丢失）
      if (mergedShots.length === 0 && ALL_SAVED_SHOTS.length > 0) {
        mergedShots = ALL_SAVED_SHOTS;
      }

      if (mergedShots.length > 0) {
        // Fix any shots with videoUrl but wrong status
        const fixed = mergedShots.map(s => {
          if (s.interval?.videoUrl && s.interval?.status !== "completed") {
            return { ...s, interval: { ...s.interval, status: "completed" as const } };
          }
          // Clean up: failed status with no meaningful generation data (bug from recovery effect)
          if (s.interval?.status === "failed" && !s.interval?.videoUrl && !s.interval?.taskId && !s.interval?.videoPrompt) {
            return { ...s, interval: undefined };
          }
          return s;
        });
        setShots(fixed);
        setLoading(false);
        // 注意：不要在这里 persistShots(fixed) 写回 config！
        // 重建的 shots 基于旧 config + storyboards，会覆盖用户刚上传的
        // uploadedRefImages（上传后立即刷新/重载时的覆盖竞态 → 参考图丢失）
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

  // 409 冲突时的真合并：以服务器 shots 为基底 + 本地增量，逐镜头、逐视频合并。
  // 原来直接整体替换 newShots → 多人/双标签页编辑时，后写者用本地旧数据把
  // 服务器上他人刚保存的 videoUrl 覆盖掉 → 项目里视频"消失"（2026-08-11 修复）。
  const mergeShots = (serverShots: Shot[], localShots: Shot[]): Shot[] => {
    const serverMap = new Map(serverShots.map(s => [s.id, s]));
    const localIds = new Set(localShots.map(s => s.id));
    // videos 按 videoId 合并：同 id 取字段并集（server 基底 + local 覆盖，谁的字段全留谁的）
    const mergeVideos = (a?: VideoInterval[], b?: VideoInterval[]): VideoInterval[] => {
      const merged = new Map<string, VideoInterval>();
      for (const v of [...(a || []), ...(b || [])]) {
        const prev = merged.get(v.id);
        merged.set(v.id, prev ? { ...prev, ...v } : v);
      }
      // 顺序：服务器优先 + 本地新增追加尾部
      const seen = new Set<string>();
      const ordered: VideoInterval[] = [];
      for (const v of [...(a || []), ...(b || [])]) {
        if (!seen.has(v.id)) { seen.add(v.id); ordered.push(merged.get(v.id)!); }
      }
      return ordered;
    };
    return [
      ...localShots.map(local => {
        const server = serverMap.get(local.id);
        if (!server) return local; // 本地新建的镜头
        const mergedVideo = local.videos !== undefined || server.videos !== undefined
          ? mergeVideos(server.videos, local.videos)
          : undefined;
        return {
          ...server,
          ...local,
          videos: mergedVideo,
          interval: local.interval || server.interval,
          uploadedRefImages: local.uploadedRefImages || server.uploadedRefImages,
          hiddenRefImageUrls: local.hiddenRefImageUrls || server.hiddenRefImageUrls,
          audioRef: local.audioRef || server.audioRef,
        };
      }),
      ...serverShots.filter(s => !localIds.has(s.id)), // 服务器上他人新增的镜头
    ];
  };

  // Persist shots + aspect ratio to episode config (merge to preserve other fields)
  // Serialized via saveQueueRef to avoid GET+PUT race conditions on rapid updates
  // 乐观锁（2026-08-10）：GET 拿到 updated_at → PUT 带上 → 409 冲突时
  // 重拉最新配置，mergeShots 真合并（保留他人修改）再重试（≤3 次）
  const persistShots = useCallback(async (newShots: Shot[]) => {
    const prev = saveQueueRef.current;
    const next = (async () => {
      await prev;
      try {
        let pending = newShots;
        for (let attempt = 0; attempt < 3; attempt++) {
          const ep = await api.get<EpisodeData & { updated_at?: string }>(`/api/v1/projects/${projectId}/episodes/${episodeId}`);
          try {
            await api.put(`/api/v1/projects/${projectId}/episodes/${episodeId}`, {
              config: { ...(ep?.config || {}), aspectRatio, structureData: { ...(ep?.config?.structureData || {}), shots: pending } },
              if_updated_before: ep?.updated_at,
            });
            return;
          } catch (e) {
            // 409 冲突：他人已更新该集 → 真合并后重试（保留对方刚保存的 videoUrl 等）
            if (e instanceof Error && e.message.includes("已被其他用户更新")) {
              console.warn(`[StageDirector] persistShots conflict (attempt ${attempt + 1}/3), merging with fresh config`);
              pending = mergeShots((ep.config?.structureData?.shots || []) as Shot[], pending);
              continue;
            }
            throw e;
          }
        }
        console.warn("[StageDirector] persistShots conflict retries exhausted");
      } catch (e) {
        console.warn("[StageDirector] Failed to persist shots", e);
      }
    })();
    saveQueueRef.current = next;
  }, [projectId, episodeId, aspectRatio]);

  // Save aspect ratio changes to episode config
  const handleAspectRatioChange = (ratio: string) => {
    setAspectRatio(ratio);
    persistShots(shots); // persist immediately to save the new ratio
  };

  const updateShots = (newShots: Shot[]) => {
    shotsRef.current = newShots;
    setShots(newShots);
    persistShots(newShots);
  };

  const updateShot = (
    shotId: string,
    updates: Partial<Shot> | ((s: Shot) => Partial<Shot>),
  ) => {
    const newShots = shotsRef.current.map(s => {
      if (s.id !== shotId) return s;
      const u = typeof updates === "function" ? updates(s) : updates;
      return { ...s, ...u };
    });
    updateShots(newShots);
  };

  /** 镜头内视频列表（videos 存在即优先——空数组=已删光；老数据无 videos 时用 interval 退化） */
  const shotVideos = (s: Shot): VideoInterval[] =>
    s.videos !== undefined ? s.videos : (s.interval ? [s.interval] : []);

  /** 更新镜头内某个视频项（按 id 定位，多视频并发安全） */
  const updateShotVideo = (shotId: string, videoId: string, patch: Partial<VideoInterval>) => {
    updateShot(shotId, (s) => ({
      videos: shotVideos(s).map(v => v.id === videoId ? { ...v, ...patch } : v),
    }));
  };

  const deleteShot = (shotId: string) => {
    const newShots = shots.filter(s => s.id !== shotId);
    if (activeShotId === shotId) setActiveShotId(null);
    updateShots(newShots);
  };

  // Restore activeShotId after SSR hydration
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`director-shot-${episodeId}`);
      if (saved && shots.some(s => s.id === saved)) setActiveShotId(saved);
    } catch {}
  }, []);

  // Recover stuck generating tasks after page refresh (multi-video aware)
  const recoveringRef = useRef(false);
  useEffect(() => {
    if (loading || shots.length === 0 || recoveringRef.current) return;
    recoveringRef.current = true;
    (async () => {
      // 无 taskId 的视频：按 prompt 从后端 recover 匹配 project 记录找回
      // （提交响应回来前就关页面的场景，taskId 未持久化；2026-08-10）
      const candidates = shots.flatMap((s) => shotVideos(s)
        .filter((v) => v.videoPrompt && !v.taskId && !v.videoUrl && v.status !== "completed")
        .map((v) => ({ shot: s, video: v })));
      const recoverMap = new Map<string, string>(); // prompt(trim) -> videoUrl
      if (candidates.length > 0) {
        try {
          const res = await api.get<{ items?: Array<{ prompt?: string; status?: string; media_url?: string; params?: { source?: string } }> }>(
            "/api/v1/user/assets/recover", { include_project: true, project_id: projectId }
          );
          for (const item of res.items || []) {
            // 只认 project 来源的完成视频；recover 已按时间倒序，取最新一条
            if (item.status === "COMPLETED" && item.media_url && item.params?.source === "project" && item.prompt) {
              if (!recoverMap.has(item.prompt.trim())) {
                recoverMap.set(item.prompt.trim(), item.media_url);
              }
            }
          }
        } catch (e) {
          console.warn("[StageDirector] recover project videos failed", e);
        }
      }
      for (const shot of shots) {
        for (const intv of shotVideos(shot)) {
          if (intv?.videoUrl && intv?.status !== "completed") {
            // Has videoUrl but wrong status — just fix it
            updateShotVideo(shot.id, intv.id, { status: "completed" });
            continue;
          }
          // Check any video with a taskId that isn't completed
          if (intv?.taskId && intv?.status !== "completed") {
            const taskId = intv.taskId;
            const videoUrl = intv.videoUrl;
            const prevErr = intv.errorMessage;
            api.get<{ status: string; video_url?: string; error_message?: string }>(`/api/v1/video/status/${taskId}`)
              .then((st) => {
                if (st.status === "completed" && st.video_url) {
                  updateShotVideo(shot.id, intv.id, { videoUrl: st.video_url, status: "completed" });
                } else if (st.status === "failed") {
                  // If there's already a video URL (from a previous successful gen), keep it
                  if (videoUrl) {
                    updateShotVideo(shot.id, intv.id, { status: "completed" });
                  } else {
                    updateShotVideo(shot.id, intv.id, { status: "failed", errorMessage: st.error_message || prevErr });
                  }
                }
              })
              .catch(() => {
                // API error — do NOT mark as failed (video may still be running). Will retry on next page load.
              });
          } else if (intv && intv.status !== "completed") {
            // 无 taskId（老数据/任务已死）：有视频按完成处理；
            // 有生成意图先按 prompt 找回丢失的 project 生成。
            // 2026-08-11：匹配不到**不再标 failed**——recover 已按项目查（全成员），
            // 他人生成的视频在本端 recover 匹配不到不等于不存在，标 failed 会让卡片
            // 变红且丧失后续找回机会；保留原状态等待下次恢复。
            if (intv.videoUrl) {
              updateShotVideo(shot.id, intv.id, { status: "completed" });
            } else if (intv.videoPrompt) {
              const hit = recoverMap.get(intv.videoPrompt.trim());
              if (hit) {
                updateShotVideo(shot.id, intv.id, { videoUrl: hit, status: "completed" });
              }
            }
          }
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Persist activeShotId when it changes (skip initial null from SSR)
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    if (activeShotId) {
      try { localStorage.setItem(`director-shot-${episodeId}`, activeShotId); } catch {}
    }
  }, [activeShotId, episodeId]);

  // Persist selectedVideoModel across refreshes (skip initial SSR default)
  const modelMounted = useRef(false);
  useEffect(() => {
    if (!modelMounted.current) { modelMounted.current = true; return; }
    if (selectedVideoModel) {
      try { localStorage.setItem(`director-model-${episodeId}`, selectedVideoModel); } catch {}
    }
  }, [selectedVideoModel, episodeId]);

  // Persist aspectRatio across refreshes (skip initial SSR default)
  const arMounted = useRef(false);
  useEffect(() => {
    if (!arMounted.current) { arMounted.current = true; return; }
    try { localStorage.setItem(`director-ar-${episodeId}`, aspectRatio); } catch {}
  }, [aspectRatio, episodeId]);

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

  const handleUploadRefImage = async (shotId: string, file: File, type?: string): Promise<string | null> => {
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

      // 函数式更新：资产库多选时 onSelect 循环连续调用，闭包里的 shots 是旧值，
      // 直接展开会相互覆盖（N 张只剩最后 1 张）——必须基于 shotsRef 最新状态
      updateShot(shotId, (s) => ({
        uploadedRefImages: [
          ...(s.uploadedRefImages || []),
          { name: file.name.split(".")[0] || "参考图", url, type },
        ],
      }));
      return url;
    } catch { return null; }
  };

  const handleDeleteUploadedImage = (shotId: string, url: string) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot?.uploadedRefImages) return;
    updateShot(shotId, { uploadedRefImages: shot.uploadedRefImages.filter(img => img.url !== url) });
  };

  /** 上传音频参考（BGM/配音）——每镜头一个，存 shot.audioRef */
  const handleUploadAudio = async (shotId: string, file: File): Promise<string | null> => {
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
      updateShot(shotId, { audioRef: { name: file.name.split(".")[0] || "音频", url } });
      return url;
    } catch { return null; }
  };

  const handleDeleteAudio = (shotId: string) => {
    updateShot(shotId, { audioRef: undefined });
  };

  /** 删除镜头内的某个视频（多视频列表） */
  const handleDeleteVideo = (shotId: string, videoId: string) => {
    updateShot(shotId, (s) => {
      const rest = shotVideos(s).filter(v => v.id !== videoId);
      // 删光后同时清掉 interval，避免退化显示残留（老数据失败视频会从 interval 复活）
      return { videos: rest, ...(rest.length === 0 ? { interval: undefined } : {}) };
    });
  };

  /** 取消某条视频任务（后端已终止，这里更新本地状态为已取消） */
  const handleCancelVideo = (shotId: string, videoId: string) => {
    updateShotVideo(shotId, videoId, { status: "failed", errorMessage: "已取消" });
  };

  /** 用某条视频的参数再生成一个视频（追加到列表） */
  const handleRerunVideo = (shotId: string, videoId: string) => {
    const shot = shotsRef.current.find(s => s.id === shotId);
    if (!shot) return;
    const vid = shotVideos(shot).find(v => v.id === videoId);
    if (!vid) return;
    const scriptRefs = [
      ...((scriptData?.characters || []) as any[]).map(c => c.image_url).filter(Boolean),
      ...((scriptData?.scenes || []) as any[]).map(c => c.image_url).filter(Boolean),
      ...((scriptData?.props || []) as any[]).map(c => c.image_url).filter(Boolean),
    ];
    const allRefUrls = [...scriptRefs, ...(shot.uploadedRefImages?.map(i => i.url) || [])].filter(Boolean);
    handleGenerateVideo(shotId, vid.videoPrompt || shot.actionSummary, vid.duration || 5, allRefUrls, vid.resolution, shot.audioRef?.url);
  };

  // ─── Generate video ────────────────────────────────

  const handleGenerateVideo = async (shotId: string, promptText: string, duration: number = 5, refImageUrls: string[] = [], videoResolution?: string, audioUrl?: string) => {
    const shot = shotsRef.current.find(s => s.id === shotId);
    if (!shot) return;

    // Use shot-level resolution if provided, otherwise derive from global aspect ratio
    const effectiveSize = videoResolution || (
      aspectRatio === "16:9" ? "1280x720" :
      aspectRatio === "9:16" ? "720x1280" :
      aspectRatio === "1:1" ? "1024x1024" : "1280x720"
    );

    // 多视频：新视频追加到 videos 列表尾部（老数据 interval 作为第一项）
    const videoId = `vid-${shotId}-${Date.now()}`;
    const newVideo: VideoInterval = {
      id: videoId,
      startKeyframeId: "",
      endKeyframeId: "",
      duration,
      videoPrompt: promptText,
      resolution: effectiveSize,
      status: "generating",
      videoUrl: undefined,
      startedAt: Date.now(),
    };
    updateShot(shotId, (s) => ({ videos: [...shotVideos(s), newVideo] }));

    if (!selectedVideoModel) {
      updateShotVideo(shotId, videoId, { status: "failed" });
      return;
    }
    try {
      const body: Record<string, any> = {
        prompt: promptText,
        model_id: selectedVideoModel,
        duration,
        size: effectiveSize,
        source: "project", // 标记来源：AI 工具页历史恢复会排除 project 记录
      };
      if (refImageUrls.length > 0) {
        body.reference_images = refImageUrls;
      }
      if (audioUrl) {
        body.reference_audio = audioUrl; // 音频参考（BGM/配音），天翼云 audio_url
      }
      const videoRes = await api.post<{ task_id: string }>("/api/v1/video/generate", body);

      if (!videoRes.task_id) throw new Error("no task_id");

      // 关键：taskId 必须写入列表项并保持（persistShots 无 taskId 时
      // 恢复逻辑会走「按 prompt 匹配」误标 failed → 与轮询互相覆盖横跳）
      updateShotVideo(shotId, videoId, { taskId: videoRes.task_id });

      for (let i = 0; i < 400; i++) {
        await new Promise(r => setTimeout(r, 3000));
        // Wrap polling in try-catch so transient network errors don't abort the whole loop
        let st: { status: string; video_url?: string; error_message?: string; progress?: number };
        try {
          st = await api.get<{ status: string; video_url?: string; error_message?: string; progress?: number }>(`/api/v1/video/status/${videoRes.task_id}`);
        } catch (e) {
          console.warn(`[StageDirector] Poll iteration ${i} failed, retrying`, e);
          continue;
        }
        // Update progress on each poll so UI can show a live progress bar
        if (st.progress !== undefined) {
          updateShotVideo(shotId, videoId, { progress: st.progress });
        }
        if (st.status === "completed" && st.video_url) {
          updateShotVideo(shotId, videoId, {
            videoUrl: st.video_url,
            status: "completed",
            progress: 100,
          });
          return;
        }
        if (st.status === "failed") {
          // Store error message from backend so UI can show it
          updateShotVideo(shotId, videoId, { status: "failed", errorMessage: st.error_message || "生成失败" });
          return;
        }
        if (st.status === "cancelled") {
          // 用户取消了任务（取消按钮 → 后端终止 → 状态接口返回 cancelled）
          updateShotVideo(shotId, videoId, { status: "failed", errorMessage: "已取消" });
          return;
        }
      }
    } catch (e) {
      console.warn("[StageDirector] Video generation failed", e);
      // 后端 429 限流：标失败并向上抛出，让 UI 触发异常点击锁定
      if (e instanceof Error && e.message.includes("提交过于频繁")) {
        updateShotVideo(shotId, videoId, { status: "failed", errorMessage: e.message });
        throw e;
      }
      // 其他提交失败（如 422 校验）：把真实原因展示给用户，而不是固定误导文案
      const detail = e instanceof Error ? e.message : "";
      const friendly = detail.includes("too_long")
        ? "参考图超过 12 张上限，请减少参考图后重试"
        : detail.includes("reference_audio")
          ? "音频参考格式不支持，请更换音频后重试"
          : "";
      updateShotVideo(shotId, videoId, {
        status: "failed",
        errorMessage: friendly || (detail ? `提交失败：${detail.slice(0, 120)}` : "视频生成超时或请求提交失败，请重试"),
      });
      return;
    }

    // 走到这里 = 轮询 400 次（3s × 400 = 20 分钟）仍未完成，确为超时；
    // 提交失败已在上方 catch 分支处理并显示真实原因
    updateShotVideo(shotId, videoId, {
      status: "failed",
      errorMessage: "视频生成超时，请重试",
    });
  };

  const rawShot = shots.find(s => s.id === activeShotId);
  // If a shot has videoUrl but wrong status (and not currently generating), treat as completed
  const activeShot = rawShot?.interval?.videoUrl && rawShot.interval.status !== "completed" && rawShot.interval.status !== "generating"
    ? { ...rawShot, interval: { ...rawShot.interval, status: "completed" as const } }
    : rawShot;

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
          <span className="text-[10px] font-mono text-text-muted">
            {shots.filter(s => s.interval?.videoUrl).length}/{shots.length} 完成
          </span>
        </div>
      </div>

      {/* Main content — top: grid, bottom: 3-column editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Shot grid (top) — compact when bottom panel is open */}
        <div className={cn(
          "overflow-y-auto transition-all duration-300",
          activeShotId ? "max-h-[30vh] shrink-0 p-3" : "flex-1 p-6"
        )}>
          <div className={cn(
            "grid",
            activeShotId ? "gap-2" : "gap-4",
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

        {/* Bottom panel: 3-column workbench */}
        {activeShotId && activeShot && (
          <ShotWorkbench
            shot={activeShot}
            shotIndex={shots.findIndex(s => s.id === activeShotId)}
            totalShots={shots.length}
            scriptData={scriptData}
            aspectRatio={aspectRatio}
            videoModels={videoModels}
            onVideoModelChange={setSelectedVideoModel}
            onAspectRatioChange={handleAspectRatioChange}
            refImages={getShotRefImagesWithNames(activeShot)}
            uploadedImages={activeShot.uploadedRefImages || []}
            layout="bottom"
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
            onUploadAudio={handleUploadAudio}
            onDeleteAudio={handleDeleteAudio}
            projectId={projectId}
            selectedVideoModel={selectedVideoModel}
            videoModelResolutions={videoModels.find(m => m.id === selectedVideoModel)?.resolutions}
            onGenerateVideo={handleGenerateVideo}
            onDeleteVideo={handleDeleteVideo}
            onRerunVideo={handleRerunVideo}
            onCancelVideo={handleCancelVideo}
          />
        )}
      </div>

      {/* Image preview */}
      <ImagePreviewModal imageUrl={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
}
