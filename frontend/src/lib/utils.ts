import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

let _shortIdCounter = 0;
export function shortId(prefix = ""): string {
  _shortIdCounter += 1;
  return `${prefix}${_shortIdCounter}_${Date.now().toString(36)}`;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/spiritlens";

/**
 * Resolve image URL: prefix local upload paths with API base for nginx proxy.
 */
export function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/uploads/")) return `${API_BASE}${url}`;
  return url;
}
