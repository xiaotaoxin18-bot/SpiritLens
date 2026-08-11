"use client";

import { useRouter } from "next/navigation";
import { Package, Check, AlertCircle, Sparkles, Loader2, Upload, Trash2 } from "lucide-react";
import { resolveImageUrl } from "@/lib/utils";
import ImageUploadButton from "./ImageUploadButton";

interface PropData {
  id?: string;
  name: string;
  description?: string;
  image_url?: string;
  status?: string;
}

interface Props {
  projectId: string;
  prop: PropData;
  isGenerating: boolean;
  onUpload: (file: File) => void;
  onGenerate: () => void;
  onDelete?: () => void;
  variantCount?: number;
}

export default function PropCard({
  projectId, prop, isGenerating, onUpload, onGenerate, onDelete, variantCount,
}: Props) {
  const router = useRouter();
  const hasImage = !!prop.image_url;

  const handleClick = () => {
    if (prop.id) {
      router.push(`/projects/${projectId}/assets/props/${prop.id}`);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="rounded-2xl border border-border-subtle bg-surface-card overflow-hidden flex flex-col cursor-pointer hover:border-border-glow hover:shadow-sm transition-all"
    >
      {/* Image — padding-bottom square */}
      <div className="relative w-full" style={{ paddingBottom: "100%" }}>
        <div className="absolute inset-0 bg-surface-elevated group/image cursor-pointer">
          {hasImage ? (
            <>
              <img src={resolveImageUrl(prop.image_url)} alt={prop.name} className="w-full h-full object-cover" />
              <div className="absolute top-2 right-2 p-1 bg-accent-green rounded-full shadow"><Check className="size-3 text-white" /></div>
              {/* Variant count badge */}
              {variantCount != null && variantCount > 0 && (
                <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[9px] font-bold backdrop-blur-sm">
                  +{variantCount}
                </div>
              )}
              {/* Delete button — hover visible */}
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="absolute top-2 left-2 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover/image:opacity-100 hover:bg-red-500 transition-all z-10"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/40 transition-all flex items-center justify-center">
                <span className="text-white/0 group-hover/image:text-white text-xs font-medium transition-all flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-white/60" />
                  点击编辑
                  <span className="size-1.5 rounded-full bg-white/60" />
                </span>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-text-muted p-4 text-center gap-2">
              <Package className="size-8 opacity-20" />
              <div onClick={(e) => e.stopPropagation()}>
                <ImageUploadButton onUpload={onUpload} onGenerate={onGenerate} isGenerating={isGenerating} uploadLabel="上传" generateLabel="生成" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Name */}
      <div className="px-2 py-2.5 text-center">
        <span className="text-xs font-bold text-text-primary block truncate">{prop.name}</span>
      </div>
    </div>
  );
}
