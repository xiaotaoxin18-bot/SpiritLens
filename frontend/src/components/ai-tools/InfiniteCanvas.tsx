"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { CanvasEditor } from "./canvas/canvas-editor";

interface Props {
  projectId?: string;
  onBack?: () => void;
}

export default function InfiniteCanvas({ projectId, onBack }: Props) {
  return (
    <ReactFlowProvider>
      <CanvasEditor projectId={projectId} onBack={onBack} />
    </ReactFlowProvider>
  );
}
