'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Globe2, LoaderCircle, Sparkles } from 'lucide-react';
import { ErrorState, SuccessState } from '@/components/ui/feedback';
import { BrandWebsiteSuggestions } from '@/components/brand/website-suggestions';

type Status = { kind: 'success' | 'error' | 'idle'; message: string };

export default function NewBrandPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle', message: '' });
  const [createdBrandId, setCreatedBrandId] = useState('');
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
      setCreatedBrandId(String(result.brand.id));
      setStatus({ kind: 'success', message: 'Brand created. Open the brand workspace to start research and continue the workflow.' });
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
        <div className="brand-form-section">
          <div className="brand-form-section-title">
            <strong>What happens next</strong>
            <span className="badge"><Sparkles size={12} /> Research → Brand Intelligence → Strategy</span>
          </div>
          <p className="subtitle" style={{ margin: 0 }}>Research gathers evidence first. Brand Intelligence organizes what the system found. Human review decides what becomes trusted brand knowledge.</p>
        </div>
        <button disabled={loading} className="brand-form-submit">
          {loading ? <><LoaderCircle size={15} className="spin"/> Creating…</> : <>Create brand and open workspace <Sparkles size={15}/></>}
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
