"use client";

import { useState } from "react";
import { X, Loader2, Sparkles, Check } from "lucide-react";
import { api } from "@/services/api";
import { useToast } from "@/components/ui/Toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

function imgUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) return path;
  return `${API_BASE}${path}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  prompt: string;
  onPublished?: () => void;
}

export function PublishDialog({ open, onClose, imageUrl, prompt, onPublished }: Props) {
  const [title, setTitle] = useState(prompt.slice(0, 100) || "未命名作品");
  const [description, setDescription] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageW, setImageW] = useState<number | null>(null);
  const [imageH, setImageH] = useState<number | null>(null);
  const { toast } = useToast();

  if (!open) return null;

  const handlePublish = async () => {
    if (!title.trim()) return;
    setPublishing(true);
    setError(null);
    try {
      await api.post("/api/v1/community/posts", {
        title: title.trim(),
        description: description.trim() || undefined,
        cover_url: imageUrl,
        cover_width: imageW,
        cover_height: imageH,
      });
      setDone(true);
      toast("已发布到社区", "success");
      onPublished?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "发布失败");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-brand-cyan/15">
              <Sparkles className="size-3.5 text-brand-cyan" />
            </div>
            <h3 className="text-sm font-medium text-primary">发布到社区</h3>
          </div>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-white/[0.06] hover:text-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        {done ? (
          /* Success state */
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-accent-green/15">
              <Check className="size-7 text-accent-green" />
            </div>
            <h3 className="text-base font-semibold text-primary">发布成功</h3>
            <p className="mt-1 text-sm text-muted">作品已发布到灵感社区</p>
            <button
              onClick={onClose}
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan px-6 text-sm font-medium text-white transition-all hover:brightness-110"
            >
              关闭
            </button>
          </div>
        ) : (
          <>
            {/* Preview image */}
            <div className="px-5 pt-4">
              <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]">
                <img
                  src={imgUrl(imageUrl)}
                  alt="preview"
                  className="max-h-48 w-full object-contain"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth && img.naturalHeight) {
                      setImageW(img.naturalWidth);
                      setImageH(img.naturalHeight);
                    }
                  }}
                />
              </div>
            </div>

            {/* Form */}
            <div className="space-y-4 px-5 py-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-secondary">标题</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  placeholder="给作品起个名字"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-primary outline-none transition-colors placeholder:text-muted focus:border-brand-cyan/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-secondary">描述（可选）</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="描述你的创作思路..."
                  className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-primary outline-none transition-colors placeholder:text-muted focus:border-brand-cyan/50"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-sm text-red-400">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] px-5 py-4">
              <button
                onClick={onClose}
                className="inline-flex h-10 items-center rounded-xl border border-white/[0.08] px-5 text-sm text-secondary transition-colors hover:bg-white/[0.05]"
              >
                取消
              </button>
              <button
                onClick={handlePublish}
                disabled={!title.trim() || publishing}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan px-6 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {publishing ? (
                  <><Loader2 className="size-4 animate-spin" />发布中...</>
                ) : (
                  <><Sparkles className="size-4" />发布</>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
