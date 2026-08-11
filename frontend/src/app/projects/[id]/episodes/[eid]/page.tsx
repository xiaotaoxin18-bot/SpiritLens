"use client";

import { useEffect, useState, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, FileText, Users, Clapperboard, Film,
  Loader2, Sun, Moon, Cpu, Save, CheckCircle, HelpCircle,
  FolderOpen, Globe, Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/store/theme";
import { api } from "@/services/api";
import { useToast } from "@/components/ui/Toast";
import ScriptStage from "@/components/projects/script/ScriptStage";
import StageAssets from "@/components/projects/script/StageAssets";
import StageDirector from "@/components/projects/script/StageDirector";
import StageExport from "@/components/projects/script/StageExport";

type Stage = "script" | "assets" | "director" | "export";

const STAGE_ITEMS = [
  { id: "script" as Stage, label: "剧本与故事", icon: FileText, sub: "阶段 01" },
  { id: "assets" as Stage, label: "角色与场景", icon: Users, sub: "阶段 02" },
  { id: "director" as Stage, label: "导演工作台", icon: Clapperboard, sub: "阶段 03" },
  { id: "export" as Stage, label: "成片与导出", icon: Film, sub: "阶段 04" },
];

interface Episode {
  id: string;
  project_id: string;
  episode_number: number;
  title: string;
  status: string;
  script_content: string | null;
}

interface Project {
  id: string;
  name: string;
}

export default function EpisodeDetailPage({
  params,
}: {
  params: Promise<{ id: string; eid: string }>;
}) {
  const resolved = use(params);
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { theme, toggle: toggleTheme } = useTheme();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStage, setCurrentStage] = useState<Stage>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`episode-stage-${resolved.eid}`);
      if (saved && STAGE_ITEMS.some(s => s.id === saved)) return saved as Stage;
    }
    return "script";
  });
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [showSaveStatus, setShowSaveStatus] = useState(false);
  const saveTimeoutRef = useRef<any>(null);
  const hideStatusTimeoutRef = useRef<any>(null);

  useEffect(() => { setMounted(true); }, []);

  // Restore saved stage after SSR hydration (localStorage not available during SSR)
  useEffect(() => {
    const saved = localStorage.getItem(`episode-stage-${resolved.eid}`);
    if (saved && STAGE_ITEMS.some(s => s.id === saved) && saved !== currentStage) {
      setCurrentStage(saved as Stage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved.eid]);

  useEffect(() => {
    if (mounted && !isAuthenticated) router.push("/auth/login");
  }, [mounted, isAuthenticated, router]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ep, proj] = await Promise.all([
        api.get<Episode>(`/api/v1/projects/${resolved.id}/episodes/${resolved.eid}`),
        api.get<Project>(`/api/v1/projects/${resolved.id}`),
      ]);
      setEpisode(ep);
      setProject(proj);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [resolved.id, resolved.eid]);

  useEffect(() => {
    if (isAuthenticated && mounted) loadData();
  }, [loadData, isAuthenticated, mounted]);

  // Persist current stage across refreshes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(`episode-stage-${resolved.eid}`, currentStage);
    }
  }, [currentStage, resolved.eid]);

  // Auto-save indicator
  useEffect(() => {
    if (!episode) return;
    setSaveStatus("unsaved");
    setShowSaveStatus(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        setSaveStatus("saved");
      } catch {
        // ignore
      }
    }, 1000);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [episode]);

  useEffect(() => {
    if (saveStatus === "saved") {
      if (hideStatusTimeoutRef.current) clearTimeout(hideStatusTimeoutRef.current);
      hideStatusTimeoutRef.current = setTimeout(() => setShowSaveStatus(false), 2000);
    } else if (saveStatus === "saving") {
      setShowSaveStatus(true);
      if (hideStatusTimeoutRef.current) clearTimeout(hideStatusTimeoutRef.current);
    }
    return () => { if (hideStatusTimeoutRef.current) clearTimeout(hideStatusTimeoutRef.current); };
  }, [saveStatus]);

  const displayEpisodeTitle = episode?.title || `第 ${episode?.episode_number} 集`;
  const episodeLabel = project
    ? `${project.name} / ${displayEpisodeTitle}`
    : displayEpisodeTitle;

  const renderStage = () => {
    switch (currentStage) {
      case "script":
        return (
          <ScriptStage
            projectId={resolved.id}
            episodeId={resolved.eid}
            projectName={project?.name || ""}
            episodeTitle={displayEpisodeTitle}
          />
        );
      case "assets":
        return (
          <StageAssets
            projectId={resolved.id}
            episodeId={resolved.eid}
          />
        );
      case "director":
        return (
          <StageDirector
            projectId={resolved.id}
            episodeId={resolved.eid}
          />
        );
      case "export":
        return (
          <StageExport
            projectId={resolved.id}
            episodeId={resolved.eid}
            projectName={project?.name}
            episodeTitle={displayEpisodeTitle}
          />
        );
    }
  };

  const handleExit = () => {
    router.push(`/projects/${resolved.id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-base flex items-center justify-center">
        <Loader2 className="size-6 text-text-muted animate-spin" />
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="min-h-screen bg-surface-base flex items-center justify-center">
        <Link href={`/projects/${resolved.id}`} className="text-brand-cyan text-sm hover:underline">
          ← 返回项目概览
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-surface-base overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 bg-surface-card border-r border-border-subtle h-screen fixed left-0 top-0 flex flex-col z-50 select-none">
        {/* Logo + Exit */}
        <div className="p-6 border-b border-border-subtle">
          <div className="flex items-center gap-3 mb-6">
            <div className="size-8 rounded-xl bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center text-white font-bold text-sm shrink-0">
              S
            </div>
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold text-text-primary tracking-wider">SpiritLens</h1>
              <p className="text-[10px] text-text-muted tracking-widest">专业版</p>
            </div>
          </div>
          <button
            onClick={handleExit}
            className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-text-muted hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="size-3 hover:-translate-x-1 transition-transform" />
            返回项目概览
          </button>
        </div>

        {/* Project/Episode info */}
        <div className="px-6 py-4 border-b border-border-subtle">
          <div className="text-[10px] text-text-muted uppercase tracking-widest mb-1">当前项目</div>
          <Link href={`/projects/${resolved.id}`} className="text-xs text-brand-cyan hover:underline truncate block mb-2 text-left">
            <FolderOpen className="size-3 inline mr-1" />{project?.name || "未命名项目"}
          </Link>
          <div className="text-[10px] text-text-muted uppercase tracking-widest mb-1">当前集数</div>
          <div className="text-sm font-medium text-text-secondary truncate font-mono">{displayEpisodeTitle}</div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 space-y-1">
          {STAGE_ITEMS.map((item) => {
            const isActive = currentStage === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentStage(item.id)}
                className={cn(
                  "w-full flex items-center justify-between px-6 py-4 transition-all duration-200 group relative border-l-2",
                  isActive
                    ? "border-brand-cyan bg-brand-cyan/5 text-text-primary"
                    : "border-transparent text-text-muted hover:text-text-secondary hover:bg-surface-light"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn("size-4", isActive ? "text-brand-cyan" : "text-text-muted")} />
                  <span className="font-medium text-xs tracking-wider uppercase">{item.label}</span>
                </div>
                <span className={cn("text-[10px] font-mono", isActive ? "text-text-muted" : "text-text-muted/50")}>{item.sub}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="p-6 border-t border-border-subtle space-y-4">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between text-text-muted hover:text-text-primary cursor-pointer transition-colors"
          >
            <span className="font-mono text-[10px] uppercase tracking-widest">{theme === "dark" ? "亮色主题" : "暗色主题"}</span>
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <div className="flex gap-3 pt-2">
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); toast("功能建设中，敬请期待", "info"); }}
              className="flex items-center gap-1.5 text-text-muted hover:text-brand-cyan transition-colors"
            >
              <Globe className="size-3.5" />
              <span className="font-mono text-[10px] tracking-wide">官网</span>
            </a>
            <span className="text-border-subtle">|</span>
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white px-3 py-1.5 text-[10px] font-bold tracking-wide hover:shadow-glow-sm transition-all"
              title="返回首页"
            >
              <Home className="size-3.5" />
              <span>返回首页</span>
            </button>
          </div>
          <div className="text-[9px] text-text-muted font-mono tracking-wide opacity-60 pt-1">
            SpiritLens v0.1
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-72 flex-1 h-screen overflow-hidden relative">
        {renderStage()}

        {/* Save status */}
        {showSaveStatus && (
          <div className="absolute top-4 right-6 pointer-events-none flex items-center gap-2 text-xs font-mono text-text-muted bg-surface-overlay/80 px-2 py-1 rounded-full backdrop-blur-sm z-50">
            {saveStatus === "saving" ? (
              <><Save className="size-3 animate-pulse" />保存中...</>
            ) : (
              <><CheckCircle className="size-3 text-accent-green" />已保存</>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
