"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User, Lock, AlertCircle, Eye, EyeOff, RefreshCw } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth";

interface FormErrors {
  account?: string;
  password?: string;
  confirmPassword?: string;
  captcha?: string;
}

function validateAccount(account: string): string | undefined {
  if (!account.trim()) return "请输入用户名";
  if (account.trim().length < 2) return "用户名至少 2 个字符";
  return undefined;
}

function validateCaptcha(value: string): string | undefined {
  if (!value.trim()) return "请输入验证码";
  return undefined;
}

function validatePassword(password: string): string | undefined {
  if (!password) return "请输入密码";
  if (password.length < 6) return "密码至少 6 位";
  return undefined;
}

function validateConfirmPassword(password: string, confirmPassword: string): string | undefined {
  if (!confirmPassword) return "请再次输入密码";
  if (password !== confirmPassword) return "两次输入的密码不一致";
  return undefined;
}

function validateForm(form: {
  account: string;
  password: string;
  confirmPassword: string;
  captcha: string;
}): FormErrors {
  return {
    account: validateAccount(form.account),
    password: validatePassword(form.password),
    confirmPassword: validateConfirmPassword(form.password, form.confirmPassword),
    captcha: validateCaptcha(form.captcha),
  };
}

export default function RegisterForm() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    account: "",
    password: "",
    confirmPassword: "",
    captcha: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // CAPTCHA
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaSvg, setCaptchaSvg] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    try {
      const res = await api.get<{ token: string; image: string }>("/api/v1/auth/captcha");
      setCaptchaToken(res.token);
      setCaptchaSvg(res.image);
    } catch {
      // ignore
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  const validateField = useCallback(
    (name: string, value: string) => {
      let error: string | undefined;
      if (name === "account") error = validateAccount(value);
      else if (name === "password") error = validatePassword(value);
      else if (name === "confirmPassword")
        error = validateConfirmPassword(form.password, value);
      else if (name === "captcha") error = validateCaptcha(value);

      setErrors((prev) => {
        const next = { ...prev };
        if (error) next[name as keyof FormErrors] = error;
        else delete next[name as keyof FormErrors];
        return next;
      });
    },
    [form.password],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setTouched((prev) => ({ ...prev, [name]: true }));
      validateField(name, value);
    },
    [validateField],
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setSubmitted(true);
    setTouched({
      account: true,
      password: true,
      confirmPassword: true,
    });

    const allErrors = validateForm(form);
    setErrors(allErrors);

    if (Object.values(allErrors).some(Boolean)) return;

    setIsLoading(true);
    setServerError(null);

    try {
      await api.post("/api/v1/auth/register", {
        username: form.account,
        password: form.password,
        captcha_token: captchaToken,
        captcha_text: form.captcha,
      });

      // Auto-login after registration
      const tokens = await api.post<{
        access_token: string;
        refresh_token: string;
      }>("/api/v1/auth/login", {
        username: form.account,
        password: form.password,
      });

      setAuth({ id: "", nickname: "" }, tokens.access_token, tokens.refresh_token);
      const user = await api.get<{
        id: string;
        username?: string;
        nickname: string;
      }>("/api/v1/auth/me");

      setAuth(user, tokens.access_token, tokens.refresh_token);
      router.push("/");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "注册失败，请重试";
      setServerError(message);
    } finally {
      setIsLoading(false);
    }
  };

  /** Clear server error when user types */
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
      if (name === "password") {
        setErrors((prev) => {
          if (!prev.confirmPassword) return prev;
          return { ...prev, confirmPassword: undefined };
        });
      }
      setServerError(null);
    },
    [],
  );

  const showError = (field: keyof FormErrors) =>
    (touched[field] || submitted) ? errors[field] : undefined;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <Input
        label="用户名"
        name="account"
        type="text"
        placeholder="请输入用户名，用于登录"
        value={form.account}
        onChange={handleChange}
        onBlur={handleBlur}
        leftIcon={<User className="w-4 h-4" />}
        error={showError("account")}
        autoComplete="username"
        required
      />

      <Input
        label="密码"
        name="password"
        type={showPassword ? "text" : "password"}
        placeholder="至少 6 位密码"
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
        autoComplete="new-password"
        required
      />

      <Input
        label="确认密码"
        name="confirmPassword"
        type={showPassword ? "text" : "password"}
        placeholder="再次输入密码"
        value={form.confirmPassword}
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
        error={showError("confirmPassword")}
        autoComplete="new-password"
        required
      />

      {/* CAPTCHA */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-secondary">
          验证码
        </label>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <input
              name="captcha"
              type="text"
              autoComplete="off"
              placeholder="输入验证码"
              maxLength={6}
              value={form.captcha}
              onChange={handleChange}
              onBlur={handleBlur}
              className={"w-full rounded-xl border bg-surface-card px-4 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted " + (showError("captcha") ? "border-red-500/50" : "border-border-subtle focus:border-brand-cyan/50")}
            />
            {showError("captcha") && (
              <p className="mt-1 text-xs text-red-400">{errors.captcha}</p>
            )}
          </div>
          <button
            type="button"
            onClick={loadCaptcha}
            disabled={captchaLoading}
            className="shrink-0 flex items-center justify-center overflow-hidden rounded-xl border border-border-subtle bg-surface-card h-[42px] w-[120px] hover:border-brand-cyan/30 transition-colors"
            title="刷新验证码"
          >
            {captchaLoading ? (
              <RefreshCw className="size-4 animate-spin text-text-muted" />
            ) : captchaSvg ? (
              <span
                dangerouslySetInnerHTML={{ __html: captchaSvg }}
                className="flex items-center justify-center w-full h-full"
              />
            ) : (
              <span className="text-xs text-text-muted">加载失败</span>
            )}
          </button>
          <button
            type="button"
            onClick={loadCaptcha}
            className="shrink-0 flex size-[42px] items-center justify-center rounded-xl border border-border-subtle text-text-muted hover:text-text-secondary hover:border-brand-cyan/30 transition-colors"
            title="换一张"
          >
            <RefreshCw className="size-4" />
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
        创建账号
      </Button>

      <p className="text-center text-sm text-text-muted">
        已有账号？{" "}
        <a
          href="/spiritlens/auth/login"
          className="text-brand-cyan hover:text-brand-cyan-dim transition-colors font-medium"
        >
          立即登录
        </a>
      </p>

      <p className="text-xs text-text-muted text-center">
        注册即表示同意{" "}
        <a href="#" className="text-text-secondary hover:text-brand-cyan">
          服务条款
        </a>
        {" 和 "}
        <a href="#" className="text-text-secondary hover:text-brand-cyan">
          隐私政策
        </a>
      </p>
    </form>
  );
}
