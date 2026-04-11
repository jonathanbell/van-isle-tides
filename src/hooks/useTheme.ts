import { useCallback, useEffect, useState } from 'react';
import { getSetting, setSetting } from '../db/tides';

type ThemeMode = 'auto' | 'sun';

const KEY = 'themeMode';

export function useTheme(): { mode: ThemeMode; toggleSun: () => void } {
  const [mode, setMode] = useState<ThemeMode>('auto');

  useEffect(() => {
    let cancelled = false;
    void getSetting<ThemeMode>(KEY).then((v) => {
      if (!cancelled && v) setMode(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode === 'sun') {
      document.documentElement.dataset.theme = 'sun';
    } else {
      delete document.documentElement.dataset.theme;
    }
  }, [mode]);

  const toggleSun = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'sun' ? 'auto' : 'sun';
      void setSetting(KEY, next);
      return next;
    });
  }, []);

  return { mode, toggleSun };
}
