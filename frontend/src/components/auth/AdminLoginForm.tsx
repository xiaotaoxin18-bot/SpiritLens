"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { User, Lock, AlertCircle, Eye, EyeOff } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth";

interface FormErrors {
  account?: string;
  password?: string;
}

function validateAccount(account: string): string | undefined {
  if (!account.trim()) return "请输入管理员账号";
  if (account.trim().length < 2) return "账号至少 2 个字符";
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

export default function AdminLoginForm() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({ account: "", password: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

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

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setTouched((prev) => ({ ...prev, [name]: true }));
      validateField(name, value);
    },
    [validateField],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setForm((prev) => ({ ...prev, [name]: value }));
      setErrors((prev) => {
        if (!prev[name as keyof FormErrors]) return prev;
        const next = { ...prev };
        delete next[name as keyof FormErrors];
        return next;
      });
      setServerError(null);
    },
    [],
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setSubmitted(true);
    setTouched({ account: true, password: true });

    const allErrors = validateForm(form);
    setErrors(allErrors);

    if (allErrors.account || allErrors.password) return;

    setIsLoading(true);
    setServerError(null);

    try {
      const tokens = await api.post<{
        access_token: string;
        refresh_token: string;
        token_type: string;
      }>("/api/v1/auth/admin-login", {
        username: form.account,
        password: form.password,
      });

      // 先用返回的 token 直接请求用户信息并校验管理员身份——此时尚未调用
      // setAuth（会持久化写入 localStorage），非管理员不会残留任何 token
      const base = process.env.NEXT_PUBLIC_API_URL || "/spiritlens";
      const meRes = await fetch(`${base}/api/v1/auth/me`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });
      if (!meRes.ok) {
        let detail = `HTTP ${meRes.status}`;
        try {
          const err = await meRes.json();
          if (err.detail) {
            detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
          }
        } catch {
          // ignore
        }
        throw new Error(detail);
      }
      const user = (await meRes.json()) as {
        id: string;
        username?: string;
        nickname: string;
        is_admin: boolean;
      };

      if (!user.is_admin) {
        setServerError("该账号没有管理员权限");
        return;
      }

      setAuth(user, tokens.access_token, tokens.refresh_token);
      router.push("/admin");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "登录失败，请重试";
      setServerError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const showError = (field: keyof FormErrors) =>
    (touched[field] || submitted) ? errors[field] : undefined;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <Input
        label="管理员账号"
        name="account"
        type="text"
        placeholder="请输入管理员账号"
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
        管理员登录
      </Button>

      <p className="text-center text-sm text-text-muted">
        <a
          href="/spiritlens/auth/login"
          className="text-brand-cyan hover:text-brand-cyan-dim transition-colors font-medium"
        >
          返回用户登录
        </a>
      </p>
    </form>
  );
}
