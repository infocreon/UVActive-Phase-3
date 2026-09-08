import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { memberLogin, memberLogout, tokenStore, setUnauthorizedHandler, type MemberProfile, type MemberLoginResult } from '../services/api';
import { registerForPushNotifications, unregisterPushNotifications } from '../services/pushNotifications';

interface AuthContextValue {
  member: MemberProfile | null;
  loading: boolean;
  login: (memberCode: string, pin: string) => Promise<MemberLoginResult>;
  logout: () => Promise<void>;
  refreshProfile: (profile: MemberProfile) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tokenStore
      .getProfile()
      .then((p) => {
        setMember(p);
      })
      .catch(() => {
        // SecureStore read failed (corrupted data, platform issue, etc.)
        // — treat as logged-out so the app can still render the Login
        // screen instead of being stuck on a blank loading view forever.
        console.warn('[Auth] Could not restore session — user will need to log in again.');
      })
      .finally(() => setLoading(false));
    setUnauthorizedHandler(() => setMember(null));
  }, []);

  // Registers this device's push token on every successful sign-in
  // AND on every app boot that restores an existing session — Expo
  // tokens can rotate, so re-registering each time the member is
  // known-authenticated keeps the backend's copy current rather than
  // only ever capturing it once at first-ever login.
  useEffect(() => {
    if (member) registerForPushNotifications();
  }, [member?.id]);

  const login = useCallback(async (memberCode: string, pin: string) => {
    const result = await memberLogin(memberCode, pin);
    if (result.member) setMember(result.member);
    return result;
  }, []);

  const logout = useCallback(async () => {
    await unregisterPushNotifications();
    await memberLogout();
    setMember(null);
  }, []);

  // Called after a Settings edit changes name/photo-adjacent fields
  // that live on the trimmed login profile too, so the rest of the app
  // (e.g. a header greeting) doesn't need a full re-login to see it.
  const refreshProfile = useCallback(async (profile: MemberProfile) => {
    await tokenStore.setProfile(profile);
    setMember(profile);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ member, loading, login, logout, refreshProfile }),
    [member, loading, login, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
