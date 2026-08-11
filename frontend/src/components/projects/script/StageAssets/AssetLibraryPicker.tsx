"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X, ImageIcon, Users, MapPin, Package, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { resolveImageUrl } from "@/lib/utils";
import { api } from "@/services/api";

interface LibraryItem {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  prompt?: string;
  group_id?: string | null;
}

interface Props {
  projectId: string;
  type: "characters" | "scenes" | "props";
  /** single（默认）：第二层点击即返回；multi：勾选后点「确认添加」批量返回 */
  mode?: "single" | "multi";
  onSelect: (items: LibraryItem | LibraryItem[]) => void;
  onClose: () => void;
}

const ICONS = { characters: Users, scenes: MapPin, props: Package };
const LABELS = { characters: "角色", scenes: "场景", props: "道具" };

export default function AssetLibraryPicker({ projectId, type, mode = "single", onSelect, onClose }: Props) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // 第二层：当前展开的主条目
  const [main, setMain] = useState<LibraryItem | null>(null);
  // multi 模式勾选的形象 id
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.get<{ total: number; characters?: LibraryItem[]; scenes?: LibraryItem[]; props?: LibraryItem[] }>(
          `/api/v1/projects/${projectId}/${type}`
        );
        setItems((data as any)[type] || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    load();
  }, [projectId, type]);

  // 第一层：只显示主条目（group_id 为空），变体通过计数徽标展示
  const mains = useMemo(() => items.filter(i => !i.group_id), [items]);
  const variantCount = (mainId: string) => items.filter(i => i.group_id === mainId).length;
  const filteredMains = mains.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  // 第二层：主条目 + 它的全部形象（变体）
  const looks = useMemo(() => {
    if (!main) return [];
    return [main, ...items.filter(i => i.group_id === main.id)];
  }, [main, items]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const confirmMulti = () => {
    const selected = looks.filter(i => selectedIds.includes(i.id));
    if (selected.length > 0) onSelect(selected);
  };

  const handleItemClick = (item: LibraryItem) => {
    if (mode === "multi") toggleSelect(item.id);
    else onSelect(item);
  };

  const Icon = ICONS[type];

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-card border border-border-subtle w-full max-w-2xl max-h-[80vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {main && (
              <button
                onClick={() => { setMain(null); setSelectedIds([]); }}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-all shrink-0"
                title="返回"
              >
                <ChevronLeft className="size-4" />
              </button>
            )}
            <Icon className="size-5 text-brand-cyan shrink-0" />
            <h2 className="text-base font-bold text-text-primary truncate">
              {main ? `${main.name} 的形象` : `从资产库选择${LABELS[type]}`}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-all shrink-0">
            <X className="size-4" />
          </button>
        </div>

        {/* Search（仅第一层） */}
        {!main && (
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
        )}

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="size-6 text-text-muted animate-spin" /></div>
          ) : !main ? (
            filteredMains.length === 0 ? (
              <div className="text-center py-12">
                <Icon className="size-12 text-text-muted/20 mx-auto mb-3" />
                <p className="text-sm text-text-muted">{search ? "未匹配到结果" : `暂无已保存的${LABELS[type]}`}</p>
                <p className="text-xs text-text-muted/60 mt-1">{search ? "" : "请先在角色卡片中点击\"加入资产库\""}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredMains.map((item) => {
                  const vc = variantCount(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => setMain(item)}
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
                        {vc > 0 ? (
                          <p className="text-[10px] text-brand-cyan/70 font-mono">{vc} 个形象</p>
                        ) : item.description ? (
                          <p className="text-[10px] text-text-muted truncate">{item.description}</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-text-muted group-hover:text-brand-cyan transition-all">
                        <ChevronRight className="size-4" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            /* 第二层：该主条目的全部形象 */
            <div className="grid grid-cols-3 gap-3">
              {looks.map((item) => {
                const isMain = item.id === main.id;
                const selected = selectedIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`relative rounded-xl overflow-hidden border transition-all cursor-pointer group ${mode === "multi" && selected ? "border-brand-cyan ring-2 ring-brand-cyan/40" : "border-border-subtle hover:border-brand-cyan/40"}`}
                  >
                    <div className="relative w-full" style={{ paddingBottom: "100%" }}>
                      <div className="absolute inset-0 bg-surface-elevated">
                        {item.image_url ? (
                          <img src={resolveImageUrl(item.image_url)} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><ImageIcon className="size-6 text-text-muted/30" /></div>
                        )}
                        {/* multi 模式勾选角标 */}
                        {mode === "multi" && (
                          <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selected ? "bg-brand-cyan border-brand-cyan" : "bg-black/40 border-white/50"}`}>
                            {selected && <Check className="size-3 text-white" />}
                          </div>
                        )}
                        {isMain && (
                          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/50 text-white text-[9px] font-mono">原始</span>
                        )}
                      </div>
                    </div>
                    <div className="px-2 py-1.5 bg-surface-card">
                      <p className="text-[11px] font-medium text-text-primary truncate">{item.name}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* multi 模式底部确认栏（第二层） */}
        {mode === "multi" && main && (
          <div className="px-6 py-3 border-t border-border-subtle flex items-center justify-between shrink-0">
            <span className="text-xs text-text-muted">已选 {selectedIds.length} 张</span>
            <button
              onClick={confirmMulti}
              disabled={selectedIds.length === 0}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-purple to-brand-cyan-dim text-white text-xs font-bold disabled:opacity-40 transition-all"
            >
              确认添加{selectedIds.length > 0 ? `（${selectedIds.length} 张）` : ""}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
