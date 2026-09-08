/**
 * UV Active Member App — cloud API client. Same shape as the Trainer
 * App's services/api.ts (plain fetch + timeout + one-shot 401 refresh),
 * just pointed at the member auth realm instead of staff.
 */
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config';

const ACCESS_TOKEN_KEY = 'uva_member_access_token';
const REFRESH_TOKEN_KEY = 'uva_member_refresh_token';
const MEMBER_PROFILE_KEY = 'uva_member_profile';

// Minimal profile returned directly by login — just enough to route
// into the app. The Settings/Home/Workout screens all pull the fuller
// bio-inclusive profile from member/me (see membersApi.me()) since
// that's also what stays fresh after a Settings edit.
export interface MemberProfile {
  id: string;
  memberCode: string;
  name: string;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  currentGymId: string | null;
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
  async getProfile(): Promise<MemberProfile | null> {
    const raw = await SecureStore.getItemAsync(MEMBER_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  async set(accessToken: string, refreshToken: string, profile: MemberProfile): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
      SecureStore.setItemAsync(MEMBER_PROFILE_KEY, JSON.stringify(profile)),
    ]);
  },
  async setAccess(accessToken: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  },
  async setProfile(profile: MemberProfile): Promise<void> {
    await SecureStore.setItemAsync(MEMBER_PROFILE_KEY, JSON.stringify(profile));
  },
  async clear(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(MEMBER_PROFILE_KEY),
    ]);
  },
};

// Same generous timeout as the Trainer App — covers a cold-start free-tier
// deploy waking up, not just a normal request.
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
        body: JSON.stringify({ refreshToken, realm: 'member' }),
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

export interface MemberLoginResult {
  accessToken?: string;
  refreshToken?: string;
  member?: MemberProfile;
}

// memberCode + PIN — the sole login path a front-desk-registered member
// has from day one (email+password is an alternative first factor for
// members who've since set one, not covered here).
export async function memberLogin(memberCode: string, pin: string): Promise<MemberLoginResult> {
  const data = await request<MemberLoginResult>('/auth/member/login', {
    method: 'POST',
    body: { memberCode: memberCode.trim().toUpperCase(), pin },
    auth: false,
  });
  if (data.accessToken && data.refreshToken && data.member) {
    await tokenStore.set(data.accessToken, data.refreshToken, data.member);
  }
  return data;
}

export async function memberLogout(): Promise<void> {
  const refreshToken = await tokenStore.getRefresh();
  try {
    if (refreshToken) await api.post('/auth/logout', { refreshToken, realm: 'member' });
  } catch {
    // best-effort server-side; local clear below is what actually matters
  } finally {
    await tokenStore.clear();
  }
}

export function changePin(currentPin: string, newPin: string) {
  return api.post('/member/change-pin', { currentPin, newPin });
}
