"use client";

export interface CanvasProject {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl?: string;
}

const PROJECTS_KEY = "spiritlens:canvas:projects";
const DATA_PREFIX = "spiritlens:canvas:data:";

let _projectCounter = 0;

export function genCanvasId(): string {
  _projectCounter += 1;
  return `canvas_${_projectCounter}_${Date.now().toString(36)}`;
}

export function getCanvasProjects(): CanvasProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCanvasProjects(projects: CanvasProject[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function createCanvasProject(title?: string): CanvasProject {
  const id = genCanvasId();
  const now = new Date().toISOString();
  const project: CanvasProject = {
    id,
    title: title || `画布项目`,
    createdAt: now,
    updatedAt: now,
  };
  const projects = getCanvasProjects();
  projects.unshift(project);
  saveCanvasProjects(projects);
  return project;
}

export function renameCanvasProject(id: string, title: string): void {
  updateCanvasProject(id, { title });
}

export function deleteCanvasProject(id: string): void {
  const projects = getCanvasProjects().filter((p) => p.id !== id);
  saveCanvasProjects(projects);
  if (typeof window !== "undefined") {
    localStorage.removeItem(`${DATA_PREFIX}${id}`);
  }
}

export function updateCanvasProject(
  id: string,
  updates: Partial<CanvasProject>
): void {
  const projects = getCanvasProjects();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx === -1) return;
  projects[idx] = {
    ...projects[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveCanvasProjects(projects);
}

export function getCanvasData(
  id: string
): { nodes: unknown[]; edges: unknown[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${DATA_PREFIX}${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCanvasData(
  id: string,
  nodes: unknown[],
  edges: unknown[]
): void {
  if (typeof window === "undefined") return;
  try {
    // Strip ephemeral callbacks before saving (they can't be serialized)
    const cleanNodes = (nodes as Record<string, unknown>[]).map((n) => ({
      ...n,
      data: Object.fromEntries(
        Object.entries(
          (n.data as Record<string, unknown>) || {}
        ).filter(
          ([k]) =>
            !k.startsWith("on") &&
            k !== "upstreamPrompts" &&
            k !== "upstreamImageUrls" &&
            k !== "inputImageUrl" &&
            k !== "canvasModels" &&
            k !== "supportedSizes" &&
            k !== "taskId"
        )
      ),
    }));
    localStorage.setItem(
      `${DATA_PREFIX}${id}`,
      JSON.stringify({ nodes: cleanNodes, edges })
    );
  } catch {
    // ignore
  }
}

/** Extract the first successful image URL from canvas nodes for thumbnail */
export function extractThumbnail(nodes: unknown[]): string | undefined {
  for (const n of nodes as Record<string, unknown>[]) {
    const data = n.data as Record<string, unknown> | undefined;
    if (!data) continue;
    const urls = data.imageUrls as string[] | undefined;
    if (urls && urls.length > 0 && urls[0]) return urls[0];
    const poster = data.videoPosterUrl as string | undefined;
    if (poster) return poster;
  }
  return undefined;
}
