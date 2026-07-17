"use client";

// ─── Key types for StageDirector ───────────────────────────

export type KeyframeStatus = "pending" | "generating" | "completed" | "failed";

export interface Keyframe {
  id: string;
  type: "start" | "end";
  visualPrompt: string;
  imageUrl?: string;
  status: KeyframeStatus;
}

export type VideoStatus = "pending" | "generating" | "completed" | "failed";

export interface VideoInterval {
  id: string;
  startKeyframeId: string;
  endKeyframeId: string;
  duration: number;
  videoUrl?: string;
  videoPrompt?: string;
  resolution?: string;
  status: VideoStatus;
}

export type CameraMovement =
  | "fixed" | "pan" | "tilt" | "zoom" | "track" | "crane"
  | "dolly" | "handheld" | "aerial" | "steadycam";

export type DubbingMode = "narration" | "dialogue";

export interface ShotDubbing {
  mode: DubbingMode;
  text: string;
  status: "pending" | "generating" | "completed" | "failed";
  audioUrl?: string;
  error?: string;
}

export interface Shot {
  id: string;
  sceneId: number | string;
  sceneName?: string;
  actionSummary: string;
  cameraMovement: CameraMovement;
  characters: string[];
  props: string[];
  keyframes: Keyframe[];
  interval?: VideoInterval;
  dubbing?: ShotDubbing;
  uploadedRefImages?: { name: string; url: string }[];
  hiddenRefImageUrls?: string[];
}

// ─── Defaults ──────────────────────────────────────────────

export const CAMERA_MOVEMENTS: { value: CameraMovement; label: string }[] = [
  { value: "fixed", label: "固定镜头" },
  { value: "pan", label: "平移" },
  { value: "tilt", label: "俯仰" },
  { value: "zoom", label: "变焦" },
  { value: "track", label: "跟拍" },
  { value: "dolly", label: "推拉" },
  { value: "crane", label: "升降" },
  { value: "handheld", label: "手持" },
  { value: "aerial", label: "航拍" },
  { value: "steadycam", label: "稳定器" },
];
