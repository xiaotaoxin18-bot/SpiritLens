"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Heart, Eye, Sparkles, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Link from "next/link";
import { api } from "@/services/api";

interface FeaturedPost {
  id: string;
  title: string;
  cover_url: string | null;
  cover_width: number | null;
  cover_height: number | null;
  like_count: number;
  view_count: number;
  user_nickname: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

function imgUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path}`;
}

export default function FeaturedWorks() {
  const [posts, setPosts] = useState<FeaturedPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ posts: FeaturedPost[] }>("/api/v1/community/featured")
      .then((res) => setPosts(res.posts))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="w-full px-4 sm:px-8 py-16">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2">
            灵感作品
          </h2>
          <p className="text-text-muted text-sm">
            看看大家都在创作什么
          </p>
        </div>
        <Link href="/community">
          <Button variant="ghost" size="sm">
            查看全部
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-text-muted" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Sparkles className="size-8 text-text-muted/30 mb-3" />
          <p className="text-sm text-text-muted">还没有发布的作品</p>
          <p className="text-xs text-text-muted/60 mt-1">先去创作再发布到社区吧</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="columns-2 sm:columns-4 gap-4"
        >
          {posts.slice(0, 4).map((work, i) => {
            let paddingBottom = "75%";
            if (work.cover_width && work.cover_height) {
              const ratio = work.cover_height / work.cover_width;
              paddingBottom = `${Math.min(ratio * 100, 200)}%`;
            } else {
              paddingBottom = ["75%", "100%", "133%", "56%"][i];
            }

            return (
              <motion.div
                key={work.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="break-inside-avoid mb-4 group"
              >
                <div className="relative overflow-hidden rounded-2xl bg-surface-card">
                  <div style={{ paddingBottom }}>
                    {work.cover_url ? (
                      <img
                        src={imgUrl(work.cover_url)}
                        alt={work.title}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-purple/10 to-brand-cyan/10">
                        <Sparkles className="size-8 text-muted/20" />
                      </div>
                    )}
                  </div>

                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

                  <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                    <p className="text-white font-semibold text-sm leading-tight line-clamp-2 drop-shadow-sm">
                      {work.title}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-white/60 text-xs">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3" />
                        {work.like_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {work.view_count}
                      </span>
                    </div>
                    <p className="text-white/40 text-[10px] mt-1">
                      {work.user_nickname}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </section>
  );
}
