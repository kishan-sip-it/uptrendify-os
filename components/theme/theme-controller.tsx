'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

export type ThemePreference = 'light' | 'dark' | 'system';

const OPTIONS = [
  ['light', 'Light', Sun],
  ['dark', 'Dark', Moon],
  ['system', 'System', Monitor],
] as const;

export function ThemeController({ compact = false }: { compact?: boolean }) {
  // Hydration-safe AND preference-accurate: server and first client render both
  // show System as active, which is the real default for a user without an
  // explicit preference. The inline boot script in app/layout.tsx has already
  // resolved the applied theme (stored light/dark, otherwise System → the OS
  // media query), so the applied appearance is correct before this state
  // syncs; the effect below then moves the button state to the real
  // preference after hydration.
  const [theme, setTheme] = useState<ThemePreference>('system');

  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem('uptrendify-theme'); } catch { /* Storage may be disabled. */ }

    // An explicit local choice (light/dark/system) always wins.
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
      document.documentElement.dataset.theme = stored;
      return;
    }
    setTheme('system');
    document.documentElement.dataset.theme = 'system';

    // No local choice: restore a light/dark preference saved on the server
    // (another device), if any. The preferences API remains light/dark-only;
    // System stays a local preference resolved by the CSS media-query rules.
    if (!stored) {
      void fetch('/api/preferences', { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) return;
          const body = await response.json().catch(() => null);
          const preference = body?.theme as ThemePreference | undefined;
          if (preference === 'light' || preference === 'dark') {
            setTheme(preference);
            document.documentElement.dataset.theme = preference;
            try { window.localStorage.setItem('uptrendify-theme', preference); } catch { /* Keep the current session preference. */ }
          }
        })
        .catch(() => undefined);
    }
  }, []);

  async function change(next: ThemePreference) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem('uptrendify-theme', next); } catch { /* Theme still applies for this session. */ }
    // System is resolved locally by the CSS media-query rules; the preferences
    // API stores explicit light/dark only. Persisting 'system' locally stops a
    // stale stored light/dark from winning the next boot.
    if (next === 'system') return;
    await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: next }),
    }).catch(() => undefined);
  }

  return (
    <div className={'theme-control' + (compact ? ' theme-control-compact' : '')} role="group" aria-label="Theme preference">
      {OPTIONS.map(([key, label, Icon]) => (
        <button
          key={key}
          type="button"
          className={'theme-option ' + (theme === key ? 'active' : '')}
          onClick={() => change(key)}
          aria-pressed={theme === key}
          aria-label={label + ' theme'}
          title={label}
        >
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  );
}
