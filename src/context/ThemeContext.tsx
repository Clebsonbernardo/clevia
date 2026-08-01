import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'clevia-theme';
const DEBOUNCE_MS = 600;

function applyThemeClass(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const lastToggleRef = useRef(0);
  const themeRef = useRef<Theme>('dark');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial = saved ?? 'dark';
    themeRef.current = initial;
    setThemeState(initial);
    applyThemeClass(initial);
  }, []);

  const setTheme = (t: Theme) => {
    themeRef.current = t;
    localStorage.setItem(STORAGE_KEY, t);
    applyThemeClass(t);
    setThemeState(t);
  };

  const toggleTheme = () => {
    const now = Date.now();
    if (now - lastToggleRef.current < DEBOUNCE_MS) return;
    lastToggleRef.current = now;
    const next = themeRef.current === 'light' ? 'dark' : 'light';
    setTheme(next);
  };

  return <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de ThemeProvider');
  return ctx;
}
