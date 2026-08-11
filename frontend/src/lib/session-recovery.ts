/**
 * 从后端同步历史创作记录到 IndexedDB（合并语义，跨设备同步）。
 * 每次打开 AI 工具页调用一次：
 *  - 补缺：后端有、本地没有的记录按「类型+日期」分组补建会话
 *  - 孤儿移除：本地有后端 id、但后端已不存在的记录（在其他设备被删除）→ 移除
 * 删除会话时前端会联动 DELETE /user/assets/{creationId}，因此后端记录消失后，
 * 其他设备合并时对应记录会被自动移除 —— 实现「删除全局生效」。
 */

import { api } from "@/services/api";
import { useSessionStore } from "@/store/sessions";
import type { GenerationResult, Session } from "@/store/sessions";

/** 后端返回的创作记录结构 */
interface RecoverItem {
  id: string;
  type: "image" | "video";
  status: string;
  media_url: string;
  prompt: string;
  model_id: string;
  image_urls: string[];
  task_id: string;
  created_at: string;
  generation_params: {
    size?: string;
    duration?: number;
    batch?: number;
    negative_prompt?: string;
    seed?: number;
  };
}

interface RecoverResponse {
  items: RecoverItem[];
}

// 本次页面生命周期只合并一次（video/image 两页共享同一标志）。
// 注意：recover 接口 LIMIT 500，超出部分的旧记录不会出现在 serverIds，
// 对应本地 generation 会被孤儿移除 —— 现有上限，可接受。
let merged = false;

/** 从 generation 解析后端 creations 记录 id（本机生成的存 creationId，恢复的存 recover-{id}） */
function backendIdOf(gen: Pick<GenerationResult, "id" | "creationId">): string | undefined {
  if (gen.creationId) return gen.creationId;
  if (gen.id.startsWith("recover-")) return gen.id.slice("recover-".length);
  return undefined;
}

/**
 * 从后端合并历史创作记录到 session store。
 * 幂等：按后端 id 去重，重复调用不会产生重复记录。
 * @returns 后端记录总数，0 表示无记录可合并或已跳过
 */
export async function restoreHistory(): Promise<number> {
  console.log("[recovery] 开始合并历史记录...");
  if (merged) return 0;
  merged = true; // 请求发出即置位，失败也不重试（两页面共享）

  let items: RecoverItem[];
  try {
    const res = await api.get<RecoverResponse>("/api/v1/user/assets/recover");
    items = res.items || [];
  } catch (err) {
    console.warn("[recovery] 同步历史记录失败:", err);
    return 0;
  }
  if (items.length === 0) return 0;

  // 后端全部记录 id（含 FAILED/PROCESSING）——用于孤儿判断
  const serverIds = new Set(items.map((i) => i.id));

  // 1) 孤儿移除：本地记录的后端 id 已不存在（其他设备删除了）→ 同步移除
  //    仅处理「原本非空」的会话——用户新建的空对话（如点「新对话」）不能参与，
  //    否则合并完成时会被当"清空会话"误删（原对话消失 bug）
  const emptiedIds = new Set<string>();
  for (const s of useSessionStore.getState().sessions) {
    if (s.generations.length === 0) continue;
    for (const g of [...s.generations]) {
      const bid = backendIdOf(g);
      if (bid && !serverIds.has(bid)) {
        useSessionStore.getState().removeGeneration(s.id, g.id);
        emptiedIds.add(s.id);
      }
    }
  }
  // 仅移除「因孤儿移除而清空」的会话（全局删除同步），保留用户新建的空对话
  for (const s of useSessionStore.getState().sessions) {
    if (emptiedIds.has(s.id) && s.generations.length === 0) {
      useSessionStore.getState().remove(s.id);
    }
  }

  // 2) 补缺：只恢复成功的记录，按类型 + 日期分组
  const completed = items.filter((i) => i.status === "completed" && i.media_url);
  if (completed.length === 0) return items.length;

  const groups: Record<string, { type: "image" | "video"; date: string; items: RecoverItem[] }> = {};
  for (const item of completed) {
    const date = item.created_at.slice(0, 10);
    const key = `${item.type}:${date}`;
    if (!groups[key]) {
      groups[key] = { type: item.type, date, items: [] };
    }
    groups[key].items.push(item);
  }

  // 本地已存在的后端 id 集合
  const localBackendIds = new Set<string>();
  for (const s of useSessionStore.getState().sessions) {
    for (const g of s.generations) {
      const bid = backendIdOf(g);
      if (bid) localBackendIds.add(bid);
    }
  }

  const groupKeys = Object.keys(groups).sort();
  for (const key of groupKeys) {
    const group = groups[key];
    const missing = group.items.filter((item) => !localBackendIds.has(item.id));
    if (missing.length === 0) continue; // 组内记录本地已全有

    // 组内部分缺失：建（或复用）会话后只补缺失记录，避免重复
    const label = group.date.replace("2026-", "").replace("-", "月") + "日";
    const store = useSessionStore.getState();
    const sessionId = store.create(group.type, label);

    const sorted = [...missing].reverse();
    for (const item of sorted) {
      const modelId = item.model_id || "unknown";
      const isVideo = item.type === "video";

      store.addGeneration(sessionId, {
        id: `recover-${item.id}`,
        prompt: item.prompt,
        modelId,
        status: "succeeded",
        progress: 100,
        createdAt: item.created_at,
        taskId: item.task_id,
        creationId: item.id, // 关键：关联后端记录 id，删除会话时才能联动后端
        ...(isVideo
          ? { videoUrl: item.media_url, videoParams: { duration: item.generation_params.duration || 5, size: item.generation_params.size || "1280x720" } }
          : { imageUrls: item.image_urls, imageParams: { size: item.generation_params.size || "1024x1024", batch: item.generation_params.batch || 1, style: "", negativePrompt: item.generation_params.negative_prompt } }
        ),
      });
    }
  }

  console.info(`[recovery] 已合并 ${items.length} 条创作记录`);
  return items.length;
}

/** 收集一个会话内所有 generation 对应的后端记录 id（供删除会话时联动） */
export function collectBackendIds(session: Session): string[] {
  const ids: string[] = [];
  for (const g of session.generations) {
    const bid = backendIdOf(g);
    if (bid) ids.push(bid);
  }
  return ids;
}
