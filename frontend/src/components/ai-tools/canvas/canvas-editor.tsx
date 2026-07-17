

"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  ReactFlow, Background, Controls, BackgroundVariant,
  applyNodeChanges, applyEdgeChanges, addEdge,
  type Node, type Edge, type NodeChange, type EdgeChange, type Connection,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Plus, ImageIcon, Clapperboard, Type, ImagePlus, ArrowLeft,
  Sparkles, Layers, Loader2, MousePointerClick, Sun, Moon,
} from "lucide-react";
import { ImageNode } from "./nodes/image-node";
import { VideoNode } from "./nodes/video-node";
import { TextNode } from "./nodes/text-node";
import { UploadNode } from "./nodes/upload-node";
import { AddNodePanel } from "./add-node-panel";
import { cn, shortId } from "@/lib/utils";
import { useTheme } from "@/store/theme";
import { api } from "@/services/api";
import {
  updateCanvasProject,
  extractThumbnail,
  getCanvasData,
} from "@/lib/canvas-storage";
import type {
  CanvasNodeData, CanvasNodeKind, AddNodeAction, TemplateId, FlowNodeData,
} from "./types";

/** Real model info from backend */
interface CanvasModel {
  id: string;
  name: string;
  vendor: string;
  type: "image" | "video";
  cost_per_unit: number;
  supported_sizes?: { label: string; value: string }[];
}

/* ─── Helper: create an edge with animated style ─── */
function makeEdge(source: string, target: string): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    animated: true,
    style: { stroke: "rgba(108,59,255,0.4)", strokeWidth: 2 },
  };
}

/* ─── Node type registry ─── */
const NODE_TYPES = {
  image: ImageNode,
  video: VideoNode,
  text: TextNode,
  upload: UploadNode,
} as const;

/* ─── Size presets (same for all image models) ─── */
const SIZE_PRESETS = [
  { label: "1:1 方图", value: "1920x1920" },
  { label: "16:9 横图", value: "2560x1440" },
  { label: "9:16 竖图", value: "1440x2560" },
  { label: "4:3 横图", value: "2304x1728" },
  { label: "3:4 竖图", value: "1728x2304" },
  { label: "3:2 横图", value: "2496x1664" },
  { label: "21:9 超宽", value: "3024x1296" },
];

/* ─── Video size presets ─── */
const VIDEO_SIZE_PRESETS = [
  { label: "16:9 横屏", value: "1280x720" },
  { label: "9:16 竖屏", value: "720x1280" },
  { label: "1:1 方屏", value: "720x720" },
  { label: "1080p", value: "1920x1080" },
];

/* ─── Props ─── */
interface Props {
  onBack?: () => void;
  projectId?: string;
}

/* ═══════════════════════════════════════════
   CanvasEditor
   ═══════════════════════════════════════════ */

function getCanvasKey(projectId?: string): string {
  return projectId ? `spiritlens:canvas:data:${projectId}` : "spiritlens:canvas";
}

function loadCanvasState(projectId?: string): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  if (typeof window === "undefined") return { nodes: [], edges: [] };
  const key = getCanvasKey(projectId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { nodes: parsed.nodes || [], edges: parsed.edges || [] };
    }
  } catch { /* ignore */ }
  return { nodes: [], edges: [] };
}

function saveCanvasStateToKey(nodes: Node<FlowNodeData>[], edges: Edge[], projectId?: string) {
  if (typeof window === "undefined") return;
  const key = getCanvasKey(projectId);
  try {
    // Strip ephemeral callbacks before saving (they can't be serialized)
    const cleanNodes = nodes.map((n) => ({
      ...n,
      data: Object.fromEntries(
        Object.entries(n.data).filter(([k]) => !k.startsWith("on") && k !== "upstreamPrompts" && k !== "upstreamImageUrls" && k !== "inputImageUrl" && k !== "canvasModels" && k !== "supportedSizes" && k !== "taskId")
      ),
    }));
    localStorage.setItem(key, JSON.stringify({ nodes: cleanNodes, edges }));
  } catch { /* ignore */ }
}

export function CanvasEditor({ onBack, projectId }: Props) {
  const rf = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { theme, toggle: toggleTheme } = useTheme();

  /* ─── State (start empty, restored from localStorage after mount to avoid hydration mismatch) ─── */
  const [nodes, setNodes] = useState<Node<FlowNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Restore from localStorage after mount (client-only)
  useEffect(() => {
    const saved = loadCanvasState(projectId);
    if (saved.nodes.length || saved.edges.length) {
      setNodes(saved.nodes);
      setEdges(saved.edges);
    }
    setHydrated(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Add-node panel state
  const [addPanel, setAddPanel] = useState<{
    kind: "anchored";
    screenX: number;
    screenY: number;
    flowX: number;
    flowY: number;
    sourceNodeId?: string;
  } | null>(null);

  // Rail state
  const [railOpen, setRailOpen] = useState(false);

  // Connection drag tracking
  const connectingFromNodeId = useRef<string | null>(null);
  const skipNextPaneClick = useRef(false);

  // Track node generation timers / polling for cancellation
  const cancelMap = useRef<Map<string, () => void>>(new Map());
  const pollingMap = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Real models from backend
  const [imageModels, setImageModels] = useState<CanvasModel[]>([]);
  const [videoModels, setVideoModels] = useState<CanvasModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  // Fetch real models on mount
  useEffect(() => {
    api.get<{ models: CanvasModel[] }>("/api/v1/models")
      .then((res) => {
        const imgs: CanvasModel[] = [];
        const vids: CanvasModel[] = [];
        for (const m of res.models) {
          if (m.type === "image") imgs.push(m);
          else if (m.type === "video") vids.push(m);
        }
        setImageModels(imgs);
        setVideoModels(vids);
      })
      .catch(() => {})
      .finally(() => setModelsLoading(false));
  }, []);

  // Save canvas state to localStorage on every change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    saveCanvasStateToKey(nodes, edges, projectId);
    // Update project listing metadata if this is a named project
    if (projectId) {
      const thumb = extractThumbnail(nodes);
      updateCanvasProject(projectId, { thumbnailUrl: thumb });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, hydrated, projectId]);

  /* ─── Single click on empty pane → close panel if open ─── */
  const onPaneClick = useCallback(() => {
    if (addPanel || railOpen) {
      setAddPanel(null);
      setRailOpen(false);
    }
  }, [addPanel, railOpen]);

  /** Reliable double-click on wrapper → open add-node panel */
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      // Only trigger on pane or empty area, not on UI elements
      const target = e.target as HTMLElement;
      if (target.closest('button, [role="button"], .nodrag, .react-flow__controls, .react-flow__node')) return;
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      // Check if click is on ReactFlow pane area
      const pane = target.closest('.react-flow__pane');
      if (!pane) return;
      const rect = wrapper.getBoundingClientRect();
      const flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setAddPanel({
        kind: "anchored",
        screenX: e.clientX - rect.left,
        screenY: e.clientY - rect.top,
        flowX: flow.x,
        flowY: flow.y,
      });
      setRailOpen(false);
    };
    // Use capture phase so ReactFlow can't stop propagation
    el.addEventListener('dblclick', handler, { capture: true });
    return () => el.removeEventListener('dblclick', handler, { capture: true });
  }, [rf]);

  /* ─── Node/Edge changes ─── */
  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((ns) => applyNodeChanges(changes, ns) as Node<FlowNodeData>[]),
    [imageModels, videoModels],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)),
    [],
  );

  /* ─── Connection validation ─── */
  const isValidConnection = useCallback(
    (conn: Edge | Connection) => {
      const { source, target } = conn;
      if (!source || !target) return false;

      const srcNode = nodes.find((n) => n.id === source);
      const tgtNode = nodes.find((n) => n.id === target);
      if (!srcNode || !tgtNode) return false;

      const srcKind = srcNode.data.kind;
      const tgtKind = tgtNode.data.kind;

      // Text nodes can output to anything that needs prompts
      // Image / Upload nodes can output to image or video (reference image)
      const validTargets: Record<string, string[]> = {
        text: ["image", "video"],             // prompts → generation nodes
        image: ["video", "image", "upload"],   // image → video, img2img, or pass to upload
        upload: ["image", "video", "upload"],   // uploaded image → generation nodes
        video: [],                              // video is terminal (for now)
      };

      const allowed = validTargets[srcKind] ?? [];
      return allowed.includes(tgtKind);
    },
    [nodes],
  );

  const onConnect = useCallback((params: Connection) => {
    if (!isValidConnection(params)) {
      console.warn("[Canvas] Connection blocked by isValidConnection:", {
        source: params.source,
        target: params.target,
        sourceKind: nodes.find((n) => n.id === params.source)?.data?.kind,
        targetKind: nodes.find((n) => n.id === params.target)?.data?.kind,
      });
      return;
    }
    try {
      setEdges((es) => addEdge(params, es));
    } catch (err) {
      console.error("[Canvas] addEdge failed:", err, params);
    }
  }, [isValidConnection, nodes]);

  /* ─── Connection drag to create node ─── */
  const onConnectStart = useCallback(
    (_: unknown, params: { nodeId: string | null }) => {
      connectingFromNodeId.current = params.nodeId;
    },
    [],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: { isValid?: boolean | null; fromNode?: { id: string } | null }) => {
      // Valid connection handled by onConnect — nothing to do here
      if (connectionState?.isValid === true) {
        connectingFromNodeId.current = null;
        return;
      }

      connectingFromNodeId.current = null;

      // Only open add-node panel when dropped on empty canvas, not on a node
      const target = event.target as HTMLElement | null;
      if (target?.closest(".react-flow__node")) return;

      const sourceId = connectionState?.fromNode?.id;
      if (!sourceId) return;

      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const clientX = "clientX" in event ? event.clientX : event.changedTouches?.[0]?.clientX ?? 0;
      const clientY = "clientY" in event ? event.clientY : event.changedTouches?.[0]?.clientY ?? 0;
      const flow = rf.screenToFlowPosition({ x: clientX, y: clientY });
      skipNextPaneClick.current = true;
      setAddPanel({
        kind: "anchored",
        screenX: clientX - rect.left,
        screenY: clientY - rect.top,
        flowX: flow.x,
        flowY: flow.y,
        sourceNodeId: sourceId,
      });
    },
    [rf],
  );

  /* ─── Update node data ─── */
  const updateNodeData = useCallback(
    (id: string, patch: Partial<CanvasNodeData>) => {
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [],
  );

  /* ─── Delete node ─── */
  const deleteNode = useCallback((id: string) => {
    cancelMap.current.get(id)?.();
    cancelMap.current.delete(id);
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
  }, []);

  /* ─── Selection ─── */
  const onSelectionChange = useCallback(
    ({ nodes: selNodes }: { nodes: Node[] }) => {
      setSelectedNodeId(selNodes.length === 1 ? selNodes[0].id : null);
    },
    [],
  );

  /* ─── Real API Generate: Image ─── */
  const startImageGeneration = useCallback(
    (nodeId: string, prompt: string, modelId: string, referenceImageUrl?: string, params?: Partial<{ size: string; batch: number }>) => {
      const size = params?.size || "1920x1920";
      const batch = params?.batch || 1;

      updateNodeData(nodeId, { status: "running", progress: 0, errorMessage: undefined, inputImageUrl: referenceImageUrl });

      // Start polling
      let taskId = "";
      const pollInterval = setInterval(async () => {
        if (!taskId) return;
        try {
          const status = await api.get<{
            status: string; progress: number; image_urls: string[]; error_message: string | null;
          }>(`/api/v1/image/status/${taskId}`);

          updateNodeData(nodeId, { progress: status.progress });

          if (status.status === "completed") {
            clearInterval(pollInterval);
            pollingMap.current.delete(nodeId);
            cancelMap.current.delete(nodeId);
            updateNodeData(nodeId, {
              status: "succeeded", progress: 100, imageUrls: status.image_urls,
            });
          } else if (status.status === "failed") {
            clearInterval(pollInterval);
            pollingMap.current.delete(nodeId);
            cancelMap.current.delete(nodeId);
            updateNodeData(nodeId, {
              status: "failed", progress: 0, errorMessage: status.error_message || "生成失败",
            });
          }
        } catch { /* retry */ }
      }, 2000);
      pollingMap.current.set(nodeId, pollInterval);

      // Submit task
      api.post<{ task_id: string }>("/api/v1/image/generate", {
        prompt, model_id: modelId, size, batch,
        reference_images: referenceImageUrl ? [referenceImageUrl] : undefined,
      }).then((res) => {
        taskId = res.task_id;
        updateNodeData(nodeId, { taskId: res.task_id });
      }).catch((err) => {
        clearInterval(pollInterval);
        pollingMap.current.delete(nodeId);
        cancelMap.current.delete(nodeId);
        updateNodeData(nodeId, {
          status: "failed", progress: 0, errorMessage: err?.message || "提交失败",
        });
      });

      const cancel = () => {
        clearInterval(pollInterval);
        pollingMap.current.delete(nodeId);
        cancelMap.current.delete(nodeId);
        if (taskId) {
          api.post(`/api/v1/image/tasks/${taskId}/cancel`, {}).catch(() => {});
        }
        updateNodeData(nodeId, { status: "idle", progress: 0 });
      };
      cancelMap.current.set(nodeId, cancel);
      return cancel;
    },
    [updateNodeData],
  );

  /* ─── Real API Generate: Video ─── */
  const startVideoGeneration = useCallback(
    (nodeId: string, prompt: string, modelId: string, referenceImageUrl: string) => {
      updateNodeData(nodeId, { status: "running", progress: 0, errorMessage: undefined, inputImageUrl: referenceImageUrl });

      let taskId = "";
      const pollInterval = setInterval(async () => {
        if (!taskId) return;
        try {
          const status = await api.get<{
            status: string; progress: number;
            video_url?: string; video_poster_url?: string; error_message?: string;
          }>(`/api/v1/video/status/${taskId}`);

          updateNodeData(nodeId, { progress: status.progress });

          if (status.status === "completed") {
            clearInterval(pollInterval);
            pollingMap.current.delete(nodeId);
            cancelMap.current.delete(nodeId);
            updateNodeData(nodeId, {
              status: "succeeded", progress: 100,
              videoUrl: status.video_url,
              videoPosterUrl: status.video_poster_url,
            });
          } else if (status.status === "failed") {
            clearInterval(pollInterval);
            pollingMap.current.delete(nodeId);
            cancelMap.current.delete(nodeId);
            updateNodeData(nodeId, {
              status: "failed", progress: 0, errorMessage: status.error_message || "生成失败",
            });
          }
        } catch { /* retry */ }
      }, 3000);
      pollingMap.current.set(nodeId, pollInterval);

      api.post<{ task_id: string }>("/api/v1/video/generate", {
        prompt, model_id: modelId, size: "1280x720",
        reference_images: referenceImageUrl ? [referenceImageUrl] : undefined,
      }).then((res) => {
        taskId = res.task_id;
        updateNodeData(nodeId, { taskId: res.task_id });
      }).catch((err) => {
        clearInterval(pollInterval);
        pollingMap.current.delete(nodeId);
        cancelMap.current.delete(nodeId);
        updateNodeData(nodeId, {
          status: "failed", progress: 0, errorMessage: err?.message || "提交失败",
        });
      });

      const cancel = () => {
        clearInterval(pollInterval);
        pollingMap.current.delete(nodeId);
        cancelMap.current.delete(nodeId);
        if (taskId) {
          api.post(`/api/v1/video/tasks/${taskId}/cancel`, {}).catch(() => {});
        }
        updateNodeData(nodeId, { status: "idle", progress: 0 });
      };
      cancelMap.current.set(nodeId, cancel);
      return cancel;
    },
    [updateNodeData],
  );

  /* ─── Resolve ALL upstream data from every incoming edge ─── */
  const resolveUpstream = useCallback(
    (nodeId: string, path: Set<string> = new Set()): { prompts: string[]; imageUrls: string[]; imageSize?: string } => {
      // Cycle detection: if we've seen this node on the current path, stop
      if (path.has(nodeId)) return { prompts: [], imageUrls: [] };

      const parentEdges = edges.filter((e) => e.target === nodeId);
      const prompts: string[] = [];
      const imageUrls: string[] = [];
      let imageSize: string | undefined;

      for (const e of parentEdges) {
        const src = nodes.find((x) => x.id === e.source);
        if (!src) continue;
        // Collect this source's own data
        if (src.data.prompt.trim()) prompts.push(src.data.prompt);
        if ((src.data.kind === "image" || src.data.kind === "upload") && src.data.imageUrls?.[0]) {
          imageUrls.push(src.data.imageUrls[0]);
          // Capture the image size from upstream image params
          if (!imageSize && src.data.kind === "image" && (src.data as CanvasNodeData).imageParams?.size) {
            imageSize = (src.data as CanvasNodeData).imageParams!.size;
          }
        }
        // Recurse further up with a new path that includes the current node
        const branchPath = new Set(path);
        branchPath.add(nodeId);
        const grand = resolveUpstream(src.id, branchPath);
        for (const p of grand.prompts) if (!prompts.includes(p)) prompts.push(p);
        for (const u of grand.imageUrls) if (!imageUrls.includes(u)) imageUrls.push(u);
        if (!imageSize && grand.imageSize) imageSize = grand.imageSize;
      }
      return { prompts, imageUrls, imageSize };
    },
    [edges, nodes],
  );

  /* ─── Add node ─── */
  const addNode = useCallback(
    (kind: CanvasNodeKind, flowPos: { x: number; y: number }) => {
      const id = shortId(kind);
      const defaultModel = kind === "video"
        ? videoModels[0]?.id || ""
        : kind === "image"
          ? imageModels[0]?.id || ""
          : "";

      const baseData: CanvasNodeData = {
        kind,
        prompt: "",
        modelId: defaultModel,
        status: "idle" as const,
        progress: 0,
      };

      if (kind === "image") {
        baseData.imageParams = { size: "1024x1024", batch: 1, style: "general" };
      }

      // Actual rendered dimensions per node type
      const sizeMap: Record<string, { w: number; h: number }> = {
        image: { w: 288, h: 360 },  // w-72 + header(~36) + square image(288) + body(~36)
        video: { w: 320, h: 330 },  // w-80 + header(~36) + video area(180) + prompt(~114)
        text: { w: 288, h: 155 },   // w-72 + header(~36) + min-h-24 textarea(~119)
        upload: { w: 288, h: 200 },
        "director-stage": { w: 360, h: 280 },
      };
      const size = sizeMap[kind] ?? { w: 288, h: 200 };

      const newNode: Node<FlowNodeData> = {
        id,
        type: kind,
        position: { x: flowPos.x - size.w / 2, y: flowPos.y - size.h / 2 },
        width: size.w,
        height: size.h,
        data: baseData as FlowNodeData,
      };

      setNodes((ns) => [...ns, newNode]);
      return id;
    },
    [],
  );

  /* ─── Insert template ─── */
  const insertTemplate = useCallback(
    (id: TemplateId, flowPos: { x: number; y: number }): string => {
      switch (id) {
        case "text-to-image":
          return addNode("image", flowPos);
        case "image-to-video": {
          const imgId = addNode("image", { x: flowPos.x - 160, y: flowPos.y });
          const vidId = addNode("video", { x: flowPos.x + 160, y: flowPos.y });
          setTimeout(() => {
            setEdges((es) => [...es, makeEdge(imgId, vidId)]);
          }, 0);
          return imgId;
        }
        case "text-to-video": {
          const txtId = addNode("text", { x: flowPos.x - 320, y: flowPos.y });
          const imgId = addNode("image", { x: flowPos.x, y: flowPos.y });
          const vidId = addNode("video", { x: flowPos.x + 320, y: flowPos.y });
          setTimeout(() => {
            setEdges((es) => [...es, makeEdge(txtId, imgId), makeEdge(imgId, vidId)]);
          }, 0);
          return txtId;
        }
      }
    },
    [addNode],
  );

  /* ─── Handle add-node action ─── */
  const handleAddNodeAction = useCallback(
    (action: AddNodeAction, atFlowPos?: { x: number; y: number }, sourceNodeId?: string) => {
      const vp = rf.getViewport();
      const fallbackPos = atFlowPos ?? {
        x: (window.innerWidth / 2 - vp.x) / vp.zoom,
        y: (window.innerHeight / 2 - vp.y) / vp.zoom,
      };
      const newId = action.kind === "template"
        ? insertTemplate(action.templateId, fallbackPos)
        : addNode(action.kind, fallbackPos);

      if (sourceNodeId && newId) {
        setTimeout(() => {
          setEdges((es) => [...es, makeEdge(sourceNodeId, newId)]);
        }, 0);
      }
      setAddPanel(null);
      setRailOpen(false);
    },
    [rf, addNode, insertTemplate],
  );

  /* ─── Inject callbacks & upstream data into nodes ─── */
  const nodesWithCallbacks = useMemo<Node<FlowNodeData>[]>(() => {
    return nodes.map((n) => {
      const up = resolveUpstream(n.id);
      const extra: Record<string, unknown> = {
        onDelete: () => deleteNode(n.id),
        onPromptChange: (p: string) => updateNodeData(n.id, { prompt: p }),
        onModelChange: (m: string) => updateNodeData(n.id, { modelId: m }),
        upstreamPrompts: up.prompts,
        upstreamImageUrls: up.imageUrls,
      };

      if (n.data.kind === "image") {
        extra.inputImageUrl = up.imageUrls[0];
        extra.canvasModels = imageModels;
        extra.supportedSizes = imageModels.find((m) => m.id === n.data.modelId)?.supported_sizes || SIZE_PRESETS;
        extra.onParamsChange = (patch: Record<string, unknown>) => {
          updateNodeData(n.id, {
            imageParams: { ...n.data.imageParams, ...patch } as CanvasNodeData["imageParams"],
          });
        };
        extra.onGenerate = () => {
          const own = n.data.prompt.trim();
          const upstreamTexts = up.prompts.filter((p: string) => p.trim());
          let p: string;
          if (own && upstreamTexts.length > 0) {
            p = `${own}\n\n【上游参考】\n${upstreamTexts.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}`;
          } else if (own) {
            p = own;
          } else if (upstreamTexts.length === 1) {
            p = upstreamTexts[0];
          } else if (upstreamTexts.length > 1) {
            p = upstreamTexts.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n');
          } else {
            return;
          }
          startImageGeneration(n.id, p, n.data.modelId, up.imageUrls[0], n.data.imageParams);
        };
        extra.onSetUploadedImage = (url: string) => {
          updateNodeData(n.id, { imageUrls: [url], status: "succeeded", progress: 100 });
        };
        extra.onSaveAsSubject = (name: string) => {
          const url = n.data.imageUrls?.[0];
          if (!url) return;
          const uploadId = addNode("upload", { x: n.position.x + 360, y: n.position.y });
          updateNodeData(uploadId, { imageUrls: [url], status: "succeeded", progress: 100 });
        };
        extra.onSendToVideo = () => {
          const url = n.data.imageUrls?.[0];
          if (!url) return;
          const vidId = addNode("video", {
            x: n.position.x + 320 + 80,
            y: n.position.y,
          });
          setTimeout(() => {
            setEdges((es) => [...es, makeEdge(n.id, vidId)]);
          }, 0);
        };
      } else if (n.data.kind === "video") {
        extra.inputImageUrl = up.imageUrls[0];
        extra.inputImageSize = up.imageSize;
        extra.canvasModels = videoModels;
        extra.supportedSizes = VIDEO_SIZE_PRESETS;
        extra.onGenerate = () => {
          const own = (n.data.prompt ?? "").trim();
          const upstreamTexts = up.prompts.filter((p: string) => p.trim());
          let p: string;
          if (own && upstreamTexts.length > 0) {
            p = `${own}\n\n【上游参考】\n${upstreamTexts.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}`;
          } else if (own) {
            p = own;
          } else if (upstreamTexts.length === 1) {
            p = upstreamTexts[0];
          } else if (upstreamTexts.length > 1) {
            p = upstreamTexts.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n');
          } else {
            p = "";
          }
          const ref = up.imageUrls[0];
          if (!ref || !p) return;
          startVideoGeneration(n.id, p, n.data.modelId, ref);
        };
      } else if (n.data.kind === "text") {
        extra.onTextChange = (text: string) => updateNodeData(n.id, { prompt: text });
      } else if (n.data.kind === "upload") {
        extra.onSetUploadedImage = (url: string) => {
          updateNodeData(n.id, { imageUrls: [url], status: "succeeded", progress: 100 });
        };
      }

      return { ...n, data: { ...n.data, ...extra } as FlowNodeData };
    });
  }, [nodes, deleteNode, updateNodeData, startImageGeneration, startVideoGeneration, resolveUpstream, addNode]);

  /* ─── Auto-trigger img2img when upstream image data is ready ─── */
  useEffect(() => {
    for (const e of edges) {
      const src = nodes.find((n) => n.id === e.source);
      const tgt = nodes.find((n) => n.id === e.target);
      if (!src || !tgt) continue;
      if (tgt.data.status !== "idle") continue;

      // Image / Upload → Image: auto-start img2img when upstream image is ready
      if (tgt.data.kind === "image" && (src.data.kind === "image" || src.data.kind === "upload")) {
        const refUrl = src.data.imageUrls?.[0];
        const prompt = tgt.data.prompt.trim();
        if (refUrl && prompt) {
          startImageGeneration(tgt.id, prompt, tgt.data.modelId, refUrl, tgt.data.imageParams);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, nodes]);

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full"
      style={{ background: theme === "dark" ? "#111112" : "#fdfaf5" }}
    >
      {/* ComfyUI-style canvas background */}
      <div
        className="absolute inset-0 transition-colors duration-300"
        style={{ backgroundColor: theme === "dark" ? "#111112" : "#fdfaf5" }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-28 transition-colors duration-300"
        style={{
          background: theme === "dark"
            ? "linear-gradient(180deg,rgba(0,0,0,0.3),transparent)"
            : "linear-gradient(180deg,rgba(0,0,0,0.02),transparent)",
        }}
      />

      {/* Top bar */}
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-surface-elevated/80 px-3 py-1.5 text-xs text-secondary backdrop-blur-xl hover:bg-white/[0.08] light:bg-black/[0.06] transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            返回
          </button>
        )}
        <div className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-surface-elevated/80 px-3 py-1.5 text-xs text-muted backdrop-blur-xl">
          <Sparkles className="size-3.5 text-brand-purple" />
          智能画布
        </div>
      </div>

      {/* Theme toggle — top right */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-surface-elevated/80 px-3 py-1.5 text-xs text-muted backdrop-blur-xl hover:bg-white/[0.08] light:bg-black/[0.06] transition-colors"
        title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
      >
        {theme === "dark" ? (
          <Sun className="size-3.5" />
        ) : (
          <Moon className="size-3.5" />
        )}
        <span>{theme === "dark" ? "浅色" : "深色"}</span>
      </button>

      {/* ReactFlow */}
      <ReactFlow
        nodes={nodesWithCallbacks}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onSelectionChange={onSelectionChange}
        onPaneClick={onPaneClick}
        panOnDrag={[0, 1]}
        selectionOnDrag={false}
        nodeTypes={NODE_TYPES}
        defaultViewport={{ x: 400, y: 200, zoom: 0.85 }}
        fitView={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={3}
        deleteKeyCode={["Backspace", "Delete"]}
        className="!bg-transparent"
      >
        {/* ComfyUI grid lines at 48px, auto-scales with zoom */}
        <Background
          id="grid-lines"
          variant={BackgroundVariant.Lines}
          gap={48}
          color="rgba(180,180,190,0.15)"
          lineWidth={0.8}
          bgColor="transparent"
          className="!bg-transparent"
        />
        {/* Main dots at 48px intersections */}
        <Background
          id="grid-dots"
          variant={BackgroundVariant.Dots}
          gap={48}
          size={1.8}
          color="rgba(180,180,190,0.14)"
          bgColor="transparent"
          className="!bg-transparent"
        />
        {/* Finer dot overlay at 24px */}
        <Background
          id="grid-fine"
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(108,59,255,0.08)"
          bgColor="transparent"
          className="!bg-transparent"
        />
        <Controls
          className="!border !border-white/20 light:!border-black/[0.08] !bg-[#252528] !rounded-2xl !shadow-lg [&>button]:!border-white/15 [&>button]:!bg-white/[0.06] [&>button]:!text-white hover:[&>button]:!bg-white/[0.15] light:[&>button]:!text-muted light:[&>button]:!bg-transparent light:[&>button]:!border-black/[0.06]"
          showInteractive={false}
        />
      </ReactFlow>

      {/* Left tool rail */}
      <CanvasLeftRail
        active={railOpen}
        onToggleAdd={() => { setRailOpen((v) => !v); setAddPanel(null); }}
        onQuickAdd={(kind) => handleAddNodeAction({ kind } as AddNodeAction)}
      />

      {/* Add-node panel (rail mode) */}
      {railOpen && (
        <div className="absolute left-16 top-1/2 z-20 -translate-y-1/2">
          <AddNodePanel onPick={(action) => handleAddNodeAction(action)} />
        </div>
      )}

      {/* Add-node panel (anchored mode) */}
      {addPanel?.kind === "anchored" && (
        <div
          className="absolute z-20"
          style={{ left: addPanel.screenX, top: addPanel.screenY }}
        >
          <AddNodePanel
            onPick={(action) =>
              handleAddNodeAction(
                action,
                { x: addPanel.flowX, y: addPanel.flowY },
                addPanel.sourceNodeId,
              )
            }
          />
        </div>
      )}

      {/* Empty state */}
      {nodes.length === 0 && !railOpen && !addPanel && (
        <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center gap-5 text-center">
          <div className="text-3xl font-bold tracking-tight">
            从一个想法
            <span className="bg-gradient-to-r from-brand-purple via-brand-cyan to-brand-purple bg-clip-text text-transparent"> 开始 </span>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] light:border-black/[0.08] bg-surface-elevated/80 px-3 py-1.5 text-sm text-muted backdrop-blur-xl">
            <MousePointerClick className="size-4 text-brand-cyan" />
            <span className="font-medium">双击</span>
            <span>画布任意位置 · 自由生成或挑选模板</span>
          </div>
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
            <QuickChip
              icon={<ImageIcon className="size-3.5" />}
              label="文生图"
              onClick={() => handleAddNodeAction({ kind: "template", templateId: "text-to-image" })}
            />
            <QuickChip
              icon={<Clapperboard className="size-3.5" />}
              label="图生视频"
              onClick={() => handleAddNodeAction({ kind: "template", templateId: "image-to-video" })}
            />
            <QuickChip
              icon={<Sparkles className="size-3.5" />}
              label="文字生视频"
              onClick={() => handleAddNodeAction({ kind: "template", templateId: "text-to-video" })}
            />
            <QuickChip
              icon={<ImagePlus className="size-3.5" />}
              label="上传图片"
              onClick={() => handleAddNodeAction({ kind: "upload" })}
            />
            <QuickChip
              icon={<Type className="size-3.5" />}
              label="文本节点"
              onClick={() => handleAddNodeAction({ kind: "text" })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-Components ─── */

function QuickChip({
  icon, label, onClick,
}: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] light:border-black/[0.08] bg-surface-elevated/80 px-3 py-1.5 text-xs font-medium text-secondary backdrop-blur-xl transition-colors hover:border-brand-purple/30 hover:bg-white/[0.06] light:bg-black/[0.05] hover:text-primary/80"
    >
      {icon}
      {label}
    </button>
  );
}

function CanvasLeftRail({
  active, onToggleAdd, onQuickAdd,
}: {
  active: boolean;
  onToggleAdd: () => void;
  onQuickAdd: (kind: CanvasNodeKind) => void;
}) {
  return (
    <aside className="absolute left-4 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-1 rounded-2xl border border-white/[0.08] light:border-black/[0.08] bg-surface-elevated/80 p-1.5 shadow-lg backdrop-blur-xl">
      <RailBtn
        active={active}
        icon={<Plus className="size-4" />}
        label="添加节点"
        onClick={onToggleAdd}
      />
      <div className="my-1 h-px w-6 bg-white/[0.06] light:bg-black/[0.05]" />
      <RailBtn icon={<ImageIcon className="size-4" />} label="图像节点" onClick={() => onQuickAdd("image")} />
      <RailBtn icon={<Clapperboard className="size-4" />} label="视频节点" onClick={() => onQuickAdd("video")} />
      <RailBtn icon={<Type className="size-4" />} label="文本节点" onClick={() => onQuickAdd("text")} />
      <RailBtn icon={<ImagePlus className="size-4" />} label="上传图片" onClick={() => onQuickAdd("upload")} />
    </aside>
  );
}

function RailBtn({
  active, icon, label, onClick,
}: { active?: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "flex size-9 items-center justify-center rounded-lg transition-colors",
        active
          ? "bg-brand-purple text-white"
          : "text-muted hover:bg-white/[0.06] light:bg-black/[0.05] hover:text-primary/70",
      )}
    >
      {icon}
    </button>
  );
}
