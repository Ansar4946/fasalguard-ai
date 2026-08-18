'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authClient } from './auth-client'; import type { CurrentUser } from './types';
interface Value { user: CurrentUser | null; isAuthenticated: boolean; isLoading: boolean; refreshUser: () => Promise<CurrentUser | null>; logout: () => Promise<void> }
const Context = createContext<Value | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null); const [isLoading, setLoading] = useState(true);
  const refreshUser = useCallback(async () => { try { const current = await authClient.me(); setUser(current); return current } catch { setUser(null); return null } finally { setLoading(false) } }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void refreshUser(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshUser]);
  const logout = useCallback(async () => { try { await authClient.logout() } finally { setUser(null) } }, []);
  const value = useMemo(() => ({ user, isAuthenticated: Boolean(user), isLoading, refreshUser, logout }), [user, isLoading, refreshUser, logout]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth(): Value { const value = useContext(Context); if (!value) throw new Error('useAuth must be used within AuthProvider.'); return value }
