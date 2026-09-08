import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { staffLogin, staffLogout, tokenStore, setUnauthorizedHandler, type StaffProfile, type StaffLoginResult } from '../services/api';
import { registerForPushNotifications, unregisterPushNotifications } from '../services/pushNotifications';

interface AuthContextValue {
  staff: StaffProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<StaffLoginResult>;
  logout: () => Promise<void>;
  isBranchManager: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tokenStore.getProfile().then((p) => {
      setStaff(p);
      setLoading(false);
    });
    setUnauthorizedHandler(() => setStaff(null));
  }, []);

  // Registers this device's push token on every successful sign-in
  // AND on every app boot that restores an existing session — Expo
  // tokens can rotate, so re-registering each time the trainer is
  // known-authenticated keeps the backend's copy current rather than
  // only ever capturing it once at first-ever login.
  useEffect(() => {
    if (staff) registerForPushNotifications();
  }, [staff?.id]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await staffLogin(email, password);
    if (result.staff) setStaff(result.staff);
    return result;
  }, []);

  const logout = useCallback(async () => {
    await unregisterPushNotifications();
    await staffLogout();
    setStaff(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ staff, loading, login, logout, isBranchManager: staff?.role === 'branch_manager' }),
    [staff, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
