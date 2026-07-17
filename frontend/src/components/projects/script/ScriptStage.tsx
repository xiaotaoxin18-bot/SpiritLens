"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  FileText, Settings, Sparkles, ChevronRight, Loader2, Save,
  Wand2, Plus, Trash2, GripVertical, Eye, EyeOff, AlertTriangle,
  CheckCircle, X, RotateCcw, ChevronDown, Maximize2, Minimize2,
  BookOpen, ListTree, Users, Clapperboard, Package,
  Play, Pause, MessageSquare, Film,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";

// ─── Types ──────────────────────────────────────────────────────

interface EpisodeData {
  id: string;
  episode_number: number;
  title: string;
  status: string;
  script_content: string | null;
  config?: Record<string, any> | null;
}

interface ProjectData {
  id: string;
  name: string;
}

interface TextModel {
  id: string;
  name: string;
  vendor: string;
  type: string;
  is_enabled: boolean;
}

interface Storyboard {
  id: string;
  episode_id: string;
  sequence_number: number;
  scene_description: string | null;
  action_description: string | null;
  shot_type: string | null;
  dialogue: string | null;
  characters: string | null;
  props: string | null;
}

// ─── Constants ──────────────────────────────────────────────────

const DURATION_PRESETS = [
  { label: "30s 广告", value: "30s" },
  { label: "60s 预告", value: "60s" },
  { label: "2min 片花", value: "120s" },
  { label: "5min 短片", value: "300s" },
  { label: "自定义", value: "custom" },
];

const STYLE_PRESETS = [
  { label: "🌟 日式动漫", value: "anime" },
  { label: "🎨 2D动画", value: "2d-animation" },
  { label: "👾 3D动画", value: "3d-animation" },
  { label: "🌌 赛博朋克", value: "cyberpunk" },
  { label: "🖼️ 油画风格", value: "oil-painting" },
  { label: "🎬 真人影视", value: "live-action" },
  { label: "✨ 自定义", value: "custom" },
];

const SHOT_TYPE_LABELS: Record<string, string> = {
  wide: "全景",
  full: "全",
  medium: "中景",
  closeup: "近景",
  extreme_closeup: "特写",
};

const SHOT_TYPE_COLORS: Record<string, string> = {
  wide: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  full: "text-green-400 bg-green-500/10 border-green-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  closeup: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  extreme_closeup: "text-red-400 bg-red-500/10 border-red-500/20",
};

// ─── Props ──────────────────────────────────────────────────────

interface ScriptStageProps {
  projectId: string;
  episodeId: string;
  projectName: string;
  episodeTitle: string;
}

export default function ScriptStage({
  projectId,
  episodeId,
  projectName,
  episodeTitle,
}: ScriptStageProps) {
  // ── State ────────────────────────────────────────────────────
  const [episode, setEpisode] = useState<EpisodeData | null>(null);
  const [loading, setLoading] = useState(true);

  // Script content
  const [scriptContent, setScriptContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved">("saved");
  const saveTimerRef = useRef<any>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Config panel
  const [showConfig, setShowConfig] = useState(false);
  const [showManualEditor, setShowManualEditor] = useState(false);
  const [config, setConfig] = useState({
    projectTitle: "",
    generationMode: "novel",
    outputLanguage: "中文",
    aspectRatio: "16:9",
    targetDuration: "",
    visualStyle: "",
    customDurationInput: "",
    customStyleInput: "",
  });
  const [qualityControl, setQualityControl] = useState(true);
  const [isInferringStyle, setIsInferringStyle] = useState(false);
  const styleInputRef = useRef<HTMLInputElement>(null);

  // AI models
  const [models, setModels] = useState<TextModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);

  // AI generation
  const [showGeneratePanel, setShowGeneratePanel] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [continueDirection, setContinueDirection] = useState("");
  const [continuing, setContinuing] = useState(false);

  // Storyboard / deconstruction
  const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
  const [loadingStoryboards, setLoadingStoryboards] = useState(false);
  const [showDeconstruction, setShowDeconstruction] = useState(false);
  const [breakingDown, setBreakingDown] = useState(false);

  // Extracted entities
  const [extractedChars, setExtractedChars] = useState<string[]>([]);
  const [extractedProps, setExtractedProps] = useState<string[]>([]);
  const [showEntityPanel, setShowEntityPanel] = useState(false);
  // Structured scene breakdown data
  const [structureData, setStructureData] = useState<{
    characters: { name: string; gender?: string; personality?: string; description?: string }[];
    scenes: { name: string; location?: string; time?: string; atmosphere?: string }[];
    props: { name: string; category?: string; description?: string }[];
  } | null>(null);

  // ── Load episode ────────────────────────────────────────────

  const loadEpisode = useCallback(async () => {
    try {
      const ep = await api.get<EpisodeData>(
        `/api/v1/projects/${projectId}/episodes/${episodeId}`
      );
      setEpisode(ep);
      setScriptContent(ep.script_content || "");
      // Restore config from backend
      if (ep.config) {
        setConfig((prev) => ({ ...prev, ...ep.config }));
        if (ep.config.model_id) setSelectedModel(ep.config.model_id);
      }
    } catch (e) {
      console.warn("[ScriptStage] Failed to load episode", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, episodeId]);

  const loadModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const data = await api.get<{ models: TextModel[] }>("/api/v1/models", {
        type: "text",
      });
      const enabled = (data.models || []).filter((m) => m.is_enabled);
      setModels(enabled);
      if (enabled.length > 0 && !selectedModel) {
        setSelectedModel(enabled[0].id);
      }
    } catch (e) {
      console.warn("[ScriptStage] Failed to load models", e);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  const loadStoryboards = useCallback(async () => {
    setLoadingStoryboards(true);
    try {
      const data = await api.get<{ total: number; storyboards: Storyboard[] }>(
        `/api/v1/projects/${projectId}/episodes/${episodeId}/storyboards`
      );
      setStoryboards(data.storyboards || []);

      // Extract unique characters and props from storyboards
      const chars = new Set<string>();
      const props = new Set<string>();
      for (const sb of data.storyboards || []) {
        try {
          if (sb.characters) {
            JSON.parse(sb.characters).forEach((c: string) => chars.add(c));
          }
        } catch {}
        try {
          if (sb.props) {
            JSON.parse(sb.props).forEach((p: string) => props.add(p));
          }
        } catch {}
      }
      setExtractedChars(Array.from(chars));
      setExtractedProps(Array.from(props));
    } catch (e) {
      console.warn("[ScriptStage] Failed to load storyboards", e);
    } finally {
      setLoadingStoryboards(false);
    }
  }, [projectId, episodeId]);

  useEffect(() => {
    loadEpisode();
    loadModels();
  }, [loadEpisode, loadModels]);

  useEffect(() => {
    if (episode?.script_content) {
      loadStoryboards();
    }
  }, [episode?.script_content]);

  // ── Auto-save ──────────────────────────────────────────────

  const saveScript = useCallback(
    async (content: string) => {
      setSaving(true);
      try {
        await api.put(
          `/api/v1/projects/${projectId}/episodes/${episodeId}`,
          { script_content: content }
        );
        setSaveStatus("saved");
      } catch (e) {
        console.warn("[ScriptStage] Failed to save script", e);
      } finally {
        setSaving(false);
      }
    },
    [projectId, episodeId]
  );

  const handleScriptChange = (value: string) => {
    setScriptContent(value);
    setSaveStatus("unsaved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveScript(value);
    }, 1500);
  };

  // ── Config auto-save ──────────────────────────────────────

  const configTimerRef = useRef<any>(null);
  const saveConfig = useCallback(async (cfg: typeof config) => {
    try {
      await api.put(
        `/api/v1/projects/${projectId}/episodes/${episodeId}`,
        {
          config: { ...cfg, model_id: selectedModel },
        }
      );
    } catch (e) {
      console.warn("[ScriptStage] Failed to save config", e);
    }
  }, [projectId, episodeId, selectedModel]);

  // Debounced config save — fires when config or selectedModel changes
  useEffect(() => {
    if (!episode) return;
    if (configTimerRef.current) clearTimeout(configTimerRef.current);
    configTimerRef.current = setTimeout(() => {
      saveConfig(config);
    }, 2000);
    return () => {
      if (configTimerRef.current) clearTimeout(configTimerRef.current);
    };
  }, [config, selectedModel, episode, saveConfig]);

  // ── AI Generate ────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!generatePrompt.trim() || generating) return;
    setGenerating(true);
    try {
      const res = await api.post<{ content: string }>(
        `/api/v1/projects/${projectId}/episodes/${episodeId}/script/generate`,
        {
          prompt: generatePrompt.trim(),
          duration: config.targetDuration === "custom" ? config.customDurationInput : config.targetDuration,
          language: config.outputLanguage,
          style: config.visualStyle === "custom" ? config.customStyleInput : config.visualStyle,
          model_id: selectedModel || undefined,
        }
      );
      const newContent = scriptContent
        ? scriptContent + "\n\n" + res.content
        : res.content;
      setScriptContent(newContent);
      await saveScript(newContent);
      setShowGeneratePanel(false);
      setGeneratePrompt("");

      // Auto-run breakdown after generation
      if (newContent.trim()) {
        setBreakingDown(true);
        try {
          const data = await api.post<{ total: number; storyboards: Storyboard[] }>(
            `/api/v1/projects/${projectId}/episodes/${episodeId}/storyboards/breakdown`,
          );
          setStoryboards(data.storyboards || []);
          setShowDeconstruction(true);
          const chars = new Set<string>();
          const props = new Set<string>();
          for (const sb of data.storyboards || []) {
            try { if (sb.characters) JSON.parse(sb.characters).forEach((c: string) => chars.add(c)); } catch {}
            try { if (sb.props) JSON.parse(sb.props).forEach((p: string) => props.add(p)); } catch {}
          }
          setExtractedChars(Array.from(chars));
          setExtractedProps(Array.from(props));
        } catch (e) {
          console.warn("[ScriptStage] Storyboard breakdown failed", e);
        } finally {
          setBreakingDown(false);
        }
      }
    } catch (e) {
      console.warn("[ScriptStage] AI generation failed", e);
    } finally {
      setGenerating(false);
    }
  };

  // ── AI Continue ────────────────────────────────────────────

  const handleContinue = async () => {
    if (!continueDirection.trim() || continuing || !scriptContent.trim()) return;
    setContinuing(true);
    try {
      const res = await api.post<{ content: string }>(
        `/api/v1/projects/${projectId}/episodes/${episodeId}/script/continue`,
        {
          direction: continueDirection.trim(),
          model_id: selectedModel || undefined,
        }
      );
      const newContent = scriptContent + "\n\n" + res.content;
      setScriptContent(newContent);
      handleScriptChange(newContent);
      setContinueDirection("");
    } catch (e) {
      console.warn("[ScriptStage] AI continue failed", e);
    } finally {
      setContinuing(false);
    }
  };

  // ── AI Breakdown ───────────────────────────────────────────

  const handleBreakdown = async () => {
    if (!scriptContent.trim() || breakingDown) return;
    setBreakingDown(true);
    try {
      // Step 0: Save script to backend first (structure API reads from DB)
      await saveScript(scriptContent);

      // Step 1: Parse script structure (characters, scenes, props)
      let structData: {
        characters: { name: string; gender?: string; personality?: string; description?: string }[];
        scenes: { name: string; location?: string; time?: string; atmosphere?: string }[];
        props: { name: string; category?: string; description?: string }[];
      } | null = null;
      try {
        structData = await api.post<{
          characters: { name: string; gender?: string; personality?: string; description?: string }[];
          scenes: { name: string; location?: string; time?: string; atmosphere?: string }[];
          props: { name: string; category?: string; description?: string }[];
        }>(
          `/api/v1/projects/${projectId}/episodes/${episodeId}/script/structure`,
        );
        setStructureData(structData);
        // Immediately save structure data to backend (no debounce)
        if (structData && (structData.characters?.length || structData.scenes?.length || structData.props?.length)) {
          const newConfig = { ...config, structureData: structData, model_id: selectedModel };
          setConfig(newConfig);
          try {
            await api.put(`/api/v1/projects/${projectId}/episodes/${episodeId}`, { config: newConfig });
          } catch (e) { console.warn("[ScriptStage] Save structure config failed", e); }
        }
      } catch (e) {
        console.warn("[ScriptStage] Structure parsing failed (non-critical)", e);
      }

      // Step 2: Break down into storyboards
      const data = await api.post<{ total: number; storyboards: Storyboard[] }>(
        `/api/v1/projects/${projectId}/episodes/${episodeId}/storyboards/breakdown`,
      );
      setStoryboards(data.storyboards || []);
      setShowDeconstruction(true);

      // Extract entity names from storyboards
      const chars = new Set<string>();
      const props = new Set<string>();
      for (const sb of data.storyboards || []) {
        try { if (sb.characters) JSON.parse(sb.characters).forEach((c: string) => chars.add(c)); } catch {}
        try { if (sb.props) JSON.parse(sb.props).forEach((p: string) => props.add(p)); } catch {}
      }
      // Also add names from structure data
      if (structData) {
        structData.characters.forEach((c) => chars.add(c.name));
        structData.props.forEach((p) => props.add(p.name));
      }
      setExtractedChars(Array.from(chars));
      setExtractedProps(Array.from(props));
    } catch (e) {
      console.warn("[ScriptStage] AI breakdown failed", e);
    } finally {
      setBreakingDown(false);
    }
  };

  // ── Edit storyboard ───────────────────────────────────────

  const storyboardSaveTimers = useRef<Record<string, any>>({});

  const updateStoryboard = (
    sbId: string,
    field: string,
    value: string
  ) => {
    setStoryboards((prev) => {
      const updated = prev.map((sb) =>
        sb.id === sbId ? { ...sb, [field]: value } : sb
      );

      // Debounced save to backend (use the updated storyboard)
      if (storyboardSaveTimers.current[sbId]) {
        clearTimeout(storyboardSaveTimers.current[sbId]);
      }
      storyboardSaveTimers.current[sbId] = setTimeout(async () => {
        const sb = updated.find((s) => s.id === sbId);
        if (!sb) return;
        const payload: Record<string, string> = {};
        // Map the changed field to API field name
        const fieldMapping: Record<string, string> = {
          scene_description: "scene_description",
          action_description: "action_description",
          shot_type: "shot_type",
          dialogue: "dialogue",
          characters: "characters",
          props: "props",
        };
        const apiField = fieldMapping[field] || field;
        payload[apiField] = (sb as any)[field] || "";
        try {
          await api.put(
            `/api/v1/projects/${projectId}/episodes/${episodeId}/storyboards/${sbId}`,
            payload
          );
        } catch (e) {
          console.warn("[ScriptStage] Failed to save storyboard", e);
        }
      }, 2000);

      return updated;
    });
  };

  // ── Derived state ─────────────────────────────────────────

  const hasScript = !!scriptContent.trim();
  const hasStoryboards = storyboards.length > 0;

  // ── Loading state ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="size-6 text-text-muted animate-spin" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ─── Top toolbar ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border-subtle bg-surface-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-text-primary">
            <FileText className="size-4 text-brand-cyan" />
            <span className="font-medium">{episodeTitle}</span>
          </div>
          <span className="text-text-muted text-[10px] font-mono border border-border-subtle px-2 py-0.5 rounded">
            剧本编辑器
          </span>
        </div>

        {/* Save indicator */}
        <div className="flex items-center gap-2 text-[10px] font-mono">
          {saving ? (
            <span className="text-text-muted flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              保存中
            </span>
          ) : saveStatus === "saved" ? (
            <span className="text-accent-green flex items-center gap-1">
              <CheckCircle className="size-3" />
              已保存
            </span>
          ) : (
            <span className="text-yellow-400 flex items-center gap-1">
              <AlertTriangle className="size-3" />
              未保存
            </span>
          )}
        </div>
      </div>

      {/* ─── Main: Config Panel | Editor ──────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ═══ Config Panel (left) ═══════════════════════════ */}
        <div className="w-80 shrink-0 border-r border-border-subtle bg-surface-card/40 overflow-y-auto flex flex-col">
          {/* Header */}
          <div className="h-12 px-5 border-b border-border-subtle flex items-center shrink-0">
            <div className="flex items-center gap-2">
              <Settings className="size-4 text-text-muted" />
              <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">项目配置</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {/* 项目标题 */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">项目标题</label>
              <input
                value={config.projectTitle}
                onChange={(e) => setConfig((c) => ({ ...c, projectTitle: e.target.value }))}
                placeholder="输入项目名称..."
                className="w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2.5 text-xs text-text-primary placeholder:text-text-muted/40 outline-none focus:border-brand-cyan/50 transition-all"
              />
            </div>

            {/* 创作模式 */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">创作模式</label>
              <div className="space-y-1.5">
                <button
                  onClick={() => setConfig((c) => ({ ...c, generationMode: "novel" }))}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg border text-xs transition-all",
                    config.generationMode === "novel"
                      ? "bg-brand-cyan/10 border-brand-cyan/30 text-text-primary"
                      : "bg-surface-card border-border-subtle text-text-muted hover:border-border-glow"
                  )}
                >
                  <div className="font-bold text-[11px]">小说生成分镜</div>
                  <div className="text-[9px] opacity-70 mt-0.5">适合粘贴小说、章节正文、故事大纲，由系统自动规划镜头。</div>
                </button>
                <button
                  onClick={() => setConfig((c) => ({ ...c, generationMode: "storyboard" }))}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg border text-xs transition-all",
                    config.generationMode === "storyboard"
                      ? "bg-brand-cyan/10 border-brand-cyan/30 text-text-primary"
                      : "bg-surface-card border-border-subtle text-text-muted hover:border-border-glow"
                  )}
                >
                  <div className="font-bold text-[11px]">分镜生成分镜</div>
                  <div className="text-[9px] opacity-70 mt-0.5">适合粘贴已写分镜，优先保留镜头顺序和对白。</div>
                </button>
              </div>
            </div>

            {/* 输出语言 */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">输出语言</label>
              <select
                value={config.outputLanguage}
                onChange={(e) => setConfig((c) => ({ ...c, outputLanguage: e.target.value }))}
                className="w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2.5 text-xs text-text-primary outline-none focus:border-brand-cyan/50 transition-all"
              >
                {["中文", "English", "日本語", "Français", "Español"].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            {/* 画面比例 */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">画面比例</label>
              <div className="flex gap-1.5">
                {["16:9", "9:16", "1:1"].map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setConfig((c) => ({ ...c, aspectRatio: ratio }))}
                    className={cn(
                      "flex-1 py-2.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-all border",
                      config.aspectRatio === ratio
                        ? "bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30"
                        : "bg-surface-card text-text-muted border-border-subtle hover:text-text-secondary hover:border-border-glow"
                    )}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            {/* 目标时长 */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">目标时长</label>
              <div className="grid grid-cols-2 gap-1.5">
                {DURATION_PRESETS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      if (opt.value === "custom") {
                        setConfig((c) => ({ ...c, targetDuration: "custom" }));
                      } else {
                        setConfig((c) => ({ ...c, targetDuration: opt.value, customDurationInput: "" }));
                      }
                    }}
                    className={cn(
                      "px-2 py-2 text-[11px] font-medium rounded-lg border transition-all text-center",
                      (config.targetDuration === opt.value) || (opt.value === "custom" && DURATION_PRESETS.every(p => p.value !== config.targetDuration))
                        ? "bg-brand-cyan/10 border-brand-cyan/30 text-text-primary"
                        : "bg-surface-card border-border-subtle text-text-muted hover:border-border-glow"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {(config.targetDuration === "custom" || (config.targetDuration && DURATION_PRESETS.every(p => p.value !== config.targetDuration))) && (
                <input
                  value={config.customDurationInput || config.targetDuration}
                  onChange={(e) => setConfig((c) => ({ ...c, customDurationInput: e.target.value, targetDuration: e.target.value }))}
                  placeholder='例如：90s、3m、2m30s'
                  className="w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted/40 outline-none focus:border-brand-cyan/50 transition-all"
                />
              )}
            </div>

            {/* 视觉风格 */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">视觉风格</label>
              <div className="grid grid-cols-2 gap-1.5">
                {STYLE_PRESETS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      if (opt.value === "custom") {
                        setConfig((c) => ({ ...c, visualStyle: "custom" }));
                      } else {
                        setConfig((c) => ({ ...c, visualStyle: opt.value, customStyleInput: "" }));
                      }
                    }}
                    className={cn(
                      "px-2 py-2 text-[11px] font-medium rounded-lg border transition-all text-center truncate",
                      (config.visualStyle === opt.value) || (opt.value === "custom" && STYLE_PRESETS.every(p => p.value !== config.visualStyle))
                        ? "bg-brand-cyan/10 border-brand-cyan/30 text-text-primary"
                        : "bg-surface-card border-border-subtle text-text-muted hover:border-border-glow"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {(config.visualStyle === "custom" || (config.visualStyle && STYLE_PRESETS.every(p => p.value !== config.visualStyle))) && (
                <input
                  value={config.customStyleInput || config.visualStyle}
                  onChange={(e) => setConfig((c) => ({ ...c, customStyleInput: e.target.value, visualStyle: e.target.value }))}
                  placeholder="输入风格（如 水彩、像素、写实）"
                  className="w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-xs text-text-primary placeholder:text-text-muted/40 outline-none focus:border-brand-cyan/50 transition-all"
                />
              )}
            </div>

            {/* 反推参考图 */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">反推参考图</label>
              <button
                onClick={() => styleInputRef.current?.click()}
                disabled={isInferringStyle}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-border-subtle text-text-muted hover:text-text-primary hover:border-border-glow transition-all text-xs disabled:opacity-50"
              >
                <svg className={cn("size-4", isInferringStyle && "animate-pulse")} stroke="currentColor" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {isInferringStyle ? "正在反推风格..." : "上传图片反推风格"}
              </button>
              <input
                ref={styleInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setIsInferringStyle(true);
                  try {
                    const formData = new FormData();
                    formData.append("files", file);
                    const token = (() => {
                      try {
                        const raw = localStorage.getItem("spiritlens-auth");
                        if (!raw) return "";
                        const parsed = JSON.parse(raw);
                        return parsed?.state?.accessToken || "";
                      } catch { return ""; }
                    })();
                    const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/spiritlens";
                    const res = await fetch(`${BASE_URL}/api/v1/upload`, {
                      method: "POST",
                      headers: token ? { Authorization: `Bearer ${token}` } : {},
                      body: formData,
                    });
                    if (res.ok) {
                      const data = await res.json();
                      const url = data.urls?.[0];
                      if (url) {
                        // Use filename as style hint (AI reverse inference TBD)
                        const hint = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
                        setConfig((c) => ({ ...c, visualStyle: hint }));
                      }
                    }
                  } catch (e) {
                    console.warn("[ScriptStage] Style inference failed", e);
                  } finally {
                    setIsInferringStyle(false);
                  }
                  e.target.value = "";
                }}
              />
              <p className="text-[9px] text-text-muted/60">上传参考图片自动提取风格关键词。</p>
            </div>

            {/* AI 模型 */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">AI 模型</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2.5 text-xs text-text-primary outline-none focus:border-brand-cyan/50 transition-all"
              >
                {loadingModels ? (
                  <option>加载中...</option>
                ) : models.length === 0 ? (
                  <option>无可用模型</option>
                ) : (
                  models.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))
                )}
              </select>
            </div>

            {/* 质量控制 */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={qualityControl}
                  onChange={(e) => setQualityControl(e.target.checked)}
                  className="h-4 w-4 rounded border-border-subtle text-brand-cyan focus:ring-brand-cyan/30"
                />
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">质量控制</span>
              </label>
              <p className="text-[9px] text-text-muted/60 pl-6">启用分镜质量校验与自动修复（推荐）。生成时自动修复字段缺失等问题。</p>
            </div>
          </div>

          {/* Bottom action */}
          <div className="p-5 border-t border-border-subtle bg-surface-card/60 shrink-0">
            <button
              onClick={() => {
                if (scriptContent.trim()) {
                  handleBreakdown();
                } else {
                  setShowGeneratePanel(true);
                  if (showManualEditor) setShowManualEditor(false);
                }
              }}
              disabled={breakingDown}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white text-xs font-bold uppercase tracking-wider hover:shadow-glow-md disabled:opacity-50 transition-all"
            >
              {breakingDown ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Wand2 className="size-3.5" />
              )}
              {hasScript ? "生成分镜脚本" : "输入故事 → 生成分镜"}
            </button>
          </div>
        </div>

        {/* ═══ Editor Area (right) ════════════════════════════ */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Config status bar - shows current settings */}
          <div className="shrink-0 px-6 py-2 border-b border-border-subtle bg-surface-card/30 flex items-center gap-4 text-[10px] font-mono text-text-muted">
            <span className="flex items-center gap-1">
              <span className="text-text-secondary">模式</span>
              {config.generationMode === "novel" ? "小说→分镜" : "分镜→分镜"}
            </span>
            <span className="flex items-center gap-1">
              <span className="text-text-secondary">语言</span>
              {config.outputLanguage}
            </span>
            <span className="flex items-center gap-1">
              <span className="text-text-secondary">比例</span>
              {config.aspectRatio}
            </span>
            {config.visualStyle && (
              <span className="flex items-center gap-1">
                <span className="text-text-secondary">风格</span>
                {config.visualStyle}
              </span>
            )}
            {config.targetDuration && (
              <span className="flex items-center gap-1">
                <span className="text-text-secondary">时长</span>
                {config.targetDuration}
              </span>
            )}
          </div>
          {/* Script editor pane */}
          <div
            className={cn(
              "flex flex-col overflow-hidden transition-all duration-300",
              showDeconstruction && hasStoryboards
                ? "flex-1 border-b border-border-subtle"
                : "flex-1"
            )}
          >
            {!hasScript && !showGeneratePanel && !showManualEditor ? (
              /* Empty state */
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-md px-8">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-purple/20 to-brand-cyan/20 flex items-center justify-center mx-auto mb-6">
                    <FileText className="size-8 text-brand-cyan" />
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    开始创作剧本
                  </h3>
                  <p className="text-sm text-text-muted mb-8 leading-relaxed">
                    你可以手动编写、粘贴剧本内容，或者使用 AI 根据故事梗概自动生成完整剧本。
                  </p>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => {
                        setShowGeneratePanel(true);
                        editorRef.current?.focus();
                      }}
                      className="flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white font-bold text-sm tracking-wider hover:shadow-glow-md transition-all"
                    >
                      <Sparkles className="size-5" />
                      AI 生成剧本
                    </button>
                    <button
                      onClick={() => { setShowManualEditor(true); setTimeout(() => editorRef.current?.focus(), 100); }}
                      className="flex items-center justify-center gap-3 px-6 py-4 rounded-xl border border-border-subtle text-text-muted hover:text-text-primary hover:border-border-glow transition-all text-sm font-medium"
                    >
                      <FileText className="size-5" />
                      手动编写剧本
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Script textarea */
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Quick AI generate panel */}
                {showGeneratePanel && (
                  <div className="shrink-0 border-b border-border-subtle bg-surface-card/80 px-6 py-4">
                    {!hasScript ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-text-primary mb-1">
                          <Sparkles className="size-4 text-brand-purple" />
                          故事梗概
                        </div>
                        <textarea
                          value={generatePrompt}
                          onChange={(e) => setGeneratePrompt(e.target.value)}
                          placeholder="描述你想要的故事主题，例如：一个失忆的侦探在调查一起悬案时发现自己就是凶手…"
                          rows={3}
                          className="w-full rounded-xl border border-border-subtle bg-surface-base px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 transition-all resize-none"
                        />
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] text-text-muted font-mono">
                            配置：{config.visualStyle || "默认"}风格 · {config.targetDuration || "未设置"}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setShowGeneratePanel(false)}
                              className="px-4 py-2 rounded-xl text-xs font-medium text-text-muted hover:text-text-primary transition-all"
                            >
                              取消
                            </button>
                            <button
                              onClick={handleGenerate}
                              disabled={generating || !generatePrompt.trim()}
                              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white text-xs font-bold uppercase tracking-wider hover:shadow-glow-md disabled:opacity-50 transition-all"
                            >
                              {generating ? (
                                <><Loader2 className="size-3.5 animate-spin" />生成中</>
                              ) : (
                                <><Sparkles className="size-3.5" />生成剧本</>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <input
                            value={generatePrompt}
                            onChange={(e) => setGeneratePrompt(e.target.value)}
                            placeholder="输入故事方向，AI 将生成新的剧本段落…"
                            className="w-full rounded-lg border border-border-subtle bg-surface-base px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 transition-all"
                          />
                        </div>
                        <button
                          onClick={handleGenerate}
                          disabled={generating || !generatePrompt.trim()}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white text-xs font-bold uppercase tracking-wider hover:shadow-glow-md disabled:opacity-50 transition-all shrink-0"
                        >
                          {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                          生成
                        </button>
                        <button
                          onClick={() => setShowGeneratePanel(false)}
                          className="rounded-lg p-2.5 text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-all"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Editor */}
                <div className="flex-1 overflow-hidden">
                  <textarea
                    ref={editorRef}
                    value={scriptContent}
                    onChange={(e) => handleScriptChange(e.target.value)}
                    placeholder="在此输入剧本内容…
（支持标准中文剧本格式：场景标题/△动作/对白）

示例：
1-1 顶层暗房 内 夜 人物：艾琳娜、马库斯
△红光昏暗。显影液刺鼻。
马库斯：（面无表情）SEC的传票到了。
艾琳娜：什么？他们怎么知道的？"
                    className="w-full h-full resize-none bg-transparent text-sm text-text-primary leading-relaxed font-mono px-6 py-4 outline-none placeholder:text-text-muted/40"
                    spellCheck={false}
                  />
                </div>

                {/* Continue panel */}
                {hasScript && (
                  <div className="shrink-0 border-t border-border-subtle">
                    <div className="flex items-center gap-2 px-4 py-2">
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          value={continueDirection}
                          onChange={(e) => setContinueDirection(e.target.value)}
                          placeholder="输入续写方向，如：继续下一场戏、增加一段对话…"
                          className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted/50 outline-none"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleContinue();
                            }
                          }}
                        />
                      </div>
                      <button
                        onClick={handleContinue}
                        disabled={continuing || !continueDirection.trim() || !hasScript}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-brand-cyan hover:bg-brand-cyan/10 border border-brand-cyan/20 disabled:opacity-40 transition-all shrink-0"
                      >
                        {continuing ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
                        续写
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── Deconstruction panel (below editor) ────────── */}
          {showDeconstruction && hasStoryboards && (
            <div className="h-1/2 border-t border-border-subtle bg-surface-card/30 flex flex-col overflow-hidden shrink-0">
              {/* Deconstruction tabs */}
              <div className="flex items-center border-b border-border-subtle shrink-0">
                <button
                  onClick={() => setShowEntityPanel(false)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium uppercase tracking-wider border-b-2 transition-all",
                    !showEntityPanel
                      ? "border-brand-cyan text-brand-cyan bg-brand-cyan/5"
                      : "border-transparent text-text-muted hover:text-text-secondary"
                  )}
                >
                  <Clapperboard className="size-3.5" />
                  分镜 ({storyboards.length})
                </button>
                <button
                  onClick={() => setShowEntityPanel(true)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium uppercase tracking-wider border-b-2 transition-all",
                    showEntityPanel
                      ? "border-brand-cyan text-brand-cyan bg-brand-cyan/5"
                      : "border-transparent text-text-muted hover:text-text-secondary"
                  )}
                >
                  <ListTree className="size-3.5" />
                  结构化提取
                </button>
              </div>

              {/* Storyboard list view */}
              {!showEntityPanel && (
                <div className="flex-1 overflow-y-auto">
                  <div className="p-3 space-y-2">
                    {storyboards.map((sb) => {
                      const chars = _parseJsonList(sb.characters);
                      const props = _parseJsonList(sb.props);

                      return (
                        <div key={sb.id} className="rounded-xl border border-border-subtle bg-surface-card overflow-hidden group">
                          <div className="flex items-center justify-between px-3 py-2 bg-surface-elevated/50 border-b border-border-subtle">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-lg bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center text-[10px] font-bold text-brand-cyan font-mono">
                                {String(sb.sequence_number).padStart(2, "0")}
                              </div>
                              <span className={cn("text-[9px] font-mono font-medium px-1.5 py-0.5 rounded border uppercase tracking-wider", SHOT_TYPE_COLORS[sb.shot_type || "medium"] || "text-text-muted border-border-subtle")}>
                                {SHOT_TYPE_LABELS[sb.shot_type || ""] || sb.shot_type || "中景"}
                              </span>
                            </div>
                          </div>

                          <div className="p-3 space-y-2">
                            <div>
                              <input
                                value={sb.scene_description || ""}
                                onChange={(e) => updateStoryboard(sb.id, "scene_description", e.target.value)}
                                className="w-full bg-transparent text-xs text-text-primary outline-none border-b border-transparent focus:border-brand-cyan/30 transition-colors pb-1"
                                placeholder="地点、时间、环境氛围…"
                              />
                            </div>
                            <div>
                              <textarea
                                value={sb.action_description || ""}
                                onChange={(e) => updateStoryboard(sb.id, "action_description", e.target.value)}
                                rows={1}
                                className="w-full bg-transparent text-xs text-text-primary outline-none border border-transparent focus:border-brand-cyan/30 transition-colors rounded-lg px-2 py-1 resize-none"
                                placeholder="角色动作描述…"
                              />
                            </div>
                            {sb.dialogue && (
                              <div className="flex items-start gap-2 pl-3 border-l-2 border-brand-purple/30">
                                <MessageSquare className="size-3 text-brand-purple mt-0.5 shrink-0" />
                                <textarea
                                  value={sb.dialogue || ""}
                                  onChange={(e) => updateStoryboard(sb.id, "dialogue", e.target.value)}
                                  rows={1}
                                  className="flex-1 bg-transparent text-xs text-text-primary outline-none border border-transparent focus:border-brand-cyan/30 transition-colors rounded-lg px-2 py-1 resize-none"
                                />
                              </div>
                            )}
                            <div className="flex items-center gap-3 pt-1">
                              {chars.length > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <Users className="size-3 text-blue-400" />
                                  <div className="flex flex-wrap gap-1">
                                    {chars.map((c, i) => (
                                      <span key={i} className="text-[9px] font-mono text-blue-300 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded">{c}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {props.length > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <Package className="size-3 text-yellow-400" />
                                  <div className="flex flex-wrap gap-1">
                                    {props.map((p, i) => (
                                      <span key={i} className="text-[9px] font-mono text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded">{p}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Entity extraction view */}
              {showEntityPanel && (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Characters */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="size-4 text-blue-400" />
                      <h3 className="text-xs font-medium text-text-primary">角色 ({extractedChars.length})</h3>
                    </div>
                    {structureData?.characters && structureData.characters.length > 0 ? (
                      <div className="space-y-2 pl-7">
                        {structureData.characters.map((ch, i) => (
                          <div key={i} className="rounded-lg border border-border-subtle bg-surface-card p-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-text-primary">{ch.name}</span>
                              {ch.gender && <span className="text-[9px] font-mono text-text-muted">{ch.gender}</span>}
                            </div>
                            {ch.personality && <p className="text-[10px] text-text-muted mt-0.5">{ch.personality}</p>}
                            {ch.description && <p className="text-[10px] text-text-secondary mt-0.5">{ch.description}</p>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 pl-7">
                        {extractedChars.length === 0 ? (
                          <p className="text-xs text-text-muted">AI 拆解后自动识别</p>
                        ) : (
                          extractedChars.map((name, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-300 font-mono">{name}</span>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Scenes */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Film className="size-4 text-green-400" />
                      <h3 className="text-xs font-medium text-text-primary">场景 ({structureData?.scenes?.length || 0})</h3>
                    </div>
                    {structureData?.scenes && structureData.scenes.length > 0 ? (
                      <div className="space-y-2 pl-7">
                        {structureData.scenes.map((sc, i) => (
                          <div key={i} className="rounded-lg border border-border-subtle bg-surface-card p-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-text-primary">{sc.name}</span>
                              {sc.time && <span className="text-[9px] font-mono text-text-muted">{sc.time}</span>}
                            </div>
                            {sc.location && <p className="text-[10px] text-text-muted mt-0.5">{sc.location}</p>}
                            {sc.atmosphere && <p className="text-[10px] text-text-secondary mt-0.5">{sc.atmosphere}</p>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted pl-7">AI 解析剧本后自动提取场景列表</p>
                    )}
                  </div>

                  {/* Props */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="size-4 text-yellow-400" />
                      <h3 className="text-xs font-medium text-text-primary">道具 ({extractedProps.length})</h3>
                    </div>
                    {structureData?.props && structureData.props.length > 0 ? (
                      <div className="space-y-2 pl-7">
                        {structureData.props.map((p, i) => (
                          <div key={i} className="rounded-lg border border-border-subtle bg-surface-card p-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-text-primary">{p.name}</span>
                              {p.category && <span className="text-[9px] font-mono text-text-muted">[{p.category}]</span>}
                            </div>
                            {p.description && <p className="text-[10px] text-text-secondary mt-0.5">{p.description}</p>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 pl-7">
                        {extractedProps.length === 0 ? (
                          <p className="text-xs text-text-muted">AI 拆解后自动识别</p>
                        ) : (
                          extractedProps.map((name, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-[10px] text-yellow-300 font-mono">{name}</span>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Shot type summary */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Clapperboard className="size-4 text-purple-400" />
                      <h3 className="text-xs font-medium text-text-primary">镜头统计 ({storyboards.length})</h3>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-7">
                      {Object.entries(SHOT_TYPE_LABELS).map(([key, label]) => {
                        const count = storyboards.filter((sb) => sb.shot_type === key).length;
                        if (count === 0) return null;
                        return (
                          <span key={key} className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono", SHOT_TYPE_COLORS[key] || "")}>
                            {label}: {count}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom status bar */}
          <div className="flex items-center justify-between px-6 py-2 border-t border-border-subtle bg-surface-card shrink-0">
            <div className="flex items-center gap-4 text-[10px] font-mono text-text-muted">
              <span>
                {scriptContent.length > 0 ? `${scriptContent.length} 字符` : "空剧本"}
              </span>
              {hasStoryboards && <span>{storyboards.length} 个分镜</span>}
              {extractedChars.length > 0 && <span>{extractedChars.length} 个角色</span>}
              {extractedProps.length > 0 && <span>{extractedProps.length} 个道具</span>}
            </div>
            <div className="flex items-center gap-2">
              {hasScript && !showDeconstruction && (
                <button
                  onClick={() => setShowDeconstruction(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-all"
                >
                  <ChevronRight className="size-3" />
                  展开拆解面板
                </button>
              )}
              {showDeconstruction && (
                <button
                  onClick={() => setShowDeconstruction(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-all"
                >
                  <X className="size-3" />
                  关闭拆解
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helper ──────────────────────────────────────────────────────

function _parseJsonList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
