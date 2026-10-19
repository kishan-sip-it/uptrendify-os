'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Globe2, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react';
import type { ExtractedIdentity } from '@/lib/brand/visual-extraction';
import { preferredPreviewFontFamily } from '@/lib/brand/identity-mapping';
import { TONE_OPTIONS } from '@/lib/brand/voice';
import { applyPrimaryColorToDraft, buildCreatePatchPayload, buildReviewDraft, type ReviewDraft } from '@/lib/brand/review-draft';
import { brandNameFromWebsiteUrl } from '@/lib/brand/website-url';
import { mergeExistingBrandScanPatch } from '@/lib/brand/scan-merge';
import { brandInitials, BrandField, BrandPanel, BrandSection, NotDetected } from './brand-profile-primitives';
import { EditableColorPalette, EditablePersonas, EditablePrimaryColor, EditableTags, EditableTextField, normaliseClearedText } from './brand-identity-editors';

type IntakeIdentity = ExtractedIdentity & {
  assets?: { url: string; type: string; label: string | null }[];
  aiProfile?: {
    products: string[];
    services: string[];
    keyFeatures: string[];
    benefits: string[];
    pricingSignals: string[];
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
    industry: string | null;
    businessModel: string | null;
    primaryMarket: string | null;
    geography: string | null;
    seo: {
      importantTopics: string[];
      keywordThemes: string[];
      contentGaps: string[];
      searchIntentOpportunities: string[];
    };
    competition: {
      namedCompetitors: string[];
      alternatives: string[];
      differentiationClaims: string[];
    };
    evidence: { claim: string; sourceUrl: string }[];
  } | null;
  crawl?: { pages: string[]; pageCount: number; stylesheetCount: number } | null;
  scanNotices?: string[];
  aiModelCompleted?: boolean;
  aiFallbackUsed?: boolean;
  aiStatus?: 'completed' | 'fallback';
  aiWarnings?: string[];
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
  onCreated: (brandId: string, details?: { brandName: string; websiteUrl: string; manual?: boolean }) => void;
  initialWebsite?: string;
  initialBrandName?: string;
  startResearch?: boolean;
  showReview?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('input');
  const [website, setWebsite] = useState(initialWebsite);
  const [name, setName] = useState(initialBrandName);
  const [identity, setIdentity] = useState<IntakeIdentity | null>(null);
  useEffect(() => {
    // Prefer font files declared by the inspected website itself; use Google Fonts
    // only when no source-hosted face was discovered for an explicitly linked family.
    const families = [...new Map((identity?.fonts ?? []).map((font) => [font.family.toLowerCase(), font])).values()]
      .filter((font) => Boolean(font.fontAssetUrl) || font.source === 'google-fonts')
      .slice(0, 3);
    const nodes = families.map((font) => {
      if (font.fontAssetUrl) {
        const style = document.createElement('style');
        const safeFamily = font.family.replace(/["\\\r\n]/g, '');
        const safeUrl = font.fontAssetUrl.replace(/["\\\r\n]/g, '');
        const format = font.fontAssetFormat ? ' format("' + font.fontAssetFormat + '")' : '';
        const weight = font.fontWeight ?? '400';
        const fontStyle = font.fontStyle ?? 'normal';
        style.dataset.brandIntakeFont = font.family;
        style.textContent = '@font-face{font-family:"' + safeFamily + '";src:url("' + safeUrl + '")' + format + ';font-weight:' + weight + ';font-style:' + fontStyle + ';font-display:swap;}';
        document.head.appendChild(style);
        return style;
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(font.family).replace(/%20/g, '+') + '&display=swap';
      link.dataset.brandIntakeFont = font.family;
      document.head.appendChild(link);
      return link;
    });
    return () => nodes.forEach((node) => node.remove());
  }, [identity?.fonts]);
  const [stepIndex, setStepIndex] = useState(0);
  const [scanElapsed, setScanElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Inline field validation (empty or malformed input) is distinct from a scan
  // failure: it never starts a request and never offers the failed-scan fallback.
  const [urlError, setUrlError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [manualSaving, setManualSaving] = useState(false);
  // Reviewed pre-creation values. The draft is authoritative: create() persists
  // exactly these values, including intentional clears.
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const draftDirtyRef = useRef(false);
  const createInFlightRef = useRef(false);
  const reviewAfterScan = showReview !== false;

  const scan = useCallback(async () => {
    const entered = website.trim();
    if (!entered) {
      setUrlError('Enter a website URL to analyse.');
      return;
    }
    const value = /^https?:\/\//i.test(entered) ? entered : `https://${entered.replace(/^\/+/g, '')}`;
    try {
      const parsed = new URL(value);
      if (!parsed.hostname.includes('.') || !['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid');
    } catch {
      // A malformed URL never reached the API, so this is field validation,
      // not a failed scan: stay on the form.
      setUrlError('Enter a valid public website domain or URL, such as salesforce.com');
      return;
    }

    setWebsite(value);
    setError(null);
    setUrlError(null);
    setSaveError(null);
    setPhase('scanning');
    setStepIndex(0);
    setScanElapsed(0);
    const startedAt = Date.now();
    const ticker = window.setInterval(() => {
      setStepIndex((current) => (current + 1) % STEPS.length);
      setScanElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1100);

    try {
      const response = await fetch(`/api/brands/website-identity?url=${encodeURIComponent(value)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (response.status === 401) { window.location.href = '/login'; return; }
      if (!response.ok || !body?.identity) {
        if (!body?.error && response.status >= 500) {
          throw new Error('Website analysis hit a server-side timeout or temporary failure before enough public content could be recovered. Retry once, or enter a public About/Products page URL. No brand was created.');
        }
        throw new Error(body?.error || 'The website did not return enough readable public content to create a reliable Brand IQ.');
      }

      const next = body.identity as IntakeIdentity;
      setIdentity(next);
      const hostLabel = brandNameFromWebsiteUrl(next.finalUrl ?? value);
      setName(next.brandName || name.trim() || hostLabel);
      // The reviewed values start as the scan output; every edit marks the draft
      // dirty so create() can tell a reviewed import from a repeat scan import.
      draftDirtyRef.current = false;
      setDraft(buildReviewDraft(next));
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that website.');
      setPhase('error');
    } finally {
      window.clearInterval(ticker);
    }
  }, [website, name]);

  // Local (pre-creation) save for the review editors: the same components the
  // saved Brand Profile uses, writing into the draft instead of the API. The
  // create step persists the draft exactly as reviewed.
  const saveDraftField = useCallback(<K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]): Promise<boolean> => {
    draftDirtyRef.current = true;
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    return Promise.resolve(true);
  }, []);

  const saveDraftPrimaryColor = useCallback((next: string): Promise<boolean> => {
    draftDirtyRef.current = true;
    setDraft((current) => (current ? applyPrimaryColorToDraft(current, next) : current));
    return Promise.resolve(true);
  }, []);

  const create = useCallback(async () => {
    if (!identity || !draft || createInFlightRef.current) return;
    createInFlightRef.current = true;
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
          description: draft.description ?? undefined,
          industry: draft.industry ?? undefined,
          targetAudience: draft.targetAudience ?? undefined,
        }),
      });
      const created = await createResponse.json().catch(() => null);
      if (!createResponse.ok) {
        if (createResponse.status === 401) { window.location.href = '/login'; return; }
        throw new Error(created?.error || 'Could not create the brand.');
      }

      const brandId = String(created.brand.id);
      // Persist exactly the reviewed values, including intentional clears
      // (explicit null/[]), so no later read can restore the scanned originals.
      const scannedPatch = buildCreatePatchPayload(draft, identity);

      let patchPayload: Record<string, unknown> = scannedPatch;
      if (created.existing === true && !draftDirtyRef.current) {
        // Repeat-scan import without review: existing human edits stay
        // authoritative. A reviewed draft is applied verbatim instead — the
        // user explicitly confirmed these values before creation.
        const existingResponse = await fetch(`/api/brands/${brandId}`, { cache: 'no-store' });
        const existingBody = await existingResponse.json().catch(() => null);
        if (!existingResponse.ok || !existingBody?.brand) {
          throw new Error(existingBody?.error || 'Could not load the saved brand before merging this scan.');
        }
        patchPayload = mergeExistingBrandScanPatch(existingBody.brand, scannedPatch);
      }

      const patchResponse = await fetch(`/api/brands/${brandId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patchPayload),
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
      // A brand-save failure is not a scan failure: stay in the review with the
      // draft intact so the user can retry without losing their edits.
      setError(err instanceof Error ? err.message : 'Could not create the brand.');
      setPhase('review');
    } finally {
      createInFlightRef.current = false;
    }
  }, [identity, draft, name, website, onCreated, startResearch]);

  useEffect(() => {
    if (reviewAfterScan || phase !== 'review' || !identity || !draft) return;
    void create();
  }, [create, identity, draft, phase, reviewAfterScan]);

  /**
   * Failure path: when the website scan failed or returned no usable identity,
   * the user can still create the brand from the name and URL they entered.
   * Nothing is invented: identity fields simply stay empty, and the existing
   * Brand Profile editors provide the same Edit/Clear capabilities used after
   * a scanned creation. This is a distinct operation from the scanned create()
   * above — no scanned patch, and research is not auto-started on empty data.
   */
  const createManually = useCallback(async () => {
    if (createInFlightRef.current) return;
    const entered = website.trim();
    const value = /^https?:\/\//i.test(entered) ? entered : `https://${entered.replace(/^\/+/g, '')}`;
    try {
      const parsed = new URL(value);
      if (!parsed.hostname.includes('.') || !['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid');
    } catch {
      setSaveError('Enter the website URL first so the brand has a valid website address.');
      return;
    }
    const resolvedName = name.trim() || brandNameFromWebsiteUrl(value);
    if (resolvedName.trim().length < 2) {
      setSaveError('Enter a brand name (at least 2 characters) to create the brand.');
      return;
    }
    createInFlightRef.current = true;
    setManualSaving(true);
    setSaveError(null);
    try {
      const createResponse = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandName: resolvedName.trim(), websiteUrl: value }),
      });
      const created = await createResponse.json().catch(() => null);
      if (!createResponse.ok) {
        if (createResponse.status === 401) { window.location.href = '/login'; return; }
        throw new Error(created?.error || 'Could not create the brand.');
      }
      onCreated(String(created.brand.id), { brandName: resolvedName.trim(), websiteUrl: value, manual: true });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not create the brand.');
    } finally {
      createInFlightRef.current = false;
      setManualSaving(false);
    }
  }, [website, name, onCreated]);

  // A failed scan keeps every entered value: pre-fill the manual brand name
  // from the URL so manual creation needs no retyping.
  useEffect(() => {
    if (phase !== 'error') return;
    if (name.trim()) return;
    setName(brandNameFromWebsiteUrl(website.trim()));
  }, [phase, name, website]);

  if (phase === 'input' || phase === 'error') {
    const scanFailed = phase === 'error';
    return (      <div>
        <label className="brand-field" style={{ display: 'block', borderTop: 0, paddingTop: 0 }}>
          <span style={{ display: 'block', marginBottom: 8, color: 'var(--text)', fontWeight: 650 }}>Start with the brand website</span>
          <span style={{ display: 'block', marginBottom: 10, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
            We read the public site, its products, services, visual identity, audience and messaging. The existing Brand IQ pipeline uses those findings to create the brand without asking you to repeat them manually.
          </span>
          <div style={{ position: 'relative' }}>
            <Globe2 size={17} style={{ position: 'absolute', left: 13, top: 14, color: 'var(--text-subtle)', pointerEvents: 'none' }} />
            <input type="url" value={website} onChange={(event) => { setWebsite(event.target.value); if (urlError) setUrlError(null); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void scan(); } }} placeholder="https://example.com" aria-label="Brand website URL" aria-invalid={urlError ? true : undefined} style={{ paddingLeft: 40 }} autoFocus />
          </div>
        </label>
        {urlError ? <p role="alert" className="brand-section-hint" style={{ marginTop: 10, color: 'var(--status-danger)' }}>{urlError}</p> : null}
        {error ? <p role="alert" className="brand-section-hint" style={{ marginTop: 10, color: 'var(--status-danger)' }}>{error}</p> : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button type="button" className="brand-btn brand-btn-primary" onClick={() => { setSaveError(null); void scan(); }} disabled={!website.trim() || manualSaving} title={website.trim() ? undefined : 'Enter a website URL first'}><Sparkles size={14} /> Analyse website</button>
        </div>
        {scanFailed ? (
          <div className="brand-edit" style={{ marginTop: 18 }}>
            <strong style={{ display: 'block', fontSize: 13 }}>Create the brand without website data</strong>
            <span style={{ display: 'block', marginTop: 5, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
              The analysis above failed, so nothing was imported. Your name and URL are kept: create the brand with just those and fill in, edit or clear every other field in the Brand Profile — the same editors a scanned brand uses.
            </span>
            <label style={{ display: 'block', marginTop: 10 }}>
              <span className="brand-persona-fact-label">Brand name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Acme" aria-label="Brand name" disabled={manualSaving} />
            </label>
            {saveError ? <p role="alert" className="brand-section-hint" style={{ marginTop: 8, color: 'var(--status-danger)' }}>{saveError}</p> : null}
            <div className="brand-edit-actions">
              <button type="button" className="brand-btn brand-btn-primary" onClick={() => void createManually()} disabled={manualSaving}>
                {manualSaving ? <LoaderCircle size={14} className="spin" /> : <ArrowRight size={14} />}
                {manualSaving ? 'Creating brand…' : 'Create brand manually'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (phase === 'scanning' || (phase === 'saving' && !reviewAfterScan)) {
    const isImporting = phase === 'saving' && !reviewAfterScan;
    return (
      <div role="status" aria-live="polite">
        <div className="brand-scan-status">
          <div className="brand-scan-status-head">
            <div>
              <span className="eyebrow">{isImporting ? 'Website analysis complete' : 'Live website analysis'}</span>
              <strong>{isImporting ? 'Importing your Brand IQ' : 'Building your brand profile'}</strong>
            </div>
            <span className="brand-scan-elapsed">{scanElapsed}s</span>
          </div>
          <div className="brand-scan-progress" aria-hidden="true"><span /></div>
          <p className="brand-section-hint" style={{ marginTop: 10 }}>
            {isImporting
              ? 'The website analysis finished successfully. We are saving the extracted identity to your brand workspace before moving to the next step.'
              : 'We fetch the public site, inspect relevant same-domain pages and external stylesheets, extract the visual identity, then build structured Brand IQ. The stages below describe the work being performed; they are not fake completion percentages.'}
          </p>
          <ul className="brand-scan-steps" aria-label="Website analysis stages">
            {STEPS.map((step, index) => (
              <li key={step} className={isImporting || index === stepIndex ? 'active' : ''}>
                <span className="brand-scan-step-index">{String(index + 1).padStart(2, '0')}</span>
                <span>{step}</span>
                {isImporting
                  ? index < STEPS.length - 1
                    ? <span aria-hidden="true">✓</span>
                    : <LoaderCircle size={14} className="spin" aria-hidden="true" />
                  : index === stepIndex
                    ? <LoaderCircle size={14} className="spin" aria-hidden="true" />
                    : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (!identity || !draft) return null;
  const ai = identity.aiProfile;
  const assets = identity.assets ?? [];
  const previewFont = preferredPreviewFontFamily(identity.fonts);
  // Missing inline CSS / colour declarations are normal on many sites and do not
  // mean Brand IQ failed; empty visual fields already explain what was not found.
  const actionableWarnings = identity.warnings.filter((warning) =>
    !/^(?:No embedded stylesheet found; linked stylesheets and declared theme colours are checked separately\.|No usable colour declarations were found on the page\.)$/i.test(warning.trim()),
  );
  const aiFallbackUsed = identity.aiFallbackUsed === true || identity.aiModelCompleted === false;

  if (!reviewAfterScan) return null;

  return (
    <div>
      <BrandPanel icon={<Sparkles size={17} />} title="Brand IQ review" subtitle="Everything the website scan found, grouped into the same working contexts your content and strategy use. Edit or clear any value below — what you review here is exactly what gets saved.">
        {actionableWarnings.length || !ai || aiFallbackUsed ? (
          <div className="brand-scan-warning" role="status" aria-live="polite">
            <strong>{aiFallbackUsed ? 'AI enrichment fallback used' : !ai ? 'Structured Brand IQ needs attention' : 'Some parts of the scan need review'}</strong>
            <p>{aiFallbackUsed ? 'We recovered public website evidence, but structured AI enrichment did not complete. The profile below uses a website-evidence fallback; treat missing facts as unknown and retry when providers are available.' : !ai ? 'We recovered the public page, but the AI could not complete every structured field. You can retry the scan; do not treat missing values as verified facts.' : 'The scan recovered usable information, but one or more sources or enrichment steps were incomplete.'}</p>
            {actionableWarnings.length ? <ul>{actionableWarnings.slice(0, 4).map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
            <button type="button" className="brand-btn" onClick={() => void scan()} disabled={phase === 'saving'}><RefreshCw size={14} /> Retry website analysis</button>
          </div>
        ) : null}
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

        <BrandSection title="Brand Essentials" hint="The core identity and positioning context. Edit any value, or clear what the scan got wrong.">
          <div className="brand-fields">
            <BrandField label="What they do"><EditableTextField value={draft.description} placeholder="Describe the business." multiline onSave={(next) => saveDraftField('description', normaliseClearedText(next))} /></BrandField>
            <BrandField label="Industry"><EditableTextField value={draft.industry} placeholder="Industry" onSave={(next) => saveDraftField('industry', normaliseClearedText(next))} /></BrandField>
            <BrandField label="Business model"><EditableTextField value={draft.businessModel} placeholder="How the business makes money or delivers value" onSave={(next) => saveDraftField('businessModel', normaliseClearedText(next))} /></BrandField>
            <BrandField label="Primary market"><EditableTextField value={draft.primaryMarket} placeholder="Primary market" onSave={(next) => saveDraftField('primaryMarket', normaliseClearedText(next))} /></BrandField>
            <BrandField label="Geography"><EditableTextField value={draft.geography} placeholder="Geography" onSave={(next) => saveDraftField('geography', normaliseClearedText(next))} /></BrandField>
            <BrandField label="Positioning"><EditableTextField value={draft.valueProposition} placeholder="Why this brand wins" multiline onSave={(next) => saveDraftField('valueProposition', normaliseClearedText(next))} /></BrandField>
            <BrandField label="Differentiators"><EditableTags label="Differentiators" values={draft.differentiators} placeholder="Add a differentiator" onSave={(next) => saveDraftField('differentiators', next)} /></BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Products & Services" hint="What the site actually sells, offers or describes. Remove anything that is not part of the offer.">
          <div className="brand-fields">
            <BrandField label="Products"><EditableTags label="Products" values={draft.products} placeholder="Add a product" onSave={(next) => saveDraftField('products', next)} /></BrandField>
            <BrandField label="Services"><EditableTags label="Services" values={draft.services} placeholder="Add a service" onSave={(next) => saveDraftField('services', next)} /></BrandField>
            <BrandField label="Key features"><EditableTags label="Key features" values={draft.keyFeatures} placeholder="Add a key feature" onSave={(next) => saveDraftField('keyFeatures', next)} /></BrandField>
            <BrandField label="Benefits"><EditableTags label="Benefits" values={draft.benefits} placeholder="Add a benefit" onSave={(next) => saveDraftField('benefits', next)} /></BrandField>
            <BrandField label="Pricing signals"><EditableTags label="Pricing signals" values={draft.pricingSignals} placeholder="Add a pricing signal" onSave={(next) => saveDraftField('pricingSignals', next)} /></BrandField>
            <BrandField label="Product categories"><EditableTags label="Product categories" values={draft.productCategories} placeholder="Add a category" onSave={(next) => saveDraftField('productCategories', next)} /></BrandField>
            <BrandField label="Calls to action"><EditableTags label="Calls to action" values={draft.callsToAction} placeholder="Add a CTA" onSave={(next) => saveDraftField('callsToAction', next)} /></BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Audience" hint="Who the website says it serves, including detected segments and needs.">
          <div className="brand-fields">
            <BrandField label="Target audience"><EditableTextField value={draft.targetAudience} placeholder="Who should this brand reach?" multiline onSave={(next) => saveDraftField('targetAudience', normaliseClearedText(next))} /></BrandField>
            <BrandField label="Customer types"><EditableTags label="Customer types" values={draft.customerTypes} placeholder="Add a customer type" onSave={(next) => saveDraftField('customerTypes', next)} /></BrandField>
            <BrandField label="Personas"><EditablePersonas personas={draft.personas} onSave={(next) => saveDraftField('personas', next)} /></BrandField>
            <BrandField label="Pain points"><EditableTags label="Pain points" values={draft.painPoints} placeholder="Add a pain point" onSave={(next) => saveDraftField('painPoints', next)} /></BrandField>
            <BrandField label="Use cases"><EditableTags label="Use cases" values={draft.useCases} placeholder="Add a use case" onSave={(next) => saveDraftField('useCases', next)} /></BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Voice & Tone" hint="The verbal identity extracted from the site's own copy.">
          <div className="brand-fields">
            <BrandField label="Tone of voice"><EditableTags label="Tone" values={draft.tone} placeholder="Add a tone" max={3} primaryFirst suggestions={[...TONE_OPTIONS]} onSave={(next) => saveDraftField('tone', next)} /></BrandField>
            <BrandField label="Terminology"><EditableTags label="Terminology" values={draft.terminology} placeholder="Add preferred terminology" onSave={(next) => saveDraftField('terminology', next)} /></BrandField>
            <BrandField label="Recurring claims"><EditableTags label="Recurring claims" values={draft.recurringClaims} placeholder="Add a recurring claim" onSave={(next) => saveDraftField('recurringClaims', next)} /></BrandField>
            <BrandField label="Messaging themes"><EditableTags label="Messaging themes" values={draft.messagingThemes} placeholder="Add a messaging theme" onSave={(next) => saveDraftField('messagingThemes', next)} /></BrandField>
          </div>
        </BrandSection>

        <BrandSection title="SEO & Search" hint="Topics and search-intent opportunities grounded in the scanned pages.">
          <div className="brand-fields">
            <BrandField label="Important topics"><EditableTags label="Important topics" values={draft.seo.importantTopics} placeholder="Add a topic" onSave={(next) => saveDraftField('seo', { ...draft.seo, importantTopics: next })} /></BrandField>
            <BrandField label="Keyword themes"><EditableTags label="Keyword themes" values={draft.seo.keywordThemes} placeholder="Add a keyword theme" onSave={(next) => saveDraftField('seo', { ...draft.seo, keywordThemes: next })} /></BrandField>
            <BrandField label="Content gaps"><EditableTags label="Content gaps" values={draft.seo.contentGaps} placeholder="Add a content gap" onSave={(next) => saveDraftField('seo', { ...draft.seo, contentGaps: next })} /></BrandField>
            <BrandField label="Search intent opportunities"><EditableTags label="Search intent opportunities" values={draft.seo.searchIntentOpportunities} placeholder="Add a search-intent opportunity" onSave={(next) => saveDraftField('seo', { ...draft.seo, searchIntentOpportunities: next })} /></BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Competitive Context" hint="Competitors and alternatives only when supported by evidence.">
          <div className="brand-fields">
            <BrandField label="Named competitors"><EditableTags label="Named competitors" values={draft.competition.namedCompetitors} placeholder="Add a competitor" onSave={(next) => saveDraftField('competition', { ...draft.competition, namedCompetitors: next })} /></BrandField>
            <BrandField label="Alternatives"><EditableTags label="Alternatives" values={draft.competition.alternatives} placeholder="Add an alternative" onSave={(next) => saveDraftField('competition', { ...draft.competition, alternatives: next })} /></BrandField>
            <BrandField label="Differentiation claims"><EditableTags label="Differentiation claims" values={draft.competition.differentiationClaims} placeholder="Add a differentiation claim" onSave={(next) => saveDraftField('competition', { ...draft.competition, differentiationClaims: next })} /></BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Visual Identity" hint="Declared colours and typography, including external stylesheets rather than only inline HTML.">
          {identity.scanNotices?.length ? (
            <p className="brand-section-hint" role="note" style={{ marginTop: 0 }}>
              {identity.scanNotices.join(' ')}
            </p>
          ) : null}
          <div className="brand-fields">
            <BrandField label="Logo">
              {identity.logoUrl ? (
                <div>
                  <div className="brand-identity"><img src={identity.logoUrl} alt="Detected brand logo" style={{ maxWidth: 220, maxHeight: 64, objectFit: 'contain' }} /></div>
                  <span className="brand-section-hint" style={{ display: 'block', marginTop: 8 }}>The scanned logo is read-only in this preview. If this scanned logo isn&apos;t right, you can change it after creating the brand.</span>
                </div>
              ) : (
                <div>
                  <NotDetected label="No logo candidate detected" />
                  <span className="brand-section-hint" style={{ display: 'block', marginTop: 8 }}>No logo could be verified from this website yet. You can add or change the logo after creating the brand.</span>
                </div>
              )}
            </BrandField>
            <BrandField label="Primary colour"><EditablePrimaryColor value={draft.primaryColor} onSave={saveDraftPrimaryColor} /></BrandField>
            <BrandField label="Colours"><EditableColorPalette palette={draft.palette} onSave={(next) => saveDraftField('palette', next)} /></BrandField>
            <BrandField label="Fonts">
              <div>
                {identity.fonts.length ? <div className="brand-tags">{identity.fonts.map((font) => <span key={font.family} className="brand-tag">{font.family}</span>)}</div> : <NotDetected label="No font declarations detected" />}
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  <div><span className="brand-persona-fact-label">Heading font</span><EditableTextField value={draft.headingFont} placeholder="e.g. Inter" onSave={(next) => saveDraftField('headingFont', normaliseClearedText(next))} /></div>
                  <div><span className="brand-persona-fact-label">Body font</span><EditableTextField value={draft.bodyFont} placeholder="e.g. Inter" onSave={(next) => saveDraftField('bodyFont', normaliseClearedText(next))} /></div>
                </div>
              </div>
            </BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Assets" hint="Public visual assets found on the scanned homepage. These are references only until a proper asset-import workflow is approved.">
          {assets.length ? <div className="brand-persona-grid">{assets.map((asset) => <a key={asset.url} href={asset.url} target="_blank" rel="noreferrer" className="brand-persona" style={{ textDecoration: 'none' }}>{asset.type === 'image' ? <img src={asset.url} alt={asset.label ?? ''} style={{ width: '100%', height: 110, objectFit: 'contain', borderRadius: 10, background: 'var(--surface-muted)' }} /> : null}<span className="brand-persona-desc" style={{ display: 'block', marginTop: 7, overflowWrap: 'anywhere' }}>{asset.label || 'Website asset'}</span></a>)}</div> : <NotDetected label="No public image assets detected" />}
        </BrandSection>

        <BrandSection title="Live Preview" hint="A small brand-context preview using the imported identity, not generated placeholder data.">
          <div className="brand-voice-summary" style={{ background: 'color-mix(in srgb, var(--brand-primary, var(--accent)) 12%, var(--surface))', ...(previewFont ? { fontFamily: `"${previewFont.replace(/["\\]/g, '')}", sans-serif` } : {}) }}>
            <strong>{name || identity.brandName || 'Your brand'}</strong>{draft.valueProposition ? ` — ${draft.valueProposition}` : draft.description ? ` — ${draft.description}` : ''}
            {draft.tone.length ? <span style={{ display: 'block', marginTop: 6, opacity: .78 }}>Voice: {draft.tone.join(' · ')}</span> : null}
          </div>
        </BrandSection>

        <BrandSection title="Import provenance" hint="What was actually inspected during this scan.">
          <div className="brand-fields">
            <BrandField label="Pages scanned"><span>{identity.crawl?.pageCount ?? 1}</span></BrandField>
            <BrandField label="External stylesheets"><span>{identity.crawl?.stylesheetCount ?? 0}</span></BrandField>
            <BrandField label="Evidence used">{tags(identity.inspected)}</BrandField>
            {ai?.evidence?.length ? <BrandField label="Evidence claims"><div className="brand-evidence-list">{ai.evidence.slice(0, 8).map((item) => <div className="brand-evidence-item" key={item.sourceUrl + item.claim}><span>{item.claim}</span><a href={item.sourceUrl} target="_blank" rel="noreferrer">{new URL(item.sourceUrl).hostname}</a></div>)}</div></BrandField> : null}
            {actionableWarnings.length ? <BrandField label="Warnings"><ul style={{ margin: 0, paddingLeft: 18 }}>{actionableWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></BrandField> : null}
          </div>
        </BrandSection>

        {error ? <p role="alert" className="brand-section-hint" style={{ marginTop: 12, color: 'var(--status-danger)' }}>{error}</p> : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" className="brand-btn brand-btn-primary" onClick={() => void create()} disabled={phase === 'saving'}>{phase === 'saving' ? <LoaderCircle size={14} className="spin" /> : <ArrowRight size={14} />}{phase === 'saving' ? 'Creating brand…' : 'Create brand'}</button>
          <button type="button" className="brand-btn" onClick={() => { setPhase('input'); setIdentity(null); setError(null); setSaveError(null); setName(''); setDraft(null); draftDirtyRef.current = false; }} disabled={phase === 'saving'}><RefreshCw size={14} /> Scan a different site</button>
        </div>
      </BrandPanel>
    </div>
  );
}
