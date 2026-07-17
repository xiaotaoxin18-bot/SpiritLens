"use client";

import { Image as ImageIcon, Video, Trash2, Camera } from "lucide-react";
import { cn, resolveImageUrl } from "@/lib/utils";
import { Shot, KeyframeStatus } from "./types";

interface Props {
  shot: Shot;
  index: number;
  isActive: boolean;
  onClick: () => void;
  onDelete?: (shotId: string) => void;
}

const heroBase = "/spiritlens/spiritlens-hero";

export default function ShotCard({ shot, index, isActive, onClick, onDelete }: Props) {
  const sKf = shot.keyframes?.find(k => k.type === "start");
  const eKf = shot.keyframes?.find(k => k.type === "end");
  const hasImage = !!sKf?.imageUrl;
  const hasVideo = !!shot.interval?.videoUrl;
  const isGeneratingKf = shot.keyframes?.some(k => k.status === "generating");
  const isGeneratingVideo = shot.interval?.status === "generating";

  const displayNumber = `SHOT ${String(index + 1).padStart(3, "0")}`;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex flex-col bg-surface-card border rounded-xl overflow-hidden cursor-pointer transition-all duration-200",
        isActive
          ? "border-brand-cyan ring-1 ring-brand-cyan/30"
          : "border-border-subtle hover:border-border-glow hover:shadow-lg"
      )}
    >
      {/* Header */}
      <div className="px-3 py-2 bg-surface-elevated border-b border-border-subtle flex justify-between items-center">
        <span className={cn(
          "font-mono text-[10px] font-bold",
          isActive ? "text-brand-cyan" : "text-text-muted"
        )}>
          {displayNumber}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] px-1.5 py-0.5 bg-surface-base text-text-muted rounded uppercase">
            {shot.cameraMovement}
          </span>
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(shot.id); }}
              className="p-1 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Thumbnail */}
      <div className="aspect-video bg-surface-elevated relative flex items-center justify-center overflow-hidden">
        {/* Default hero background when no image or video generated */}
        {!hasImage && !hasVideo && !isGeneratingKf && (
          <>
            <img
              src={`${heroBase}/hero-dark@2x.png`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-50 light:hidden pointer-events-none"
            />
            <img
              src={`${heroBase}/hero-light@2x.png`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-50 hidden light:block pointer-events-none"
            />
          </>
        )}
        {isGeneratingKf ? (
          <div className="flex flex-col items-center gap-1">
            <div className="size-5 border-2 border-brand-cyan border-t-transparent rounded-full animate-spin" />
            <span className="text-[9px] text-text-muted">生成中</span>
          </div>
        ) : hasImage ? (
          <img src={sKf!.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : hasVideo ? (
          <video
            src={resolveImageUrl(shot.interval!.videoUrl!)}
            className="w-full h-full object-cover"
            preload="metadata"
            muted
            playsInline
          />
        ) : (
          <ImageIcon className="size-8 text-text-muted/20" />
        )}
        {/* Status badges */}
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          {hasVideo && (
            <span className="px-1.5 py-0.5 rounded bg-accent-green/20 text-accent-green text-[8px] font-bold flex items-center gap-0.5">
              <Video className="size-2.5" /> 完成
            </span>
          )}
          {isGeneratingVideo && (
            <span className="px-1.5 py-0.5 rounded bg-brand-cyan/20 text-brand-cyan text-[8px] font-bold flex items-center gap-0.5">
              <div className="size-2 border border-brand-cyan border-t-transparent rounded-full animate-spin" />
              视频
            </span>
          )}
          {!hasImage && !isGeneratingKf && (
            <span className="px-1.5 py-0.5 rounded bg-text-muted/10 text-text-muted text-[8px] font-bold">
              待生成
            </span>
          )}
        </div>
        {/* Scene name */}
        {shot.sceneName && (
          <div className="absolute bottom-1.5 left-1.5 right-1.5">
            <span className="block truncate px-1.5 py-0.5 rounded bg-black/50 text-white/80 text-[8px] backdrop-blur-sm">
              <Camera className="size-2 inline mr-0.5" />
              {shot.sceneName}
            </span>
          </div>
        )}
      </div>

      {/* Action summary */}
      <div className="px-3 py-2 min-h-0">
        <p className="text-[10px] text-text-secondary leading-relaxed line-clamp-2">
          {shot.actionSummary}
        </p>
      </div>
    </div>
  );
}
