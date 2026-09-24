import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { api, ApiError, tokenStore, onAuthCleared, ACCESS_TOKEN_KEY, ADMIN_PROFILE_KEY, AdminProfile } from "./api";

// Spec §2: 30-minute idle session timeout for the Admin Portal.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
// How often each tab re-checks the shared activity clock — see
// markActivity()'s comment for why this is shared across tabs at all.
const IDLE_CHECK_INTERVAL_MS = 30 * 1000;
const LAST_ACTIVITY_KEY = "uva_admin_last_activity";

interface LoginResult {
  setupRequired?: boolean;
  setupToken?: string;
  totpRequired?: boolean;
}

interface AuthContextValue {
  admin: AdminProfile | null;
  loading: boolean;
  login: (email: string, password: string, totp?: string, backupCode?: string) => Promise<LoginResult>;
  completeTotpSetup: (setupToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminProfile | null>(() => tokenStore.getProfile());
  const [loading, setLoading] = useState(false);
  const idleCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.getRefresh();
    tokenStore.clear();
    setAdmin(null);
    if (refreshToken) {
      try {
        await api.post("/auth/logout", { realm: "admin", refreshToken }, { auth: false });
      } catch {
        // best-effort — local session is already cleared either way
      }
    }
  }, []);

  // Any tab's activity marks the WHOLE account active, not just that
  // one tab. Previously each tab tracked its own private idle timer
  // but the resulting logout() clears localStorage, which is shared —
  // an admin actively working in one tab with a second tab left open
  // and idle in the background would get logged out of BOTH the
  // instant the idle tab's own timer fired, unrelated to whether
  // anyone was actually using the account. A shared last-activity
  // timestamp, polled by every tab, means the account only actually
  // goes idle once EVERY tab has been untouched for the full timeout.
  const markActivity = useCallback(() => {
    if (!tokenStore.getAccess()) return;
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    } catch {
      // Storage can throw in rare cases — degrading to per-tab-only
      // tracking is far better than crashing the app over it.
    }
  }, []);

  const checkIdle = useCallback(() => {
    if (!tokenStore.getAccess()) return;
    const lastActivityRaw = localStorage.getItem(LAST_ACTIVITY_KEY);
    const lastActivity = lastActivityRaw ? Number(lastActivityRaw) : Date.now();
    if (Date.now() - lastActivity >= IDLE_TIMEOUT_MS) logout();
  }, [logout]);

  useEffect(() => {
    if (!admin) return;
    markActivity(); // signing in / restoring a session counts as activity
    const events: (keyof WindowEventMap)[] = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, markActivity));
    idleCheckInterval.current = setInterval(checkIdle, IDLE_CHECK_INTERVAL_MS);
    return () => {
      events.forEach((e) => window.removeEventListener(e, markActivity));
      if (idleCheckInterval.current) clearInterval(idleCheckInterval.current);
    };
  }, [admin, markActivity, checkIdle]);

  // Cross-tab sync: a login, logout, or account switch in one tab
  // must be reflected in every other open tab immediately — the
  // `storage` event only fires in OTHER tabs (never the one that made
  // the change), which is exactly the gap this covers.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== ADMIN_PROFILE_KEY && e.key !== ACCESS_TOKEN_KEY) return;
      setAdmin(tokenStore.getProfile());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // A hard, unrecoverable 401 in THIS tab — sync React state
  // immediately instead of leaving the UI showing a stale "logged in"
  // header while every request from here on goes out unauthenticated.
  useEffect(() => onAuthCleared(() => setAdmin(null)), []);

  const login = useCallback(async (email: string, password: string, totp?: string, backupCode?: string) => {
    setLoading(true);
    try {
      const { data } = await api.post<{
        setupRequired?: boolean;
        setupToken?: string;
        totpRequired?: boolean;
        accessToken?: string;
        refreshToken?: string;
        admin?: AdminProfile;
      }>("/auth/admin/login", { email, password, totp, backupCode }, { auth: false });

      if (data.setupRequired) {
        return { setupRequired: true, setupToken: data.setupToken };
      }
      if (data.totpRequired) {
        return { totpRequired: true };
      }
      if (data.accessToken && data.refreshToken && data.admin) {
        tokenStore.set(data.accessToken, data.refreshToken, data.admin);
        setAdmin(data.admin);
      }
      return {};
    } finally {
      setLoading(false);
    }
  }, []);

  const completeTotpSetup = useCallback(async (setupToken: string, code: string) => {
    const { data } = await api.post<{ accessToken: string; refreshToken: string; admin: AdminProfile }>(
      "/auth/admin/2fa/confirm",
      { setupToken, code },
      { auth: false },
    );
    tokenStore.set(data.accessToken, data.refreshToken, data.admin);
    setAdmin(data.admin);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ admin, loading, login, completeTotpSetup, logout, isSuperAdmin: admin?.role === "super_admin" }),
    [admin, loading, login, completeTotpSetup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };