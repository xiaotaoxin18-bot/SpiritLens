import { Sparkles } from "lucide-react";

const FOOTER_LINKS = {
  产品: ["AI 图片生成", "AI 视频生成", "智能画布", "数字人"],
  社区: ["灵感广场", "创作者计划", "官方公告"],
  支持: ["使用指南", "常见问题", "意见反馈", "联系我们"],
  法律: ["服务条款", "隐私政策", "AI 生成内容标识"],
};

export default function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-brand-deep/80">
      <div className="w-full px-4 sm:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-base font-bold text-gradient">SpiritLens</span>
            </div>
            <p className="text-sm text-text-muted leading-relaxed">
              灵境 — 一站式 AI 创意创作平台<br />
              释放你的无限想象力
            </p>
          </div>

          {/* Links */}
          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-text-primary mb-3">
                {category}
              </h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-text-muted hover:text-text-secondary transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-border-subtle flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-text-muted">
            &copy; {new Date().getFullYear()} SpiritLens. All rights reserved.
          </p>
          <p className="text-xs text-text-muted">
            AI 生成内容请遵守相关法律法规
          </p>
        </div>
      </div>
    </footer>
  );
}
