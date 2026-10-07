'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Globe2, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react';
import type { ExtractedIdentity } from '@/lib/brand/visual-extraction';
import { toVisualIdentity } from '@/lib/brand/identity-mapping';
import { brandInitials, BrandField, BrandPanel, BrandSection, NotDetected } from './brand-profile-primitives';

type IntakeIdentity = ExtractedIdentity & {
  assets?: { url: string; type: string; label: string | null }[];
  aiProfile?: {
    products: string[];
    services: string[];
    audience: string | null;
    personas: { name: string; description?: string | null }[];
    customerTypes: string[];
    painPoints: string[];
    useCases: string[];
    tone: string[];
    terminology: string[];
    recurringClaims: string[];
    messagingThemes: string[];
    valueProposition: string | null;
    differentiators: string[];
    positioningThemes: string[];
    callsToAction: string[];
    productCategories: string[];
    businessModel: string | null;
    primaryMarket: string | null;
    geography: string | null;
    evidence: { claim: string; sourceUrl: string }[];
  } | null;
  crawl?: { pages: string[]; pageCount: number; stylesheetCount: number } | null;
};

type Phase = 'input' | 'scanning' | 'review' | 'saving' | 'error';

const STEPS = [
  'Reading the public website',
  'Reading products, services and key pages',
  'Extracting colours, fonts, logo and assets',
  'Building your Brand IQ',
  'Preparing the review',
];

const tags = (values: string[] | undefined, empty = 'Not detected from this website') =>
  values?.length ? (
    <div className="brand-tags">{values.map((value) => <span key={value} className="brand-tag">{value}</span>)}</div>
  ) : <NotDetected label={empty} />;

export function BrandIntake({
  onCreated,
  initialWebsite = '',
  initialBrandName = '',
  startResearch = true,
  showReview = true,
}: {
  onCreated: (brandId: string, details?: { brandName: string; websiteUrl: string }) => void;
  initialWebsite?: string;
  initialBrandName?: string;
  startResearch?: boolean;
  showReview?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('input');
  const [website, setWebsite] = useState(initialWebsite);
  const [name, setName] = useState(initialBrandName);
  const [identity, setIdentity] = useState<IntakeIdentity | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const reviewAfterScan = showReview !== false;

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
    const ticker = window.setInterval(() => setStepIndex((current) => Math.min(current + 1, STEPS.length - 1)), 1100);

    try {
      const response = await fetch(`/api/brands/website-identity?url=${encodeURIComponent(value)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (response.status === 401) { window.location.href = '/login'; return; }
      if (!response.ok || !body?.identity) throw new Error(body?.error || 'Could not read that website.');

      const next = body.identity as IntakeIdentity;
      setIdentity(next);
      if (next.brandName) setName(next.brandName);
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
          industry: identity.aiProfile?.businessModel ?? undefined,
          targetAudience: identity.aiProfile?.audience ?? undefined,
        }),
      });
      const created = await createResponse.json().catch(() => null);
      if (!createResponse.ok) {
        if (createResponse.status === 401) { window.location.href = '/login'; return; }
        throw new Error(created?.error || 'Could not create the brand.');
      }

      const brandId = String(created.brand.id);
      const patchResponse = await fetch(`/api/brands/${brandId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          description: identity.description ?? null,
          primaryColor: identity.primaryColor,
          secondaryColors: identity.secondaryColors,
          industry: null,
          targetAudience: identity.aiProfile?.audience ?? null,
          positioning: {
            valueProposition: identity.aiProfile?.valueProposition ?? null,
            differentiators: identity.aiProfile?.differentiators ?? [],
            positioningThemes: identity.aiProfile?.positioningThemes ?? [],
          },
          offerDetails: {
            products: identity.aiProfile?.products ?? [],
            services: identity.aiProfile?.services ?? [],
            productCategories: identity.aiProfile?.productCategories ?? [],
            callsToAction: identity.aiProfile?.callsToAction ?? [],
            painPoints: identity.aiProfile?.painPoints ?? [],
            useCases: identity.aiProfile?.useCases ?? [],
          },
          audienceDetails: {
            summary: identity.aiProfile?.audience ?? null,
            personas: identity.aiProfile?.personas ?? [],
            customerTypes: identity.aiProfile?.customerTypes ?? [],
          },
          messaging: {
            toneOfVoice: identity.aiProfile?.tone ?? [],
            terminology: identity.aiProfile?.terminology ?? [],
            recurringClaims: identity.aiProfile?.recurringClaims ?? [],
            messagingThemes: identity.aiProfile?.messagingThemes ?? [],
            brandMessaging: identity.aiProfile?.valueProposition ?? null,
          },
          visualIdentity: toVisualIdentity(identity),
        }),
      });
      const patched = await patchResponse.json().catch(() => null);
      if (!patchResponse.ok) throw new Error(patched?.error || 'Brand was created, but the imported Brand IQ could not be saved.');

      if (startResearch) {
        const researchResponse = await fetch(`/api/brands/${brandId}/research`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!researchResponse.ok && researchResponse.status !== 409) {
          const researchBody = await researchResponse.json().catch(() => null);
          throw new Error(researchBody?.error || 'Brand created and imported, but research could not be started.');
        }
      }
      onCreated(brandId, { brandName: resolvedName, websiteUrl: resolvedUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the brand.');
      setPhase('error');
    }
  }, [identity, name, website, onCreated, startResearch]);

  useEffect(() => {
    if (reviewAfterScan || phase !== 'review' || !identity) return;
    void create();
  }, [create, identity, phase, reviewAfterScan]);

  if (phase === 'input' || phase === 'error') {
    return (      <div>
        <label className="brand-field" style={{ display: 'block', borderTop: 0, paddingTop: 0 }}>
          <span style={{ display: 'block', marginBottom: 8, color: 'var(--text)', fontWeight: 650 }}>Start with the brand website</span>
          <span style={{ display: 'block', marginBottom: 10, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
            We read the public site, its products, services, visual identity, audience and messaging. The existing Brand IQ pipeline uses those findings to create the brand without asking you to repeat them manually.
          </span>
          <div style={{ position: 'relative' }}>
            <Globe2 size={17} style={{ position: 'absolute', left: 13, top: 14, color: 'var(--text-subtle)', pointerEvents: 'none' }} />
            <input type="url" value={website} onChange={(event) => setWebsite(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void scan(); } }} placeholder="https://example.com" aria-label="Brand website URL" style={{ paddingLeft: 40 }} autoFocus />
          </div>
        </label>
        {error ? <p role="alert" className="brand-section-hint" style={{ marginTop: 10, color: 'var(--status-danger)' }}>{error}</p> : null}
        <button type="button" className="brand-btn brand-btn-primary" style={{ marginTop: 14 }} onClick={() => void scan()}><Sparkles size={14} /> Analyse website</button>
      </div>
    );
  }

  if (phase === 'scanning') {
    return (
      <div role="status" aria-live="polite">
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 11 }}>
          {STEPS.map((step, index) => (
            <li key={step} style={{ display: 'flex', alignItems: 'center', gap: 10, color: index <= stepIndex ? 'var(--text)' : 'var(--text-subtle)' }}>
              {index < stepIndex ? <span style={{ color: 'var(--status-success)' }}>✓</span> : index === stepIndex ? <LoaderCircle size={15} className="spin" style={{ color: 'var(--accent)' }} /> : <span style={{ width: 15, height: 15, borderRadius: 999, border: '1px solid var(--border-strong)' }} />}
              <span style={{ fontSize: 14 }}>{step}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!identity) return null;
  const ai = identity.aiProfile;
  const assets = identity.assets ?? [];

  if (!reviewAfterScan) return null;

  return (
    <div>
      <BrandPanel icon={<Sparkles size={17} />} title="Brand IQ review" subtitle="Everything the website scan found, grouped into the same working contexts your content and strategy use.">
        <div className="brand-strip" aria-hidden="true" />
        <div className="brand-identity">
          <span className="brand-identity-logo" style={{ width: 58, height: 58 }}>
            {identity.logoUrl ? <img src={identity.logoUrl} alt="" /> : <span style={{ fontWeight: 750 }}>{brandInitials(identity.brandName ?? name)}</span>}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <span className="eyebrow">Brand name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Brand name" style={{ marginTop: 6 }} />
            <div className="brand-section-hint" style={{ marginTop: 7 }}>{identity.finalUrl ?? website}</div>
          </div>
        </div>

        <BrandSection title="Brand Essentials" hint="The core identity and positioning context.">
          <div className="brand-fields">
            <BrandField label="What they do"><span>{identity.description || <NotDetected label="Not detected from this website" />}</span></BrandField>
            <BrandField label="Industry"><span>{identity.aiProfile?.productCategories?.join(', ') || <NotDetected label="Not detected from this website" />}</span></BrandField>
            <BrandField label="Business model"><span>{ai?.businessModel || <NotDetected label="Not detected from this website" />}</span></BrandField>
            <BrandField label="Primary market / geography"><span>{[ai?.primaryMarket, ai?.geography].filter(Boolean).join(' · ') || <NotDetected label="Not detected from this website" />}</span></BrandField>
            <BrandField label="Positioning"><span>{ai?.valueProposition || <NotDetected label="Not detected from this website" />}</span></BrandField>
            <BrandField label="Differentiators">{tags(ai?.differentiators)}</BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Products & Services" hint="What the site actually sells, offers or describes.">
          <div className="brand-fields">
            <BrandField label="Products">{tags(ai?.products)}</BrandField>
            <BrandField label="Services">{tags(ai?.services)}</BrandField>
            <BrandField label="Product categories">{tags(ai?.productCategories)}</BrandField>
            <BrandField label="Calls to action">{tags(ai?.callsToAction)}</BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Audience" hint="Who the website says it serves, including detected segments and needs.">
          <div className="brand-fields">
            <BrandField label="Target audience"><span>{ai?.audience || <NotDetected label="Not detected from this website" />}</span></BrandField>
            <BrandField label="Customer types">{tags(ai?.customerTypes)}</BrandField>
            <BrandField label="Personas">
              {ai?.personas?.length ? <div className="brand-persona-grid">{ai.personas.map((persona) => <div key={persona.name} className="brand-persona"><h4 className="brand-persona-name">{persona.name}</h4>{persona.description ? <p className="brand-persona-desc">{persona.description}</p> : null}</div>)}</div> : <NotDetected label="No distinct personas detected from this website" />}
            </BrandField>
            <BrandField label="Pain points">{tags(ai?.painPoints)}</BrandField>
            <BrandField label="Use cases">{tags(ai?.useCases)}</BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Voice & Tone" hint="The verbal identity extracted from the site's own copy.">
          <div className="brand-fields">
            <BrandField label="Tone of voice">{tags(ai?.tone)}</BrandField>
            <BrandField label="Terminology">{tags(ai?.terminology)}</BrandField>
            <BrandField label="Recurring claims">{tags(ai?.recurringClaims)}</BrandField>
            <BrandField label="Messaging themes">{tags(ai?.messagingThemes)}</BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Guidelines" hint="Working rules derived from repeated language and explicit calls-to-action. They remain editable after import.">
          <div className="brand-fields">
            <BrandField label="Use / preferred language">{tags(ai?.terminology, 'No recurring terminology detected')}</BrandField>
            <BrandField label="Messaging rules">{tags([...(ai?.recurringClaims ?? []), ...(ai?.messagingThemes ?? [])], 'No explicit messaging rules detected')}</BrandField>
            <BrandField label="Positioning themes">{tags(ai?.positioningThemes)}</BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Visual Identity" hint="Declared colours and typography, including external stylesheets rather than only inline HTML.">
          <div className="brand-fields">
            <BrandField label="Logo">
              {identity.logoUrl ? <div className="brand-identity"><img src={identity.logoUrl} alt="Detected brand logo" style={{ maxWidth: 220, maxHeight: 64, objectFit: 'contain' }} /></div> : <NotDetected label="No logo candidate detected" />}
            </BrandField>
            <BrandField label="Colours">
              {identity.palette.length ? <div className="brand-swatches">{identity.palette.map((color) => <span key={color.hex} className="brand-swatch"><span className="brand-swatch-dot" style={{ ['--swatch' as string]: color.hex }} /><span style={{ textTransform: 'uppercase' }}>{color.hex.replace('#', '')}</span><span className="brand-swatch-role">{color.role}</span></span>)}</div> : <NotDetected label="No colours could be detected from the website" />}
            </BrandField>
            <BrandField label="Fonts">
              {identity.fonts.length ? <div className="brand-tags">{identity.fonts.map((font) => <span key={font.family} className="brand-tag">{font.family}</span>)}</div> : <NotDetected label="No font declarations detected" />}
            </BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Assets" hint="Public visual assets found on the scanned homepage. These are references only until a proper asset-import workflow is approved.">
          {assets.length ? <div className="brand-persona-grid">{assets.map((asset) => <a key={asset.url} href={asset.url} target="_blank" rel="noreferrer" className="brand-persona" style={{ textDecoration: 'none' }}>{asset.type === 'image' ? <img src={asset.url} alt={asset.label ?? ''} style={{ width: '100%', height: 110, objectFit: 'contain', borderRadius: 10, background: 'var(--surface-muted)' }} /> : null}<span className="brand-persona-desc" style={{ display: 'block', marginTop: 7, overflowWrap: 'anywhere' }}>{asset.label || 'Website asset'}</span></a>)}</div> : <NotDetected label="No public image assets detected" />}
        </BrandSection>

        <BrandSection title="Live Preview" hint="A small brand-context preview using the imported identity, not generated placeholder data.">
          <div className="brand-voice-summary" style={{ background: 'color-mix(in srgb, var(--brand-primary, var(--accent)) 12%, var(--surface))' }}>
            <strong>{name || identity.brandName || 'Your brand'}</strong>{ai?.valueProposition ? ` — ${ai.valueProposition}` : identity.description ? ` — ${identity.description}` : ''}
            {ai?.tone?.length ? <span style={{ display: 'block', marginTop: 6, opacity: .78 }}>Voice: {ai.tone.join(' · ')}</span> : null}
          </div>
        </BrandSection>

        <BrandSection title="Import provenance" hint="What was actually inspected during this scan.">
          <div className="brand-fields">
            <BrandField label="Pages scanned"><span>{identity.crawl?.pageCount ?? 1}</span></BrandField>
            <BrandField label="External stylesheets"><span>{identity.crawl?.stylesheetCount ?? 0}</span></BrandField>
            <BrandField label="Evidence used">{tags(identity.inspected)}</BrandField>
            {identity.warnings.length ? <BrandField label="Warnings"><ul style={{ margin: 0, paddingLeft: 18 }}>{identity.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></BrandField> : null}
          </div>
        </BrandSection>

        {error ? <p role="alert" className="brand-section-hint" style={{ marginTop: 12, color: 'var(--status-danger)' }}>{error}</p> : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" className="brand-btn brand-btn-primary" onClick={() => void create()} disabled={phase === 'saving'}>{phase === 'saving' ? <LoaderCircle size={14} className="spin" /> : <ArrowRight size={14} />}{phase === 'saving' ? 'Creating brand…' : 'Create brand'}</button>
          <button type="button" className="brand-btn" onClick={() => { setPhase('input'); setIdentity(null); setError(null); }} disabled={phase === 'saving'}><RefreshCw size={14} /> Scan a different site</button>
        </div>
      </BrandPanel>
    </div>
  );
}