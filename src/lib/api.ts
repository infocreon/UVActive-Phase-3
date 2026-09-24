/**
 * Thin, typed client for the UV Active Cloud API — admin realm only.
 *
 * Every response from the API is wrapped in an envelope:
 *   success: { success: true, data: T, meta？: {...} }
 *   error:   { success: false, error: { code, message }, path }
 * (see cloud-api ResponseEnvelopeInterceptor / AllExceptionsFilter)
 *
 * This client unwraps `data`, surfaces `meta` alongside it, and throws an
 * `ApiError` (carrying `code` + `message`) on failure so callers can match
 * on `error.code` rather than parsing message text.
 */

import { logger } from "./logger";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api/v1";

export const ACCESS_TOKEN_KEY = "uva_admin_access_token";
const REFRESH_TOKEN_KEY = "uva_admin_refresh_token";
export const ADMIN_PROFILE_KEY = "uva_admin_profile";

export interface AdminProfile {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "support";
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ── Auth-state broadcast ──────────────────────────────────────────────
// Fires whenever this tab's own session ends involuntarily — a 401 that
// survives a refresh attempt (refresh token itself expired/invalid/
// revoked). Without this, request() cleared localStorage but nothing
// ever told AuthProvider's React state, so the tab kept rendering the
// last-known admin name in the header while every subsequent request
// silently went out with no Authorization header at all.
type AuthClearedListener = () => void;
const authClearedListeners = new Set<AuthClearedListener>();
export function onAuthCleared(listener: AuthClearedListener): () => void {
  authClearedListeners.add(listener);
  return () => authClearedListeners.delete(listener);
}

// ── Token storage ──────────────────────────────────────────────────────
// Access tokens are short-lived (15 min per spec) and kept in localStorage
// alongside the refresh token so a page refresh doesn't force a re-login;
// the 30-min idle timeout is enforced separately in AuthContext.
export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  getProfile: (): AdminProfile | null => {
    const raw = localStorage.getItem(ADMIN_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  set: (accessToken: string, refreshToken: string, profile: AdminProfile) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(profile));
  },
  setAccess: (accessToken: string) => localStorage.setItem(ACCESS_TOKEN_KEY, accessToken),
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(ADMIN_PROFILE_KEY);
  },
};

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return false;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ realm: "admin", refreshToken }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) return false;
        tokenStore.setAccess(json.data.accessToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean; // defaults to true
  query?: Record<string, string | number | boolean | undefined>;
}

async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const { method = "GET", body, auth = true, query } = opts;

  let url = `${BASE_URL}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const doFetch = async () => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth) {
      const token = tokenStore.getAccess();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    return fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch();

  // One retry after a silent refresh on 401 — mirrors the token-version
  // re-check the cloud API performs on every request (spec §4.1).
  if (res.status === 401 && auth) {
    const refreshed = await tryRefresh();
    if (refreshed) res = await doFetch();
  }

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.success) {
    const code = json?.error?.code || "UNKNOWN_ERROR";
    const message = json?.error?.message || `Request failed with status ${res.status}`;
    if (res.status === 401) {
      tokenStore.clear();
      authClearedListeners.forEach((l) => l());
    }
    // Instance log of the failed call — the backend envelope (code +
    // message + path) plus which method/path produced it, so a console
    // export shows the full failure story without reproducing it.
    logger.error(
      "RequestLogger",
      `${method} ${path} -> ${res.status} ${code}`,
      json?.error ? json.error : message,
    );
    throw new ApiError(code, message, res.status);
  }

  return { data: json.data as T, meta: json.meta };
}

export const api = {
  get: <T = unknown>(path: string, query?: RequestOptions["query"]) => request<T>(path, { method: "GET", query }),
  post: <T = unknown>(path: string, body?: unknown, opts?: Partial<RequestOptions>) => request<T>(path, { method: "POST", body, ...opts }),
  patch: <T = unknown>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }),
};
