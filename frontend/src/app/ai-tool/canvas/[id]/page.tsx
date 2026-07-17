"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";
import { getCanvasProjects } from "@/lib/canvas-storage";

// Dynamic import to avoid SSR issues with ReactFlow
const InfiniteCanvas = dynamic(
  () => import("@/components/ai-tools/InfiniteCanvas"),
  { ssr: false }
);

export default function CanvasProjectPage() {
  const params = useParams();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // In Next.js 16, params is a Promise — need to await it
  const projectId = params.id as string;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !projectId) return;
    // Check if project exists in localStorage
    const projects = getCanvasProjects();
    const exists = projects.some((p) => p.id === projectId);
    if (!exists) {
      setNotFound(true);
    }
  }, [mounted, projectId]);

  if (!mounted) {
    return (
      <div className="h-screen bg-surface-base flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-brand-cyan" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="h-screen bg-surface-base flex flex-col items-center justify-center gap-4">
        <p className="text-text-muted text-sm">画布项目不存在</p>
        <button
          onClick={() => router.push("/ai-tool/canvas")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-primary transition-colors text-sm"
        >
          <ArrowLeft className="size-4" />
          返回画布列表
        </button>
      </div>
    );
  }

  return (
    <InfiniteCanvas
      projectId={projectId}
      onBack={() => router.push("/ai-tool/canvas")}
    />
  );
}
