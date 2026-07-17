"use client";

import { useState, useRef, useEffect } from "react";
import {
  ArrowUp, Sparkles, Settings2, ImagePlus, ChevronDown,
  Loader2, X, Download, Heart, RefreshCw, Check, Play,
  Film, Layers, GalleryThumbnails,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSessionStore, type GenerationResult } from "@/store/sessions";
import { SessionSidebar } from "@/components/ai-tools/SessionSidebar";
import { GenerationPicker } from "@/components/ai-tools/GenerationPicker";
import { PublishDialog } from "@/components/community/PublishDialog";
import { MoreMenu } from "@/components/ui/MoreMenu";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { api } from "@/services/api";

type VideoReferenceMode = "universal" | "first-last" | "keyframes";

type VideoModelInfo = {
  id: string; name: string; vendor?: string; cost?: number; latency?: number;
};

const DEFAULT_VIDEO_MODELS: VideoModelInfo[] = [
  { id: "doubao-seedance-2-0-260128", name: "Seedance 2.0", vendor: "星河智云", cost: 15, latency: 60000 },
  { id: "doubao-seedance-2-0-fast-260128", name: "Seedance 2.0 Fast", vendor: "星河智云", cost: 8, latency: 30000 },
  { id: "doubao-seedance-2-0-mini-260615", name: "Seedance 2.0 Mini", vendor: "星河智云", cost: 5, latency: 20000 },
  { id: "doubao-seedance-1-5-pro-251215", name: "Seedance 1.5 Pro", vendor: "星河智云", cost: 10, latency: 45000 },
];

const REFERENCE_MODES: Array<{
  value: VideoReferenceMode; label: string; hint: string;
  icon: React.ComponentType<{ className?: string }>;
  maxRefs: number; slotLabels?: string[];
}> = [
  { value: "universal", label: "全能参考", hint: "上传 1-9 张参考素材，模型综合提取人物/风格/场景", icon: Sparkles, maxRefs: 9 },
  { value: "first-last", label: "首尾帧", hint: "首帧 + 尾帧两张图，模型在中间补全过渡动画", icon: Film, maxRefs: 2, slotLabels: ["首帧", "尾帧"] },
  { value: "keyframes", label: "智能多帧", hint: "1-9 张关键帧按顺序排列，模型在帧间智能补全", icon: Layers, maxRefs: 9 },
];

const DURATIONS = [3, 5, 10, 15];

const MAX_REFS = 9;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

function imgUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) return path;
  return `${API_BASE}${path}`;
}

export default function VideoGenPage() {
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState("");
  const [duration, setDuration] = useState(5);
  const [size, setSize] = useState("1280x720");
  const [references, setReferences] = useState<string[]>([]);
  const [referenceMode, setReferenceMode] = useState<VideoReferenceMode>("universal");
  const [isRunning, setIsRunning] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [models, setModels] = useState<VideoModelInfo[]>(DEFAULT_VIDEO_MODELS);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const { sessions, activeId, create, switchTo, remove, addGeneration, updateGeneration, removeGeneration } = useSessionStore();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useSessionStore.persist.hasHydrated()) setHydrated(true);
    const unsub = useSessionStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  // Cleanup stale running tasks on mount (after backend restart)
  useEffect(() => {
    if (!hydrated) return;
    for (const sess of sessions) {
      if (sess.kind !== "video") continue;
      for (const gen of sess.generations) {
        if (gen.status !== "running") continue;
        if (!gen.taskId) {
          updateGeneration(sess.id, gen.id, { status: "failed", progress: 0, errorMessage: "服务重启，任务已失效" });
          continue;
        }
        api.get<{status: string}>(`/api/v1/video/status/${gen.taskId}`)
          .then((res) => {
            if (res.status === "completed") {
              api.get<{status: string; video_url?: string}>(`/api/v1/video/status/${gen.taskId}`)
                .then((full) => {
                  if (full.status === "completed") {
                    updateGeneration(sess.id, gen.id, { status: "succeeded", progress: 100, videoUrl: full.video_url });
                  }
                }).catch(() => {});
            }
          })
          .catch(() => {
            updateGeneration(sess.id, gen.id, { status: "failed", progress: 0, errorMessage: "服务重启，任务已失效" });
          });
      }
    }
  }, [hydrated]);

  const videoSessions = sessions.filter((s) => s.kind === "video");
  const activeSession = videoSessions.find((s) => s.id === activeId) ?? videoSessions[videoSessions.length - 1];
  const stream = activeSession?.generations ?? [];
  // Use the filtered session's ID so we never add generations to the wrong kind
  const sessionId = activeSession?.id ?? activeId;

  useEffect(() => {
    api.get<{ models: Array<{ id: string; name: string; vendor?: string; cost_per_unit?: number }> }>("/api/v1/models", { type: "video" })
      .then((res) => {
        const enabled = (res.models || []).map((m) => ({
          id: m.id,
          name: m.name,
          vendor: m.vendor,
          cost: m.cost_per_unit,
        }));
        if (enabled.length > 0) {
          setModels(enabled);
          setModelId((current) => enabled.some((m) => m.id === current) ? current : enabled[0].id);
        }
      })
      .catch(() => {
        setModelId((current) => current || DEFAULT_VIDEO_MODELS[0].id);
      });
  }, []);

  useEffect(() => {
    if (hydrated && sessions.filter((s) => s.kind === "video").length === 0) create("video");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, sessions.length]);

  // Sync activeId to a video session so sidebar highlight is correct
  useEffect(() => {
    if (!hydrated) return;
    if (videoSessions.length > 0 && !videoSessions.find((s) => s.id === activeId)) {
      switchTo(videoSessions[videoSessions.length - 1].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const currentModel = models.find((m) => m.id === modelId) ?? models[0];
  const anyRunning = stream.some((g) => g.status === "running");
  const modeMeta = REFERENCE_MODES.find((m) => m.value === referenceMode) ?? REFERENCE_MODES[0];

  const handleCancelGen = (genId: string) => {
    const gen = stream.find(g => g.id === genId);
    if (!gen) return;
    updateGeneration(sessionId, genId, { status: "failed", progress: 0, errorMessage: "已取消" });
    if (gen.taskId) {
      api.post(`/api/v1/video/tasks/${gen.taskId}/cancel`, {}).catch(() => {});
    }
    if (gen.creationId) {
      api.delete(`/api/v1/user/assets/${gen.creationId}`).catch(() => {});
    }
    const s = useSessionStore.getState().sessions.find(ss => ss.id === sessionId);
    if (!s?.generations.some(g => g.status === "running")) setIsRunning(false);
  };

  const handleNewSession = () => { setPrompt(""); setReferences([]); create("video"); };
  const handleSwitchSession = (id: string) => { switchTo(id); setPrompt(""); setReferences([]); };
  const handleDeleteSession = (id: string) => {
    remove(id);
    if (sessions.filter((s) => s.kind === "video").length <= 1) create("video");
  };

  const handleSubmit = async () => {
    const submitModelId = modelId || currentModel?.id;
    const submittedPrompt = prompt.trim();
    if (!submittedPrompt || !sessionId || !submitModelId) return;
    setIsRunning(true);
    const id = `vid-${Date.now()}`;
    const startedAt = new Date().toISOString();

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let taskId = "";
    let creationId = "";

    addGeneration(sessionId, {
      id, prompt: submittedPrompt, modelId: submitModelId, status: "running", progress: 0, createdAt: startedAt,
      references: [...references], videoParams: { duration, size }, referenceMode,
    });
    setPrompt("");
    setReferences([]);

    try {
      const res = await api.post<{ task_id: string; creation_id?: string }>("/api/v1/video/generate", {
        prompt: submittedPrompt,
        model_id: submitModelId,
        duration,
        size: size,
        reference_mode: referenceMode,
        reference_images: references,
      });

      taskId = res.task_id;
      creationId = res.creation_id || "";
      updateGeneration(sessionId, id, { taskId, creationId: creationId || undefined });

      // WebSocket for bonus real-time progress updates
      try {
        const wsBase = API_BASE.replace(/^http/, "ws");
        const ws = new WebSocket(`${wsBase}/ws/task/${taskId}`);
        ws.onmessage = (e) => {
          if (cancelled) return;
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "pong" || msg.type === "heartbeat") return;
            updateGeneration(sessionId, id, { progress: msg.progress ?? 0 });
          } catch { /* ignore */ }
        };
        ws.onerror = () => ws.close();
      } catch { /* WS failed, polling will still work */ }

      // Poll every 2 seconds
      pollTimer = setInterval(async () => {
        if (cancelled) return;
        // Stop if cancelled via card button (status changed)
        const curGen = useSessionStore.getState().sessions
          .find(s => s.id === sessionId)?.generations.find(g => g.id === id);
        if (!curGen || curGen.status !== "running") {
          if (pollTimer) clearInterval(pollTimer);
          if (curGen?.creationId && curGen.status === "failed") {
            api.delete(`/api/v1/user/assets/${curGen.creationId}`).catch(() => {});
          }
          return;
        }
        try {
          const status = await api.get<{
            status: string; progress: number;
            video_url?: string; video_poster_url?: string; error_message?: string;
          }>(`/api/v1/video/status/${taskId}`);

          updateGeneration(sessionId, id, {
            progress: status.progress,
            ...(status.status === "completed" ? {
              status: "succeeded", progress: 100,
              videoUrl: status.video_url,
              videoPosterUrl: status.video_poster_url,
            } : {}),
            ...(status.status === "failed" ? {
              status: "failed", errorMessage: status.error_message,
            } : {}),
          });

          if (status.status === "completed" || status.status === "failed") {
            if (pollTimer) clearInterval(pollTimer);
            if (!useSessionStore.getState().sessions.find(s => s.id === sessionId)?.generations.some(g => g.status === "running")) {
              setIsRunning(false);
            }
          }
        } catch {
          // poll error, keep trying
        }
      }, 2000);
    } catch (e: unknown) {
      if (pollTimer) clearInterval(pollTimer);
      const msg = e instanceof Error ? e.message : "请求失败";
      updateGeneration(sessionId, id, { status: "failed", progress: 0, errorMessage: msg });
      if (!useSessionStore.getState().sessions.find(s => s.id === sessionId)?.generations.some(g => g.status === "running")) {
        setIsRunning(false);
      }
    }
  };

  const handleRerun = (g: GenerationResult) => {
    setPrompt(g.prompt); setModelId(g.modelId);
    if (g.videoParams) { setDuration(g.videoParams.duration); setSize(g.videoParams.size || "1280x720"); }
    if (g.references) setReferences(g.references);
    if (g.referenceMode) setReferenceMode(g.referenceMode as VideoReferenceMode);
  };
  const handleDeleteGen = (genId: string) => {
    if (!sessionId) return;
    const gen = stream.find((g) => g.id === genId);
    if (!gen) return;
    if (gen.status === "running" && gen.taskId) {
      api.post(`/api/v1/video/tasks/${gen.taskId}/cancel`, {}).catch(() => {});
    }
    if (gen.creationId) {
      api.delete(`/api/v1/user/assets/${gen.creationId}`).catch(() => {});
    }
    removeGeneration(sessionId, genId);
    const s = useSessionStore.getState().sessions.find(ss => ss.id === sessionId);
    if (!s?.generations.some(g => g.status === "running")) setIsRunning(false);
  };

  const handleFiles = async (fs: FileList | null) => {
    if (!fs) return;
    const next = [...references];
    const remaining = modeMeta.maxRefs - next.length;
    const incoming = Array.from(fs).slice(0, remaining);
    try {
      const formData = new FormData();
      for (const f of incoming) {
        if (f.size <= MAX_FILE_BYTES) formData.append("files", f);
      }
      const res = await fetch(`${API_BASE}/api/v1/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.urls?.length) {
        setReferences([...next, ...data.urls]);
      }
    } catch {
      // upload failed silently
    }
  };

  const removeRef = (idx: number) => setReferences((prev) => prev.filter((_, i) => i !== idx));

  useEffect(() => {
    if (references.length > modeMeta.maxRefs) setReferences(references.slice(0, modeMeta.maxRefs));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceMode]);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [stream.length]);

  return (
    <AuthGuard><div className="flex h-full min-h-screen bg-surface-base">
      <SessionSidebar sessions={sessions} activeId={activeId} kind="video" onNew={handleNewSession} onSwitch={handleSwitchSession} onDelete={handleDeleteSession} />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-3 px-6 py-4 border-b border-white/[0.06] light:border-black/[0.06] bg-surface-elevated/60 backdrop-blur-xl">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-purple to-brand-cyan">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-primary/90">AI 视频生成</h1>
            <p className="text-[11px] text-muted">文生视频 · 首尾帧 · 图生视频</p>
          </div>
          {activeSession && (
            <span className="ml-auto text-[11px] text-muted truncate max-w-[200px]">{activeSession.title} · {activeSession.generations.length} 次</span>
          )}
        </div>

        {/* Content */}
        <div ref={scrollerRef} className={cn("flex-1 overflow-y-auto", stream.length === 0 && "flex flex-col")}>
          {stream.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8">
              <div className="text-center max-w-lg">
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                  输入镜头描述
                  <span className="bg-gradient-to-r from-brand-purple via-brand-cyan to-brand-purple bg-clip-text text-transparent"> 生成视频 </span>
                </h1>
                <p className="mt-3 text-sm text-muted">用文字描述画面和运镜，AI 帮你生成高清视频</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-5xl w-full px-6 pb-6 pt-6">
              <div className="mb-8 space-y-8">
                {stream.map((gen) => (
                  <VideoCard key={gen.id} gen={gen} models={models} onDelete={() => handleDeleteGen(gen.id)} onRerun={() => handleRerun(gen)} onCancel={gen.status === "running" ? () => handleCancelGen(gen.id) : undefined} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="flex-shrink-0 border-t border-white/[0.06] light:border-black/[0.06] bg-surface-elevated/80 backdrop-blur-xl">
          <div className="mx-auto max-w-5xl px-6 py-4">
            {references.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {references.map((url, i) => (
                  <div key={i} className="group relative">
                    <div className="relative size-14 overflow-hidden rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-white/[0.03] light:bg-black/[0.02]">
                      <img src={imgUrl(url)} alt={`参考 ${i + 1}`} className="h-full w-full object-cover" />
                      <button onClick={() => removeRef(i)} className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"><X className="size-3" /></button>
                      {modeMeta.slotLabels?.[i] && <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] text-white">{modeMeta.slotLabels[i]}</span>}
                    </div>
                  </div>
                ))}
                <span className="text-[11px] text-muted">{references.length}/{modeMeta.maxRefs}</span>
              </div>
            )}

            <div className="rounded-3xl border border-white/[0.08] light:border-black/[0.08] bg-surface-card/[0.96] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]">
              <div className="px-5 pt-4">
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSubmit(); } }} placeholder="描述镜头与动作，例如：相机缓慢左移，云层快速流动，光影渐变... Enter 发送 · Shift+Enter 换行" className="min-h-20 w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-relaxed text-primary/70 placeholder:text-muted focus:outline-none focus:ring-0" />
              </div>

              <div className="flex items-center gap-2 px-3 pb-3 pt-3">
                <ToolbarButton label="添加参考图" icon={<ImagePlus className="size-4" />} onClick={() => fileRef.current?.click()} />
                <ToolbarButton label="生成记录" icon={<GalleryThumbnails className="size-4" />} onClick={() => setPickerOpen(true)} />
                <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />

                <RefModePill modes={REFERENCE_MODES} current={referenceMode} onChange={setReferenceMode} />
                <ModelPill models={models} currentId={modelId || currentModel?.id || ""} onChange={setModelId} />
                <VideoAdvancedPill duration={duration} onDurationChange={setDuration} size={size} onSizeChange={setSize} modelName={currentModel?.name || "未选择模型"} />

                <div className="flex-1" />
                <span className="inline-flex items-center gap-1 rounded-lg px-2 text-[11px] text-muted"><Sparkles className="size-3 text-brand-purple" />{currentModel?.cost} cr</span>

                {anyRunning && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-cyan/20 bg-brand-cyan/5 px-3 py-1.5 text-[11px] text-brand-cyan">
                    <Loader2 className="size-3 animate-spin" />生成中...
                  </span>
                )}

                <button onClick={handleSubmit} disabled={!prompt.trim()} className={cn("flex size-10 items-center justify-center rounded-full transition-all", prompt.trim() ? "bg-brand-cyan text-black shadow-md hover:brightness-110 active:scale-95" : "bg-white/[0.05] light:bg-black/[0.04] text-muted cursor-not-allowed")}><ArrowUp className="size-4" /></button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <GenerationPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => {
          if (references.length < modeMeta.maxRefs) {
            setReferences((prev) => [...prev, url]);
          }
        }}
      />
    </div></AuthGuard>
  );
}

function VideoCard({ gen, models, onDelete, onRerun, onCancel }: {
  gen: GenerationResult; models: VideoModelInfo[]; onDelete: () => void; onRerun: () => void; onCancel?: () => void;
}) {
  const [publishUrl, setPublishUrl] = useState<string | null>(null);
  const isRunning = gen.status === "running";
  const isFailed = gen.status === "failed";
  const isSucceeded = gen.status === "succeeded";
  const model = models.find((m) => m.id === gen.modelId);
  const coverUrl = gen.videoPosterUrl || gen.references?.[0];

  return (
    <div className="rounded-3xl border border-white/[0.08] light:border-black/[0.08] bg-surface-card/[0.96] p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", isRunning ? "bg-brand-cyan/10 text-brand-cyan" : isSucceeded ? "bg-accent-green/10 text-accent-green" : isFailed ? "bg-red-500/10 text-red-400" : "bg-white/[0.05] light:bg-black/[0.03] text-muted")}>
              {isRunning ? "生成中" : isSucceeded ? "完成" : isFailed ? "失败" : "待生成"}
            </span>
            <span className="text-xs text-muted">{model?.name || "未知模型"} · {new Date(gen.createdAt).toLocaleTimeString("zh-CN")}</span>
            {gen.videoParams && <span className="text-xs text-muted/70">{gen.videoParams.size || gen.videoParams.resolution} · {gen.videoParams.duration}s</span>}
          </div>
          <p className="mt-1.5 text-sm leading-snug text-secondary line-clamp-2">{gen.prompt}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isRunning && onCancel && (
            <button onClick={onCancel} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-white/[0.04] light:bg-black/[0.03] px-3 text-xs text-secondary transition-colors hover:bg-white/[0.08]"><Loader2 className="size-3 animate-spin" />取消</button>
          )}
          {isSucceeded && (
            <>
              <IconBtn icon={<RefreshCw className="size-3.5" />} label="重跑" onClick={onRerun} />
              <MoreMenu items={[
                { label: "发布到社区", icon: <Sparkles className="size-3.5" />, onClick: () => setPublishUrl(coverUrl || null) },
                ...(coverUrl ? [{ label: "下载封面", icon: <Download className="size-3.5" />, onClick: () => { const a = document.createElement("a"); a.href = imgUrl(coverUrl); a.download = `spiritlens-video-${gen.id}.png`; a.click(); } }] : []),
              ]} />
            </>
          )}
          <IconBtn icon={<X className="size-3.5" />} label="删除" onClick={onDelete} />
        </div>
      </div>

      {isFailed && gen.errorMessage && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">{gen.errorMessage}</div>
      )}

      {/* 参考图缩略图 */}
      {gen.references && gen.references.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-[11px] text-text-muted shrink-0">参考图</span>
          <div className="flex gap-1.5 overflow-x-auto">
            {gen.references.map((ref, i) => (
              <div key={i} className="size-10 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] light:border-black/[0.08] bg-white/[0.03]">
                <img src={imgUrl(ref)} alt={`参考 ${i + 1}`} className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/[0.06] light:border-black/[0.06] bg-white/[0.03] light:bg-black/[0.02]">
        {gen.videoPosterUrl ? (
          <img src={imgUrl(gen.videoPosterUrl || "")} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : isSucceeded && gen.videoUrl ? (
          <video
            src={imgUrl(gen.videoUrl)}
            className="absolute inset-0 h-full w-full object-contain bg-black/40"
            controls
            playsInline
            preload="metadata"
          >
            您的浏览器不支持视频播放
          </video>
        ) : isRunning ? null : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-cyan/[0.03] via-brand-mid/[0.03] to-brand-purple/[0.03]"><div className="text-xs text-muted">无预览</div></div>
        )}
        {isRunning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40">
            <Loader2 className="size-8 animate-spin text-brand-cyan" />
            <div className="text-sm font-bold tracking-tight text-white/80">{Math.round(gen.progress)}%</div>
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-purple to-brand-cyan transition-all" style={{ width: `${gen.progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {isSucceeded && (
        <div className="mt-4 rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-white/[0.02] light:bg-black/[0.02] px-4 py-2.5 text-xs text-muted">生成完成 · 消耗 {model?.cost} cr</div>
      )}

      {publishUrl && (
        <PublishDialog
          open={!!publishUrl}
          onClose={() => setPublishUrl(null)}
          imageUrl={publishUrl}
          prompt={gen.prompt}
        />
      )}
    </div>
  );
}

/* ─── Shared UI ─── */

function ToolbarButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick?: () => void }) {
  return <button type="button" onClick={onClick} title={label} className="flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/[0.06] light:hover:bg-black/[0.05] hover:text-secondary">{icon}</button>;
}
function IconBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return <button type="button" onClick={onClick} title={label} className="flex size-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-white/[0.06] light:hover:bg-black/[0.05] hover:text-secondary">{icon}</button>;
}

function ModelPill({ models, currentId, onChange }: { models: { id: string; name: string; vendor?: string }[]; currentId: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = models.find((m) => m.id === currentId);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.08] light:border-black/[0.08] bg-white/[0.04] light:bg-black/[0.03] px-3 text-xs text-secondary transition-colors hover:bg-white/[0.08]">
        <Sparkles className="size-3.5 text-brand-purple" /><span>{current?.name || "选择模型"}</span><ChevronDown className="size-3 text-muted" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-56 overflow-hidden rounded-2xl border border-white/[0.08] light:border-black/[0.08] bg-surface-overlay/[0.98] shadow-xl backdrop-blur-xl">
          <div className="max-h-64 overflow-y-auto p-1.5">
            {models.map((m) => (
              <button key={m.id} type="button" onClick={() => { onChange(m.id); setOpen(false); }} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors", m.id === currentId ? "bg-white/[0.08] text-primary" : "text-secondary hover:bg-white/[0.05] light:hover:bg-black/[0.04]")}>
                <div className="flex size-7 items-center justify-center rounded-lg bg-white/[0.05] light:bg-black/[0.04]"><Sparkles className="size-3.5 text-brand-purple" /></div>
                <div className="min-w-0 flex-1"><div className="text-sm font-medium">{m.name}</div>{m.vendor && <div className="text-[10px] text-muted">{m.vendor}</div>}</div>
                {m.id === currentId && <Check className="size-3.5 text-brand-cyan" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RefModePill({ modes, current, onChange }: { modes: typeof REFERENCE_MODES; current: string; onChange: (v: VideoReferenceMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const currentMeta = modes.find((m) => m.value === current) ?? modes[0];
  const Icon = currentMeta.icon;
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.08] light:border-black/[0.08] bg-white/[0.04] light:bg-black/[0.03] px-3 text-xs text-secondary transition-colors hover:bg-white/[0.08]">
        <Icon className="size-3.5 text-brand-cyan" /><span>{currentMeta.label}</span><ChevronDown className="size-3 text-muted" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-64 overflow-hidden rounded-2xl border border-white/[0.08] light:border-black/[0.08] bg-surface-overlay/[0.98] shadow-xl backdrop-blur-xl">
          <div className="p-1.5">
            {modes.map((m) => {
              const MIcon = m.icon;
              return (
                <button key={m.value} type="button" onClick={() => { onChange(m.value); setOpen(false); }} className={cn("flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left transition-colors", m.value === current ? "bg-white/[0.08] light:bg-black/[0.06] text-primary" : "text-secondary hover:bg-white/[0.05] light:hover:bg-black/[0.04]")}>
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] light:bg-black/[0.04]"><MIcon className="size-3.5 text-brand-cyan" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium">{m.label}{m.value === current && <Check className="size-3 text-brand-cyan" />}</span>
                    <span className="mt-0.5 block text-[11px] text-muted">{m.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function VideoAdvancedPill({ duration, onDurationChange, size, onSizeChange, modelName }: {
  duration: number; onDurationChange: (v: number) => void;
  size: string; onSizeChange: (v: string) => void;
  modelName: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Derive aspect ratio & resolution level from the current pixel size
  const parseSize = (s: string) => {
    const map: Record<string, { aspect: string; label: string }> = {
      "1280x720": { aspect: "16:9", label: "720p" },
      "1920x1080": { aspect: "16:9", label: "1080p" },
      "720x1280": { aspect: "9:16", label: "720p" },
      "1080x1920": { aspect: "9:16", label: "1080p" },
      "720x720": { aspect: "1:1", label: "720p" },
      "1080x1080": { aspect: "1:1", label: "1080p" },
    };
    return map[s] || { aspect: "16:9", label: "720p" };
  };

  const [aspectRatio, setAspectRatio] = useState(parseSize(size).aspect);
  const [resLabel, setResLabel] = useState(parseSize(size).label);

  // Sync when size prop changes externally (e.g., restore from history)
  useEffect(() => {
    const parsed = parseSize(size);
    setAspectRatio(parsed.aspect);
    setResLabel(parsed.label);
  }, [size]);

  // Build resolution options for the selected aspect ratio
  const RES_BY_ASPECT: Record<string, { label: string; value: string }[]> = {
    "16:9": [
      { label: "720p", value: "1280x720" },
      { label: "1080p", value: "1920x1080" },
    ],
    "9:16": [
      { label: "720p", value: "720x1280" },
      { label: "1080p", value: "1080x1920" },
    ],
    "1:1": [
      { label: "720p", value: "720x720" },
      { label: "1080p", value: "1080x1080" },
    ],
  };
  const resOptions = RES_BY_ASPECT[aspectRatio] || RES_BY_ASPECT["16:9"];

  const handleAspectChange = (ar: string) => {
    setAspectRatio(ar);
    // Auto-select first resolution for the new aspect ratio
    const options = RES_BY_ASPECT[ar] || RES_BY_ASPECT["16:9"];
    setResLabel(options[0].label);
    onSizeChange(options[0].value);
  };

  const handleResChange = (label: string, value: string) => {
    setResLabel(label);
    onSizeChange(value);
  };

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton label="高级参数" icon={<Settings2 className="size-4" />} onClick={() => setOpen((v) => !v)} />
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-80 overflow-hidden rounded-2xl border border-white/[0.08] light:border-black/[0.08] bg-surface-overlay/[0.98] shadow-xl backdrop-blur-xl">
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-muted">时长</label>
                <div className="flex gap-1">
                  {DURATIONS.map((d) => (
                    <button key={d} onClick={() => onDurationChange(d)} className={cn("flex h-8 flex-1 items-center justify-center rounded-lg text-xs transition-colors", duration === d ? "bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20" : "bg-white/[0.04] light:bg-black/[0.03] text-muted border border-white/[0.06] light:border-black/[0.06] hover:bg-white/[0.08]")}>{d}s</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-muted">画面比例</label>
                <div className="flex gap-1">
                  {["16:9", "9:16", "1:1"].map((ar) => (
                    <button key={ar} onClick={() => handleAspectChange(ar)} className={cn("flex h-8 flex-1 items-center justify-center rounded-lg text-xs transition-colors", aspectRatio === ar ? "bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20" : "bg-white/[0.04] light:bg-black/[0.03] text-muted border border-white/[0.06] light:border-black/[0.06] hover:bg-white/[0.08]")}>{ar}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Resolution row */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-muted">分辨率</label>
              <div className="flex gap-1">
                {resOptions.map((opt) => (
                  <button key={opt.value} onClick={() => handleResChange(opt.label, opt.value)} className={cn("flex h-8 flex-1 items-center justify-center rounded-lg text-xs transition-colors", resLabel === opt.label ? "bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20" : "bg-white/[0.04] light:bg-black/[0.03] text-muted border border-white/[0.06] light:border-black/[0.06] hover:bg-white/[0.08]")}>{opt.label} {opt.value}</button>
                ))}
              </div>
            </div>

            <p className="text-[10px] text-muted">{modelName} 参数可在生成前调整。</p>
          </div>
        </div>
      )}
    </div>
  );
}
