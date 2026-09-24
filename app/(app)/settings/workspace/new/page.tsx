'use client';

import { useState } from 'react';
import { ArrowLeft, Building2, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ErrorState } from '@/components/ui/feedback';

export default function NewWorkspacePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [workspaceType, setWorkspaceType] = useState<'AGENCY' | 'BUSINESS'>('AGENCY');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function createWorkspace() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/workspace/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, workspaceType, timezone }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not create the workspace.');
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the workspace.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="main" style={{ maxWidth: 820 }}>
      <div className="topbar" style={{ marginBottom: 20 }}>
        <div>
          <a href="/settings" className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <ArrowLeft size={15} /> Back to Settings
          </a>
          <h1 style={{ fontSize: 'clamp(26px, 4vw, 38px)', marginTop: 8 }}>Create a workspace</h1>
          <p className="subtitle">This creates a separate workspace owned by your account. It is not nested under your current workspace; you can switch between them from the workspace picker.</p>
        </div>
      </div>

      <section className="card content-form">
        <div>
          <div className="eyebrow"><Building2 size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} /> Workspace setup</div>
          <h2 style={{ margin: '5px 0' }}>Start a separate operating space</h2>
          <p className="subtitle" style={{ margin: 0 }}>Choose the workspace type now. Brands added later belong to this workspace.</p>
        </div>

        <label>
          Workspace name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Northstar Marketing" maxLength={120} autoFocus />
        </label>

        <label>
          Workspace type
          <select value={workspaceType} onChange={(event) => setWorkspaceType(event.target.value as 'AGENCY' | 'BUSINESS')}>
            <option value="AGENCY">Agency — manage multiple brands</option>
            <option value="BUSINESS">Business — manage your business brands</option>
          </select>
        </label>

        <label>
          Timezone
          <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
            <option>Asia/Kolkata</option>
            <option>UTC</option>
            <option>America/New_York</option>
            <option>Europe/London</option>
            <option>Asia/Singapore</option>
            <option>Asia/Tokyo</option>
          </select>
        </label>

        {error ? <ErrorState message={error} /> : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <a className="badge" href="/settings">Cancel</a>
          <button type="button" className="badge auth-submit" onClick={() => void createWorkspace()} disabled={busy || name.trim().length < 2} style={{ border: 0, cursor: busy || name.trim().length < 2 ? 'not-allowed' : 'pointer', opacity: busy || name.trim().length < 2 ? 0.6 : 1 }}>
            {busy ? <><LoaderCircle size={14} className="spin" /> Creating…</> : <>Create workspace</>}
          </button>
        </div>
      </section>
    </main>
  );
}
