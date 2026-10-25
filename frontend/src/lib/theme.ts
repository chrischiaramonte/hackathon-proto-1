// Light/dark theme. Follows the system until the learner picks one, then remembers it.
// index.html applies the same choice before first paint, so there is no flash.
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'signspark:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Until the learner chooses, keep following the system setting.
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      if (!storedTheme()) setTheme(systemTheme());
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the choice lasts for this visit only.
    }
    setTheme(next);
  };

  return [theme, toggle];
}
