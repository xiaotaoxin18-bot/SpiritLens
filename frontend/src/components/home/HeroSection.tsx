"use client";

import { useState, useEffect } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import { useRouter } from "next/navigation";

const TYPING_TEXTS = [
  "山水墨色，诗意江南",
  "赛博朋克城市夜景",
  "一只在太空漫步的猫",
  "水墨风格的中国龙",
];

export default function HeroSection() {
  const router = useRouter();
  const [textIndex, setTextIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentText = TYPING_TEXTS[textIndex];
    let timeout: NodeJS.Timeout;

    if (!isDeleting) {
      if (displayText.length < currentText.length) {
        timeout = setTimeout(() => {
          setDisplayText(currentText.slice(0, displayText.length + 1));
        }, 80);
      } else {
        timeout = setTimeout(() => setIsDeleting(true), 2000);
      }
    } else {
      if (displayText.length > 0) {
        timeout = setTimeout(() => {
          setDisplayText(displayText.slice(0, -1));
        }, 40);
      } else {
        setIsDeleting(false);
        setTextIndex((prev) => (prev + 1) % TYPING_TEXTS.length);
      }
    }

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, textIndex]);

  return (
    <section className="relative overflow-hidden min-h-[85vh] flex items-center justify-center">
      {/* Background decoration — larger glow */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-[-300px] left-[-200px] w-[800px] h-[800px] rounded-full bg-brand-purple/12 blur-[150px]" />
        <div className="absolute bottom-[-300px] right-[-200px] w-[700px] h-[700px] rounded-full bg-brand-cyan/8 blur-[130px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-mid/8 blur-[120px]" />
      </div>

      <div className="relative w-full px-4 sm:px-8 lg:px-16 py-20 sm:py-28">
        <div className="text-center max-w-5xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border-border-subtle text-sm text-text-secondary mb-8 animate-fade-in">
            <Sparkles className="w-4 h-4 text-brand-cyan" />
            <span>一站式 AI 创作平台 · 即点即用</span>
          </div>

          {/* Title — bigger, more impactful */}
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-bold leading-[1.1] mb-6 animate-slide-up">
            <span className="text-text-primary">释放你的</span>
            <br />
            <span className="text-gradient">无限想象力</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-text-secondary mb-10 max-w-2xl mx-auto leading-relaxed animate-slide-up">
            AI 图片生成 · AI 视频生成 · 智能画布 · 数字人
            <br />
            输入创意描述，秒级生成你的专属作品
          </p>

          {/* Typing prompt */}
          <div className="glass inline-flex items-center gap-3 px-6 py-3.5 rounded-2xl border-border-subtle mb-10 animate-fade-in">
            <Sparkles className="w-5 h-5 text-brand-cyan flex-shrink-0" />
            <span className="text-text-muted text-sm">试试输入：</span>
            <span className="text-text-primary text-base font-medium min-w-[200px] text-left">
              {displayText}
              <span className="inline-block w-[2px] h-5 bg-brand-cyan ml-0.5 animate-pulse" />
            </span>
          </div>

          {/* CTA */}
          <div className="flex items-center justify-center gap-4 animate-slide-up">
            <Button
              variant="primary"
              size="lg"
              rightIcon={<ArrowRight className="w-4 h-4" />}
              onClick={() => router.push("/ai-tool/image")}
            >
              开始创作
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => router.push("/community")}
            >
              探索灵感
            </Button>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-12 mt-14 text-center">
            {[
              { label: "活跃用户", value: "10万+" },
              { label: "生成作品", value: "500万+" },
              { label: "AI 模型", value: "6+" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-2xl sm:text-3xl font-bold text-gradient-purple">
                  {stat.value}
                </div>
                <div className="text-sm text-text-muted mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
