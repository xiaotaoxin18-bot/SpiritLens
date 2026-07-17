import Link from "next/link";
import { Sparkles, ArrowLeft } from "lucide-react";
import RegisterForm from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="flex-1 flex items-center justify-center py-12 px-4 relative">
      {/* Back button */}
      <Link
        href="/"
        className="absolute left-4 sm:left-8 top-4 sm:top-8 inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-elevated/60 px-3 py-2 text-xs text-text-secondary backdrop-blur-xl hover:text-text-primary hover:border-white/20 transition-all"
      >
        <ArrowLeft className="size-3.5" />
        返回首页
      </Link>
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center shadow-glow-md">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gradient">加入 SpiritLens</h1>
          <p className="text-text-muted mt-2 text-sm">
            开启你的 AI 创意之旅
          </p>
        </div>

        {/* Form Card */}
        <div className="glass rounded-2xl p-8 border-border-subtle">
          <RegisterForm />
        </div>
      </div>
    </div>
  );
}
