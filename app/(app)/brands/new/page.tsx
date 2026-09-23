'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Globe2, LoaderCircle, Sparkles } from 'lucide-react';
import { ErrorState, SuccessState } from '@/components/ui/feedback';
import { BrandWebsiteSuggestions } from '@/components/brand/website-suggestions';

type Status = { kind: 'success' | 'error' | 'idle'; message: string };

export default function NewBrandPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle', message: '' });
  const [brandName, setBrandName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [workspace, setWorkspace] = useState<{ name: string; workspace_type: 'AGENCY' | 'BUSINESS' } | null>(null);

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
      setStatus({ kind: 'success', message: 'Brand created. Open the brand workspace to start research and continue the workflow.' });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="main" style={{ maxWidth: 980 }}>
      <a href="/" className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><ArrowLeft size={15}/> Back to command center</a>
      <div style={{ marginTop: 28 }}>
        <div className="eyebrow">Brand onboarding</div>
        <h1>Turn a website into a growth workspace.</h1>
        <p className="subtitle">{workspace ? `${workspace.name} · ${workspace.workspace_type === 'AGENCY' ? 'Agency workspace' : 'Business workspace'} · ` : ''}Give UpTrendifyOS the public website and basic context. The next stage researches evidence and builds a reviewable Brand Brain.</p>
        {workspace?.workspace_type === 'BUSINESS' ? (
          <div className="card" style={{ marginTop: 14, padding: 14 }}>
            <div className="eyebrow">Business workspace</div>
            <strong>One active brand</strong>
            <p className="subtitle" style={{ margin: '5px 0 0' }}>Business workspaces focus on one primary brand. Switch the workspace to Agency to manage multiple brands.</p>
          </div>
        ) : null}
      </div>
      <form onSubmit={submit} className="card" style={{ marginTop: 28, display: 'grid', gap: 18 }}>
        <div className="badge"><Sparkles size={14}/> AI-ready brand onboarding</div>
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
          <label>Industry<input name="industry" placeholder="B2B SaaS" /></label>
          <label>Primary market<input name="marketCountry" placeholder="United States" /></label>
          <label>Target audience<input name="targetAudience" placeholder="Operations leaders at SMBs" /></label>
        </div>
        <button disabled={loading} className="badge" style={{ border:0, justifyContent:'center', padding:14, cursor:'pointer' }}>
          {loading ? <><LoaderCircle size={15} className="spin"/> Creating…</> : <>Create brand workspace <Sparkles size={15}/></>}
        </button>
        {status.kind === 'success' && <SuccessState message={status.message} />}
        {status.kind === 'error' && <ErrorState message={status.message} />}
      </form>
    </main>
  );
}
