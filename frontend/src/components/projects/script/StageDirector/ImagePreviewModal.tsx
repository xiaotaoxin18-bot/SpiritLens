"use client";

import { X } from "lucide-react";
import { resolveImageUrl } from "@/lib/utils";

interface Props {
  imageUrl: string | null;
  title?: string;
  onClose: () => void;
}

export default function ImagePreviewModal({ imageUrl, title, onClose }: Props) {
  if (!imageUrl) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-8 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-h-[90vh] max-w-[90vw]">
        {title && (
          <div className="absolute -top-8 left-0 text-sm text-white/70">{title}</div>
        )}
        <button onClick={onClose} className="absolute -top-8 right-0 p-1 text-white/70 hover:text-white transition-colors">
          <X className="size-5" />
        </button>
        <img
          src={resolveImageUrl(imageUrl)}
          alt={title || "preview"}
          className="max-h-[85vh] max-w-[90vw] rounded-2xl object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
