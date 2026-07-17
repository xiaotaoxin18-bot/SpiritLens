"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, Check, AlertCircle, RefreshCw, Sparkles, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { resolveImageUrl } from "@/lib/utils";

// Namespace localStorage keys
const LS_PREFIX = "sl_var_";

const CLOTHING_VARIATIONS = [
  { label: "休闲", promptSuffix: "穿着休闲便装，T恤牛仔裤，日常自然风格" },
  { label: "正式", promptSuffix: "穿着正式西装/礼服，商务场合，精致干练" },
  { label: "运动", promptSuffix: "穿着运动装，活力动感，户外光线" },
  { label: "传统", promptSuffix: "穿着传统服饰/古装，典雅庄重" },
];

interface VariantItem {
  label: string;
  status: "pending" | "generating" | "completed" | "failed";
  imageUrl: string;
  prompt: string;
  taskId?: string;
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
  debug?: boolean;
}

export default function VariationsModal({
  characterName, basePrompt, characterExtra, modelId, size, referenceImage,
  existingImages, onSave, onClose,
}: Props) {
  // Check both prop and localStorage for cached images
  const cachedImages = existingImages?.length
    ? existingImages
    : (() => {
        try {
          const raw = localStorage.getItem(`sl_var_${characterName}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.some(Boolean)) return parsed;
          }
        } catch {}
        return undefined;
      })();
  const hasExisting = cachedImages && cachedImages.some(Boolean);

  const [variants, setVariants] = useState<VariantItem[]>(() =>
    hasExisting
      ? CLOTHING_VARIATIONS.map((v, i) => ({
          label: v.label,
          status: (cachedImages![i] ? "completed" : "pending") as "completed" | "pending",
          imageUrl: cachedImages![i] || "",
          prompt: v.promptSuffix,
        }))
      : CLOTHING_VARIATIONS.map((v) => ({
          label: v.label,
          status: "pending" as const,
          imageUrl: "",
          prompt: v.promptSuffix,
        }))
  );

  const started = useRef(false);
  const [genKey, setGenKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const imageUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    if (hasExisting && variants.every(v => v.status === "completed") && genKey === 0) return;
    if (started.current) return;
    started.current = true;
    generateAll();
  }, [genKey]);

  const generateOne = async (idx: number, retryCount = 0): Promise<boolean> => {
    const variation = CLOTHING_VARIATIONS[idx];
    const clothingPrompt = basePrompt
      ? `${basePrompt}，${variation.promptSuffix}`
      : `${characterName}，${variation.promptSuffix}`;

    setVariants((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: "generating" };
      return next;
    });

    try {
      const body: Record<string, any> = { prompt: clothingPrompt, model_id: modelId, size, batch: 1 };
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
          setVariants((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], status: "completed", imageUrl: url };
            return next;
          });
          return true;
        }
        if (st.status === "failed") break;
      }
    } catch (e) {
      console.warn("[VariationsModal] Image generation failed", e);
    }

    // Retry up to 2 times on failure
    if (retryCount < 2) {
      await new Promise(r => setTimeout(r, 2000));
      return generateOne(idx, retryCount + 1);
    }

    setVariants((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: "failed" };
      return next;
    });
    return false;
  };

  const generateAll = async () => {
    for (let i = 0; i < CLOTHING_VARIATIONS.length; i++) {
      await generateOne(i);
    }
    const urls = imageUrlsRef.current;
    const saved = urls.filter(Boolean);
    if (saved.length > 0) {
      try { localStorage.setItem(`sl_var_${characterName}`, JSON.stringify(urls)); } catch {}
      if (onSave) onSave(urls);
    }
  };

  const retryAll = () => {
    started.current = false;
    imageUrlsRef.current = [];
    setVariants(
      CLOTHING_VARIATIONS.map((v) => ({
        label: v.label,
        status: "pending" as const,
        imageUrl: "",
        prompt: v.promptSuffix,
      }))
    );
  };

  const allDone = variants.every((v) => v.status === "completed" || v.status === "failed");
  const anyFailed = variants.some((v) => v.status === "failed");

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-card border border-border-subtle rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand-cyan" />
            <h3 className="text-sm font-bold text-text-primary">服装变体 — {characterName}</h3>
          </div>
          <div className="flex items-center gap-2">
            {allDone && anyFailed && (
              <button
                onClick={retryAll}
                className="px-3 py-1.5 rounded-lg bg-surface-elevated text-text-muted hover:text-text-primary text-[10px] font-bold uppercase tracking-wider border border-border-subtle hover:border-border-glow transition-all flex items-center gap-1"
              >
                <RefreshCw className="size-3" /> 重试
              </button>
            )}
            {hasExisting && allDone && !anyFailed && (
              <button
                onClick={() => {
                  started.current = false;
                  imageUrlsRef.current = [];
                  setGenKey(k => k + 1);
                  setVariants(CLOTHING_VARIATIONS.map((v) => ({
                    label: v.label, status: "pending" as const, imageUrl: "", prompt: v.promptSuffix,
                  })));
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

        {/* Grid */}
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4">
            {variants.map((v, i) => (
              <div key={i} className="rounded-xl border border-border-subtle bg-surface-elevated overflow-hidden">
                <div className="aspect-[4/3] bg-surface-base relative flex items-center justify-center group/image">
                  {v.status === "pending" && (
                    <span className="text-[10px] text-text-muted">等待生成</span>
                  )}
                  {v.status === "generating" && (
                    <Loader2 className="size-6 text-brand-cyan animate-spin" />
                  )}
                  {v.status === "completed" && v.imageUrl && (
                    <img
                      src={resolveImageUrl(v.imageUrl)}
                      alt={`${characterName} ${v.label}`}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setPreviewUrl(v.imageUrl); }}
                    />
                  )}
                  {v.status === "completed" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setPreviewUrl(v.imageUrl); }}
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-all opacity-0 group-hover/image:opacity-100"
                    >
                      <Maximize2 className="size-3" />
                    </button>
                  )}
                  {v.status === "failed" && (
                    <div className="flex flex-col items-center gap-1">
                      <AlertCircle className="size-5 text-red-400" />
                      <span className="text-[10px] text-red-400">生成失败</span>
                    </div>
                  )}
                </div>
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-text-primary">{v.label}</span>
                  {v.status === "completed" && <Check className="size-3.5 text-accent-green" />}
                </div>
              </div>
            ))}
          </div>

          {allDone && !anyFailed && (
            <p className="text-center text-[10px] text-text-muted mt-4">全部生成完成</p>
          )}
        </div>
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-8 backdrop-blur-sm" onClick={() => setPreviewUrl(null)}>
          <button onClick={() => setPreviewUrl(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10">
            <X className="size-5" />
          </button>
          <img src={resolveImageUrl(previewUrl)} alt="preview" className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
