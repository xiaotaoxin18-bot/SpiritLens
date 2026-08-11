"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Image, Video, Layout, Briefcase, Sparkles, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

const TOOLS = [
  {
    title: "AI 图片生成",
    description: "文生图 / 图生图，让你的想象变成现实",
    href: "/ai-tool/image",
    icon: Image,
    gradient: "from-brand-purple to-brand-cyan",
    color: "text-brand-cyan",
    badge: "热门",
  },
  {
    title: "AI 视频生成",
    description: "文生视频 / 图生视频，让画面动起来",
    href: "/ai-tool/video",
    icon: Video,
    gradient: "from-accent-pink to-accent-amber",
    color: "text-accent-pink",
    badge: "热门",
  },
  {
    title: "智能画布",
    description: "无限画布 / AI 融合创作",
    href: "/ai-tool/canvas",
    icon: Layout,
    gradient: "from-accent-amber to-accent-green",
    color: "text-accent-amber",
    badge: "新功能",
  },
  {
    title: "项目管理",
    description: "从剧本到成片，AI 全流程辅助创作",
    href: "/projects",
    icon: Briefcase,
    gradient: "from-brand-cyan to-accent-pink",
    color: "text-brand-cyan",
    badge: "新功能",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function ToolGrid() {
  return (
    <section className="w-full px-4 sm:px-8 pt-0 pb-12 mt-[15px] tool-grid">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2">
          选择你的创作工具
        </h2>
        <p className="text-text-muted text-sm">
          点击即用，无需配置，让 AI 帮你实现创意
        </p>
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <motion.div key={tool.title} variants={item}>
              <Link href={tool.comingSoon ? "#" : tool.href}>
                <Card
                  hover={!tool.comingSoon}
                  className={cn(
                    "h-full flex flex-col relative group",
                    tool.comingSoon && "opacity-60"
                  )}
                >
                  {/* Badge */}
                  {tool.badge && (
                    <span
                      className={cn(
                        "absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-medium",
                        "bg-gradient-to-r border border-border-subtle",
                        tool.badge === "热门"
                          ? "from-brand-cyan/20 text-brand-cyan"
                          : tool.badge === "新功能"
                          ? "from-accent-pink/20 text-accent-pink"
                          : "from-text-muted/20 text-text-muted"
                      )}
                    >
                      {tool.badge}
                    </span>
                  )}

                  {/* Icon */}
                  <div
                    className={cn(
                      "w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center mb-4",
                      tool.gradient
                    )}
                  >
                    <Icon className="w-6 h-6 text-white" />
                  </div>

                  {/* Content */}
                  <h3 className={cn("text-lg font-semibold mb-2", tool.color)}>
                    {tool.title}
                  </h3>
                  <p className="text-sm text-text-secondary">
                    {tool.description}
                  </p>

                  {/* Action */}
                  <div className="flex items-center gap-1 mt-auto pt-4 text-xs text-text-muted group-hover:text-brand-cyan transition-colors">
                    <span>{tool.comingSoon ? "即将上线" : "开始使用"}</span>
                    {!tool.comingSoon && <ArrowRight className="w-3 h-3" />}
                  </div>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
