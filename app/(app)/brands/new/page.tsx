'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Globe2, LoaderCircle, Rocket, Sparkles, Users } from 'lucide-react';
import { ErrorState, SuccessState } from '@/components/ui/feedback';
import { useRouter } from 'next/navigation';
import { BrandWebsiteSuggestions } from '@/components/brand/website-suggestions';

type Status = { kind: 'success' | 'error' | 'idle'; message: string };

export default function NewBrandPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle', message: '' });
  const router = useRouter();
  const [createdBrandId, setCreatedBrandId] = useState('');
  const [brandName, setBrandName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [secondaryAudience, setSecondaryAudience] = useState('');
  const [offer, setOffer] = useState('');
  const [valueProposition, setValueProposition] = useState('');
  const [differentiators, setDifferentiators] = useState('');
  const [coreMessage, setCoreMessage] = useState('');
  const [messagingPillars, setMessagingPillars] = useState('');
  const [tone, setTone] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#6ee7c7');
  const [wordsToUse, setWordsToUse] = useState('');
  const [wordsToAvoid, setWordsToAvoid] = useState('');
  const [restrictions, setRestrictions] = useState('');
  const [colorSource, setColorSource] = useState<'default' | 'website' | 'manual'>('default');
  const [colorLoading, setColorLoading] = useState(false);
  const [workspace, setWorkspace] = useState<{ name: string; workspace_type: 'AGENCY' | 'BUSINESS' } | null>(null);

  useEffect(() => {
    const website = websiteUrl.trim();
    if (!/^https?:\/\//i.test(website) || colorSource === 'manual') {
      setColorLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      const controller = new AbortController();
      setColorLoading(true);
      try {
        const response = await fetch('/api/website-preview?url=' + encodeURIComponent(website), {
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null);
        if (!controller.signal.aborted && typeof body?.primaryColor === 'string' && colorSource === 'default') {
          setPrimaryColor(body.primaryColor);
          setColorSource('website');
        }
      } catch {
        // Website color detection is optional.
      } finally {
        if (!controller.signal.aborted) setColorLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [websiteUrl, colorSource]);

  useEffect(() => {
    fetch('/api/workspace', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => { if (body?.workspace) setWorkspace(body.workspace); })
      .catch(() => undefined);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus({ kind: 'idle', message: '' });
    const form = new FormData(event.currentTarget);
    const payload = {
      brandName: brandName.trim(),
      websiteUrl: websiteUrl.trim(),
      industry: String(form.get('industry') ?? '').trim() || undefined,
      marketCountry: String(form.get('marketCountry') ?? '').trim() || undefined,
      targetAudience: String(form.get('targetAudience') ?? '').trim() || undefined,
      description: String(form.get('description') ?? '').trim() || undefined,
    };
    try {
      const response = await fetch('/api/brands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }
        throw new Error(result.error || 'Could not create brand');
      }
      const brandId = String(result.brand.id);
      setCreatedBrandId(brandId);

      const rulesResponse = await fetch('/api/brands/' + brandId, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          description: payload.description ?? null,
          industry: payload.industry ?? null,
          marketCountry: payload.marketCountry ?? null,
          targetAudience: payload.targetAudience ?? null,
          audienceDetails: { secondaryAudience: secondaryAudience.trim() || null },
          offerDetails: { coreOffer: offer.trim() || null },
          positioning: {
            valueProposition: valueProposition.trim() || null,
            differentiators: differentiators.split('\n').map((value) => value.trim()).filter(Boolean),
          },
          messaging: {
            coreMessage: coreMessage.trim() || null,
            pillars: messagingPillars.split('\n').map((value) => value.trim()).filter(Boolean),
            tone: tone.trim() || null,
            wordsToUse: wordsToUse.split('\n').map((value) => value.trim()).filter(Boolean),
            wordsToAvoid: wordsToAvoid.split('\n').map((value) => value.trim()).filter(Boolean),
            restrictions: restrictions.trim() || null,
          },
          primaryColor,
          visualIdentity: { primaryColor },
        }),
      });
      const rulesBody = await rulesResponse.json().catch(() => null);
      if (!rulesResponse.ok) throw new Error(rulesBody?.error || 'Could not save the brand rules');

      const researchResponse = await fetch('/api/brands/' + brandId + '/research', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const researchBody = await researchResponse.json().catch(() => null);
      if (!researchResponse.ok && researchResponse.status !== 409) {
        throw new Error(researchBody?.error || 'Brand created, but research could not be started.');
      }

      setStatus({ kind: 'success', message: 'Brand created and research started. Opening the research workspace…' });
      window.setTimeout(() => router.replace('/brands/' + brandId), 350);
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="main" style={{ maxWidth: 1120 }}>
      <a href="/dashboard" className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><ArrowLeft size={15}/> Back to command center</a>
      <div className="brand-form-header" style={{ marginTop: 24 }}>
        <div className="eyebrow">Brand onboarding</div>
        <h1>Give the workspace a brand people can recognize.</h1>
        <p className="subtitle">{workspace ? `${workspace.name} · ${workspace.workspace_type === 'AGENCY' ? 'Agency workspace' : 'Business workspace'} · ` : ''}Start with the public website and a few human-provided basics. Research comes next, then Brand Intelligence and human review.</p>
        {workspace?.workspace_type === 'BUSINESS' ? (
          <div className="card" style={{ marginTop: 14, padding: 14 }}>
            <div className="eyebrow">Business workspace</div>
            <strong>One active brand</strong>
            <p className="subtitle" style={{ margin: '5px 0 0' }}>Business workspaces focus on one primary brand. Switch the workspace to Agency to manage multiple brands.</p>
          </div>
        ) : null}
      </div>
      <form onSubmit={submit} className="card brand-form-shell" style={{ marginTop: 18 }}>
        <div className="brand-form-section">
          <div className="brand-form-section-title">
            <strong>Brand identity</strong>
            <span className="badge">Step 1</span>
          </div>
          <div className="brand-input-grid">
        <label className="brand-field">
          <span>Brand name</span>
          <div className="brand-suggestion-wrap">
            <input className="brand-input" name="brandName" required value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="e.g. Aurora Labs" autoComplete="organization" autoFocus />
            <BrandWebsiteSuggestions query={brandName} onSelect={(name, url) => { setBrandName(name); setWebsiteUrl(url); }} />
          </div>
          <small>Type the company name and choose the real public website when it appears.</small>
        </label>
        <label className="brand-field"><span>Website URL</span><div style={{ position:'relative' }}><Globe2 size={18} style={{ position:'absolute', left:12, top:13, color:'var(--muted)' }}/><input className="brand-input" name="websiteUrl" type="url" required value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://example.com" style={{ paddingLeft:40, width:'100%' }}/></div></label>
        <div className="grid grid-3">
          <label className="brand-field"><span>Industry</span><input className="brand-input" name="industry" placeholder="B2B SaaS" /></label>
          <label className="brand-field"><span>Primary market</span><input className="brand-input" name="marketCountry" placeholder="India" /></label>
          <label className="brand-field brand-input-span"><span>Primary audience</span><textarea className="brand-textarea" name="targetAudience" placeholder="Who should this brand reach?" /></label>
          <label className="brand-field brand-input-span"><span>What does the brand do?</span><textarea className="brand-textarea" name="description" placeholder="Describe the business in your own words." /></label>
        </div>
        </div>
        </div>
        <div className="brand-form-section">
          <div className="brand-form-section-title">
            <strong>Brand rules</strong>
            <span className="badge"><Users size={12} /> Same questions as initial onboarding</span>
          </div>
          <div className="onboarding-grid">
            <label>Secondary audience<textarea rows={3} value={secondaryAudience} onChange={(event) => setSecondaryAudience(event.target.value)} /></label>
            <label>Core offer<textarea rows={3} value={offer} onChange={(event) => setOffer(event.target.value)} /></label>
            <label>Value proposition<textarea rows={3} value={valueProposition} onChange={(event) => setValueProposition(event.target.value)} /></label>
            <label>Differentiators<textarea rows={3} value={differentiators} onChange={(event) => setDifferentiators(event.target.value)} placeholder="One per line" /></label>
            <label>Core message<textarea rows={3} value={coreMessage} onChange={(event) => setCoreMessage(event.target.value)} /></label>
            <label>Messaging pillars<textarea rows={3} value={messagingPillars} onChange={(event) => setMessagingPillars(event.target.value)} placeholder="One per line" /></label>
            <label>Tone / communication style<input value={tone} onChange={(event) => setTone(event.target.value)} placeholder="e.g. direct, optimistic, expert" /></label>
            <label>Primary brand color<input type="color" value={primaryColor} onChange={(event) => { setPrimaryColor(event.target.value); setColorSource('manual'); }} /></label>
            <label>Words to use<textarea rows={3} value={wordsToUse} onChange={(event) => setWordsToUse(event.target.value)} placeholder="One per line" /></label>
            <label>Words to avoid<textarea rows={3} value={wordsToAvoid} onChange={(event) => setWordsToAvoid(event.target.value)} placeholder="One per line" /></label>
            <label className="span-2">Restrictions / claims to avoid<textarea rows={4} value={restrictions} onChange={(event) => setRestrictions(event.target.value)} /></label>
          </div>
          <p className="field-note" style={{ marginTop: 10 }}>
            {colorLoading ? 'Checking the website for its primary theme color…' : colorSource === 'website' ? 'Primary color detected from the website. You can change it above.' : 'Primary color will be detected from the public website when available.'}
          </p>
        </div>
        <div className="brand-form-section">
          <div className="brand-form-section-title">
            <strong>What happens next</strong>
            <span className="badge"><Sparkles size={12} /> Research → Brand Intelligence → Strategy</span>
          </div>
          <p className="subtitle" style={{ margin: 0 }}>Creating the brand now also starts the research run automatically, so this path behaves like the initial onboarding flow.</p>
        </div>
        <button disabled={loading} className="brand-form-submit">
          {loading ? <><LoaderCircle size={15} className="spin"/> Creating & starting research…</> : <>Create brand and start research <Rocket size={15}/><ArrowRight size={14}/></>}
        </button>
        {status.kind === 'success' && (
          <div className="card" style={{ background: '#edf5ef', borderColor: '#cfe0d4' }}>
            <SuccessState message={status.message} />
            {createdBrandId ? <a className="badge" href={'/brands/' + createdBrandId}><CheckCircle2 size={14} /> Open brand workspace</a> : null}
          </div>
        )}
        {status.kind === 'error' && <ErrorState message={status.message} />}
      </form>
    </main>
  );
}
