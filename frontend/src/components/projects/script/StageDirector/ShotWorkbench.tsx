"use client";

import { useState, useRef, useEffect } from "react";
import {
  X, ChevronLeft, ChevronRight, Sparkles, Loader2, Video,
  Check, AlertCircle, Image as ImageIcon, Upload, Trash2, Download,
  Library,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveImageUrl } from "@/lib/utils";
import { api } from "@/services/api";
import { Shot } from "./types";
import AssetLibraryPicker from "@/components/projects/script/StageAssets/AssetLibraryPicker";

interface AssetImage {
  name: string;
  url: string;
}

interface Props {
  shot: Shot;
  shotIndex: number;
  totalShots: number;
  scriptData: any;
  aspectRatio: string;
  refImages: AssetImage[];
  uploadedImages: AssetImage[];
  projectId?: string;
  selectedVideoModel?: string;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onUploadRefImage: (shotId: string, file: File) => Promise<string | null>;
  onDeleteUploadedImage: (shotId: string, index: number) => void;
  onHideAutoImage: (shotId: string, imgUrl: string) => void;
  onGenerateVideo: (shotId: string, prompt: string, duration: number | undefined, refImageUrls: string[], resolution: string) => Promise<void>;
}

export default function ShotWorkbench({
  shot, shotIndex, totalShots, scriptData, aspectRatio, refImages,
  uploadedImages, projectId, selectedVideoModel,
  onClose, onPrevious, onNext,
  onUploadRefImage, onDeleteUploadedImage, onHideAutoImage, onGenerateVideo,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [prompt, setPrompt] = useState(shot.interval?.videoPrompt || shot.actionSummary || "");
  const [duration, setDuration] = useState(shot.interval?.duration || 5);
  const [resolution, setResolution] = useState(shot.interval?.resolution || "");
  const [libraryType, setLibraryType] = useState<"characters" | "scenes" | "props" | null>(null);
  const isGenerating = shot.interval?.status === "generating";
  const hasVideo = !!shot.interval?.videoUrl;

  // Resolution options based on current aspect ratio
  const resolutionOptions = aspectRatio === "16:9"
    ? ["1280x720", "1920x1080", "2560x1440"]
    : aspectRatio === "9:16"
      ? ["720x1280", "1080x1920", "1440x2560"]
      : ["1024x1024", "2048x2048"];

  // If current resolution isn't valid for this aspect ratio, reset to default
  const effectiveResolution = resolution && resolutionOptions.includes(resolution)
    ? resolution
    : resolutionOptions[0];

  // Sync local state when switching to a different shot
  useEffect(() => {
    setPrompt(shot.interval?.videoPrompt || shot.actionSummary || "");
    setDuration(shot.interval?.duration || 5);
    setResolution(shot.interval?.resolution || "");
  }, [shot.id]);
  const availableDurations = [5, 10, 15];
  const allRefUrls = [...refImages.map(i => i.url), ...uploadedImages.map(i => i.url)].filter(Boolean);

  return (
    <div className="w-[500px] h-full bg-surface-card border-l border-border-subtle overflow-y-auto shrink-0">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-card border-b border-border-subtle px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={onPrevious} disabled={shotIndex === 0} className="p-1 rounded-lg text-text-muted hover:text-text-primary disabled:opacity-30">
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-xs font-bold font-mono text-text-primary">
              SHOT {String(shotIndex + 1).padStart(3, "0")} / {String(totalShots).padStart(3, "0")}
            </span>
            <button onClick={onNext} disabled={shotIndex >= totalShots - 1} className="p-1 rounded-lg text-text-muted hover:text-text-primary disabled:opacity-30">
              <ChevronRight className="size-4" />
            </button>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-primary">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* ─── 镜头描述 ───────────────────────── */}
        <div>
          <h4 className="text-[10px] font-bold font-mono uppercase tracking-wider text-text-muted mb-2">镜头描述</h4>
          <p className="text-sm text-text-primary leading-relaxed">{shot.actionSummary}</p>
        </div>

        {/* ─── 参考图 ─────────────────────────── */}
        <div>
          <h4 className="text-[10px] font-bold font-mono uppercase tracking-wider text-text-muted mb-2">
            参考图（{refImages.length + uploadedImages.length}）
          </h4>
          <div className="flex flex-wrap gap-2">
            {/* Auto-matched images (filter out hidden ones) */}
            {refImages
              .filter(img => !(shot.hiddenRefImageUrls || []).includes(img.url))
              .map((img, i) => (
              <div key={`auto-${i}`} className="relative group">
                <img
                  src={resolveImageUrl(img.url)}
                  alt={img.name}
                  className="w-20 h-20 rounded-lg object-cover border border-brand-cyan/30"
                />
                <button
                  onClick={() => onHideAutoImage(shot.id, img.url)}
                  className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="size-3" />
                </button>
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 py-0.5 rounded bg-black/60 text-white/90 text-[8px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  {img.name}
                </span>
              </div>
            ))}
            {/* User-uploaded images */}
            {uploadedImages.map((img, i) => (
              <div key={`up-${i}`} className="relative group">
                <img
                  src={resolveImageUrl(img.url)}
                  alt={img.name}
                  className="w-20 h-20 rounded-lg object-cover border border-yellow-500/40"
                />
                <button
                  onClick={() => onDeleteUploadedImage(shot.id, i)}
                  className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="size-3" />
                </button>
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 py-0.5 rounded bg-black/60 text-white/90 text-[8px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  {img.name}
                </span>
              </div>
            ))}
            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-20 h-20 rounded-lg border-2 border-dashed border-border-subtle hover:border-brand-cyan/50 flex flex-col items-center justify-center gap-1 text-text-muted hover:text-text-primary transition-all disabled:opacity-30"
              title="本地上传"
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              <span className="text-[8px]">上传</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                await onUploadRefImage(shot.id, file);
                setUploading(false);
                e.target.value = "";
              }}
            />
            {/* 从资产库选择 */}
            {projectId && (
              <>
                {(["characters", "scenes", "props"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setLibraryType(type)}
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-border-subtle hover:border-brand-purple/50 flex flex-col items-center justify-center gap-1 text-text-muted hover:text-text-primary transition-all"
                    title={`从${type === "characters" ? "角色" : type === "scenes" ? "场景" : "道具"}库选择`}
                  >
                    <Library className="size-4" />
                    <span className="text-[8px]">{type === "characters" ? "角色" : type === "scenes" ? "场景" : "道具"}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* ─── 资产库选择弹窗 ─────────────────── */}
        {libraryType && projectId && (
          <AssetLibraryPicker
            projectId={projectId}
            type={libraryType}
            onSelect={(item: any) => {
              const url = item.image_url || "";
              if (url) {
                // Add as uploaded reference image
                const existing = shot.uploadedRefImages || [];
                const newName = item.name || libraryType;
                // We can't directly mutate, so trigger upload via parent
                // Instead, download the image and re-upload it to local storage
                fetch(resolveImageUrl(url))
                  .then(r => r.blob())
                  .then(blob => {
                    const file = new File([blob], `${newName}.jpg`, { type: "image/jpeg" });
                    onUploadRefImage(shot.id, file);
                  })
                  .catch(() => {});
              }
              setLibraryType(null);
            }}
            onClose={() => setLibraryType(null)}
          />
        )}

        {/* ─── 提示词 ─────────────────────────── */}
        <div>
          <h4 className="text-[10px] font-bold font-mono uppercase tracking-wider text-text-muted mb-2">视频提示词</h4>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="描述这个镜头需要生成的视频内容..."
            className="w-full bg-surface-elevated border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/30 outline-none focus:border-brand-cyan/30 transition-colors resize-none"
          />
        </div>

        {/* ─── 视频时长 ───────────────────────── */}
        <div>
          <h4 className="text-[10px] font-bold font-mono uppercase tracking-wider text-text-muted mb-2">视频时长</h4>
          <div className="flex gap-2">
            {availableDurations.map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-bold font-mono border transition-all",
                  duration === d
                    ? "bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30"
                    : "bg-surface-elevated text-text-muted hover:text-text-primary border-border-subtle"
                )}
              >
                {d} 秒
              </button>
            ))}
          </div>
        </div>

        {/* ─── 分辨率 ─────────────────────────── */}
        <div>
          <h4 className="text-[10px] font-bold font-mono uppercase tracking-wider text-text-muted mb-2">分辨率</h4>
          <div className="flex gap-2">
            {resolutionOptions.map((r) => (
              <button
                key={r}
                onClick={() => setResolution(r)}
                className={cn(
                  "px-3 py-2 rounded-lg text-[10px] font-bold font-mono border transition-all",
                  effectiveResolution === r
                    ? "bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30"
                    : "bg-surface-elevated text-text-muted hover:text-text-primary border-border-subtle"
                )}
              >
                {r.replace("x", " × ")}
              </button>
            ))}
          </div>
        </div>

        {/* ─── 视频生成 ───────────────────────── */}
        <div>
          {hasVideo ? (
            <div className="space-y-2">
              {/* Actual prompt used for generation — visible & copyable */}
              {shot.interval?.videoPrompt && (
                <div className="p-3 rounded-xl bg-surface-elevated border border-border-subtle">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-text-muted">
                      生成提示词
                    </span>
                    <button
                      onClick={() => navigator.clipboard.writeText(shot.interval!.videoPrompt || "")}
                      className="text-[10px] font-mono text-brand-cyan hover:underline transition-colors"
                    >
                      复制
                    </button>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
                    {shot.interval!.videoPrompt}
                  </p>
                </div>
              )}
              {/* Video player */}
              <video
                src={resolveImageUrl(shot.interval!.videoUrl!)}
                controls
                className="w-full rounded-xl bg-black max-h-[300px]"
              />
              <div className="flex items-center gap-3 p-3 rounded-xl bg-accent-green/5 border border-accent-green/20">
                <Check className="size-5 text-accent-green shrink-0" />
                <span className="text-sm text-text-secondary flex-1">视频已生成</span>
                <a
                  href={resolveImageUrl(shot.interval!.videoUrl!)}
                  download
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan/20 text-[10px] font-bold border border-brand-cyan/20 transition-all"
                >
                  <Download className="size-3.5" />
                  下载视频
                </a>
                <button
                  onClick={() => onGenerateVideo(shot.id, prompt, duration, allRefUrls, effectiveResolution)}
                  disabled={!prompt.trim()}
                  className="px-3 py-1.5 rounded-lg bg-surface-elevated text-text-muted hover:text-text-primary text-[10px] font-bold border border-border-subtle transition-all disabled:opacity-30"
                >
                  重新生成
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => onGenerateVideo(shot.id, prompt, duration, allRefUrls, effectiveResolution)}
              disabled={!prompt.trim() || isGenerating}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white text-xs font-bold uppercase tracking-wider hover:shadow-glow-sm disabled:opacity-30 transition-all flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <><Loader2 className="size-4 animate-spin" /> 生成中...</>
              ) : (
                <><Video className="size-4" /> 生成视频</>
              )}
            </button>
          )}
          {isGenerating && (
            <div className="mt-2 flex items-center gap-2 text-xs text-brand-cyan">
              <Loader2 className="size-3 animate-spin" />
              视频生成中，请耐心等待...
            </div>
          )}
          {shot.interval?.status === "failed" && (
            <div className="mt-2 flex items-center gap-2 text-xs text-red-400">
              <AlertCircle className="size-3" />
              生成失败，请重试
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
