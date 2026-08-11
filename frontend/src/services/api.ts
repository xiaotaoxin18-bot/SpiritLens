const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/spiritlens";
const AUTH_KEY = "spiritlens-auth";

interface AuthState {
  state: {
    user: Record<string, unknown>;
    accessToken: string | null;
    refreshToken?: string | null;
    isAuthenticated: boolean;
  };
}

function getAuth(): AuthState["state"] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw).state || null;
  } catch {
    return null;
  }
}

function setTokens(accessToken: string, refreshToken: string) {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    parsed.state.accessToken = accessToken;
    if (refreshToken) parsed.state.refreshToken = refreshToken;
    localStorage.setItem(AUTH_KEY, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const auth = getAuth();
    const rt = auth?.refreshToken;
    if (!rt) return false;
    try {
      const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  let url = `${BASE_URL}${endpoint}`;

  const auth = getAuth();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (auth?.accessToken) {
    headers["Authorization"] = `Bearer ${auth.accessToken}`;
  }

  let response = await fetch(url, { ...options, headers });

  // Auto-refresh on 401
  if (response.status === 401 && auth?.refreshToken) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const newAuth = getAuth();
      if (newAuth?.accessToken) {
        headers["Authorization"] = `Bearer ${newAuth.accessToken}`;
      }
      response = await fetch(url, { ...options, headers });
    }
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      if (err.detail) {
        // detail 可能是对象/数组（如 FastAPI 422 校验错误），直接 throw 会变成 "[object Object]"
        detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
      }
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  // 204 No Content — return null as T
  if (response.status === 204) return null as T;

  return response.json();
}

export const api = {
  get: <T>(endpoint: string, params?: Record<string, string>) => {
    let url = endpoint;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      url += `?${qs}`;
    }
    return request<T>(url, { method: "GET" });
  },

  post: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T>(endpoint: string) =>
    request<T>(endpoint, { method: "DELETE" }),

  /** Upload file(s) via multipart/form-data — does NOT use JSON Content-Type */
  uploadFile: async (endpoint: string, file: File, fieldName = "files"): Promise<{ urls: string[]; errors?: Array<{filename?: string; error: string}> }> => {
    const url = `${BASE_URL}${endpoint}`;
    const auth = getAuth();
    const formData = new FormData();
    formData.append(fieldName, file);

    const headers: Record<string, string> = {};
    if (auth?.accessToken) {
      headers["Authorization"] = `Bearer ${auth.accessToken}`;
    }

    let response = await fetch(url, { method: "POST", headers, body: formData });

    // Auto-refresh on 401
    if (response.status === 401 && auth?.refreshToken) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        const newAuth = getAuth();
        if (newAuth?.accessToken) {
          headers["Authorization"] = `Bearer ${newAuth.accessToken}`;
        }
        response = await fetch(url, { method: "POST", headers, body: formData });
      }
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const err = await response.json();
        if (err.detail) {
          detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
        }
      } catch { /* ignore */ }
      throw new Error(detail);
    }
    return response.json();
  },
};
