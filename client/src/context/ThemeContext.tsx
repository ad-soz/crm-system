import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { applyTheme, isDarkMode, resolveTheme, type Theme, type ThemePrefs } from '@/lib/theme';

interface ThemeContextValue {
  /** The theme currently on screen (a preview, if one is active). */
  theme: Theme;
  isDark: boolean;
  /** Organisation default, or null if the admin hasn't set one. */
  org: ThemePrefs | null;
  /** The signed-in user's override, or null if they follow the org default. */
  mine: ThemePrefs | null;
  /** Show a draft theme across the app without saving it. Pass null to stop. */
  setPreview: (theme: Theme | null) => void;
  saveMine: (prefs: ThemePrefs) => Promise<void>;
  clearMine: () => Promise<void>;
  saveOrg: (prefs: ThemePrefs) => Promise<void>;
  clearOrg: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [org, setOrg] = useState<ThemePrefs | null>(null);
  const [mine, setMine] = useState<ThemePrefs | null>(null);
  const [preview, setPreview] = useState<Theme | null>(null);
  const [systemDark, setSystemDark] = useState<boolean>(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(DARK_QUERY).matches,
  );

  // Track the OS light/dark setting for "system" mode.
  useEffect(() => {
    const mq = window.matchMedia?.(DARK_QUERY);
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // The org theme is public, so it also styles the login page.
  useEffect(() => {
    api
      .get<{ theme: ThemePrefs | null }>('/appearance/org')
      .then((res) => setOrg(res.data?.theme ?? null))
      .catch(() => setOrg(null));
  }, []);

  // Personal override, reloaded whenever the signed-in user changes.
  useEffect(() => {
    if (!user) {
      setMine(null);
      return;
    }
    api
      .get<{ theme: ThemePrefs | null }>('/appearance/me')
      .then((res) => setMine(res.data?.theme ?? null))
      .catch(() => setMine(null));
  }, [user?.id]);

  const theme = useMemo(() => preview ?? resolveTheme(org, mine), [preview, org, mine]);
  const isDark = isDarkMode(theme, systemDark);

  useEffect(() => {
    applyTheme(theme, systemDark);
  }, [theme, systemDark]);

  const saveMine = useCallback(async (prefs: ThemePrefs) => {
    const res = await api.put<{ theme: ThemePrefs }>('/appearance/me', prefs);
    setMine(res.data.theme);
  }, []);

  const clearMine = useCallback(async () => {
    await api.delete('/appearance/me');
    setMine(null);
  }, []);

  const saveOrg = useCallback(async (prefs: ThemePrefs) => {
    const res = await api.put<{ theme: ThemePrefs }>('/appearance/org', prefs);
    setOrg(res.data.theme);
  }, []);

  const clearOrg = useCallback(async () => {
    await api.delete('/appearance/org');
    setOrg(null);
  }, []);

  const value = useMemo(
    () => ({ theme, isDark, org, mine, setPreview, saveMine, clearMine, saveOrg, clearOrg }),
    [theme, isDark, org, mine, saveMine, clearMine, saveOrg, clearOrg],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
