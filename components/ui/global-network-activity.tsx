'use client';

import { useEffect, useState } from 'react';

const PATCH_KEY = '__uptrendifyNetworkActivityPatched__';
type PatchedWindow = Window & { __uptrendifyNetworkActivityPatched__?: boolean };

export function GlobalNetworkActivity() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const patchedWindow = window as PatchedWindow;
    if (patchedWindow[PATCH_KEY]) return;
    const originalFetch = window.fetch.bind(window);
    let pending = 0;
    let showTimer: number | null = null;
    const update = () => setActive(pending > 0);
    window.fetch = async (...args) => {
      pending += 1;
      if (pending === 1) showTimer = window.setTimeout(update, 220);
      try { return await originalFetch(...args); }
      finally {
        pending = Math.max(0, pending - 1);
        if (pending === 0) {
          if (showTimer !== null) window.clearTimeout(showTimer);
          showTimer = null;
          setActive(false);
        }
      }
    };
    patchedWindow[PATCH_KEY] = true;
  }, []);

  return active ? <div className="global-network-activity" role="progressbar" aria-label="Loading" /> : null;
}
