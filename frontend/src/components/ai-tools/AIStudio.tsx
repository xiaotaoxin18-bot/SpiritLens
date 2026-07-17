"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Download,
  Heart,
  RefreshCw,
  Image,
  Video,
  Layout,
  SlidersHorizontal,
} from "lucide-react";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface AIStudioProps {
  type: "image" | "video" | "canvas";
}

const TYPE_CONFIG = {
  image: {
    title: "AI 图片生成",
    description: "文生图 · 图生图",
    icon: Image,
    placeholder: "描述你想要的画面，例如：一只在太空漫步的猫，赛博朋克风格...",
    params: [
      { label: "图片尺寸", options: ["1:1", "3:4", "4:3", "9:16", "16:9"] },
      { label: "生成数量", options: ["1张", "2张", "4张"] },
    ],
  },
  video: {
    title: "AI 视频生成",
    description: "文生视频 · 首尾帧 · 动作模仿",
    icon: Video,
    placeholder: "描述视频内容，例如：日落时分，海浪拍打礁石， cinematic...",
    params: [
      { label: "视频时长", options: ["3秒", "5秒", "10秒", "15秒"] },
      { label: "运镜方式", options: ["固定", "推近", "拉远", "左右平移", "上下移动"] },
    ],
  },
  canvas: {
    title: "智能画布",
    description: "局部重绘 · 扩图 · 抠图 · AI 融合",
    icon: Layout,
    placeholder: "描述你要修改的区域或风格...",
    params: [
      { label: "工具", options: ["局部重绘", "智能扩图", "AI 抠图", "AI 融合"] },
    ],
  },
};

const MOCK_RESULTS = [
  {
    id: 1,
    url: null,
    gradient: "from-brand-purple/30 via-brand-mid/30 to-brand-cyan/30",
    prompt: "示例作品 1",
  },
  {
    id: 2,
    url: null,
    gradient: "from-accent-pink/30 via-accent-amber/30 to-accent-green/30",
    prompt: "示例作品 2",
  },
  {
    id: 3,
    url: null,
    gradient: "from-brand-deep/40 via-brand-mid/30 to-brand-purple/30",
    prompt: "示例作品 3",
  },
  {
    id: 4,
    url: null,
    gradient: "from-brand-cyan/30 via-brand-purple/30 to-accent-pink/30",
    prompt: "示例作品 4",
  },
];

export default function AIStudio({ type }: AIStudioProps) {
  const config = TYPE_CONFIG[type];
  const Icon = config.icon;
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showParams, setShowParams] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    // Mock generation
    await new Promise((r) => setTimeout(r, 2000));
    setIsGenerating(false);
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-6 w-full px-4 sm:px-8 py-8">
      {/* Left Panel — Input */}
      <div className="lg:w-[420px] flex-shrink-0">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="sticky top-24 space-y-5"
        >
          {/* Header */}
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center">
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-text-primary">
                  {config.title}
                </h1>
                <p className="text-xs text-text-muted">{config.description}</p>
              </div>
            </div>
          </div>

          {/* Prompt Input */}
          <Card>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              描述词
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={config.placeholder}
              rows={4}
              className="w-full px-4 py-3 bg-surface-dark border border-border-subtle rounded-[12px] text-text-primary placeholder:text-text-muted text-sm resize-none focus:outline-none focus:border-brand-cyan/50 focus:ring-2 focus:ring-brand-cyan/10 transition-all"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-text-muted">
                {prompt.length} / 1000
              </span>
              <button
                onClick={() => setShowParams(!showParams)}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                <SlidersHorizontal className="w-3 h-3" />
                高级参数
              </button>
            </div>
          </Card>

          {/* Advanced Params */}
          {showParams && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="space-y-4"
            >
              {config.params.map((param) => (
                <div key={param.label}>
                  <label className="block text-xs text-text-secondary mb-2">
                    {param.label}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {param.options.map((opt) => (
                      <button
                        key={opt}
                        className="px-3 py-1.5 text-xs rounded-[8px] border border-border-subtle text-text-muted hover:text-text-primary hover:border-brand-cyan/50 hover:bg-brand-cyan/5 transition-all"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {/* Generate Button */}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handleGenerate}
            isLoading={isGenerating}
            leftIcon={!isGenerating ? <Sparkles className="w-4 h-4" /> : undefined}
          >
            {isGenerating ? "生成中..." : "立即生成"}
          </Button>

          {/* Tips */}
          <div className="text-xs text-text-muted space-y-1 p-4 glass rounded-card">
            <p className="font-medium text-text-secondary mb-1">💡 生成技巧</p>
            <p>· 描述越详细，生成效果越好</p>
            <p>· 可以指定风格、光线、构图等</p>
            <p>· 试试中英文混合描述</p>
          </div>
        </motion.div>
      </div>

      {/* Right Panel — Results */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-medium text-text-secondary">
            生成结果
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Results Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {isGenerating ? (
            // Loading skeleton
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-2xl bg-surface-dark animate-pulse border border-border-subtle"
              >
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <RefreshCw className="w-8 h-8 text-text-muted animate-spin mx-auto mb-2" />
                    <p className="text-xs text-text-muted">生成中...</p>
                  </div>
                </div>
              </div>
            ))
          ) : prompt ? (
            // Mock results
            MOCK_RESULTS.map((result) => (
              <motion.div
                key={result.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: result.id * 0.1 }}
                className="group"
              >
                <div
                  className={`relative aspect-square rounded-2xl bg-gradient-to-br ${result.gradient}
                    overflow-hidden border border-border-subtle
                    group-hover:border-border-glow group-hover:shadow-glow-sm transition-all duration-300`}
                >
                  {/* Placeholder for actual image */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Sparkles className="w-10 h-10 text-muted mx-auto mb-2" />
                      <p className="text-sm text-muted">{result.prompt}</p>
                    </div>
                  </div>

                  {/* Actions overlay */}
                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center justify-between">
                      <button className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
                        <Heart className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            // Empty state
            <div className="col-span-full flex flex-col items-center justify-center py-24">
              <div className="w-20 h-20 rounded-2xl glass flex items-center justify-center mb-6">
                <Icon className="w-10 h-10 text-text-muted" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                输入描述词开始创作
              </h3>
              <p className="text-text-muted text-sm text-center max-w-md">
                在左侧输入你的创意描述，点击「立即生成」
                <br />
                AI 将为你生成独一无二的作品
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
