'use client';

import { useState } from 'react';
import { AlertTriangle, LoaderCircle, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function BrandWorkspaceActions({ brandId, brandName }: { brandId: string; brandName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function resetWorkspace() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/brands/${brandId}/reset`, { method: 'POST' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not reset brand workspace');
      setOpen(false);
      router.refresh();
      window.location.href = `/brands/${brandId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset brand workspace');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 18, borderColor: 'rgba(234,179,8,.30)' }}>
      <div className="section-title">
        <div>
          <div className="eyebrow">Workspace recovery</div>
          <h3 style={{ margin: '4px 0' }}>Reset generated work</h3>
        </div>
        <RotateCcw size={16} />
      </div>
      <p className="subtitle" style={{ marginTop: 0 }}>
        Keep {brandName} and its saved brand settings, but clear generated research and workflow data so the brand can start again from the integration stage.
      </p>
      {!open ? (
        <button type="button" className="badge" onClick={() => { setOpen(true); setError(''); }} disabled={busy}>
          <RotateCcw size={14} /> Reset brand workspace
        </button>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="field-note" role="alert">
            <AlertTriangle size={14} />
            <span>
              This will remove research, Brand Brain findings, strategies, campaigns, content, approvals, publishing records and generated AI work for <strong>{brandName}</strong>. The brand itself and its saved brand settings remain. Other brands are not affected. This cannot be undone.
            </span>
          </div>
          {error ? <div className="field-note" role="alert">{error}</div> : null}
          <div className="onboarding-actions">
            <button type="button" className="badge" onClick={() => { setOpen(false); setError(''); }} disabled={busy}>Cancel</button>
            <button type="button" className="badge tone-warn" onClick={resetWorkspace} disabled={busy}>
              {busy ? <><LoaderCircle size={14} className="spin" /> Resetting…</> : <><RotateCcw size={14} /> Confirm reset</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
