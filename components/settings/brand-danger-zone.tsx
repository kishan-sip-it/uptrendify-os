'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCcw, Trash2 } from 'lucide-react';

 type Brand = { id: string; name: string; status: 'ACTIVE' | 'ARCHIVED' };
 type Action = 'reset' | 'delete';

export function BrandDangerZone() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [running, setRunning] = useState<Action | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId) ?? null;

  async function loadBrands() {
    const response = await fetch('/api/settings/brands', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || 'Could not load brands');
    const next = Array.isArray(body.brands) ? body.brands as Brand[] : [];
    setBrands(next);
    setSelectedBrandId((current) => current && next.some((brand) => brand.id === current) ? current : next[0]?.id ?? '');
  }

  useEffect(() => {
    void loadBrands().catch((err) => setError(err instanceof Error ? err.message : 'Could not load brands'));
  }, []);

  async function runAction() {
    if (!selectedBrand || !confirming) return;
    const brandName = selectedBrand.name;
    const action = confirming;
    setRunning(action);
    setError('');
    setMessage('');
    try {
      const endpoint = action === 'reset' ? `/api/brands/${selectedBrand.id}/reset` : `/api/brands/${selectedBrand.id}`;
      const response = await fetch(endpoint, { method: action === 'reset' ? 'POST' : 'DELETE' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || (action === 'reset' ? 'Could not reset brand workspace' : 'Could not delete brand'));
      setConfirming(null);
      if (action === 'delete') {
        setBrands((current) => current.filter((brand) => brand.id !== selectedBrand.id));
        setSelectedBrandId('');
        setMessage(`${brandName} was deleted.`);
      } else {
        setMessage(`${brandName} workspace was reset. The brand remains ready for fresh research.`);
      }
      await loadBrands();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The requested action failed');
    } finally {
      setRunning(null);
    }
  }

  return (
    <section className="card settings-tools" style={{ borderColor: 'color-mix(in srgb, var(--danger, #ef4444) 28%, var(--line))' }}>
      <div className="section-title">
        <div>
          <div className="eyebrow" style={{ color: 'var(--danger, #ef4444)' }}>Danger zone</div>
          <h2>Brand recovery & deletion</h2>
        </div>
        <AlertTriangle size={18} color="var(--danger, #ef4444)" />
      </div>

      <p className="subtitle">Choose a brand first. Reset and delete affect only that selected brand, never the other brands in this workspace.</p>

      {error ? <div className="field-note" role="alert">{error}</div> : null}
      {message ? <div className="field-note">{message}</div> : null}

      <label>
        Brand
        <select value={selectedBrandId} onChange={(event) => { setSelectedBrandId(event.target.value); setConfirming(null); }} disabled={!!running}>
          <option value="" disabled>{brands.length ? 'Select a brand' : 'No brands available'}</option>
          {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}{brand.status === 'ARCHIVED' ? ' · Archived' : ''}</option>)}
        </select>
      </label>

      {selectedBrand ? (
        <div className="settings-tool-grid" style={{ marginTop: 14 }}>
          <button type="button" className="settings-tool" onClick={() => setConfirming('reset')} disabled={!!running}>
            <RefreshCcw size={16} />
            <span><strong>Reset {selectedBrand.name}</strong><small>Remove research, Brand Brain, strategies, campaigns, content and workflow state while keeping the brand.</small></span>
          </button>
          <button type="button" className="settings-tool" onClick={() => setConfirming('delete')} disabled={!!running}>
            <Trash2 size={16} />
            <span><strong>Delete {selectedBrand.name}</strong><small>Permanently remove this brand and its brand-owned data. Other brands remain untouched.</small></span>
          </button>
        </div>
      ) : null}

      {confirming && selectedBrand ? (
        <div className="editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !running) setConfirming(null); }}>
          <section className="card editor-modal" role="dialog" aria-modal="true" aria-labelledby="brand-danger-title">
            <div className="section-title">
              <div><div className="eyebrow">Danger zone confirmation</div><h2 id="brand-danger-title">{confirming === 'reset' ? `Reset ${selectedBrand.name}?` : `Delete ${selectedBrand.name}?`}</h2></div>
              <AlertTriangle size={18} color="var(--danger, #ef4444)" />
            </div>
            <p className="subtitle">
              {confirming === 'reset'
                ? 'This permanently removes this brand’s research, sources, Brand Brain suggestions and facts, strategies, campaigns, content and workflow state. The brand identity, integration configuration and audit history remain. Other brands are not affected.'
                : 'This permanently removes this brand and its brand-owned research, Brand Brain, strategies, campaigns, content and publishing data. Other brands are not affected. This cannot be undone.'}
            </p>
            <div className="field-note"><AlertTriangle size={14} /> Selected brand: <strong>{selectedBrand.name}</strong>. The action applies only to this brand.</div>
            <div className="onboarding-actions">
              <button type="button" className="badge" onClick={() => setConfirming(null)} disabled={!!running}>Cancel</button>
              <button type="button" className="badge tone-danger" onClick={() => void runAction()} disabled={!!running}>
                {running ? <><RefreshCcw size={14} className="spin" /> {confirming === 'reset' ? 'Resetting…' : 'Deleting…'}</> : <>{confirming === 'reset' ? <RefreshCcw size={14} /> : <Trash2 size={14} />} {confirming === 'reset' ? 'Reset workspace' : 'Delete brand'}</>}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
