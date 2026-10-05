'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

const LIMIT = 3;

type LimitState = {
  generationCount: number;
  generationLimit: number;
  generationLimitReached: boolean;
};

export function StrategyGenerationLimitBanner({ brandId }: { brandId: string }) {
  const [state, setState] = useState<LimitState | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/brands/${brandId}/strategy`, { cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json().catch(() => null);
      if (!body) return;
      setState({
        generationCount: Number(body.generationCount ?? 0),
        generationLimit: Number(body.generationLimit ?? LIMIT),
        generationLimitReached: Boolean(body.generationLimitReached),
      });
    } catch {
      // The main strategy workspace owns the actionable error state.
    }
  }, [brandId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 2500);
    return () => window.clearInterval(timer);
  }, [load]);

  if (!state?.generationLimitReached) return null;

  return (
    <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--accent) 45%, var(--line))', background: 'color-mix(in srgb, var(--accent) 7%, var(--panel))', marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ color: 'var(--accent)' }}>Strategy generation limit reached</div>
          <h3 style={{ margin: '6px 0 7px' }}>You’ve used all {state.generationLimit} strategy generations available on your current plan.</h3>
          <p className="subtitle" style={{ margin: 0 }}>
            Generate additional strategy versions by upgrading to Premium.
          </p>
          <p className="activity-meta" style={{ margin: '8px 0 0' }}>
            {state.generationCount}/{state.generationLimit} generations used. Premium billing is not connected yet, so no purchase is processed here.
          </p>
        </div>
        <button
          type="button"
          className="badge"
          disabled
          title="Premium upgrade is coming soon."
          style={{ border: 0, padding: '9px 13px', cursor: 'not-allowed', opacity: 0.7, flexShrink: 0 }}
        >
          <Sparkles size={14} /> Upgrade to Premium · Coming soon
        </button>
      </div>
    </div>
  );
}
