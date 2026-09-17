'use client';

import { FormEvent, useState } from 'react';
import { ArrowLeft, Globe2, LoaderCircle, Sparkles } from 'lucide-react';
import { ErrorState, SuccessState } from '@/components/ui/feedback';

type Status = { kind: 'success' | 'error' | 'idle'; message: string };

export default function NewBrandPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle', message: '' });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus({ kind: 'idle', message: '' });
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
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
      setStatus({ kind: 'success', message: `Brand ${result.brand.name} created successfully. Next step: run brand research.` });
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
        <p className="subtitle">Give UpTrendifyOS the public website and basic context. The next stage will crawl approved public pages, preserve evidence and build a reviewable Brand Brain.</p>
      </div>
      <form onSubmit={submit} className="card" style={{ marginTop: 28, display: 'grid', gap: 18 }}>
        <div className="badge"><Sparkles size={14}/> AI-ready brand onboarding</div>
        <label>Client name<input name="clientName" required placeholder="e.g. Aurora Labs" /></label>
        <label>Brand name<input name="brandName" required placeholder="e.g. Aurora" /></label>
        <label>Website URL<div style={{ position:'relative' }}><Globe2 size={18} style={{ position:'absolute', left:12, top:13, color:'var(--muted)' }}/><input name="websiteUrl" type="url" required placeholder="https://example.com" style={{ paddingLeft:40, width:'100%' }}/></div></label>
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
