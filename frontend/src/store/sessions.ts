"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { indexedDBStorage } from "@/lib/indexeddb-storage";

// 安全上限：最多保留 200 个会话（IndexedDB 容量远大于 localStorage，设一个合理上限避免无限增长）
const MAX_SESSIONS = 200;

/** 淘汰最早的会话直到低于数量上限（sessions 已按最新在前排序） */
function trimSessions(sessions: Session[], maxCount: number): Session[] {
  if (sessions.length <= maxCount) return sessions;
  let result = [...sessions];
  while (result.length > maxCount) {
    result = result.slice(0, -1); // 扔掉最旧（数组末尾）的会话
  }
  return result;
}

export interface GenerationResult {
  id: string;
  prompt: string;
  modelId: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  progress: number;
  imageUrls?: string[];
  videoPosterUrl?: string;
  videoUrl?: string;
  errorMessage?: string;
  createdAt: string;
  taskId?: string;           // Backend task_id for cancellation
  creationId?: string;       // Backend creations table UUID (for deletion on cancel)
  imageParams?: { size: string; batch: number; style: string; negativePrompt?: string };
  videoParams?: { duration: number; resolution?: string; camera?: string; size?: string; audioUrl?: string };
  references?: string[];
  referenceMode?: string;
}

export interface Session {
  id: string;
  title: string;
  kind: "image" | "video";
  createdAt: string;
  generations: GenerationResult[];
}

interface SessionState {
  sessions: Session[];
  activeId: string | null;
  create: (kind: Session["kind"], title?: string) => string;
  switchTo: (id: string) => void;
  remove: (id: string) => void;
  addGeneration: (sessionId: string, gen: GenerationResult) => void;
  updateGeneration: (sessionId: string, genId: string, patch: Partial<GenerationResult>) => void;
  removeGeneration: (sessionId: string, genId: string) => void;
}

let _sid = 0;
function genId(): string {
  _sid += 1;
  return `sess_${_sid}_${Date.now().toString(36)}`;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeId: null,

      create: (kind, title) => {
        const id = genId();
        const now = new Date().toISOString();
        const session: Session = {
          id,
          title: title || `新${kind === "image" ? "图片" : "视频"}对话`,
          kind,
          createdAt: now,
          generations: [],
        };
        set((s) => ({ sessions: [session, ...s.sessions], activeId: id }));
        return id;
      },

      switchTo: (id) => {
        set({ activeId: id });
      },

      remove: (id) => {
        set((s) => ({
          sessions: s.sessions.filter((x) => x.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
        }));
      },

      addGeneration: (sessionId, gen) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? { ...sess, generations: [...sess.generations, gen] }
              : sess,
          ),
        }));
      },

      updateGeneration: (sessionId, genId, patch) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  generations: sess.generations.map((g) =>
                    g.id === genId ? { ...g, ...patch } : g,
                  ),
                }
              : sess,
          ),
        }));
      },

      removeGeneration: (sessionId, genId) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  generations: sess.generations.filter((g) => g.id !== genId),
                }
              : sess,
          ),
        }));
      },
    }),
    {
      name: "spiritlens-sessions",
      version: 1,
      storage: createJSONStorage(() => indexedDBStorage), // 使用 IndexedDB，容量可达 GB 级别
      // 限制持久化会话数量，避免无限增长
      partialize: (state) => {
        const trimmed = trimSessions(state.sessions, MAX_SESSIONS);
        const dropped = state.sessions.length - trimmed.length;
        if (dropped > 0) {
          console.info(`[sessions] 已自动淘汰 ${dropped} 个旧会话（上限 ${MAX_SESSIONS} 个）`);
        }
        return {
          ...state,
          sessions: trimmed,
          activeId: trimmed.some((s) => s.id === state.activeId) ? state.activeId : (trimmed[0]?.id ?? null),
        };
      },
    },
  ),
);
