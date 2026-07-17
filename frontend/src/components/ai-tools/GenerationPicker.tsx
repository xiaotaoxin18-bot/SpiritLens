"use client";

import { X, Check, ImagePlus } from "lucide-react";
import { useSessionStore } from "@/store/sessions";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

function imgUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) return path;
  return `${API_BASE}${path}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}

export function GenerationPicker({ open, onClose, onSelect }: Props) {
  const { sessions } = useSessionStore();

  if (!open) return null;

  // Collect all succeeded image generations (across all sessions, both image and video)
  const images = sessions
    .flatMap((s) => s.generations)
    .filter((g) => g.status === "succeeded" && g.imageUrls?.length)
    .flatMap((g) =>
      (g.imageUrls ?? []).map((url) => ({ url, prompt: g.prompt })),
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-3xl max-h-[80vh] overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-brand-purple/15">
              <ImagePlus className="size-3.5 text-brand-purple" />
            </div>
            <h3 className="text-sm font-medium text-primary">从生成记录选择</h3>
          </div>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-white/[0.06] hover:text-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-white/[0.04]">
              <ImagePlus className="size-6 text-muted" />
            </div>
            <p className="text-sm text-muted">暂无已生成的图片</p>
            <p className="mt-1 text-xs text-muted/60">先在图片生成中创作，完成后可在此处选作参考图</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 overflow-y-auto p-4 max-h-[60vh]">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => {
                  onSelect(img.url);
                  onClose();
                }}
                className="group relative aspect-square overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] transition-all hover:border-brand-purple/40 hover:shadow-lg"
              >
                <img
                  src={imgUrl(img.url)}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                  <Check className="size-8 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="line-clamp-1 text-[10px] text-white/80">{img.prompt}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
