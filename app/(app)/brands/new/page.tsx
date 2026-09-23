'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Check, Globe2, LoaderCircle, Sparkles } from 'lucide-react';
import { ErrorState, SuccessState } from '@/components/ui/feedback';

type Status = { kind: 'success' | 'error' | 'idle'; message: string };
type Suggestion = { title: string; url: string };

export default function NewBrandPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle', message: '' });
  const [brandName, setBrandName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    const name = brandName.trim();
    if (name.length < 2) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setDiscovering(true);
      try {
        const response = await fetch('/api/brand-discovery?q=' + encodeURIComponent(name), { signal: controller.signal });
        const body = await response.json().catch(() => null);
        if (response.ok) setSuggestions(Array.isArray(body?.suggestions) ? body.suggestions : []);
      } catch {
        // Discovery never blocks manual entry.
      } finally {
        setDiscovering(false);
      }
    }, 450);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [brandName]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus({ kind: 'idle', message: '' });
    const form = new FormData(event.currentTarget);
    const payload = {
      brandName: brandName.trim(),
      websiteUrl: websiteUrl.trim(),
      industry: String(form.get('industry') ?? ''),
      marketCountry: String(form.get('marketCountry') ?? ''),
      targetAudience: String(form.get('targetAudience') ?? ''),
    };
    try {
      const response = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) { window.location.href = '/login'; return; }
        throw new Error(result?.error || 'Could not create the brand. Check the details and try again.');
      }
      setStatus({ kind: 'success', message: `Brand ${result.brand.name} created successfully. Next: start research.` });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong while creating the brand.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="main page-narrow">
      <a href="/dashboard" className="back-link"><ArrowLeft size={15}/> Back to command center</a>

      <div className="page-intro">
        <div className="eyebrow">Brand setup</div>
        <h1>Add a brand without the old-school form wall.</h1>
        <p className="subtitle">Start with the identity people know. UpTrendifyOS can then discover the public website, research it, and build the Brand Brain for review.</p>
      </div>

      <form onSubmit={submit} className="modern-form-card">
        <div className="form-card-head">
          <div className="form-card-title"><span className="soft-icon"><Sparkles size={16}/></span><div><strong>Brand identity</strong><span>Brand = the business identity you are marketing.</span></div></div>
          <span className="form-step">START</span>
        </div>

        <div className="modern-field">
          <label htmlFor="brand-name">Brand name</label>
          <div className="input-shell input-shell-focusable">
            <input id="brand-name" name="brandName" value={brandName} onChange={(event) => setBrandName(event.target.value)} required placeholder="e.g. AURORA" autoComplete="organization" />
            <Sparkles size={16} aria-hidden="true" />
          </div>
          <span className="field-help">As you type, public website candidates appear below. Choose one or paste a URL yourself.</span>
          {(discovering || suggestions.length > 0) && (
            <div className="website-suggestions" role="listbox" aria-label="Public website suggestions">
              {discovering ? <div className="suggestion-loading"><LoaderCircle size={14} className="spin" /> Searching public websites…</div> : null}
              {!discovering && suggestions.map((suggestion) => (
                <button type="button" className="suggestion-row" key={suggestion.url} onClick={() => { setWebsiteUrl(suggestion.url); setSuggestions([]); }}>
                  <span className="suggestion-check"><Check size={13}/></span>
                  <span className="suggestion-main"><strong>{suggestion.title}</strong><span>{suggestion.url}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="modern-field">
          <label htmlFor="brand-website">Website URL</label>
          <div className="input-shell">
            <Globe2 size={16} aria-hidden="true" />
            <input id="brand-website" name="websiteUrl" type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} required placeholder="https://example.com" />
          </div>
          <span className="field-help">Only public website URLs are appropriate here. Internal dashboards and app paths are rejected by design.</span>
        </div>

        <div className="modern-section">
          <div className="modern-section-title"><span>Optional context</span><small>You can fill deeper Brand Ground Rules later.</small></div>
          <div className="modern-grid-3">
            <div className="modern-field"><label htmlFor="industry">Industry</label><input id="industry" name="industry" placeholder="B2B SaaS" /></div>
            <div className="modern-field"><label htmlFor="market-country">Primary market</label><input id="market-country" name="marketCountry" placeholder="India" /></div>
            <div className="modern-field"><label htmlFor="target-audience">Primary audience</label><input id="target-audience" name="targetAudience" placeholder="Operations leaders at SMBs" /></div>
          </div>
        </div>

        <div className="form-inline-note"><span className="dot" /> The brand record stays stable when you rename or edit it later.</div>

        <div className="form-actions">
          <a className="button-secondary" href="/brands">Cancel</a>
          <button disabled={loading} className="button-primary" type="submit">
            {loading ? <><LoaderCircle size={15} className="spin"/> Creating…</> : <>Create brand <ArrowLeft size={15} style={{ transform: 'rotate(180deg)' }}/></>}
          </button>
        </div>

        {status.kind === 'success' && <SuccessState message={status.message} />}
        {status.kind === 'error' && <ErrorState message={status.message} />}
      </form>
    </main>
  );
}
