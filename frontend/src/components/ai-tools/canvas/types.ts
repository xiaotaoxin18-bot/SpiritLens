import type { Node, Edge } from "@xyflow/react";

/* ─── Canvas Node Kind ─── */
export type CanvasNodeKind = "image" | "video" | "text" | "upload" | "director-stage";

/* ─── Node Status ─── */
export type CanvasNodeStatus = "idle" | "running" | "succeeded" | "failed";

/* ─── Image Generation Params ─── */
export interface ImageParams {
  size: string;
  batch: number;
  style: string;
  quality?: number; // 1-10 画质强度
  negativePrompt?: string;
  seed?: number;
}

/* ─── Node Data ─── */
// ReactFlow requires node data to extend Record<string, unknown>
export type FlowNodeData = CanvasNodeData & Record<string, unknown>;

export interface CanvasNodeData {
  kind: CanvasNodeKind;
  prompt: string;
  modelId: string;
  status: CanvasNodeStatus;
  progress: number;

  // Image results
  imageUrls?: string[];
  // Video results
  videoPosterUrl?: string;
  videoUrl?: string;

  errorMessage?: string;
  generationId?: string;

  // Image-specific params
  imageParams?: ImageParams;
  // Video-specific params
  videoParams?: { duration?: number; resolution?: string; camera?: string };

  // Director stage
  directorStageId?: string;

  // Ephemeral callbacks (injected by canvas-editor, not persisted)
  onDelete?: () => void;
  onPromptChange?: (p: string) => void;
  onModelChange?: (id: string) => void;
  onGenerate?: () => void;

  // Image node specific
  onParamsChange?: (patch: Partial<ImageParams>) => void;
  onQuickGenerate?: (opts: {
    promptAppend?: string;
    paramsOverride?: Partial<ImageParams>;
    persistAppend?: boolean;
  }) => void;
  onSaveAsSubject?: (name: string) => void;
  onSendToVideo?: () => void;
  onSetUploadedImage?: (url: string) => void;
  onImageChange?: (url?: string) => void;

  // Video node specific
  inputImageUrl?: string;

  // Text node specific
  onTextChange?: (text: string) => void;

  // Real API generation tracking
  taskId?: string;                // Backend task ID for status polling / cancel
  upstreamPrompts?: string[];     // Prompts from upstream nodes (injected by canvas-editor)
  upstreamImageUrls?: string[];   // Image URLs from upstream nodes (injected by canvas-editor)
  inputImageUrl?: string;         // First upstream image (convenience)

  // Dynamic model data (injected by canvas-editor, from backend API)
  canvasModels?: Array<{ id: string; name: string; vendor?: string; cost_per_unit?: number }>;
  supportedSizes?: Array<{ label: string; value: string }>;
}

/* ─── Canvas Document ─── */
export interface CanvasDoc {
  id: string;
  title: string;
  kind: "flow" | "freeform";
  nodes: DocNode[];
  edges: DocEdge[];
  viewport: { x: number; y: number; zoom: number };
  coverUrl?: string;
}

export interface DocNode {
  id: string;
  type: CanvasNodeKind;
  position: { x: number; y: number };
  data: CanvasNodeData;
}

export interface DocEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/* ─── Add Node Panel ─── */
export type AddNodeAction =
  | { kind: "image" }
  | { kind: "video" }
  | { kind: "text" }
  | { kind: "upload" }
  | { kind: "template"; templateId: TemplateId };

export type TemplateId = "text-to-image" | "image-to-video" | "text-to-video";

/* ─── Mapper helpers ─── */
export function toFlowNode(n: DocNode): Node<FlowNodeData> {
  return { id: n.id, type: n.type, position: n.position, data: n.data as FlowNodeData };
}

export function fromFlowNode(n: Node<FlowNodeData>): DocNode {
  const data = n.data as CanvasNodeData & Record<string, unknown>;
  const rest: CanvasNodeData = {
    kind: data.kind,
    prompt: data.prompt,
    modelId: data.modelId,
    status: data.status,
    progress: data.progress,
    imageUrls: data.imageUrls,
    videoPosterUrl: data.videoPosterUrl,
    videoUrl: data.videoUrl,
    errorMessage: data.errorMessage,
    generationId: data.generationId,
    imageParams: data.imageParams,
    videoParams: data.videoParams,
    directorStageId: data.directorStageId,
  };
  return {
    id: n.id,
    type: n.type as CanvasNodeKind,
    position: n.position,
    data: rest,
  };
}

export function toFlowEdge(e: DocEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
    animated: true,
  };
}

export function fromFlowEdge(e: Edge): DocEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
  };
}
