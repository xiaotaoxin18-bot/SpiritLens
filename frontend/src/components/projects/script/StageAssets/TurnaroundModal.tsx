"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, Check, AlertCircle, RefreshCw, Grid3x3, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { resolveImageUrl } from "@/lib/utils";

const TURNAROUND_ANGLES = [
  { label: "正面", suffix: "正面视角，面向镜头，全身照" },
  { label: "左前 3/4", suffix: "左前45度半侧面视角，全身照" },
  { label: "左侧面", suffix: "左侧面视角，全身照" },
  { label: "左后 3/4", suffix: "左后45度半背面视角，全身照" },
  { label: "背面", suffix: "背面视角，背对镜头，全身照" },
  { label: "右后 3/4", suffix: "右后45度半背面视角，全身照" },
  { label: "右侧面", suffix: "右侧面视角，全身照" },
  { label: "右前 3/4", suffix: "右前45度半侧面视角，全身照" },
  { label: "俯视", suffix: "俯视角度，从上往下看，全身照" },
];

interface TurnaroundItem {
  label: string;
  status: "pending" | "generating" | "completed" | "failed";
  imageUrl: string;
}

interface Props {
  characterName: string;
  basePrompt: string;
  characterExtra: Record<string, string>;
  modelId: string;
  size: string;
  referenceImage?: string;
  existingImages?: string[];
  onSave?: (images: string[]) => void;
  onClose: () => void;
}

export default function TurnaroundModal({
  characterName, basePrompt, characterExtra, modelId, size, referenceImage,
  existingImages, onSave, onClose,
}: Props) {
  // Check both prop and localStorage for cached images
  const cachedImages = existingImages?.length
    ? existingImages
    : (() => {
        try {
          const raw = localStorage.getItem(`sl_turn_${characterName}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.some(Boolean)) return parsed;
          }
        } catch {}
        return undefined;
      })();
  const hasExisting = cachedImages && cachedImages.some(Boolean);

  const [items, setItems] = useState<TurnaroundItem[]>(() =>
    hasExisting
      ? TURNAROUND_ANGLES.map((a, i) => ({
          label: a.label,
          status: (cachedImages![i] ? "completed" : "pending") as "completed" | "pending",
          imageUrl: cachedImages![i] || "",
        }))
      : TURNAROUND_ANGLES.map((a) => ({ label: a.label, status: "pending" as const, imageUrl: "" }))
  );
  const [overallStatus, setOverallStatus] = useState<"idle" | "generating" | "done">(hasExisting ? "done" : "idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [genKey, setGenKey] = useState(0);
  const started = useRef(false);
  const imageUrlsRef = useRef<string[]>(existingImages?.filter(Boolean) || []);

  useEffect(() => {
    // If all items already completed from cache, skip generation
    if (hasExisting && items.every(i => i.status === "completed") && genKey === 0) return;
    if (started.current) return;
    started.current = true;
    generateAll();
  }, [genKey]);

  const generateOne = async (idx: number, retryCount = 0): Promise<boolean> => {
    const angle = TURNAROUND_ANGLES[idx];
    const characterDesc = Object.values(characterExtra).filter(Boolean).join("，");
    const anglePrompt = basePrompt
      ? `${basePrompt}，${angle.suffix}`
      : `${characterName}${characterDesc ? `，${characterDesc}` : ""}，${angle.suffix}`;

    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: "generating" };
      return next;
    });

    try {
      const body: Record<string, any> = { prompt: anglePrompt, model_id: modelId, size, batch: 1, source: "project" };
      if (referenceImage) {
        body.reference_images = [referenceImage];
        body.reference_dimension = "character";
        body.reference_strength = 70;
      }

      const taskRes = await api.post<{ task_id: string; status: string }>(
        `/api/v1/image/generate`,
        body
      );

      if (!taskRes.task_id) throw new Error("no task_id");

      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const st = await api.get<{ status: string; image_urls?: string[] }>(
          `/api/v1/image/status/${taskRes.task_id}`
        );
        if (st.status === "completed" && st.image_urls?.length) {
          const url = st.image_urls[0];
          imageUrlsRef.current[idx] = url;
          setItems((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], status: "completed", imageUrl: url };
            return next;
          });
          return true;
        }
        if (st.status === "failed") break;
      }
    } catch (e) {
      console.warn("[TurnaroundModal] Image generation failed", e);
    }

    if (retryCount < 2) {
      await new Promise(r => setTimeout(r, 2000));
      return generateOne(idx, retryCount + 1);
    }

    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: "failed" };
      return next;
    });
    return false;
  };

  const generateAll = async () => {
    setOverallStatus("generating");
    // Generate in parallel batches of 3 to avoid overwhelming the API
    for (let batch = 0; batch < 3; batch++) {
      const promises = [];
      for (let j = 0; j < 3; j++) {
        const idx = batch * 3 + j;
        if (idx < TURNAROUND_ANGLES.length) {
          promises.push(generateOne(idx));
        }
      }
      await Promise.all(promises);
    }
    setOverallStatus("done");
    const urls = imageUrlsRef.current;
    if (urls.length > 0) {
      // Save to localStorage for persistence
      try { localStorage.setItem(`sl_turn_${characterName}`, JSON.stringify(urls)); } catch {}
      if (onSave) onSave(urls);
    }
  };

  const retryFailed = () => {
    started.current = false;
    imageUrlsRef.current = [];
    setOverallStatus("idle");
    setItems(
      TURNAROUND_ANGLES.map((a) => ({ label: a.label, status: "pending" as const, imageUrl: "" }))
    );
  };

  const doneCount = items.filter((i) => i.status === "completed").length;
  const total = items.length;
  const anyFailed = items.some((i) => i.status === "failed");
  const allDone = items.every((i) => i.status === "completed" || i.status === "failed");

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-card border border-border-subtle rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Grid3x3 className="size-4 text-brand-cyan" />
            <h3 className="text-sm font-bold text-text-primary">造型九宫格 — {characterName}</h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-text-muted">
              {doneCount}/{total}
            </span>
            {allDone && anyFailed && (
              <button
                onClick={retryFailed}
                className="px-3 py-1.5 rounded-lg bg-surface-elevated text-text-muted hover:text-text-primary text-[10px] font-bold uppercase tracking-wider border border-border-subtle hover:border-border-glow transition-all flex items-center gap-1"
              >
                <RefreshCw className="size-3" /> 重试失败项
              </button>
            )}
            {hasExisting && overallStatus === "done" && !anyFailed && (
              <button
                onClick={() => {
                  started.current = false;
                  imageUrlsRef.current = [];
                  setGenKey(k => k + 1);
                  setOverallStatus("idle");
                  setItems(TURNAROUND_ANGLES.map((a) => ({ label: a.label, status: "pending" as const, imageUrl: "" })));
                }}
                className="px-3 py-1.5 rounded-lg bg-surface-elevated text-text-muted hover:text-text-primary text-[10px] font-bold uppercase tracking-wider border border-border-subtle hover:border-border-glow transition-all flex items-center gap-1"
              >
                <RefreshCw className="size-3" /> 重新生成
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* 3x3 Grid */}
        <div className="p-6">
          <div className="grid grid-cols-3 gap-3">
            {items.map((item, i) => (
              <div key={i} className="rounded-xl border border-border-subtle bg-surface-elevated overflow-hidden">
                <div className="aspect-[3/4] bg-surface-base relative flex items-center justify-center group/image">
                  {item.status === "pending" && (
                    <div className="flex flex-col items-center gap-1">
                      <Loader2 className="size-4 text-text-muted/40" />
                      <span className="text-[9px] text-text-muted/40">等待中</span>
                    </div>
                  )}
                  {item.status === "generating" && (
                    <Loader2 className="size-6 text-brand-cyan animate-spin" />
                  )}
                  {item.status === "completed" && item.imageUrl && (
                    <img
                      src={resolveImageUrl(item.imageUrl)}
                      alt={`${characterName} ${item.label}`}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setPreviewUrl(item.imageUrl); }}
                    />
                  )}
                  {item.status === "completed" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setPreviewUrl(item.imageUrl); }}
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-all opacity-0 group-hover/image:opacity-100"
                    >
                      <Maximize2 className="size-3" />
                    </button>
                  )}
                  {item.status === "failed" && (
                    <div className="flex flex-col items-center gap-1">
                      <AlertCircle className="size-5 text-red-400" />
                      <span className="text-[9px] text-red-400">失败</span>
                    </div>
                  )}
                </div>
                <div className="px-2 py-1.5 flex items-center justify-between">
                  <span className="text-[9px] font-bold text-text-primary">{item.label}</span>
                  {item.status === "completed" && <Check className="size-3 text-accent-green" />}
                </div>
              </div>
            ))}
          </div>

          {allDone && !anyFailed && (
            <p className="text-center text-[10px] text-text-muted mt-4">全部生成完成</p>
          )}
        </div>
      </div>

      {/* Image preview overlay */}
      {previewUrl && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-8 backdrop-blur-sm" onClick={() => setPreviewUrl(null)}>
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10"
          >
            <X className="size-5" />
          </button>
          <img
            src={resolveImageUrl(previewUrl)}
            alt="preview"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
