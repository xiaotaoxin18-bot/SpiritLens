"use client";

import { useState, useCallback, useEffect } from "react";
import { User, Lock, X, AlertCircle, Eye, EyeOff } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth";

interface FormErrors {
  account?: string;
  password?: string;
}

function validateAccount(account: string): string | undefined {
  if (!account.trim()) return "请输入用户名";
  if (account.trim().length < 2) return "用户名至少 2 个字符";
  return undefined;
}

function validatePassword(password: string): string | undefined {
  if (!password) return "请输入密码";
  return undefined;
}

function validateForm(form: { account: string; password: string }): FormErrors {
  return {
    account: validateAccount(form.account),
    password: validatePassword(form.password),
  };
}

/** UTF-8 安全的 base64（密码混淆存储用，非加密） */
function b64encode(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}
function b64decode(s: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
}

export default function LoginForm() {
  const { setAuth } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({ account: "", password: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // 记住密码：localStorage 存账号 + base64 混淆的密码（防明文可见，
  // 但 XSS 下仍可解——真正安全需浏览器密码管理器，Chrome SPA 提示不可靠）
  useEffect(() => {
    try {
      const saved = localStorage.getItem("spiritlens:login-remember");
      if (saved) {
        const data = JSON.parse(saved);
        if (data?.account) {
          let pwd = "";
          if (data.password) {
            try {
              pwd = b64decode(data.password); // 新格式（base64）
            } catch {
              pwd = data.password; // 旧版明文残留：直接用
            }
          }
          setForm((prev) => ({ ...prev, account: data.account, password: pwd }));
          setRemember(true);
          // 迁移：旧明文 → 转 base64 存回，不留明文
          if (data.password && pwd) {
            localStorage.setItem("spiritlens:login-remember", JSON.stringify({
              account: data.account, password: b64encode(pwd),
            }));
          }
        }
      }
    } catch { /* ignore */ }
  }, []);

  /** Validate a single field and update errors — only shows if field is touched or form was submitted */
  const validateField = useCallback(
    (name: string, value: string) => {
      let error: string | undefined;
      if (name === "account") error = validateAccount(value);
      else if (name === "password") error = validatePassword(value);

      setErrors((prev) => {
        const next = { ...prev };
        if (error) next[name as keyof FormErrors] = error;
        else delete next[name as keyof FormErrors];
        return next;
      });
    },
    [],
  );

  /** Mark field as touched on blur and validate */
  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setTouched((prev) => ({ ...prev, [name]: true }));
      validateField(name, value);
    },
    [validateField],
  );

  /** Clear error on change (remove it immediately while typing) */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setForm((prev) => ({ ...prev, [name]: value }));
      // Clear the error for this field while the user is typing
      setErrors((prev) => {
        if (!prev[name as keyof FormErrors]) return prev;
        const next = { ...prev };
        delete next[name as keyof FormErrors];
        return next;
      });
      // Clear server error when user types
      setServerError(null);
    },
    [],
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Mark all fields as touched and validate everything
    setSubmitted(true);
    setTouched({ account: true, password: true });

    const allErrors = validateForm(form);
    setErrors(allErrors);

    // If there are errors, stop
    if (allErrors.account || allErrors.password) return;

    setIsLoading(true);
    setServerError(null);

    try {
      const tokens = await api.post<{
        access_token: string;
        refresh_token: string;
        token_type: string;
      }>("/api/v1/auth/login", {
        username: form.account,
        password: form.password,
      });

      // Save token to store first so api requests pick it up
      setAuth({ id: "", nickname: "" }, tokens.access_token, tokens.refresh_token);

      // Fetch user info (token already in localStorage from setAuth above)
      const user = await api.get<{
        id: string;
        email?: string;
        username?: string;
        nickname: string;
        avatar_url?: string;
        bio?: string;
      }>("/api/v1/auth/me");

      setAuth(user, tokens.access_token, tokens.refresh_token);

      // 记住密码：存账号 + base64 混淆密码；取消勾选则清除
      try {
        if (remember) {
          localStorage.setItem("spiritlens:login-remember", JSON.stringify({
            account: form.account,
            password: b64encode(form.password),
          }));
        } else {
          localStorage.removeItem("spiritlens:login-remember");
        }
      } catch { /* ignore */ }

      // 整页跳转：SPA router.push 不会触发 Chrome「保存密码」提示（需真实导航）
      window.location.href = "/spiritlens";
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "登录失败，请重试";
      setServerError(message);
    } finally {
      setIsLoading(false);
    }
  };

  /** Helper: should we show the error for a field? */
  const showError = (field: keyof FormErrors) =>
    (touched[field] || submitted) ? errors[field] : undefined;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <Input
        label="用户名"
        name="account"
        type="text"
        placeholder="请输入用户名"
        value={form.account}
        onChange={handleChange}
        onBlur={handleBlur}
        leftIcon={<User className="w-4 h-4" />}
        error={showError("account")}
        autoComplete="username"
        required
      />

      <div>
        <Input
          label="密码"
          name="password"
          type={showPassword ? "text" : "password"}
          placeholder="请输入密码"
          value={form.password}
          onChange={handleChange}
          onBlur={handleBlur}
          leftIcon={<Lock className="w-4 h-4" />}
          rightIcon={
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowPassword((v) => !v)}
              className="text-text-muted hover:text-text-secondary transition-colors"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
          error={showError("password")}
          autoComplete="current-password"
          required
        />
        <div className="flex items-center justify-between mt-1.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-3.5 accent-brand-cyan"
            />
            <span className="text-xs text-text-muted">记住密码</span>
          </label>
          <button
            type="button"
            onClick={() => setToast("忘记密码请联系管理员重置")}
            className="text-xs text-text-muted hover:text-brand-cyan transition-colors"
          >
            忘记密码？
          </button>
        </div>
      </div>

      {serverError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="size-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        isLoading={isLoading}
      >
        登录
      </Button>

      {/* Social Login */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border-subtle" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-surface-base px-4 text-text-muted">或使用第三方登录</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { name: "微信", icon: "💬", provider: "wechat" },
          { name: "抖音", icon: "🎵", provider: "douyin" },
          { name: "GitHub", icon: "💻", provider: "github" },
        ].map((s) => (
          <button
            key={s.provider}
            type="button"
            onClick={() => setToast(`${s.name}登录功能开发中`)}
            className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-[12px] border border-border-subtle hover:border-border-glow hover:bg-surface-light transition-all duration-200 group"
          >
            <span className="text-xl group-hover:scale-110 transition-transform">
              {s.icon}
            </span>
            <span className="text-[10px] text-text-muted">{s.name}</span>
          </button>
        ))}
      </div>

      <p className="text-center text-sm text-text-muted">
        还没有账号？{" "}
        <a
          href="/spiritlens/auth/register"
          className="text-brand-cyan hover:text-brand-cyan-dim transition-colors font-medium"
        >
          立即注册
        </a>
      </p>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="inline-flex items-center gap-2.5 rounded-2xl border border-border-subtle bg-surface-overlay/95 px-5 py-3 text-sm text-text-secondary shadow-lg backdrop-blur-xl">
            <span>{toast}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-1 rounded-lg p-0.5 text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
