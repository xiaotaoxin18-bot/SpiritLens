"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowUp, Sparkles, Settings2, ImagePlus, ChevronDown,
  Loader2, X, Download, Heart, RefreshCw, Check, ZoomIn,
  GalleryThumbnails, Copy, CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSessionStore, type GenerationResult } from "@/store/sessions";
import { SessionSidebar } from "@/components/ai-tools/SessionSidebar";
import { GenerationPicker } from "@/components/ai-tools/GenerationPicker";
import { PublishDialog } from "@/components/community/PublishDialog";
import { MoreMenu } from "@/components/ui/MoreMenu";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { api } from "@/services/api";
import { useToast } from "@/components/ui/Toast";

interface ImageParams {
  size: string;
  batch: number;
  negativePrompt?: string;
  seed?: number;
}

interface ModelInfo {
  id: string;
  name: string;
  vendor: string;
  cost: number;
}

interface SizeOption {
  label: string;
  value: string;
  pixels: number;
}

interface ModelCapability {
  id: string;
  name: string;
  vendor: string;
  type: string;
  min_pixels: number | null;
  supported_sizes: SizeOption[];
  max_batch: number;
  cost_per_unit: number;
}

const DEFAULT_MODELS: ModelInfo[] = [
  { id: "doubao-seedream-4-5-251128", name: "Doubao-Seedream-4.5", vendor: "星河智云", cost: 5 },
  { id: "doubao-seedream-5-0-260128", name: "Doubao-Seedream-5.0", vendor: "星河智云", cost: 8 },
];

const MAX_REFS = 9;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/** Convert local path to full URL for display */
function imgUrl(path: string | undefined | null): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) return path;
  return `${API_BASE}${path}`;
}

export default function ImageGenPage() {
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_MODELS[0].id);
  const [size, setSize] = useState("");
  const [batch, setBatch] = useState(1);
  const [negative, setNegative] = useState("");
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [references, setReferences] = useState<string[]>([]);
  const [refStrength, setRefStrength] = useState(70);
  const [refDimension, setRefDimension] = useState<"style" | "character">("style");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [models, setModels] = useState<ModelInfo[]>(DEFAULT_MODELS);
  const [capabilities, setCapabilities] = useState<Record<string, ModelCapability>>({});
  const fileRef = useRef<HTMLInputElement | null>(null);

  const { toast } = useToast();
  const {
    sessions, activeId, create, switchTo, remove,
    addGeneration, updateGeneration, removeGeneration,
  } = useSessionStore();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useSessionStore.persist.hasHydrated()) setHydrated(true);
    const unsub = useSessionStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  // Cleanup stale running tasks on mount (e.g. after backend restart)
  useEffect(() => {
    if (!hydrated) return;
    for (const sess of sessions) {
      if (sess.kind !== "image") continue;
      for (const gen of sess.generations) {
        if (gen.status !== "running") continue;
        if (!gen.taskId) {
          updateGeneration(sess.id, gen.id, { status: "failed", progress: 0, errorMessage: "服务重启，任务已失效" });
          continue;
        }
        api.get<{status: string}>(`/api/v1/image/status/${gen.taskId}`)
          .then((res) => {
            if (res.status === "completed") {
              api.get<{status: string; image_urls: string[]}>(`/api/v1/image/status/${gen.taskId}`)
                .then((full) => {
                  if (full.status === "completed") {
                    updateGeneration(sess.id, gen.id, { status: "succeeded", progress: 100, imageUrls: full.image_urls });
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

  const imageSessions = sessions.filter((s) => s.kind === "image");
  const activeSession = imageSessions.find((s) => s.id === activeId) ?? imageSessions[imageSessions.length - 1];
  const stream = activeSession?.generations ?? [];
  // Use the filtered session's ID so we never add generations to the wrong kind
  const sessionId = activeSession?.id ?? activeId;

  // Fetch model capabilities from backend
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
        if (modelList.length > 0) setModels(modelList);
      })
      .catch(() => { toast("模型列表加载失败，使用默认配置", "error"); });
  }, []);

  // When model changes, update available sizes
  const currentCap = capabilities[modelId];
  const availableSizes: SizeOption[] = currentCap?.supported_sizes ?? [];
  const maxBatch = currentCap?.max_batch ?? 4;

  // Ensure current size is valid for the selected model
  useEffect(() => {
    if (availableSizes.length > 0) {
      const stillValid = availableSizes.some((s) => s.value === size);
      if (!size || !stillValid) {
        setSize(availableSizes[0].value);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, availableSizes.length]);

  useEffect(() => {
    if (hydrated && sessions.filter((s) => s.kind === "image").length === 0) create("image");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, sessions.length]);

  // Sync activeId to an image session so sidebar highlight is correct
  useEffect(() => {
    if (!hydrated) return;
    if (imageSessions.length > 0 && !imageSessions.find((s) => s.id === activeId)) {
      switchTo(imageSessions[imageSessions.length - 1].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const currentModel = models.find((m) => m.id === modelId) ?? models[0];
  const anyRunning = stream.some((g) => g.status === "running");

  // 垫图模式下 batch 强制为 1（API 限制）
  const handleCancelGen = (genId: string) => {
    const gen = stream.find(g => g.id === genId);
    if (!gen) return;
    // Mark failed locally so the card shows cancelled immediately
    updateGeneration(sessionId, genId, { status: "failed", progress: 0, errorMessage: "已取消" });
    // Cancel backend task
    if (gen.taskId) {
      api.post(`/api/v1/image/tasks/${gen.taskId}/cancel`, {}).catch(() => {});
    }
    // Delete from asset library so cancelled works don't pile up
    if (gen.creationId) {
      api.delete(`/api/v1/user/assets/${gen.creationId}`).catch(() => {});
    }
    // Update isRunning if nothing left running
    const s = useSessionStore.getState().sessions.find(ss => ss.id === sessionId);
    if (!s?.generations.some(g => g.status === "running")) setIsRunning(false);
  };

  const handleNewSession = () => {
    setPrompt("");
    setReferences([]);
    create("image");
  };

  const handleSwitchSession = (id: string) => {
    switchTo(id);
    setPrompt("");
    setReferences([]);
  };

  const handleDeleteSession = (id: string) => {
    remove(id);
    if (sessions.filter((s) => s.kind === "image").length <= 1) {
      create("image");
    }
  };

  const handleSubmit = async () => {
    const submittedPrompt = prompt.trim();
    if (!submittedPrompt || !sessionId) return;
    setIsRunning(true);

    const id = `gen-${Date.now()}`;
    const startedAt = new Date().toISOString();

    // Create placeholder immediately
    const placeholder: GenerationResult = {
      id,
      prompt: submittedPrompt,
      modelId,
      status: "running",
      progress: 0,
      createdAt: startedAt,
      imageParams: { size, batch, negativePrompt: negative || undefined, seed },
    };
    addGeneration(sessionId, placeholder);
    setPrompt("");
    setReferences([]);

    // Track polling state
    let pollingActive = true;
    let currentTaskId = "";

    try {
      // Call real API
      const task = await api.post<{
        task_id: string;
        status: string;
        progress: number;
        image_urls: string[];
        error_message: string | null;
        creation_id?: string;
      }>("/api/v1/image/generate", {
        prompt: submittedPrompt,
        model_id: modelId,
        size,
        batch,
        negative_prompt: negative || undefined,
        seed: seed !== undefined ? seed : undefined,
        reference_images: references.length > 0 ? references : undefined,
        reference_strength: references.length > 0 ? refStrength : undefined,
        reference_dimension: references.length > 0 ? refDimension : undefined,
      });

      currentTaskId = task.task_id;
      // Store task_id + creation_id for cancellation and asset cleanup
      updateGeneration(sessionId, id, {
        taskId: currentTaskId,
        creationId: task.creation_id,
      });

      // Poll for completion (always runs, WebSocket is bonus)
      const poll = async () => {
        while (pollingActive) {
          await new Promise((r) => setTimeout(r, 2000));
          if (!pollingActive) break;
          try {
            const status = await api.get<{
              task_id: string; status: string; progress: number;
              image_urls: string[]; error_message: string | null;
            }>(`/api/v1/image/status/${currentTaskId}`);

            // Stop if cancelled via card button or deleted
            const genNow = useSessionStore.getState().sessions
              .find((s) => s.id === sessionId)?.generations.find((g) => g.id === id);
            if (!genNow || genNow.status !== "running") { pollingActive = false; break; }

            updateGeneration(sessionId, id, { progress: status.progress });

            if (status.status === "completed") {
              updateGeneration(sessionId, id, { status: "succeeded", progress: 100, imageUrls: status.image_urls });
              pollingActive = false;
              if (!useSessionStore.getState().sessions.find(s => s.id === sessionId)?.generations.some(g => g.status === "running")) {
                setIsRunning(false);
              }
              break;
            }
            if (status.status === "failed") {
              updateGeneration(sessionId, id, { status: "failed", progress: 0, errorMessage: status.error_message || "生成失败" });
              pollingActive = false;
              if (!useSessionStore.getState().sessions.find(s => s.id === sessionId)?.generations.some(g => g.status === "running")) {
                setIsRunning(false);
              }
              break;
            }
          } catch { /* retry */ }
        }
      };
      poll();

      // WebSocket for bonus real-time updates (non-blocking)
      try {
        const wsBase = API_BASE.replace(/^http/, "ws");
        const ws = new WebSocket(`${wsBase}/ws/task/${currentTaskId}`);
        ws.onmessage = (e) => {
          if (!pollingActive) return;
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "pong" || msg.type === "heartbeat") return;
            updateGeneration(sessionId, id, { progress: msg.progress ?? 0 });
          } catch { /* ignore */ }
        };
        ws.onerror = () => ws.close();
      } catch { /* WS failed, polling will still work */ }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "请求失败";
      updateGeneration(sessionId, id, { status: "failed", progress: 0, errorMessage: msg });
      if (!useSessionStore.getState().sessions.find(s => s.id === sessionId)?.generations.some(g => g.status === "running")) {
        setIsRunning(false);
      }
    }
  };

  const handleRerun = (g: GenerationResult) => {
    setPrompt(g.prompt);
    setModelId(g.modelId);
    if (g.imageParams) {
      setSize(g.imageParams.size);
      setBatch(g.imageParams.batch);
      setNegative(g.imageParams.negativePrompt ?? "");
      if (g.imageParams.seed !== undefined) setSeed(g.imageParams.seed);
    }
    if (g.references?.length) setReferences(g.references);
  };

  const handleDeleteGen = (genId: string) => {
    if (!sessionId) return;
    const gen = stream.find((g) => g.id === genId);
    if (!gen) return;
    // Cancel backend task if still running
    if (gen.status === "running" && gen.taskId) {
      api.post(`/api/v1/image/tasks/${gen.taskId}/cancel`, {}).catch(() => {});
    }
    // Remove from asset library too
    if (gen.creationId) {
      api.delete(`/api/v1/user/assets/${gen.creationId}`).catch(() => {});
    }
    removeGeneration(sessionId, genId);
    // Update isRunning state
    const s = useSessionStore.getState().sessions.find(ss => ss.id === sessionId);
    if (!s?.generations.some(g => g.status === "running")) setIsRunning(false);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const remaining = MAX_REFS - references.length;
    const incoming = Array.from(files).slice(0, remaining);
    try {
      const formData = new FormData();
      for (const f of incoming) {
        if (f.size <= MAX_FILE_BYTES) formData.append("files", f);
      }
      const res = await fetch(`${API_BASE}/api/v1/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.urls?.length) {
        setReferences((prev) => [...prev, ...data.urls]);
      }
    } catch {
      toast("上传失败，请检查文件大小和类型", "error");
    }
  };

  const removeRef = (idx: number) => setReferences((prev) => prev.filter((_, i) => i !== idx));

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [stream.length]);

  return (
    <AuthGuard><div className="flex h-full min-h-screen bg-surface-base">
      <SessionSidebar
        sessions={sessions}
        activeId={activeId}
        kind="image"
        onNew={handleNewSession}
        onSwitch={handleSwitchSession}
        onDelete={handleDeleteSession}
      />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header bar */}
        <div className="flex-shrink-0 flex items-center gap-3 px-6 py-4 border-b border-white/[0.06] light:border-black/[0.06] bg-surface-elevated/60 backdrop-blur-xl">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-purple to-brand-cyan">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-primary/90">AI 图片生成</h1>
            <p className="text-[11px] text-muted">文生图 · 图生图</p>
          </div>
          {activeSession && (
            <span className="ml-auto text-[11px] text-muted truncate max-w-[200px]">
              {activeSession.title} · {activeSession.generations.length} 次
            </span>
          )}
        </div>

        {/* Content area */}
        <div
          ref={scrollerRef}
          className={cn(
            "flex-1 overflow-y-auto",
            stream.length === 0 && "flex flex-col",
          )}
        >
          {stream.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8">
              <div className="text-center max-w-lg">
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                  输入提示词
                  <span className="bg-gradient-to-r from-brand-purple via-brand-cyan to-brand-purple bg-clip-text text-transparent"> 开始创作 </span>
                </h1>
                <p className="mt-3 text-sm text-muted">描述你想要的画面，AI 会为你生成独一无二的作品</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-6xl w-full px-4 pb-4 pt-4">
              <div className="mb-8 space-y-8">
                {stream.map((gen) => (
                  <GenerationCard
                    key={gen.id}
                    gen={gen}
                    models={models}
                    onDelete={() => handleDeleteGen(gen.id)}
                    onRerun={() => handleRerun(gen)}
                    onCancel={gen.status === "running" ? () => handleCancelGen(gen.id) : undefined}
                    onPreview={(url) => setPreviewUrl(url)}
                    onAddReference={(url) => {
                      if (references.length < MAX_REFS) {
                        setReferences((prev) => [...prev, url]);
                      }
                    }}
                    onUsePrompt={(p, refs) => { setPrompt(p); if (refs?.length) setReferences(refs); }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="flex-shrink-0 border-t border-white/[0.06] light:border-black/[0.06] bg-surface-elevated/80 backdrop-blur-xl">
          <div className="mx-auto max-w-5xl px-6 py-4">
            {references.length > 0 && (
              <div className="mb-3 overflow-hidden rounded-2xl border border-white/[0.06] light:border-black/[0.06] bg-surface-card/80 backdrop-blur-sm">
                {/* Thumbnails strip */}
                <div className="px-3 pt-3 pb-2">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="size-5 rounded-md bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center">
                        <ImagePlus className="size-3 text-white" />
                      </div>
                      <span className="text-[12px] font-medium text-text-secondary">参考图</span>
                      <span className="text-[10px] text-text-muted bg-white/[0.04] light:bg-black/[0.03] rounded-full px-1.5 py-0.5">{references.length}/{MAX_REFS}</span>
                    </div>
                    <button onClick={() => setReferences([])}
                      className="text-[11px] text-text-muted hover:text-red-400 transition-colors flex items-center gap-0.5">
                      <X className="size-3" /> 清空
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {references.map((url, i) => (
                      <div key={i} className="group relative shrink-0">
                        <div className="size-[72px] overflow-hidden rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-white/[0.03] light:bg-black/[0.02] ring-1 ring-transparent hover:ring-brand-purple/30 transition-all">
                          <img src={imgUrl(url)} alt={`参考 ${i + 1}`} className="h-full w-full object-cover" />
                          <div className="absolute top-1 left-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-md bg-black/65 text-[10px] font-medium text-white/90 px-1">
                            {i + 1}
                          </div>
                          <button onClick={() => removeRef(i)}
                            className="absolute -top-1.5 -right-1.5 flex size-[22px] items-center justify-center rounded-full bg-black/70 text-white/80 opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all hover:bg-red-500/90 shadow-lg">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {references.length < MAX_REFS && (
                      <button onClick={() => fileRef.current?.click()}
                        className="size-[72px] shrink-0 flex items-center justify-center rounded-xl border-2 border-dashed border-white/[0.08] light:border-black/[0.08] text-text-muted hover:text-brand-purple hover:border-brand-purple/30 transition-all group">
                        <div className="flex flex-col items-center gap-0.5">
                          <ImagePlus className="size-5 group-hover:scale-110 transition-transform" />
                          <span className="text-[9px]">添加</span>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
                {/* Separator */}
                <div className="mx-3 h-px bg-white/[0.05] light:bg-black/[0.04]" />

                {/* 参考维度 */}
                <div className="px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] text-text-muted">参考维度</span>
                    <span className="text-[9px] text-brand-cyan/60">已启用 · 图一/图二 可在 prompt 中引用</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRefDimension("style")}
                      className={cn(
                        "flex-1 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs transition-all border",
                        refDimension === "style"
                          ? "bg-brand-purple/12 text-brand-purple border-brand-purple/25"
                          : "bg-white/[0.03] light:bg-black/[0.02] text-text-muted border-white/[0.06] light:border-black/[0.06] hover:bg-white/[0.06]",
                      )}
                    >
                      <span className="text-base">🎨</span>
                      <div className="text-left">
                        <div className="text-[11px] font-medium">风格特征</div>
                        <div className="text-[9px] opacity-60">学画风/色调/氛围</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setRefDimension("character")}
                      className={cn(
                        "flex-1 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs transition-all border",
                        refDimension === "character"
                          ? "bg-brand-purple/12 text-brand-purple border-brand-purple/25"
                          : "bg-white/[0.03] light:bg-black/[0.02] text-text-muted border-white/[0.06] light:border-black/[0.06] hover:bg-white/[0.06]",
                      )}
                    >
                      <span className="text-base">🧑</span>
                      <div className="text-left">
                        <div className="text-[11px] font-medium">人物长相</div>
                        <div className="text-[9px] opacity-60">保持人脸/角色一致</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Separator */}
                <div className="mx-3 h-px bg-white/[0.05] light:bg-black/[0.04]" />

                {/* Reference strength */}
                <div className="px-3 py-2.5 flex items-center gap-3">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[11px] text-text-muted">强度</span>
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-[10px] text-text-muted/60 w-6 text-right">{refStrength}%</span>
                    <div className="flex-1 relative h-1.5 rounded-full bg-white/[0.06] light:bg-black/[0.05]">
                      <div className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-brand-purple to-brand-cyan transition-all"
                        style={{ width: `${refStrength}%` }} />
                      <input type="range" min="0" max="100" value={refStrength}
                        onChange={(e) => setRefStrength(Number(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded",
                        refStrength >= 80 ? "bg-brand-purple/10 text-brand-purple" :
                        refStrength >= 50 ? "bg-brand-cyan/10 text-brand-cyan" :
                        "bg-white/[0.04] light:bg-black/[0.03] text-text-muted"
                      )}>
                        {refStrength >= 80 ? "强参考" : refStrength >= 50 ? "中参考" : "弱参考"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {references.length > 0 && (
              <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-purple/8 border border-brand-purple/15">
                <span className="text-[10px] text-text-muted leading-relaxed">
                  💡 prompt 中输入 <span className="text-brand-cyan font-mono">图一</span> <span className="text-text-muted/40">/</span> <span className="text-brand-cyan font-mono">图二</span> 可引用对应参考图，例如：
                  <span className="text-text-secondary">"让图一站在樱花树下"</span>
                </span>
              </div>
            )}

            <div className="rounded-3xl border border-white/[0.08] light:border-black/[0.08] bg-surface-card/[0.96] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]">
              <div className="px-5 pt-4">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="描述你想要的画面，例如：一只在太空漫步的猫，赛博朋克风格... Enter 发送 · Shift+Enter 换行"
                  className="min-h-20 w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-relaxed text-primary/70 placeholder:text-muted focus:outline-none focus:ring-0"
                />
              </div>

              <div className="flex items-center gap-2 px-3 pb-3 pt-3">
                <ToolbarButton label="上传参考" icon={<ImagePlus className="size-4" />} onClick={() => fileRef.current?.click()} />
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
                <ToolbarButton label="生成记录" icon={<GalleryThumbnails className="size-4" />} onClick={() => setPickerOpen(true)} />

                <ModelPill models={models} currentId={modelId} onChange={setModelId} />
                <AdvancedPill size={size} onSizeChange={setSize} batch={batch} onBatchChange={setBatch} negative={negative} onNegativeChange={setNegative} seed={seed} onSeedChange={setSeed} modelName={currentModel.name} availableSizes={availableSizes} maxBatch={maxBatch} />

                <div className="flex-1" />
                <span className="inline-flex items-center gap-1 rounded-lg px-2 text-[11px] text-muted">
                  <Sparkles className="size-3 text-brand-purple" />
                  {currentModel.cost * batch} cr
                </span>

                {anyRunning && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-cyan/20 bg-brand-cyan/5 px-3 py-1.5 text-[11px] text-brand-cyan">
                    <Loader2 className="size-3 animate-spin" />生成中...
                  </span>
                )}
                <button onClick={handleSubmit} disabled={!prompt.trim()} className={cn("flex size-10 items-center justify-center rounded-full transition-all", prompt.trim() ? "bg-brand-purple text-white shadow-md hover:brightness-110 active:scale-95" : "bg-white/[0.05] light:bg-black/[0.04] text-muted cursor-not-allowed")}>
                  <ArrowUp className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* Image preview modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
          >
            <X className="size-5" />
          </button>
          <a
            href={imgUrl(previewUrl)}
            download
            className="absolute right-16 top-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
            title="下载"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="size-5" />
          </a>
          <img
            src={imgUrl(previewUrl)}
            alt="预览"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <GenerationPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => {
          if (references.length < MAX_REFS) {
            setReferences((prev) => [...prev, url]);
          }
        }}
      />
    </AuthGuard>
  );
}

/* ─── Sub-components ─── */

function GenerationCard({ gen, models, onDelete, onRerun, onCancel, onPreview, onAddReference, onUsePrompt }: {
  gen: GenerationResult; models: ModelInfo[]; onDelete: () => void; onRerun: () => void; onCancel?: () => void; onPreview?: (url: string) => void; onAddReference?: (url: string) => void; onUsePrompt?: (prompt: string, refs?: string[]) => void;
}) {
  const [publishUrl, setPublishUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expandedPrompt, setExpandedPrompt] = useState(false);
  const isRunning = gen.status === "running";
  const isFailed = gen.status === "failed";
  const isSucceeded = gen.status === "succeeded";
  const model = models.find((m) => m.id === gen.modelId) ?? models[0];
  const requestedBatch = gen.imageParams?.batch ?? 1;
  // Only show as many slots as there are actual images (once completed)
  const actualCount = isSucceeded ? (gen.imageUrls?.length ?? 0) : requestedBatch;
  const grid = actualCount || 1;

  const firstImageUrl = gen.imageUrls?.[0];
  const handleDownload = () => {
    if (!firstImageUrl) return;
    const a = document.createElement("a");
    a.href = imgUrl(firstImageUrl);
    a.download = `spiritlens-${gen.id}.png`;
    a.click();
  };
  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(gen.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = gen.prompt;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Derive aspect ratio from the generation's image params
  const imageSize = gen.imageParams?.size;
  const aspectStyle = imageSize
    ? (() => {
        const parts = imageSize.split("x");
        if (parts.length === 2) {
          const w = parseInt(parts[0]);
          const h = parseInt(parts[1]);
          if (w && h) return { aspectRatio: `${w} / ${h}` };
        }
        return {};
      })()
    : {};

  return (
    <div className="rounded-3xl border border-white/[0.08] light:border-black/[0.08] bg-surface-card/[0.96] p-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", isRunning ? "bg-brand-cyan/10 text-brand-cyan" : isSucceeded ? "bg-accent-green/10 text-accent-green" : isFailed ? "bg-red-500/10 text-red-400" : "bg-white/[0.05] light:bg-black/[0.03] text-muted")}>
              {isRunning ? "生成中" : isSucceeded ? "完成" : isFailed ? "失败" : "待生成"}
            </span>
            <span className="text-xs text-muted">{model.name} · {new Date(gen.createdAt).toLocaleTimeString("zh-CN")}</span>
          </div>
          <p
            className={cn(
              "mt-1.5 text-sm leading-snug text-secondary cursor-pointer transition-colors hover:text-text-primary",
              !expandedPrompt && "line-clamp-2",
            )}
            title={gen.prompt}
            onClick={() => {
              if (expandedPrompt) {
                handleCopyPrompt();
              } else {
                setExpandedPrompt(true);
              }
            }}
          >
            {copied ? (
              <span className="inline-flex items-center gap-1 text-brand-cyan">
                <CheckCheck className="size-3.5" /> 已复制
              </span>
            ) : gen.prompt}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isRunning && onCancel && (
            <button onClick={onCancel} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-white/[0.04] light:bg-black/[0.03] px-3 text-xs text-secondary transition-colors hover:bg-white/[0.08]">
              <Loader2 className="size-3 animate-spin" />取消
            </button>
          )}
          {isSucceeded && (
            <>
              <IconBtn icon={<RefreshCw className="size-3.5" />} label="重跑" onClick={onRerun} />
              <MoreMenu items={[
                { label: "使用提示词", icon: <RefreshCw className="size-3.5" />, onClick: () => onUsePrompt?.(gen.prompt, gen.references) },
                { label: "发布到社区", icon: <Sparkles className="size-3.5" />, onClick: () => setPublishUrl(firstImageUrl || null) },
                { label: "下载", icon: <Download className="size-3.5" />, onClick: handleDownload },
                ...(onAddReference && firstImageUrl ? [{ label: "用作参考图", icon: <ImagePlus className="size-3.5" />, onClick: () => onAddReference(firstImageUrl) }] : []),
              ]} />
            </>
          )}
          <IconBtn icon={<X className="size-3.5" />} label="删除" onClick={onDelete} />
        </div>
      </div>

      {isFailed && gen.errorMessage && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">{gen.errorMessage}</div>
      )}

      {/* 参考图缩略图 — 像即梦一样清晰显示引用了哪些图 */}
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

      <div className="mx-auto grid" style={{ gridTemplateColumns: `repeat(${grid}, minmax(0, 1fr))`, gap: grid >= 4 ? "0.5rem" : "1rem" }}>
        {Array.from({ length: grid }).map((_, i) => {
          const url = gen.imageUrls?.[i];
          if (isRunning || (!url && !isFailed)) {
            return (
              <div key={i} className="relative overflow-hidden rounded-2xl border border-white/[0.06] light:border-black/[0.06] bg-white/[0.03] light:bg-black/[0.02]"
                style={{ ...aspectStyle, minHeight: 200, maxHeight: 380 }}>
                <div className="absolute inset-0 bg-gradient-to-br from-brand-purple/[0.03] via-brand-mid/[0.03] to-brand-cyan/[0.03]" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="size-6 animate-spin text-brand-cyan" />
                  <div className="text-xs text-muted">{Math.round(gen.progress)}%</div>
                </div>
                <div className="absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-white/[0.06] light:bg-black/[0.05]">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-purple to-brand-cyan transition-all" style={{ width: `${gen.progress}%` }} />
                </div>
              </div>
            );
          }
          if (isFailed) {
            return <div key={i} className="flex items-center justify-center rounded-2xl border border-dashed border-white/[0.06] light:border-black/[0.06] bg-white/[0.02] light:bg-black/[0.02] text-xs text-muted"
              style={{ ...aspectStyle, minHeight: 160 }}>未生成</div>;
          }
          return (
            <div key={i} className="flex flex-col gap-0"><button type="button" onClick={() => onPreview?.(url!)}
              className="group relative w-full overflow-hidden rounded-2xl border border-white/[0.06] light:border-black/[0.06] cursor-pointer text-left"
              style={{ ...aspectStyle, minHeight: 200, maxHeight: 380 }}>
              <img src={imgUrl(url)} alt="" className="h-full w-full object-contain" draggable={false} />
              <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/50 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="flex items-center gap-1 text-xs text-white/80"><ZoomIn className="size-3.5" /> 点击预览</span>
              </div>
            </button>
            <div className="flex items-center justify-center -mt-1">
              <button type="button" onClick={() => onAddReference?.(url!)}
                className="inline-flex items-center gap-1 rounded-b-xl border border-t-0 border-white/[0.06] light:border-black/[0.06] bg-surface-elevated/50 px-3 py-1.5 text-[11px] text-text-muted hover:text-brand-purple hover:bg-brand-purple/5 transition-colors w-full justify-center">
                <ImagePlus className="size-3" /> 作为参考图
              </button>
            </div></div>
          );
        })}
      </div>

      {isSucceeded && (
        <div className="mt-4 rounded-xl border border-white/[0.06] light:border-black/[0.06] bg-white/[0.02] light:bg-black/[0.02] px-4 py-2.5 text-xs text-muted">
          生成完成 · 消耗 {model.cost * requestedBatch} cr
        </div>
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

function ToolbarButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} title={label} className="flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/[0.06] light:hover:bg-black/[0.05] hover:text-secondary">
      {icon}
    </button>
  );
}

function IconBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} title={label} className="flex size-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-white/[0.06] light:hover:bg-black/[0.05] hover:text-secondary">
      {icon}
    </button>
  );
}

function ModelPill({ models, currentId, onChange }: {
  models: { id: string; name: string; vendor?: string }[];
  currentId: string; onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = models.find((m) => m.id === currentId) ?? models[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.08] light:border-black/[0.08] bg-white/[0.04] light:bg-black/[0.03] px-3 text-xs text-secondary transition-colors hover:bg-white/[0.08]">
        <Sparkles className="size-3.5 text-brand-purple" />
        <span>{current.name}</span>
        <ChevronDown className="size-3 text-muted" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-56 overflow-hidden rounded-2xl border border-white/[0.08] light:border-black/[0.08] bg-surface-overlay/[0.98] shadow-xl backdrop-blur-xl">
          <div className="max-h-64 overflow-y-auto p-1.5">
            {models.map((m) => (
              <button key={m.id} type="button" onClick={() => { onChange(m.id); setOpen(false); }} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors", m.id === currentId ? "bg-white/[0.08] text-primary" : "text-secondary hover:bg-white/[0.05] light:hover:bg-black/[0.04]")}>
                <div className="flex size-7 items-center justify-center rounded-lg bg-white/[0.05] light:bg-black/[0.04]"><Sparkles className="size-3.5 text-brand-purple" /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{m.name}</div>
                  {m.vendor && <div className="text-[10px] text-muted">{m.vendor}</div>}
                </div>
                {m.id === currentId && <Check className="size-3.5 text-brand-cyan" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AdvancedPill({ size, onSizeChange, batch, onBatchChange, negative, onNegativeChange, seed, onSeedChange, modelName, availableSizes, maxBatch }: {
  size: string; onSizeChange: (v: string) => void;
  batch: number; onBatchChange: (v: number) => void;
  negative: string; onNegativeChange: (v: string) => void;
  seed?: number; onSeedChange?: (v: number | undefined) => void;
  modelName: string;
  availableSizes?: SizeOption[];
  maxBatch?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton label="高级参数" icon={<Settings2 className="size-4" />} onClick={() => setOpen((v) => !v)} />
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-80 overflow-hidden rounded-2xl border border-white/[0.08] light:border-black/[0.08] bg-surface-overlay/[0.98] shadow-xl backdrop-blur-xl">
          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-muted">尺寸</label>
              <div className="grid grid-cols-4 gap-1.5">
                {(availableSizes?.length ? availableSizes : []).map((s) => (
                  <button key={s.value} onClick={() => onSizeChange(s.value)} className={cn("rounded-lg px-2 py-1.5 text-[11px] transition-colors", size === s.value ? "bg-brand-purple/15 text-brand-purple border border-brand-purple/20" : "bg-white/[0.04] light:bg-black/[0.03] text-muted border border-white/[0.06] light:border-black/[0.06] hover:bg-white/[0.08]")}>{s.label}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-muted">批量 (最大 {maxBatch ?? 4})</label>
                <div className="flex gap-1">
                  {Array.from({ length: maxBatch ?? 4 }, (_, i) => i + 1).map((n) => (
                    <button key={n} onClick={() => onBatchChange(n)} className={cn("flex h-8 flex-1 items-center justify-center rounded-lg text-xs transition-colors", batch === n ? "bg-brand-purple text-white" : "bg-white/[0.04] light:bg-black/[0.03] text-muted hover:bg-white/[0.08]")}>{n}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-muted">种子 (seed)</label>
                <input type="number" min={0} max={2147483647} value={seed ?? ""} placeholder="留空=随机"
                  onChange={(e) => {
                    const v = e.target.value;
                    onSeedChange?.(v === "" ? undefined : parseInt(v, 10));
                  }}
                  className="h-8 w-full rounded-lg border border-white/[0.1] light:border-black/[0.1] bg-surface-card px-2 text-xs text-primary outline-none focus:border-brand-purple/40 transition-colors placeholder:text-muted/40" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-muted">负向提示词</label>
              <textarea value={negative} onChange={(e) => onNegativeChange(e.target.value)} placeholder="例如：低质量、模糊、多余手指" rows={2} className="min-h-[60px] w-full resize-none rounded-xl border border-white/[0.06] light:border-black/[0.06] bg-white/[0.03] light:bg-black/[0.02] px-3 py-2 text-xs text-secondary placeholder:text-muted outline-none" />
            </div>
            <p className="text-[10px] text-muted">{modelName} 独有参数可在生成前调整。</p>
          </div>
        </div>
      )}
    </div>
  );
}
