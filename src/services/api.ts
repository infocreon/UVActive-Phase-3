/**
 * UV Active Trainer App — cloud API client.
 *
 * Talks directly to the cloud API over HTTPS. No hub, no local IP
 * config, no WiFi discovery — that whole layer (hubDiscovery.ts,
 * udpDiscovery.ts, websocket.ts, the hub-relative bits of the old
 * connectionManager.ts) is gone, not refactored.
 *
 * Every call here is a plain fetch with a timeout and 401 handling.
 * Nothing in this file is on the critical path for a live session —
 * see sessionEngine.ts / syncQueue.ts for how session data survives
 * being offline; this client is just the transport those use once
 * connectivity is actually available.
 */
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config';

const ACCESS_TOKEN_KEY = 'uva_access_token';
const REFRESH_TOKEN_KEY = 'uva_refresh_token';
const STAFF_PROFILE_KEY = 'uva_staff_profile';

export interface StaffProfile {
  id: string;
  name: string;
  email: string;
  role: 'trainer' | 'branch_manager';
  gymId: string;
  gymName: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type UnauthorizedHandler = () => void;
let _onUnauthorized: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(fn: UnauthorizedHandler) {
  _onUnauthorized = fn;
}

export const tokenStore = {
  async getAccess(): Promise<string | null> {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },
  async getRefresh(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },
  async getProfile(): Promise<StaffProfile | null> {
    const raw = await SecureStore.getItemAsync(STAFF_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  async set(accessToken: string, refreshToken: string, profile: StaffProfile): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
      SecureStore.setItemAsync(STAFF_PROFILE_KEY, JSON.stringify(profile)),
    ]);
  },
  async setAccess(accessToken: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  },
  async clear(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(STAFF_PROFILE_KEY),
    ]);
  },
};

// Render's free tier spins a service down after ~15 min idle and takes
// 30-60s to wake on the next request — if you're on that tier, the
// FIRST request after any idle period can genuinely take that long.
// This timeout is set high enough to survive a cold start rather than
// misreport it as a network failure; the sync queue's own retry logic
// (see syncQueue.ts) handles the rest if a request does still time out.
const REQUEST_TIMEOUT_MS = 45_000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  auth?: boolean; // default true
  isRetry?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true, isRetry = false } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = await tokenStore.getAccess();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') {
      throw new ApiError('Request timed out — check your connection.', 0, 'TIMEOUT');
    }
    throw new ApiError('Network error — check your connection.', 0, 'NETWORK');
  }
  clearTimeout(timer);

  // 401 → try ONE silent refresh before giving up, same pattern as the
  // web portals. Only ever retried once (isRetry guards against a loop
  // if the refresh token itself is dead).
  if (res.status === 401 && auth && !isRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request<T>(path, { ...options, isRetry: true });
    }
    await tokenStore.clear();
    _onUnauthorized?.();
    throw new ApiError('Session expired — please sign in again.', 401, 'UNAUTHORIZED');
  }

  const envelope = await res.json().catch(() => null);
  if (!res.ok) {
    const message = envelope?.error?.message || envelope?.message || `Server error (${res.status})`;
    throw new ApiError(message, res.status, envelope?.error?.code);
  }
  return (envelope?.data ?? envelope) as T;
}

let _refreshInFlight: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = (async () => {
    const refreshToken = await tokenStore.getRefresh();
    if (!refreshToken) return false;
    try {
      const res = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken, realm: 'staff' }),
      });
      if (!res.ok) return false;
      const envelope = await res.json();
      const accessToken = envelope?.data?.accessToken ?? envelope?.accessToken;
      if (!accessToken) return false;
      await tokenStore.setAccess(accessToken);
      return true;
    } catch {
      return false;
    } finally {
      _refreshInFlight = null;
    }
  })();
  return _refreshInFlight;
}

export const api = {
  get: <T = unknown>(path: string, query?: RequestOptions['query']) => request<T>(path, { method: 'GET', query }),
  post: <T = unknown>(path: string, body?: unknown, opts?: Partial<RequestOptions>) => request<T>(path, { method: 'POST', body, ...opts }),
  patch: <T = unknown>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T = unknown>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// ── Auth ──────────────────────────────────────────────────────────────

export interface StaffLoginResult {
  accessToken?: string;
  refreshToken?: string;
  staff?: StaffProfile;
}

// Trainer App: password only — the backend never asks trainers for a
// second factor (that's Branch Portal only), so a successful call here
// always comes back with a token pair + profile.
export async function staffLogin(email: string, password: string): Promise<StaffLoginResult> {
  const data = await request<StaffLoginResult>('/auth/staff/login', { method: 'POST', body: { email, password }, auth: false });
  if (data.accessToken && data.refreshToken && data.staff) {
    await tokenStore.set(data.accessToken, data.refreshToken, data.staff);
  }
  return data;
}

export async function staffLogout(): Promise<void> {
  const refreshToken = await tokenStore.getRefresh();
  try {
    if (refreshToken) await api.post('/auth/logout', { refreshToken, realm: 'staff' });
  } catch {
    // Logout is best-effort server-side — local token clear below is
    // what actually matters for the app.
  } finally {
    await tokenStore.clear();
  }
}

export function changePassword(currentPassword: string, newPassword: string) {
  return api.post('/auth/staff/change-password', { currentPassword, newPassword });
}
