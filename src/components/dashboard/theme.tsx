'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { THEME_KEY, THEME_CLASSES, themeClass, isTheme, type Theme } from '@/lib/theme';

const Ctx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: 'default', setTheme: () => {} });
export const useTheme = () => useContext(Ctx);

const apply = (t: Theme | null) => {
  const root = document.documentElement;
  root.classList.remove(...THEME_CLASSES);
  if (t) root.classList.add(themeClass(t));
};

/**
 * Colour mode for the dashboard only (public pages stay mint). Remembered on this device and on
 * the pharmacy login, so it comes back after signing in on any computer or phone.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('default');
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch {}
    if (isTheme(saved)) setThemeState(saved);
    apply(isTheme(saved) ? saved : 'default');
    fetch('/api/preferences', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (isTheme(d?.theme)) { setThemeState(d.theme); apply(d.theme); try { localStorage.setItem(THEME_KEY, d.theme); } catch {} }
    }).catch(() => {});
    return () => apply(null); // leaving the dashboard: back to the public mint pages
  }, []);
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t); apply(t);
    try { localStorage.setItem(THEME_KEY, t); } catch {}
    fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: t }) }).catch(() => {});
  }, []);
  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}
