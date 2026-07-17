"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { Loader2, LogIn, UserPlus } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

export function AuthGuard({ children }: Props) {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // Wait for hydration to avoid flash
  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base">
        <Loader2 className="size-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-surface-base px-6">
        <div className="mx-auto max-w-sm text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-purple to-brand-cyan shadow-lg">
            <LogIn className="size-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">
            请先登录
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            登录后即可使用 SpiritLens 的全部功能
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={() => router.push("/auth/login")}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan px-8 text-sm font-medium text-white shadow-lg transition-all hover:brightness-110 active:scale-95"
            >
              <LogIn className="size-4" />
              登录
            </button>
            <button
              onClick={() => router.push("/auth/register")}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border-subtle px-8 text-sm font-medium text-text-secondary transition-all hover:bg-surface-light active:scale-95"
            >
              <UserPlus className="size-4" />
              注册账号
            </button>
          </div>
          <button
            onClick={() => router.push("/")}
            className="mt-6 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
