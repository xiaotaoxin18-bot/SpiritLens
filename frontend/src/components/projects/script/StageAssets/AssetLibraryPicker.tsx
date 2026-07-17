"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, X, ImageIcon, Users, MapPin, Package, Check } from "lucide-react";
import { cn, resolveImageUrl } from "@/lib/utils";
import { api } from "@/services/api";

interface LibraryItem {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  prompt?: string;
}

interface Props {
  projectId: string;
  type: "characters" | "scenes" | "props";
  onSelect: (item: LibraryItem) => void;
  onClose: () => void;
}

const ICONS = { characters: Users, scenes: MapPin, props: Package };
const LABELS = { characters: "角色", scenes: "场景", props: "道具" };

export default function AssetLibraryPicker({ projectId, type, onSelect, onClose }: Props) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.get<{ total: number; characters?: LibraryItem[]; scenes?: LibraryItem[]; props?: LibraryItem[] }>(
          `/api/v1/projects/${projectId}/${type}`
        );
        const key = type;
        setItems((data as any)[key] || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    load();
  }, [projectId, type]);

  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
  const Icon = ICONS[type];

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-card border border-border-subtle w-full max-w-2xl max-h-[80vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Icon className="size-5 text-brand-cyan" />
            <h2 className="text-base font-bold text-text-primary">从资产库选择{LABELS[type]}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-all">
            <X className="size-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-border-subtle">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`搜索${LABELS[type]}...`}
              className="w-full rounded-lg border border-border-subtle bg-surface-base py-2 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-cyan/50 transition-all"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="size-6 text-text-muted animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Icon className="size-12 text-text-muted/20 mx-auto mb-3" />
              <p className="text-sm text-text-muted">{search ? "未匹配到结果" : `暂无已保存的${LABELS[type]}`}</p>
              <p className="text-xs text-text-muted/60 mt-1">{search ? "" : "请先在角色卡片中点击\"加入资产库\""}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border-subtle bg-surface-card hover:border-brand-cyan/30 hover:bg-brand-cyan/5 transition-all text-left group"
                >
                  <div className="w-12 h-12 rounded-lg bg-surface-elevated overflow-hidden shrink-0 flex items-center justify-center">
                    {item.image_url ? (
                      <img src={resolveImageUrl(item.image_url)} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="size-5 text-text-muted/30" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{item.name}</p>
                    {item.description && <p className="text-[10px] text-text-muted truncate">{item.description}</p>}
                  </div>
                  <div className="shrink-0 w-8 h-8 rounded-full border-2 border-border-subtle flex items-center justify-center group-hover:border-brand-cyan/50 transition-all">
                    <Check className="size-4 text-transparent group-hover:text-brand-cyan/50" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
