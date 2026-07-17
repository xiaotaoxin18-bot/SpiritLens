"use client";

import { X, Download } from "lucide-react";
import { resolveImageUrl } from "@/lib/utils";

interface Props {
  url: string | null;
  onClose: () => void;
}

function handleDownload(url: string) {
  const fullUrl = resolveImageUrl(url);
  const a = document.createElement("a");
  a.href = fullUrl;
  a.download = url.split("/").pop() || "image.jpg";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function ImagePreviewModal({ url, onClose }: Props) {
  if (!url) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <img src={resolveImageUrl(url)} alt="preview" className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain" onClick={(e) => e.stopPropagation()} />
      <div className="absolute top-4 right-4 flex gap-2">
        <button
          className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          onClick={(e) => { e.stopPropagation(); handleDownload(url); }}
          title="下载"
        >
          <Download className="size-5" />
        </button>
        <button
          className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          onClick={onClose}
        >
          <X className="size-5" />
        </button>
      </div>
    </div>
  );
}
