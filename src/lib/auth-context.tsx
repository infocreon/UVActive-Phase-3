import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { api, ApiError, tokenStore, onAuthCleared, ACCESS_TOKEN_KEY, STAFF_PROFILE_KEY, StaffProfile } from "./api";

// 30-minute idle session timeout, same policy as the Admin Portal.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
// How often each tab re-checks the shared activity clock. Doesn't need
// to be frequent — worst case this is how late a timed-out tab notices
// (activity itself is what matters, and idleness by definition means
// no activity to react to yet).
const IDLE_CHECK_INTERVAL_MS = 30 * 1000;
// Shared across every tab of this origin (localStorage, not per-tab
// state) — see the "why a shared timestamp" note on resetIdleTimer
// below for what this fixes.
const LAST_ACTIVITY_KEY = "uva_staff_last_activity";

interface LoginResult {
  setupRequired?: boolean;
  setupToken?: string;
  totpRequired?: boolean;
}

interface AuthContextValue {
  staff: StaffProfile | null;
  loading: boolean;
  login: (email: string, password: string, totp?: string, backupCode?: string) => Promise<LoginResult>;
  loginWithGoogle: (idToken: string, totp?: string, backupCode?: string) => Promise<LoginResult>;
  completeTotpSetup: (setupToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  isBranchManager: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffProfile | null>(() => tokenStore.getProfile());
  const [loading, setLoading] = useState(false);
  const idleCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.getRefresh();
    tokenStore.clear();
    setStaff(null);
    if (refreshToken) {
      try {
        await api.post("/auth/logout", { realm: "staff", refreshToken }, { auth: false });
      } catch {
        // best-effort — local session is already cleared either way
      }
    }
  }, []);

  // Any tab's activity marks the WHOLE account active, not just that
  // one tab. Without this, idle detection was tracked per tab (each
  // tab's own mousedown/keydown/etc. armed its own private setTimeout)
  // but the resulting logout() call clears localStorage — which is
  // shared. A branch manager actively working in one tab, with a
  // second tab left open and idle in the background, would get logged
  // out of BOTH the instant the idle tab's own private timer fired,
  // with no relationship to whether anyone was actually using the
  // account. Writing every tab's activity to one shared timestamp, and
  // having each tab poll that shared value rather than trust only its
  // own local listeners, means the account only actually goes idle
  // when EVERY tab has been untouched for the full timeout.
  const markActivity = useCallback(() => {
    if (!tokenStore.getAccess()) return;
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    } catch {
      // Storage can throw in rare cases (private-browsing quota edge
      // cases) — activity tracking degrading to per-tab-only is a far
      // smaller problem than crashing the app over it.
    }
  }, []);

  const checkIdle = useCallback(() => {
    if (!tokenStore.getAccess()) return;
    const lastActivityRaw = localStorage.getItem(LAST_ACTIVITY_KEY);
    const lastActivity = lastActivityRaw ? Number(lastActivityRaw) : Date.now();
    if (Date.now() - lastActivity >= IDLE_TIMEOUT_MS) logout();
  }, [logout]);

  useEffect(() => {
    if (!staff) return;
    markActivity(); // signing in / restoring a session counts as activity
    const events: (keyof WindowEventMap)[] = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, markActivity));
    idleCheckInterval.current = setInterval(checkIdle, IDLE_CHECK_INTERVAL_MS);
    return () => {
      events.forEach((e) => window.removeEventListener(e, markActivity));
      if (idleCheckInterval.current) clearInterval(idleCheckInterval.current);
    };
  }, [staff, markActivity, checkIdle]);

  // Cross-tab sync: a login, logout, or account switch (someone logs
  // in as a DIFFERENT staff member) in one tab must be reflected in
  // every other open tab immediately — otherwise a second tab keeps
  // rendering the previous identity (name in the header, cached data
  // on screen) while its next request silently carries whatever
  // credentials localStorage now actually holds, which may belong to
  // a different account entirely. The `storage` event only fires in
  // OTHER tabs (never the one that made the change), which is exactly
  // the gap this needs to cover.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STAFF_PROFILE_KEY && e.key !== ACCESS_TOKEN_KEY) return;
      setStaff(tokenStore.getProfile());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // A hard, unrecoverable 401 (refresh itself failed) in THIS tab —
  // sync React state immediately instead of leaving the UI showing a
  // stale "logged in" header while every request from here on goes out
  // unauthenticated.
  useEffect(() => onAuthCleared(() => setStaff(null)), []);

  type RawLoginResponse = {
    setupRequired?: boolean;
    setupToken?: string;
    totpRequired?: boolean;
    accessToken?: string;
    refreshToken?: string;
    staff?: StaffProfile;
  };

  const applyLoginResponse = (data: RawLoginResponse): LoginResult => {
    if (data.setupRequired) return { setupRequired: true, setupToken: data.setupToken };
    if (data.totpRequired) return { totpRequired: true };
    if (data.accessToken && data.refreshToken && data.staff) {
      tokenStore.set(data.accessToken, data.refreshToken, data.staff);
      setStaff(data.staff);
    }
    return {};
  };

  const login = useCallback(async (email: string, password: string, totp?: string, backupCode?: string) => {
    setLoading(true);
    try {
      const { data } = await api.post<RawLoginResponse>(
        "/auth/staff/login",
        { email, password, totp, backupCode },
        { auth: false },
      );
      return applyLoginResponse(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string, totp?: string, backupCode?: string) => {
    setLoading(true);
    try {
      const { data } = await api.post<RawLoginResponse>(
        "/auth/staff/google",
        { idToken, totp, backupCode },
        { auth: false },
      );
      return applyLoginResponse(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const completeTotpSetup = useCallback(async (setupToken: string, code: string) => {
    const { data } = await api.post<{ accessToken: string; refreshToken: string; staff: StaffProfile }>(
      "/auth/staff/2fa/confirm",
      { setupToken, code },
      { auth: false },
    );
    tokenStore.set(data.accessToken, data.refreshToken, data.staff);
    setStaff(data.staff);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      staff, loading, login, loginWithGoogle, completeTotpSetup, logout,
      isBranchManager: staff?.role === "branch_manager",
    }),
    [staff, loading, login, loginWithGoogle, completeTotpSetup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
