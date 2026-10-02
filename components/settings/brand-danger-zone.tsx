'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { AlertTriangle, RefreshCcw, Trash2 } from 'lucide-react';

type Brand = { id: string; name: string; status: 'ACTIVE' | 'ARCHIVED' };
type Action = 'reset' | 'delete';

const danger = '#dc2626';

const dangerActionStyle: CSSProperties = {
  border: `1px solid color-mix(in srgb, ${danger} 72%, var(--line))`,
  background: `linear-gradient(135deg, color-mix(in srgb, ${danger} 15%, var(--surface)), color-mix(in srgb, ${danger} 7%, var(--surface)))`,
  color: danger,
  boxShadow: `inset 4px 0 0 ${danger}, 0 10px 28px color-mix(in srgb, ${danger} 10%, transparent)`,
};

const dangerConfirmButtonStyle: CSSProperties = {
  border: `1px solid ${danger}`,
  background: `linear-gradient(135deg, #ef4444, #b91c1c)`,
  color: '#fff',
  boxShadow: `0 12px 32px color-mix(in srgb, ${danger} 32%, transparent)`,
};

function clearClientWorkflowState() {
  try {
    for (const storage of [window.sessionStorage, window.localStorage]) {
      const keys: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith('uptrendify:contextual-checklist:')) keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
    }
  } catch { /* best effort; server reset remains authoritative */ }
}

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

  useEffect(() => { void loadBrands().catch((err) => setError(err instanceof Error ? err.message : 'Could not load brands')); }, []);

  async function runAction() {
    if (!selectedBrand || !confirming) return;
    const brandName = selectedBrand.name;
    const action = confirming;
    setRunning(action); setError(''); setMessage('');
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
        clearClientWorkflowState();
        await fetch('/api/tours', { method: 'DELETE' }).catch(() => undefined);
        setMessage(`${brandName} workspace was reset. Brand integration remains; research and downstream work are cleared.`);
        window.dispatchEvent(new CustomEvent('uptrendify:workflow-state-reset'));
      }
      await loadBrands();
      if (action === 'reset') window.setTimeout(() => window.location.reload(), 250);
    } catch (err) { setError(err instanceof Error ? err.message : 'The requested action failed'); }
    finally { setRunning(null); }
  }

  return (
    <section className="card settings-tools" style={{ position: 'relative', overflow: 'hidden', borderColor: `color-mix(in srgb, ${danger} 78%, var(--line))`, background: `linear-gradient(180deg, color-mix(in srgb, ${danger} 11%, var(--surface-card)), color-mix(in srgb, ${danger} 4%, var(--surface-card-2)))`, boxShadow: `0 20px 70px color-mix(in srgb, ${danger} 14%, transparent), inset 4px 0 0 ${danger}` }}>
      <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 3, background: `linear-gradient(90deg, #ef4444, ${danger}, transparent)` }} />
      <div className="section-title">
        <div>
          <div className="eyebrow" style={{ color: danger }}>Danger zone</div>
          <h2>Brand recovery & deletion</h2>
        </div>
        <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 11, border: `1px solid color-mix(in srgb, ${danger} 64%, var(--line))`, background: `color-mix(in srgb, ${danger} 18%, var(--surface))`, boxShadow: `0 8px 24px color-mix(in srgb, ${danger} 22%, transparent)` }}><AlertTriangle size={19} color={danger} /></span>
      </div>
      <p className="subtitle">Choose a brand first. Reset and delete affect only that selected brand, never the other brands in this workspace.</p>
      {error ? <div className="field-note" role="alert" style={{ borderColor: `color-mix(in srgb, ${danger} 70%, var(--line))`, color: danger, background: `color-mix(in srgb, ${danger} 12%, var(--surface))` }}>{error}</div> : null}
      {message ? <div className="field-note" style={{ borderColor: `color-mix(in srgb, ${danger} 42%, var(--line))`, background: `color-mix(in srgb, ${danger} 6%, var(--surface))` }}>{message}</div> : null}
      <label>Brand
        <select value={selectedBrandId} onChange={(event) => { setSelectedBrandId(event.target.value); setConfirming(null); }} disabled={!!running}>
          <option value="" disabled>{brands.length ? 'Select a brand' : 'No brands available'}</option>
          {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}{brand.status === 'ARCHIVED' ? ' · Archived' : ''}</option>)}
        </select>
      </label>
      {selectedBrand ? <div className="settings-tool-grid" style={{ marginTop: 14 }}>
        <button type="button" className="settings-tool" onClick={() => setConfirming('reset')} disabled={!!running} style={dangerActionStyle}><RefreshCcw size={16} /><span><strong style={{ color: danger }}>Reset {selectedBrand.name}</strong><small>Remove research, Brand Brain, strategies, campaigns, content and workflow state while keeping the brand integration.</small></span></button>
        <button type="button" className="settings-tool" onClick={() => setConfirming('delete')} disabled={!!running} style={dangerActionStyle}><Trash2 size={16} /><span><strong style={{ color: danger }}>Delete {selectedBrand.name}</strong><small>Permanently remove this brand and its brand-owned data. Other brands remain untouched.</small></span></button>
      </div> : null}
      {confirming && selectedBrand ? <div className="editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !running) setConfirming(null); }}>
        <section className="card editor-modal" role="dialog" aria-modal="true" aria-labelledby="brand-danger-title" style={{ borderColor: `color-mix(in srgb, ${danger} 82%, var(--line))`, background: `linear-gradient(180deg, color-mix(in srgb, ${danger} 12%, var(--surface-card)), var(--surface-card-2))`, boxShadow: `0 30px 100px color-mix(in srgb, ${danger} 18%, transparent)` }}>
          <div className="section-title"><div><div className="eyebrow" style={{ color: danger }}>Danger zone confirmation</div><h2 id="brand-danger-title">{confirming === 'reset' ? `Reset ${selectedBrand.name}?` : `Delete ${selectedBrand.name}?`}</h2></div><span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 11, background: `color-mix(in srgb, ${danger} 18%, var(--surface))`, border: `1px solid color-mix(in srgb, ${danger} 60%, var(--line))` }}><AlertTriangle size={19} color={danger} /></span></div>
          <p className="subtitle">{confirming === 'reset' ? 'This permanently removes this brand’s research, sources, Brand Brain suggestions and facts, strategies, campaigns, content and workflow state. The brand identity, integration configuration and audit history remain. The guide and contextual checklist are also reset. Other brands are not affected.' : 'This permanently removes this brand and its brand-owned research, Brand Brain, strategies, campaigns, content and publishing data. Other brands are not affected. This cannot be undone.'}</p>
          <div className="field-note" style={{ borderColor: `color-mix(in srgb, ${danger} 68%, var(--line))`, color: danger, background: `color-mix(in srgb, ${danger} 11%, var(--surface))` }}><AlertTriangle size={14} /> Selected brand: <strong>{selectedBrand.name}</strong>. The action applies only to this brand.</div>
          <div className="onboarding-actions"><button type="button" className="badge" onClick={() => setConfirming(null)} disabled={!!running}>Cancel</button><button type="button" className="badge tone-danger" onClick={() => void runAction()} disabled={!!running} style={dangerConfirmButtonStyle}>{running ? <><RefreshCcw size={14} className="spin" /> {confirming === 'reset' ? 'Resetting…' : 'Deleting…'}</> : <>{confirming === 'reset' ? <RefreshCcw size={14} /> : <Trash2 size={14} />} {confirming === 'reset' ? 'Reset workspace' : 'Delete brand'}</>}</button></div>
        </section>
      </div> : null}
    </section>
  );
}
