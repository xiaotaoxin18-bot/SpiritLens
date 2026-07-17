"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface GenerationResult {
  id: string;
  prompt: string;
  modelId: string;
  status: "running" | "succeeded" | "failed";
  progress: number;
  imageUrls?: string[];
  videoPosterUrl?: string;
  videoUrl?: string;
  errorMessage?: string;
  createdAt: string;
  taskId?: string;           // Backend task_id for cancellation
  creationId?: string;       // Backend creations table UUID (for deletion on cancel)
  imageParams?: { size: string; batch: number; style: string; negativePrompt?: string };
  videoParams?: { duration: number; resolution?: string; camera?: string; size?: string };
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
    },
  ),
);
