'use client';

import { useCallback, useState } from 'react';
import { ArrowRight, Globe2, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react';
import type { ExtractedIdentity } from '@/lib/brand/visual-extraction';
import { toVisualIdentity } from '@/lib/brand/identity-mapping';
import { brandInitials } from './brand-profile-primitives';

/**
 * Website-first brand intake.
 *
 * The user gives a URL. The deterministic scanner reads what the site actually
 * declares. Those values are shown for review *before* anything is written, and
 * the brand is created from the scan rather than from a manual rules form.
 *
 * Nothing here fabricates: fields the site did not evidence stay empty and are
 * labelled as such. A failed scan is a real, visible failure with a retry, not
 * a spinner that never resolves.
 */

type Phase = 'input' | 'scanning' | 'review' | 'saving' | 'error';

const STEPS = [
  'Reading the public website',
  'Extracting declared brand identity',
  'Detecting the real colour palette',
  'Preparing your Brand Profile',
];

export function BrandIntake({
  onCreated,
  initialWebsite = '',
  initialBrandName = '',
}: {
  onCreated: (brandId: string) => void;
  initialWebsite?: string;
  initialBrandName?: string;
}) {
  const [phase, setPhase] = useState<Phase>('input');
  const [website, setWebsite] = useState(initialWebsite);
  const [name, setName] = useState(initialBrandName);
  const [identity, setIdentity] = useState<ExtractedIdentity | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    const value = website.trim();
    if (!/^https?:\/\//i.test(value)) {
      setError('Enter a full website URL, starting with https://');
      setPhase('error');
      return;
    }

    setError(null);
    setPhase('scanning');
    setStepIndex(0);
    // Advance the visible progress so a slow scan never looks frozen.
    const ticker = window.setInterval(() => {
      setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
    }, 1400);

    try {
      const response = await fetch(`/api/brands/website-identity?url=${encodeURIComponent(value)}`, {
        cache: 'no-store',
      });
      const body = await response.json().catch(() => null);

      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!response.ok) {
        throw new Error(body?.error || 'Could not read that website.');
      }
      if (body?.error || !body?.identity) {
        throw new Error(body?.error || 'No brand information could be read from that website.');
      }

      setIdentity(body.identity as ExtractedIdentity);
      if (typeof body.identity.brandName === 'string' && body.identity.brandName) {
        setName(body.identity.brandName);
      }
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that website.');
      setPhase('error');
    } finally {
      window.clearInterval(ticker);
    }
  }, [website]);

  const create = useCallback(async () => {
    if (!identity) return;
    setPhase('saving');
    setError(null);

    try {
      const resolvedName = name.trim() || identity.brandName || website.replace(/^https?:\/\//, '').split('/')[0] || 'Brand';
      const resolvedUrl = identity.finalUrl ?? website.trim();

      const createResponse = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brandName: resolvedName,
          websiteUrl: resolvedUrl,
          description: identity.description ?? undefined,
        }),
      });
      const created = await createResponse.json().catch(() => null);
      if (!createResponse.ok) {
        if (createResponse.status === 401) {
          window.location.href = '/login';
          return;
        }
        throw new Error(created?.error || 'Could not create the brand.');
      }

      const brandId = String(created.brand.id);

      // Persist the detected identity through the existing brand route, so the
      // write is subject to exactly the same authorization as before.
      const patchResponse = await fetch(`/api/brands/${brandId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          description: identity.description ?? null,
          primaryColor: identity.primaryColor,
          secondaryColors: identity.secondaryColors,
          visualIdentity: toVisualIdentity(identity),
        }),
      });
      const patched = await patchResponse.json().catch(() => null);
      if (!patchResponse.ok) {
        throw new Error(patched?.error || 'Brand created, but the imported identity could not be saved.');
      }

      // Research continues into the existing pipeline; a failure here is
      // reported rather than swallowed.
      const researchResponse = await fetch(`/api/brands/${brandId}/research`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!researchResponse.ok && researchResponse.status !== 409) {
        const researchBody = await researchResponse.json().catch(() => null);
        throw new Error(
          researchBody?.error ||
            'Brand created and identity imported, but research could not be started. You can retry it from the brand page.',
        );
      }

      onCreated(brandId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the brand.');
      setPhase('error');
    }
  }, [identity, name, website, onCreated]);

  /* ------------------------------- input ------------------------------- */

  if (phase === 'input' || phase === 'error') {
    return (
      <div>
        <label className="brand-field" style={{ display: 'block', borderTop: 0, paddingTop: 0 }}>
          <span style={{ display: 'block', marginBottom: 8, color: 'var(--text)', fontWeight: 600 }}>
            Start with the brand website
          </span>
          <span style={{ display: 'block', marginBottom: 10, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
            We read the site, import the brand identity it actually declares — colours, fonts, logo,
            description — then hand it to you to review and edit. You never have to define brand
            rules before research.
          </span>
          <div style={{ position: 'relative' }}>
            <Globe2
              size={17}
              style={{ position: 'absolute', left: 13, top: 14, color: 'var(--text-subtle)', pointerEvents: 'none' }}
            />
            <input
              type="url"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void scan(); } }}
              placeholder="https://example.com"
              aria-label="Brand website URL"
              style={{ paddingLeft: 40 }}
              autoFocus
            />
          </div>
        </label>

        {error ? (
          <p
            role="alert"
            className="brand-section-hint"
            style={{ marginTop: 10, color: 'var(--status-danger)' }}
          >
            {error}
          </p>
        ) : null}

        <button type="button" className="brand-btn brand-btn-primary" style={{ marginTop: 14 }} onClick={() => void scan()}>
          <Sparkles size={14} /> Analyse website
        </button>
      </div>
    );
  }

  /* ------------------------------ scanning ----------------------------- */

  if (phase === 'scanning') {
    return (
      <div role="status" aria-live="polite">
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
          {STEPS.map((step, index) => (
            <li key={step} style={{ display: 'flex', alignItems: 'center', gap: 10, color: index <= stepIndex ? 'var(--text)' : 'var(--text-subtle)' }}>
              {index < stepIndex ? (
                <span aria-hidden="true" style={{ color: 'var(--status-success)' }}>✓</span>
              ) : index === stepIndex ? (
                <LoaderCircle size={15} className="spin" style={{ color: 'var(--accent)' }} />
              ) : (
                <span aria-hidden="true" style={{ width: 15, height: 15, borderRadius: 999, border: '1px solid var(--border-strong)' }} />
              )}
              <span style={{ fontSize: 14 }}>{step}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  /* ------------------------------- review ------------------------------ */

  const palette = identity?.palette ?? [];

  return (
    <div>
      <div className="brand-identity" style={{ marginBottom: 16 }}>
        <span className="brand-identity-logo" style={{ width: 52, height: 52 }} aria-hidden="true">
          {identity?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={identity.logoUrl} alt="" />
          ) : (
            <span style={{ fontWeight: 700, fontSize: 16 }}>{brandInitials(identity?.brandName ?? name)}</span>
          )}
        </span>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span className="eyebrow" style={{ margin: 0 }}>Brand name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Brand name" />
          </label>
        </div>
      </div>

      <div className="brand-fields">
        <div className="brand-field">
          <div className="brand-field-label"><span>Detected palette</span></div>
          <div className="brand-field-value">
            {palette.length > 0 ? (
              <div className="brand-swatches">
                {palette.map((color) => (
                  <span key={color.hex} className="brand-swatch">
                    <span className="brand-swatch-dot" style={{ ['--swatch' as string]: color.hex }} />
                    <span style={{ textTransform: 'uppercase' }}>{color.hex.replace('#', '')}</span>
                    <span className="brand-swatch-role">{color.role}</span>
                  </span>
                ))}
              </div>
            ) : (
              <span className="brand-not-detected">No colours could be detected — you can add them after import</span>
            )}
          </div>
        </div>

        <div className="brand-field">
          <div className="brand-field-label"><span>Description</span></div>
          <div className="brand-field-value">
            {identity?.description ? identity.description : <span className="brand-not-detected">Not detected</span>}
          </div>
        </div>

        <div className="brand-field">
          <div className="brand-field-label"><span>Fonts</span></div>
          <div className="brand-field-value">
            {identity?.fonts.length ? (
              <div className="brand-tags">
                {identity.fonts.map((font) => (
                  <span key={font.family} className="brand-tag">{font.family}</span>
                ))}
              </div>
            ) : (
              <span className="brand-not-detected">Not detected</span>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="brand-section-hint" style={{ marginTop: 12, color: 'var(--status-danger)' }}>{error}</p>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        <button type="button" className="brand-btn brand-btn-primary" onClick={() => void create()} disabled={phase === 'saving'}>
          {phase === 'saving' ? <LoaderCircle size={14} className="spin" /> : <ArrowRight size={14} />}
          {phase === 'saving' ? 'Creating brand…' : 'Create brand and start research'}
        </button>
        <button type="button" className="brand-btn" onClick={() => { setPhase('input'); setIdentity(null); setError(null); }} disabled={phase === 'saving'}>
          <RefreshCw size={14} /> Scan a different site
        </button>
      </div>
    </div>
  );
}
