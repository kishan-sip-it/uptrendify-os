'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Edit3, LoaderCircle, RotateCcw, Trash2 } from 'lucide-react';

type Brand = {
  id: string;
  name: string;
  website_url: string | null;
  description: string | null;
  industry: string | null;
  market_country: string | null;
  target_audience: string | null;
  primary_color: string | null;
  secondary_colors: string[];
  brand_rules: Record<string, unknown>;
  audience_details: Record<string, unknown>;
  offer_details: Record<string, unknown>;
  positioning: Record<string, unknown>;
  messaging: Record<string, unknown>;
};

function text(v: unknown) { return typeof v === 'string' ? v : ''; }
function lines(v: unknown) { return Array.isArray(v) ? v.map(String).join('\n') : text(v); }

export function BrandEditor({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [resetError, setResetError] = useState('');
  const [saved, setSaved] = useState(false);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [form, setForm] = useState({ name: '', websiteUrl: '', description: '', industry: '', audience: '', offer: '', valueProposition: '', differentiators: '', coreMessage: '', tone: '', primaryColor: '#67c79f', wordsToUse: '', wordsToAvoid: '', restrictions: '' });

  async function load() {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/brands/' + brandId, { cache: 'no-store' });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error || 'Could not load brand');
      const x = b.brand as Brand;
      setBrand(x);
      setForm({
        name: x.name, websiteUrl: x.website_url || '', description: x.description || '', industry: x.industry || '', audience: x.target_audience || '',
        offer: text(x.offer_details?.coreOffer), valueProposition: text(x.positioning?.valueProposition), differentiators: lines(x.positioning?.differentiators),
        coreMessage: text(x.messaging?.coreMessage), tone: text(x.messaging?.tone), primaryColor: x.primary_color || '#67c79f', wordsToUse: lines(x.messaging?.wordsToUse), wordsToAvoid: lines(x.messaging?.wordsToAvoid), restrictions: text(x.messaging?.restrictions),
      });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load brand'); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (open && !brand) void load(); }, [open, brand]);

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      const r = await fetch('/api/brands/' + brandId, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name, websiteUrl: form.websiteUrl || null, description: form.description || null, industry: form.industry || null, targetAudience: form.audience || null,
          primaryColor: form.primaryColor, offerDetails: { coreOffer: form.offer },
          positioning: { valueProposition: form.valueProposition, differentiators: form.differentiators.split('\n').map(v => v.trim()).filter(Boolean) },
          messaging: { coreMessage: form.coreMessage, tone: form.tone, wordsToUse: form.wordsToUse.split('\n').map(v => v.trim()).filter(Boolean), wordsToAvoid: form.wordsToAvoid.split('\n').map(v => v.trim()).filter(Boolean), restrictions: form.restrictions },
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error || 'Could not update brand');
      setBrand(b.brand); setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update brand'); }
    finally { setSaving(false); }
  }

  async function deleteBrand() {
    if (!brand) return;
    setDeleting(true); setDeleteError('');
    try {
      const r = await fetch('/api/brands/' + brandId, { method: 'DELETE' });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error || 'Could not delete brand');
      router.replace('/brands'); router.refresh();
    } catch (e) { setDeleteError(e instanceof Error ? e.message : 'Could not delete brand'); }
    finally { setDeleting(false); }
  }

  async function resetBrand() {
    if (!brand) return;
    setResetting(true); setResetError('');
    try {
      const r = await fetch('/api/brands/' + brandId + '/reset', { method: 'POST' });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error || 'Could not reset brand workspace');
      setResetOpen(false); setDeleteOpen(false); setSaved(false); setBrand(null);
      await load();
      router.refresh();
    } catch (e) { setResetError(e instanceof Error ? e.message : 'Could not reset brand workspace'); }
    finally { setResetting(false); }
  }

  const busy = saving || deleting || resetting;

  return (
    <>
      <button type="button" className="badge" onClick={() => setOpen(true)}><Edit3 size={14} /> Edit brand</button>
      {open ? (
        <div className="editor-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
          <section className="card editor-modal" role="dialog" aria-modal="true" aria-labelledby="brand-editor-title">
            <div className="section-title">
              <div><div className="eyebrow">Brand settings</div><h2 id="brand-editor-title">Edit {brand?.name || 'brand'}</h2></div>
              <button type="button" className="badge" onClick={() => setOpen(false)} disabled={busy}>Close</button>
            </div>
            {loading ? <p className="subtitle"><LoaderCircle size={14} className="spin" /> Loading…</p> : (
              <>
                <div className="onboarding-grid">
                  <label>Brand name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
                  <label>Website<input value={form.websiteUrl} onChange={e => setForm({ ...form, websiteUrl: e.target.value })} /></label>
                  <label>Industry<input value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} /></label>
                  <label>Primary audience<textarea rows={3} value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })} /></label>
                  <label className="span-2">Description<textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
                  <label>Core offer<textarea rows={3} value={form.offer} onChange={e => setForm({ ...form, offer: e.target.value })} /></label>
                  <label>Value proposition<textarea rows={3} value={form.valueProposition} onChange={e => setForm({ ...form, valueProposition: e.target.value })} /></label>
                  <label>Differentiators<textarea rows={3} value={form.differentiators} onChange={e => setForm({ ...form, differentiators: e.target.value })} /></label>
                  <label>Core message<textarea rows={3} value={form.coreMessage} onChange={e => setForm({ ...form, coreMessage: e.target.value })} /></label>
                  <label>Tone<input value={form.tone} onChange={e => setForm({ ...form, tone: e.target.value })} /></label>
                  <label>Primary color<input type="color" value={form.primaryColor} onChange={e => setForm({ ...form, primaryColor: e.target.value })} /></label>
                  <label>Words to use<textarea rows={3} value={form.wordsToUse} onChange={e => setForm({ ...form, wordsToUse: e.target.value })} /></label>
                  <label>Words to avoid<textarea rows={3} value={form.wordsToAvoid} onChange={e => setForm({ ...form, wordsToAvoid: e.target.value })} /></label>
                  <label className="span-2">Restrictions / claims to avoid<textarea rows={3} value={form.restrictions} onChange={e => setForm({ ...form, restrictions: e.target.value })} /></label>
                </div>
                {error ? <div className="field-note" role="alert">{error}</div> : null}
                {saved ? <div className="field-note"><Check size={14} /> Brand saved.</div> : null}
                <div className="onboarding-actions">
                  <button type="button" className="badge" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
                  <button type="button" className="badge auth-submit" onClick={save} disabled={busy}>{saving ? <><LoaderCircle size={14} className="spin" /> Saving…</> : <><Check size={14} /> Save changes</>}</button>
                </div>

                <div className="card" style={{ marginTop: 18, borderColor: 'rgba(245,158,11,.34)' }}>
                  <div className="section-title"><div><div className="eyebrow">Workspace controls</div><h3 style={{ margin: '4px 0' }}>Reset this brand</h3></div><RotateCcw size={16} /></div>
                  <p className="subtitle" style={{ marginTop: 0 }}>Clears this brand’s research, Brand Brain, strategies, campaigns, content, publishing records and generated AI workflow data. The brand itself, saved identity and integration configuration remain. Other brands are untouched.</p>
                  {!resetOpen ? (
                    <button type="button" className="badge" onClick={() => { setResetOpen(true); setResetError(''); }} disabled={busy}><RotateCcw size={14} /> Reset brand workspace</button>
                  ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div className="field-note" role="alert"><AlertTriangle size={14} /> <span><strong>Reset {brand?.name}?</strong> Research, Brand Brain results, strategies, campaigns, content, publishing records and generated workflow data for this brand will be permanently removed. The brand identity and integration configuration remain. Other brands are not affected. This cannot be undone.</span></div>
                      {resetError ? <div className="field-note" role="alert">{resetError}</div> : null}
                      <div className="onboarding-actions">
                        <button type="button" className="badge" onClick={() => { setResetOpen(false); setResetError(''); }} disabled={resetting}>Cancel</button>
                        <button type="button" className="badge tone-danger" onClick={resetBrand} disabled={resetting}>{resetting ? <><LoaderCircle size={14} className="spin" /> Resetting…</> : <><RotateCcw size={14} /> Confirm reset workspace</>}</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="card" style={{ marginTop: 18, borderColor: 'rgba(239,68,68,.32)' }}>
                  <div className="section-title"><div><div className="eyebrow">Danger zone</div><h3 style={{ margin: '4px 0' }}>Delete this brand</h3></div><Trash2 size={16} /></div>
                  <p className="subtitle" style={{ marginTop: 0 }}>Permanently removes this brand and all data belonging to it. Other brands are not affected.</p>
                  {!deleteOpen ? (
                    <button type="button" className="badge tone-danger" onClick={() => { setDeleteOpen(true); setDeleteError(''); }} disabled={busy}><Trash2 size={14} /> Delete brand permanently</button>
                  ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div className="field-note" role="alert"><AlertTriangle size={14} /> <span><strong>{brand?.name}</strong> and all data belonging to this brand will be permanently deleted. Other brands remain untouched. This cannot be undone.</span></div>
                      {deleteError ? <div className="field-note" role="alert">{deleteError}</div> : null}
                      <div className="onboarding-actions">
                        <button type="button" className="badge" onClick={() => { setDeleteOpen(false); setDeleteError(''); }} disabled={deleting}>Cancel</button>
                        <button type="button" className="badge tone-danger" onClick={deleteBrand} disabled={deleting}>{deleting ? <><LoaderCircle size={14} className="spin" /> Deleting…</> : <><Trash2 size={14} /> Confirm permanent deletion</>}</button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
