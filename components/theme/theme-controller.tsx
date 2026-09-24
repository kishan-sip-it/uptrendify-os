'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

export type ThemePreference = 'light' | 'dark' | 'system';

const OPTIONS = [
  ['light', 'Light', Sun],
  ['dark', 'Dark', Moon],
  ['system', 'System', Monitor],
] as const;

function readTheme(): ThemePreference {
  if (typeof document !== 'undefined') {
    const datasetTheme = document.documentElement.dataset.theme as ThemePreference | undefined;
    if (datasetTheme === 'light' || datasetTheme === 'dark' || datasetTheme === 'system') return datasetTheme;
  }
  return 'light';
}

export function ThemeController() {
  const [theme, setTheme] = useState<ThemePreference>(readTheme);

  useEffect(() => {
    const stored = window.localStorage.getItem('uptrendify-theme') as ThemePreference | null;
    const initial =
      stored === 'dark' || stored === 'system' || stored === 'light'
        ? stored
        : readTheme();

    setTheme(initial);
    document.documentElement.dataset.theme = initial;

    if (!stored) {
      void fetch('/api/preferences', { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) return;
          const body = await response.json().catch(() => null);
          const preference = body?.theme as ThemePreference | undefined;
          if (preference === 'light' || preference === 'dark' || preference === 'system') {
            setTheme(preference);
            document.documentElement.dataset.theme = preference;
            window.localStorage.setItem('uptrendify-theme', preference);
          }
        })
        .catch(() => undefined);
    }
  }, []);

  async function change(next: ThemePreference) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem('uptrendify-theme', next);
    await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: next }),
    }).catch(() => undefined);
  }

  return (
    <div className="theme-control" aria-label="Theme preference">
      {OPTIONS.map(([key, label, Icon]) => (
        <button
          key={key}
          type="button"
          className={'theme-option ' + (theme === key ? 'active' : '')}
          onClick={() => change(key)}
          aria-pressed={theme === key}
        >
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  );
}
