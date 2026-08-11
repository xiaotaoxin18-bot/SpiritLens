"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X, ChevronLeft, ChevronRight, Sparkles, Loader2, Video,
  Check, AlertCircle, Image as ImageIcon, Upload, Trash2, Download,
  Library, Plus, Music2,
} from "lucide-react";
import { cn, resolveImageUrl } from "@/lib/utils";
import { downloadMedia } from "@/lib/download";
import { useAntiAutoClick, isRateLimited } from "@/lib/use-anti-auto-click";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/services/api";
import { Shot, VideoInterval } from "./types";
import AssetLibraryPicker from "@/components/projects/script/StageAssets/AssetLibraryPicker";

interface AssetImage {
  name: string;
  url: string;
  type?: string;
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
  videoModels?: { id: string; name: string }[];
  selectedVideoModel?: string;
  videoModelResolutions?: string[];
  onVideoModelChange?: (id: string) => void;
  onAspectRatioChange?: (ratio: string) => void;
  layout?: "sidebar" | "bottom";
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onUploadRefImage: (shotId: string, file: File, type?: string) => Promise<string | null>;
  onDeleteUploadedImage: (shotId: string, url: string) => void;
  onHideAutoImage: (shotId: string, imgUrl: string) => void;
  onUploadAudio: (shotId: string, file: File) => Promise<string | null>;
  onDeleteAudio: (shotId: string) => void;
  onGenerateVideo: (shotId: string, prompt: string, duration: number | undefined, refImageUrls: string[], resolution: string, audioUrl?: string) => Promise<void>;
  onDeleteVideo: (shotId: string, videoId: string) => void;
  onRerunVideo: (shotId: string, videoId: string) => void;
  onCancelVideo: (shotId: string, videoId: string) => void;
}

export default function ShotWorkbench({
  shot, shotIndex, totalShots, scriptData, aspectRatio, refImages,
  uploadedImages, projectId, videoModels, selectedVideoModel, videoModelResolutions,
  onVideoModelChange, onAspectRatioChange,
  layout = "sidebar",
  onClose, onPrevious, onNext,
  onUploadRefImage, onDeleteUploadedImage, onHideAutoImage,
  onUploadAudio, onDeleteAudio, onGenerateVideo,
  onDeleteVideo, onRerunVideo, onCancelVideo,
}: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);
  const uploadTypeRef = useRef<string>("");
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [rerunningVideoId, setRerunningVideoId] = useState<string | null>(null);
  const [cancellingVideoId, setCancellingVideoId] = useState<string | null>(null);
  // 防连点：点击生成后 1.5 秒内禁用（多视频仍可生成中继续点，只是防手滑/双击重复提交）
  const submitLockRef = useRef(false);
  // 异常点击检测（自动化批量提交）→ 锁 30 秒
  const { locked, remaining, guardClick, forceLock } = useAntiAutoClick();
  // 提交反馈：点击后 2 秒内按钮显示"生成中..."，随后变回"继续生成"（真实进度由卡片体现）
  const [justSubmitted, setJustSubmitted] = useState(false);
  const submitFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleGenerateClick = async () => {
    await guardClick(async () => {
      if (submitLockRef.current) return;
      submitLockRef.current = true;
      setTimeout(() => { submitLockRef.current = false; }, 1500);
      // 即时反馈：点击即提示，按钮文字随后变"生成中..."（2 秒后变回"继续生成"）
      setJustSubmitted(true);
      if (submitFeedbackTimer.current) clearTimeout(submitFeedbackTimer.current);
      submitFeedbackTimer.current = setTimeout(() => setJustSubmitted(false), 2000);
      if (allRefUrlsRaw.length > 12) toast(`参考图共 ${allRefUrlsRaw.length} 张，超过 12 张上限，已自动截取前 12 张`, "error");
      toast("正在提交生成任务...", "info");
      try {
        await onGenerateVideo(shot.id, prompt, duration, allRefUrls, effectiveResolution, shot.audioRef?.url);
      } catch (e) {
        // 后端 429 限流 → 触发锁定
        if (isRateLimited(e)) forceLock();
      }
    });
  };
  const [prompt, setPrompt] = useState(shot.interval?.videoPrompt || shot.actionSummary || "");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionAtPos, setMentionAtPos] = useState(0);
  const [mentionActiveIdx, setMentionActiveIdx] = useState(0);
  const [mentionPos, setMentionPos] = useState({ top: 0, left: 0 });

  // Convert plain text to HTML with @图N / @音频N rendered as colored chips
  // 音频 chip 用黄色系与参考图（青色）区分
  const textToHtml = (text: string): string => {
    if (!text) return "";
    return text.replace(/(@?图\d+|@?音频\d+)/g, (match) => {
      const label = match.startsWith("@") ? match : `@${match}`;
      const isAudio = /音频\d+/.test(label);
      const cls = isAudio
        ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
        : "bg-brand-cyan/15 text-brand-cyan border-brand-cyan/30";
      return `<span contenteditable="false" class="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md ${cls} text-xl font-bold font-mono border" data-mention="${label}">${label}</span> `;
    });
  };
  const [duration, setDuration] = useState(() => {
    try { return Number(localStorage.getItem(`director-dur-${projectId}`)) || shot.interval?.duration || 5; } catch { return shot.interval?.duration || 5; }
  });
  const [resolution, setResolution] = useState(() => {
    try { return localStorage.getItem(`director-res-${projectId}`) || shot.interval?.resolution || ""; } catch { return shot.interval?.resolution || ""; }
  });
  const [libraryType, setLibraryType] = useState<"characters" | "scenes" | "props" | null>(null);

  // 探测音频时长（秒），用于提示 15s 上限
  const probeAudioDuration = (file: File): Promise<number> => new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(audio.duration); };
    audio.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    audio.src = url;
  });

  // 多视频列表（videos 存在即优先——空数组=已删光；老数据无 videos 时用 interval 退化）
  const shotVideos = shot.videos !== undefined ? shot.videos : (shot.interval ? [shot.interval] : []);

  // 生成状态基于 videos 列表（点击生成后按钮立即有反馈；不用 interval——多视频不更新 interval）
  const isGenerating = shotVideos.some(v => v.status === "generating");
  const progress = shot.interval?.progress ?? 0;
  // Format startedAt as readable time string
  const uploadTime = shot.interval?.startedAt
    ? new Date(shot.interval.startedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

  // 单条视频卡片：播放器 / 进度条 / 失败信息 + 下载/重跑/删除
  const renderVideoCard = (v: VideoInterval, index: number) => {
    const isCompleted = v.status === "completed" && v.videoUrl;
    const isGen = v.status === "generating";
    const isFailed = v.status === "failed";
    return (
      <div key={v.id} className="rounded-xl border border-border-subtle bg-surface-card/80 overflow-hidden">
        {v.videoPrompt && (
          <div className="p-3 bg-surface-elevated border-b border-border-subtle">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-text-muted">提示词</span>
              <button
                onClick={() => { navigator.clipboard.writeText(v.videoPrompt || ""); toast("已复制", "success"); }}
                className="text-[10px] font-mono text-brand-cyan hover:underline transition-colors"
              >
                复制
              </button>
            </div>
            <p className="text-[10px] text-text-secondary leading-relaxed whitespace-pre-wrap break-words line-clamp-2">
              {v.videoPrompt}
            </p>
          </div>
        )}
        {isCompleted ? (
          <video src={resolveImageUrl(v.videoUrl!)} controls className="w-full bg-black aspect-video" />
        ) : isGen ? (
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-brand-cyan flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" />生成中
              </span>
              <span className="text-xs font-mono text-text-muted">{v.progress ?? 0}%</span>
            </div>
            <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-purple to-brand-cyan transition-all duration-500"
                style={{ width: `${Math.max(v.progress ?? 0, 5)}%` }}
              />
            </div>
            <p className="text-[10px] text-text-muted/60">
              提交于 {v.startedAt ? new Date(v.startedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "—"} · 请耐心等待
            </p>
          </div>
        ) : isFailed ? (
          <div className="p-4">
            <p className="text-xs text-red-400">{v.errorMessage || "生成失败"}</p>
          </div>
        ) : (
          <div className="p-4 text-xs text-text-muted/50">待生成</div>
        )}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border-subtle bg-surface-elevated/50">
          <span className="text-[10px] text-text-muted font-mono shrink-0">视频 {index + 1}</span>
          <div className="flex-1" />
          {isCompleted && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (downloading) return;
                setDownloading(true);
                try {
                  await downloadMedia(
                    resolveImageUrl(v.videoUrl!),
                    `spiritlens-${shot.id}-${index + 1}.mp4`,
                    { isVideo: true },
                  );
                } finally {
                  setDownloading(false);
                }
              }}
              disabled={downloading}
              className="flex items-center gap-1 text-[10px] font-bold text-brand-cyan border border-brand-cyan/30 rounded-lg px-2.5 py-1 hover:bg-brand-cyan/10 disabled:opacity-60 transition-all"
            >
              {downloading ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
              {downloading ? "准备中…" : "下载"}
            </button>
          )}
          {isGen && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (cancellingVideoId || !v.taskId) return;
                setCancellingVideoId(v.id);
                try {
                  await api.post(`/api/v1/video/tasks/${v.taskId}/cancel`, {});
                  onCancelVideo(shot.id, v.id);
                  toast("任务已取消", "success");
                } catch {
                  toast("取消失败，请重试", "error");
                } finally {
                  setCancellingVideoId(null);
                }
              }}
              disabled={cancellingVideoId === v.id}
              className="text-[10px] font-bold text-yellow-500 border border-yellow-500/30 rounded-lg px-2.5 py-1 hover:bg-yellow-500/10 transition-all disabled:opacity-60 flex items-center gap-1"
            >
              {cancellingVideoId === v.id ? <Loader2 className="size-3 animate-spin" /> : null}
              {cancellingVideoId === v.id ? "取消中…" : "取消"}
            </button>
          )}
          {isFailed && (
            <button
              onClick={() => {
                if (rerunningVideoId) return;
                setRerunningVideoId(v.id);
                // 短暂 loading 视觉反馈（1.5s，与生成防连点一致），任务本身由父组件异步处理
                setTimeout(() => setRerunningVideoId(null), 1500);
                onRerunVideo(shot.id, v.id);
              }}
              disabled={rerunningVideoId === v.id}
              className="text-[10px] font-bold text-brand-cyan border border-brand-cyan/30 rounded-lg px-2.5 py-1 hover:bg-brand-cyan/10 transition-all disabled:opacity-60 flex items-center gap-1"
            >
              {rerunningVideoId === v.id ? <Loader2 className="size-3 animate-spin" /> : null}
              {rerunningVideoId === v.id ? "重跑中…" : "重跑"}
            </button>
          )}
          <button
            onClick={() => { if (window.confirm("确定删除该视频？")) onDeleteVideo(shot.id, v.id); }}
            className="text-[10px] font-bold text-red-400 border border-red-500/30 rounded-lg px-2.5 py-1 hover:bg-red-500/10 transition-all"
          >
            删除
          </button>
        </div>
      </div>
    );
  };

  // Pixel map for translating model resolution labels to pixel dimensions per aspect ratio
  const RESOLUTION_PIXELS: Record<string, Record<string, string>> = {
    "16:9": { "480p": "854x480", "720p": "1280x720", "1080p": "1920x1080", "4k": "3840x2160" },
    "9:16": { "480p": "480x854", "720p": "720x1280", "1080p": "1080x1920", "4k": "2160x3840" },
    "1:1":  { "480p": "480x480",  "720p": "720x720",  "1080p": "1080x1080", "4k": "2160x2160" },
  };

  // Resolution options based on current aspect ratio and selected model's capabilities
  const buildResOptions = (aspect: string, modelRes?: string[]): string[] => {
    if (modelRes?.length) {
      const pixelMap = RESOLUTION_PIXELS[aspect];
      if (pixelMap) {
        const opts = modelRes.map(r => pixelMap[r]).filter(Boolean) as string[];
        if (opts.length > 0) return opts;
      }
    }
    // Fallback when model capabilities are unavailable
    return aspect === "16:9"
      ? ["1280x720", "1920x1080", "2560x1440"]
      : aspect === "9:16"
        ? ["720x1280", "1080x1920", "1440x2560"]
        : ["1024x1024", "2048x2048"];
  };
  const resolutionOptions = buildResOptions(aspectRatio, videoModelResolutions);

  // If current resolution isn't valid for this aspect ratio, reset to default
  const effectiveResolution = resolution && resolutionOptions.includes(resolution)
    ? resolution
    : resolutionOptions[0];

  // Sync prompt when shot changes; restore duration/resolution from localStorage (or shot data as fallback)
  useEffect(() => {
    const text = shot.interval?.videoPrompt || "";
    setPrompt(text);
    if (promptRef.current) {
      promptRef.current.innerHTML = textToHtml(text);
    }
    try {
      const savedDur = localStorage.getItem(`director-dur-${projectId}`);
      if (savedDur) setDuration(Number(savedDur));
      else if (shot.interval?.duration) setDuration(shot.interval.duration);

      const savedRes = localStorage.getItem(`director-res-${projectId}`);
      if (savedRes) setResolution(savedRes);
      else if (shot.interval?.resolution) setResolution(shot.interval.resolution);
    } catch {}
  }, [shot.id, projectId]);
  const durMounted = useRef(false);
  useEffect(() => {
    if (!durMounted.current) { durMounted.current = true; return; }
    try { localStorage.setItem(`director-dur-${projectId}`, String(duration)); } catch {}
  }, [duration, projectId]);
  const resMounted = useRef(false);
  useEffect(() => {
    if (!resMounted.current) { resMounted.current = true; return; }
    if (resolution) try { localStorage.setItem(`director-res-${projectId}`, resolution); } catch {}
  }, [resolution, projectId]);

  const availableDurations = [5, 10, 15];
  // 自定义时长：1~15 秒，排除快捷值 5/10/15
  const customDurations = Array.from({ length: 15 }, (_, i) => i + 1).filter((d) => ![5, 10, 15].includes(d));
  // 参考图上限 12 张（天翼云 content 带音频 12 项/纯图 9 项，schema 校验 max_length=12）。
  // 自动匹配（角色/场景/道具）+ 手动上传/资产库多选可能超限 → 截取前 12 张，超限时提交前提示
  const allRefUrlsRaw = [...refImages.map(i => i.url), ...uploadedImages.map(i => i.url)].filter(Boolean);
  const allRefUrls = allRefUrlsRaw.slice(0, 12);

  // ─── @mention 参考图 + 参考音频 ─────────────────
  const visibleRefs = refImages.filter(img => !(shot.hiddenRefImageUrls || []).includes(img.url));
  const imgMentions = [...visibleRefs, ...uploadedImages.filter(img => img.type)]
    .map((img, i) => ({ url: img.url, label: `图${i + 1}`, name: img.name }));
  const audioMentions = shot.audioRef
    ? [{ url: shot.audioRef.url, label: "音频1", name: shot.audioRef.name }]
    : [];
  const mentionItems = [...imgMentions, ...audioMentions]
    .filter(item => !mentionFilter || item.label.includes(mentionFilter) || item.name.includes(mentionFilter));

  useEffect(() => {
    if (!mentionOpen) return;
    const handler = (e: MouseEvent) => {
      if (mentionRef.current && !mentionRef.current.contains(e.target as Node) &&
          textareaRef.current && !textareaRef.current.contains(e.target as Node)) {
        setMentionOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mentionOpen]);

  // Handle contentEditable input — sync plain text + detect @ for mention
  const handlePromptInput = () => {
    if (!promptRef.current) return;
    const val = promptRef.current.textContent || "";
    // Detect @ cursor for mention
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      if (r.startContainer.nodeType === Node.TEXT_NODE) {
        const pos = r.startOffset;
        const txt = (r.startContainer.textContent || "");
        const before = txt.slice(0, pos);
        if (before.endsWith("@") && !mentionOpen) {
          setMentionOpen(true); setMentionFilter(""); setMentionAtPos(1); setMentionActiveIdx(0);
          setMentionPos(getCursorPos());
        } else if (mentionOpen && pos <= 0) {
          setMentionOpen(false);
        }
      } else if (mentionOpen) {
        setMentionOpen(false);
      }
    }
    setPrompt(val);
  };

  // Handle contentEditable keyboard for mention dropdown + @ detection

  // Measure cursor position in contentEditable for @mention positioning
  const getCursorPos = (): { top: number; left: number } => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.getRangeAt(0)) return { top: 0, left: 0 };
    const range = sel.getRangeAt(0);
    const rects = range.getClientRects();
    if (rects.length > 0) {
      return { top: rects[0].top - 4, left: rects[0].left };
    }
    const el = promptRef.current;
    if (!el) return { top: 0, left: 0 };
    const r = el.getBoundingClientRect();
    return { top: r.top + r.height, left: r.left };
  };

  const insertMention = (label: string) => {
    const el = promptRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      // Fallback: append to end
      el.innerHTML += textToHtml(label + " ");
      setPrompt(el.textContent || "");
      setMentionOpen(false);
      return;
    }
    const range = sel.getRangeAt(0);
    // Create chip element（音频黄色系，图青色系，与 textToHtml 一致）
    const chip = document.createElement("span");
    chip.contentEditable = "false";
    const isAudio = /音频\d+/.test(label);
    chip.className = `inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md ${isAudio ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" : "bg-brand-cyan/15 text-brand-cyan border-brand-cyan/30"} text-xl font-bold font-mono border`;
    chip.textContent = `@${label}`;
    chip.dataset.mention = label;
    // Remove the @ that was typed (go back one char)
    if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
      range.setStart(range.startContainer, range.startOffset - 1);
    }
    range.deleteContents();
    range.insertNode(chip);
    // Add space after chip
    const space = document.createTextNode(" ");
    range.setStartAfter(chip);
    range.insertNode(space);
    // Move cursor after space
    range.setStartAfter(space);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    setPrompt(el.textContent || "");
    setMentionOpen(false);
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    if (!mentionOpen) {
      if (pos > 0 && val[pos - 1] === '@' && (pos === 1 || /[\s\n(]/.test(val[pos - 2]))) {
        setMentionOpen(true); setMentionFilter(""); setMentionAtPos(pos); setMentionActiveIdx(0);
        setMentionPos(getCursorPos());
      }
    } else {
      const typed = val.slice(mentionAtPos, pos);
      if (pos < mentionAtPos || /[\s\n]/.test(typed)) setMentionOpen(false);
      else setMentionFilter(val.slice(mentionAtPos, pos));
    }
    setPrompt(val);
  };

  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (mentionOpen && mentionItems.length > 0) {
      if (e.key === "Enter") { e.preventDefault(); insertMention(mentionItems[mentionActiveIdx].label); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionActiveIdx(i => Math.min(i + 1, mentionItems.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionActiveIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Escape") { setMentionOpen(false); return; }
    }
    if (e.key === "@") {
      // Dropdown opens in the onInput handler which fires after this
    }
  };

  // ─── Bottom layout: 3-column grid below the shot grid ─────
  if (layout === "bottom") {
    return (
      <div className="bg-surface-card border-t border-border-subtle flex-1 overflow-y-auto min-h-0">
        <div className="grid grid-cols-[1fr_2fr_1.5fr] gap-6 p-6 h-full min-h-0">
          {/* Col 1: Shot number + Reference images */}
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-bold font-mono uppercase tracking-wider text-text-muted mb-1">
                SHOT {String(shotIndex + 1).padStart(3, "0")}<span> / </span>{String(totalShots).padStart(3, "0")}
              </h4>
              <div className="flex items-center gap-1 mt-1">
                <button onClick={onPrevious} disabled={shotIndex === 0}
                  className="p-0.5 rounded text-text-muted hover:text-text-primary disabled:opacity-30">
                  <ChevronLeft className="size-3.5" />
                </button>
                <p className="text-sm text-text-secondary leading-relaxed truncate">{shot.actionSummary}</p>
                <button onClick={onNext} disabled={shotIndex >= totalShots - 1}
                  className="p-0.5 rounded text-text-muted hover:text-text-primary disabled:opacity-30 shrink-0">
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Reference images — grouped by type */}
            <div>
              <h4 className="text-sm font-bold font-mono uppercase tracking-wider text-text-muted mb-3">参考图</h4>

              <input ref={fileInputRef} type="file" multiple className="hidden"
                onChange={async (e) => {
                  const fs = e.target.files; if (!fs?.length) return;
                  // 无 accept 过滤：文件框显示所有文件，这里前端过滤图片类型
                  const images = Array.from(fs).filter(f => f.type.startsWith("image/"));
                  if (images.length < fs.length) toast("已跳过非图片文件", "error");
                  if (images.length === 0) { e.target.value = ""; return; }
                  setUploading(true);
                  try {
                    for (const f of images) {
                      await onUploadRefImage(shot.id, f, uploadTypeRef.current);
                    }
                  } finally {
                    setUploading(false); e.target.value = "";
                  }
                }} />

              {/* 角色 */}
              <div className="mb-3">
                <div className="flex items-center gap-4 mb-1.5">
                  <span className="text-sm font-medium text-text-muted shrink-0">角色</span>
                  <button onClick={() => setLibraryType("characters")}
                    className="text-sm px-3 py-1 rounded-lg border border-brand-cyan/40 text-brand-cyan hover:bg-brand-cyan/10 transition-colors">
                    资产库
                  </button>
                  <button onClick={() => { uploadTypeRef.current = "characters"; fileInputRef.current?.click(); }} disabled={uploading}
                    className="text-sm px-3 py-1 rounded-lg border border-brand-cyan/40 text-brand-cyan bg-brand-cyan/10 hover:bg-brand-cyan/20 transition-colors disabled:opacity-30">
                    {uploading ? <Loader2 className="size-3 animate-spin inline" /> : null}上传
                  </button>
                </div>
                <div className="flex gap-1 items-center flex-wrap">
                  {refImages.filter(img => !(shot.hiddenRefImageUrls || []).includes(img.url) && scriptData?.characters?.some((c: any) => c.name === img.name)).map((img, i) => (
                    <div key={`c-${i}`} className="relative group/thumb">
                      <img src={resolveImageUrl(img.url)} alt={img.name}
                        className="size-20 rounded object-cover border border-brand-cyan/30" />
                      <button onClick={() => onHideAutoImage(shot.id, img.url)}
                        className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-red-500/80 text-white opacity-0 group-hover/thumb:opacity-100">
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                  {uploadedImages.filter(img => img.type === "characters").map((img, i) => (
                    <div key={`up-c-${i}`} className="relative group/thumb">
                      <img src={resolveImageUrl(img.url)} alt={img.name}
                        className="size-20 rounded object-cover border border-white/40" />
                      <button onClick={() => onDeleteUploadedImage(shot.id, img.url)}
                        className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-red-500/80 text-white opacity-0 group-hover/thumb:opacity-100">
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 场景 */}
              <div className="mb-3">
                <div className="flex items-center gap-4 mb-1.5">
                  <span className="text-sm font-medium text-text-muted shrink-0">场景</span>
                  <button onClick={() => setLibraryType("scenes")}
                    className="text-sm px-3 py-1 rounded-lg border border-brand-cyan/40 text-brand-cyan hover:bg-brand-cyan/10 transition-colors">
                    资产库
                  </button>
                  <button onClick={() => { uploadTypeRef.current = "scenes"; fileInputRef.current?.click(); }} disabled={uploading}
                    className="text-sm px-3 py-1 rounded-lg border border-brand-cyan/40 text-brand-cyan bg-brand-cyan/10 hover:bg-brand-cyan/20 transition-colors disabled:opacity-30">
                    上传
                  </button>
                </div>
                <div className="flex gap-1 items-center flex-wrap">
                  {refImages.filter(img => !(shot.hiddenRefImageUrls || []).includes(img.url) && scriptData?.scenes?.some((s: any) => s.name === img.name)).map((img, i) => (
                    <div key={`s-${i}`} className="relative group/thumb">
                      <img src={resolveImageUrl(img.url)} alt={img.name}
                        className="size-20 rounded object-cover border border-accent-green/40" />
                      <button onClick={() => onHideAutoImage(shot.id, img.url)}
                        className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-red-500/80 text-white opacity-0 group-hover/thumb:opacity-100">
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                  {uploadedImages.filter(img => img.type === "scenes").map((img, i) => (
                    <div key={`up-s-${i}`} className="relative group/thumb">
                      <img src={resolveImageUrl(img.url)} alt={img.name}
                        className="size-20 rounded object-cover border border-white/40" />
                      <button onClick={() => onDeleteUploadedImage(shot.id, img.url)}
                        className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-red-500/80 text-white opacity-0 group-hover/thumb:opacity-100">
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 道具 */}
              <div className="mb-3">
                <div className="flex items-center gap-4 mb-1.5">
                  <span className="text-sm font-medium text-text-muted shrink-0">道具</span>
                  <button onClick={() => setLibraryType("props")}
                    className="text-sm px-3 py-1 rounded-lg border border-brand-cyan/40 text-brand-cyan hover:bg-brand-cyan/10 transition-colors">
                    资产库
                  </button>
                  <button onClick={() => { uploadTypeRef.current = "props"; fileInputRef.current?.click(); }} disabled={uploading}
                    className="text-sm px-3 py-1 rounded-lg border border-brand-cyan/40 text-brand-cyan bg-brand-cyan/10 hover:bg-brand-cyan/20 transition-colors disabled:opacity-30">
                    上传
                  </button>
                </div>
                <div className="flex gap-1 items-center flex-wrap">
                  {refImages.filter(img => !(shot.hiddenRefImageUrls || []).includes(img.url) && scriptData?.props?.some((p: any) => p.name === img.name)).map((img, i) => (
                    <div key={`p-${i}`} className="relative group/thumb">
                      <img src={resolveImageUrl(img.url)} alt={img.name}
                        className="size-20 rounded object-cover border border-yellow-500/40" />
                      <button onClick={() => onHideAutoImage(shot.id, img.url)}
                        className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-red-500/80 text-white opacity-0 group-hover/thumb:opacity-100">
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                  {uploadedImages.filter(img => img.type === "props").map((img, i) => (
                    <div key={`up-p-${i}`} className="relative group/thumb">
                      <img src={resolveImageUrl(img.url)} alt={img.name}
                        className="size-20 rounded object-cover border border-white/40" />
                      <button onClick={() => onDeleteUploadedImage(shot.id, img.url)}
                        className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-red-500/80 text-white opacity-0 group-hover/thumb:opacity-100">
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 音频参考（BGM/配音）——天翼云 audio_url，需搭配参考图 */}
              <div>
                <div className="flex items-center gap-4 mb-1.5">
                  <span className="text-sm font-medium text-text-muted shrink-0">音频</span>
                  <button onClick={() => audioInputRef.current?.click()} disabled={uploading}
                    className="text-sm px-3 py-1 rounded-lg border border-yellow-500/40 text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors disabled:opacity-30">
                    {uploading ? <Loader2 className="size-3 animate-spin inline" /> : null}上传音频
                  </button>
                </div>
                <input ref={audioInputRef} type="file" accept="audio/*" className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (!f.type.startsWith("audio/")) { toast("请选择音频文件（mp3/wav 等）", "error"); e.target.value = ""; return; }
                    setUploading(true);
                    try {
                      // 天翼云音频参考时长上限 15.2s，超长自动截取前 15 秒
                      const dur = await probeAudioDuration(f);
                      const url = await onUploadAudio(shot.id, f);
                      if (url) toast(dur > 15.2 ? `音频已添加（${Math.round(dur)}s 超上限，将截取前 15 秒），可用 @音频1 引用` : "音频已添加，可用 @音频1 引用", "success");
                      else toast("音频上传失败", "error");
                    } finally { setUploading(false); e.target.value = ""; }
                  }} />
                {shot.audioRef && (
                  <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-2 py-1.5">
                    <Music2 className="size-4 text-yellow-400 shrink-0" />
                    <span className="text-xs text-text-secondary truncate flex-1" title={shot.audioRef.name}>{shot.audioRef.name}</span>
                    <button onClick={() => onDeleteAudio(shot.id)} className="p-1 rounded text-text-muted hover:text-red-400">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* 无分类的上传图（兼容旧数据） */}
              {uploadedImages.filter(img => !img.type).length > 0 && (
                <div className="mb-3">
                  <div className="flex gap-1 items-center flex-wrap">
                    {uploadedImages.filter(img => !img.type).map((img, i) => (
                      <div key={`up-unt-${i}`} className="relative group/thumb">
                        <img src={resolveImageUrl(img.url)} alt={img.name}
                          className="size-20 rounded object-cover border border-white/20 opacity-60" />
                        <button onClick={() => onDeleteUploadedImage(shot.id, img.url)}
                          className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-red-500/80 text-white opacity-0 group-hover/thumb:opacity-100">
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 资产库选择弹窗（多选） */}
            {libraryType && projectId && (
              <AssetLibraryPicker
                projectId={projectId}
                type={libraryType}
                mode="multi"
                onSelect={async (items: any) => {
                  const list: any[] = Array.isArray(items) ? items : [items];
                  // 并行下载选中图片，保持选择顺序逐个加入参考图
                  const blobs = await Promise.all(list.map(async (item: any) => {
                    const url = item.image_url || "";
                    if (!url) return null;
                    // cache: no-store —— 绕开浏览器对 CDN 旧响应（无 CORS 头时期）的 fetch 缓存
                    try { return await fetch(resolveImageUrl(url), { cache: "no-store" }).then(r => r.blob()); } catch { return null; }
                  }));
                  for (let i = 0; i < list.length; i++) {
                    const blob = blobs[i];
                    if (!blob) continue;
                    const file = new File([blob], `${list[i].name || libraryType}.jpg`, { type: "image/jpeg" });
                    await onUploadRefImage(shot.id, file, libraryType);
                  }
                  setLibraryType(null);
                }}
                onClose={() => setLibraryType(null)}
              />
            )}
          </div>

          {/* Col 2: Video prompt + Duration + Resolution */}
          <div className="flex flex-col h-full min-h-0 space-y-3">
            {/* 视频提示词 + 生成按钮（右下角）— 撑满剩余空间 */}
            <div>
              <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-text-muted mb-2">视频提示词</h4>
              <div className="relative">
                <div ref={promptRef} contentEditable suppressContentEditableWarning
                  onInput={handlePromptInput} onKeyDown={handlePromptKeyDown}
                  className="w-full bg-surface-elevated border border-border-subtle rounded-xl px-4 py-3 text-xl text-text-primary outline-none focus:border-brand-cyan/30 transition-colors overflow-y-auto min-h-[600px] [&amp;:empty:before]:content-[attr(data-placeholder)] [&amp;:empty:before]:text-text-muted/30"
                  data-placeholder="描述这个镜头需要生成的视频内容...（输入 @ 引用参考图）" />
                {/* @mention dropdown */}
                {mentionOpen && mentionItems.length > 0 && (
                  <div ref={mentionRef}
                    className="fixed z-[100] w-72 max-h-40 overflow-y-auto rounded-xl border border-border-subtle bg-surface-overlay/98 shadow-xl backdrop-blur-xl p-1"
                    style={{ top: mentionPos.top, left: mentionPos.left }}>
                    {mentionItems.map((item, i) => (
                      <button key={item.url} onClick={() => insertMention(item.label)}
                        onMouseEnter={() => setMentionActiveIdx(i)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                          i === mentionActiveIdx ? "bg-brand-cyan/10 text-brand-cyan" : "text-text-secondary hover:bg-white/5"
                        }`}>
                        <span className="font-mono font-bold text-brand-cyan text-[10px]">{item.label}</span>
                        <span className="truncate text-text-muted text-[10px]">{item.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="absolute bottom-2 right-2">
                  <button onClick={handleGenerateClick}
                    disabled={!prompt.trim() || submitLockRef.current || locked}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white text-xs font-bold hover:shadow-glow-sm disabled:opacity-40 transition-all flex items-center gap-1.5">
                    {locked ? (
                      <>异常点击，已锁定 {remaining} 秒</>
                    ) : justSubmitted ? (
                      <><Loader2 className="size-3.5 animate-spin" /> 生成中...</>
                    ) : shotVideos.length > 0 ? "继续生成" : "生成视频"}
                  </button>
                </div>
              </div>
            </div>

            {/* Status & reference labels — outside flex-1 so textarea gets full space */}
            {isGenerating && (
              <div className="flex items-center gap-2 text-xs text-brand-cyan">
                <Loader2 className="size-3 animate-spin" /> 视频生成中，请耐心等待...
              </div>
            )}
            {(() => {
              // 基于视频列表的最新失败项（不用 interval——老数据 interval 残留会导致错误"复活"）
              const failedVideo = [...shotVideos].reverse().find(v => v.status === "failed");
              return failedVideo ? (
                <div className="flex items-center gap-2 text-xs text-red-400">
                  <AlertCircle className="size-3" /> {failedVideo.errorMessage || "生成失败，请重试"}
                </div>
              ) : null;
            })()}
            {(() => {
              const visibleRefs = refImages.filter(img => !(shot.hiddenRefImageUrls || []).includes(img.url));
              const typeRefs = visibleRefs.filter(img =>
                scriptData?.characters?.some((c: any) => c.name === img.name) ||
                scriptData?.scenes?.some((s: any) => s.name === img.name) ||
                scriptData?.props?.some((p: any) => p.name === img.name)
              );
              const typeUploads = uploadedImages.filter(img => img.type);
              if (typeRefs.length === 0 && typeUploads.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {typeRefs.map((img, i) => (
                    <span key={i} className="text-xs text-text-muted"><span className="font-mono font-bold text-brand-cyan">图{i + 1}</span> {img.name}</span>
                  ))}
                  {typeUploads.map((img, i) => (
                    <span key={`up-${i}`} className="text-xs text-text-muted"><span className="font-mono font-bold text-brand-cyan">图{typeRefs.length + i + 1}</span> {img.name}</span>
                  ))}
                </div>
              );
            })()}
            {/* 视频模型 + 比例 */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-text-muted">视频模型</span>
                <select
                  value={selectedVideoModel || ""}
                  onChange={(e) => onVideoModelChange?.(e.target.value)}
                  className="text-xs font-mono bg-surface-elevated border border-border-subtle rounded-lg px-2 py-1.5 text-text-primary outline-none focus:border-brand-cyan/50"
                >
                  {(videoModels?.length ? videoModels : []).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-border-subtle overflow-hidden">
                {["16:9", "9:16", "1:1"].map((r) => (
                  <button
                    key={r}
                    onClick={() => onAspectRatioChange?.(r)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold font-mono border transition-all",
                      aspectRatio === r
                        ? "bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30"
                        : "bg-surface-elevated text-text-muted hover:text-text-primary border-border-subtle"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* 视频时长 + 分辨率 row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-text-muted mb-2">视频时长</h4>
                <div className="flex gap-2 items-center">
                  {availableDurations.map((d) => (
                    <button key={d} onClick={() => setDuration(d)}
                      className={cn("px-3 py-1.5 rounded-lg text-xs font-bold font-mono border transition-all flex-1",
                        duration === d ? "bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30" : "bg-surface-elevated text-text-muted hover:text-text-primary border-border-subtle")}>
                      {d}s
                    </button>
                  ))}
                  <select
                    value={availableDurations.includes(duration) ? "" : String(duration)}
                    onChange={(e) => { const v = Number(e.target.value); if (v > 0) setDuration(v); }}
                    title="自定义时长"
                    className="px-2 py-1.5 rounded-lg text-xs font-bold font-mono border border-border-subtle bg-surface-elevated text-text-primary outline-none cursor-pointer"
                  >
                    <option value="">自定义…</option>
                    {customDurations.map((d) => (
                      <option key={d} value={d}>{d}s</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-text-muted mb-2">分辨率</h4>
                <div className="flex gap-2">
                  {resolutionOptions.slice(0, 3).map((r) => (
                    <button key={r} onClick={() => setResolution(r)}
                      className={cn("px-2 py-1.5 rounded-lg text-xs font-bold font-mono border transition-all flex-1",
                        effectiveResolution === r ? "bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30" : "bg-surface-elevated text-text-muted hover:text-text-primary border-border-subtle")}>
                      {r.replace("x", "×")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Col 3: Video results (multi-video, scrollable) */}
          <div className="flex flex-col h-full min-h-0">
            {shotVideos.length > 0 ? (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-3 p-0.5">
                {shotVideos.map((v, i) => renderVideoCard(v, i))}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-text-muted/50">暂无生成结果</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

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
                  onClick={() => onDeleteUploadedImage(shot.id, img.url)}
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
              multiple
              className="hidden"
              onChange={async (e) => {
                const fs = e.target.files; if (!fs?.length) return;
                // 无 accept 过滤：文件框显示所有文件，这里前端过滤图片类型
                const images = Array.from(fs).filter(f => f.type.startsWith("image/"));
                if (images.length < fs.length) toast("已跳过非图片文件", "error");
                if (images.length === 0) { e.target.value = ""; return; }
                setUploading(true);
                try {
                  for (const f of images) {
                    await onUploadRefImage(shot.id, f);
                  }
                } finally {
                  setUploading(false);
                  e.target.value = "";
                }
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
            mode="multi"
            onSelect={async (items: any) => {
              const list: any[] = Array.isArray(items) ? items : [items];
              // 并行下载选中图片，保持选择顺序逐个加入参考图
              const blobs = await Promise.all(list.map(async (item: any) => {
                const url = item.image_url || "";
                if (!url) return null;
                try { return await fetch(resolveImageUrl(url)).then(r => r.blob()); } catch { return null; }
              }));
              for (let i = 0; i < list.length; i++) {
                const blob = blobs[i];
                if (!blob) continue;
                const file = new File([blob], `${list[i].name || libraryType}.jpg`, { type: "image/jpeg" });
                await onUploadRefImage(shot.id, file, libraryType);
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
            placeholder="描述这个镜头需要生成的视频内容...&#10;&#10;提示：可用「图一」「图二」或「@图1」「@图2」引用下方参考图"
            className="w-full bg-surface-elevated border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/30 outline-none focus:border-brand-cyan/30 transition-colors resize-none"
          />
          {/* Reference image legend (matches visible images only) */}
          {(refImages.some(r => !(shot.hiddenRefImageUrls || []).includes(r.url)) || uploadedImages.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {refImages
                .filter(img => !(shot.hiddenRefImageUrls || []).includes(img.url))
                .map((img, i) => (
                <div key={`auto-${i}`} className="flex items-center gap-1.5 text-[10px] text-text-muted">
                  <span className="font-mono font-bold text-brand-cyan">图{i + 1}</span>
                  <span className="truncate max-w-[120px]">{img.name}</span>
                </div>
              ))}
              {uploadedImages.filter(img => img.url).map((img, i) => (
                <div key={`up-${i}`} className="flex items-center gap-1.5 text-[10px] text-text-muted">
                  <span className="font-mono font-bold text-brand-cyan">图{refImages.filter(r => !(shot.hiddenRefImageUrls || []).includes(r.url)).length + i + 1}</span>
                  <span className="truncate max-w-[120px]">{img.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── 视频时长 ───────────────────────── */}
        <div>
          <h4 className="text-[10px] font-bold font-mono uppercase tracking-wider text-text-muted mb-2">视频时长</h4>
          <div className="flex gap-2 items-center">
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
            <select
              value={availableDurations.includes(duration) ? "" : String(duration)}
              onChange={(e) => { const v = Number(e.target.value); if (v > 0) setDuration(v); }}
              title="自定义时长"
              className="px-2 py-2 rounded-lg text-xs font-bold font-mono border border-border-subtle bg-surface-elevated text-text-primary outline-none cursor-pointer"
            >
              <option value="">自定义…</option>
              {customDurations.map((d) => (
                <option key={d} value={d}>{d}s</option>
              ))}
            </select>
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

        {/* ─── 视频生成（多视频列表）───────────────────────── */}
        <div>
          {shotVideos.length > 0 ? (
            <div className="space-y-2">
              {shotVideos.map((v, i) => renderVideoCard(v, i))}
              {/* 继续生成（追加新视频） */}
              <button
                onClick={handleGenerateClick}
                disabled={!prompt.trim() || submitLockRef.current || locked}
                className="w-full py-2.5 rounded-xl bg-brand-cyan/10 text-brand-cyan text-xs font-bold border border-dashed border-brand-cyan/30 hover:bg-brand-cyan/20 transition-all disabled:opacity-30 flex items-center justify-center gap-1.5"
              >
                {justSubmitted ? (
                  <><Loader2 className="size-3.5 animate-spin" /> 生成中...</>
                ) : (
                  <><Plus className="size-3.5" /> 继续生成</>
                )}
              </button>
              {locked && (
                <div className="flex items-center gap-1.5 text-[10px] text-red-400">
                  <AlertCircle className="size-3 shrink-0" />
                  检测到异常点击，已锁定 {remaining} 秒
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleGenerateClick}
              disabled={!prompt.trim() || isGenerating || submitLockRef.current || locked}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white text-xs font-bold uppercase tracking-wider hover:shadow-glow-sm disabled:opacity-30 transition-all flex items-center justify-center gap-2"
            >
              {locked ? (
                <>检测到异常点击，已锁定 {remaining} 秒</>
              ) : justSubmitted ? (
                <><Loader2 className="size-4 animate-spin" /> 生成中...</>
              ) : (
                <><Video className="size-4" /> 生成视频</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
