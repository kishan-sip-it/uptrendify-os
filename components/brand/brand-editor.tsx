'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Edit3, LoaderCircle, Trash2 } from 'lucide-react';

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

function text(v: unknown) {
  return typeof v === 'string' ? v : '';
}

function lines(v: unknown) {
  return Array.isArray(v) ? v.map(String).join('\n') : text(v);
}

export function BrandEditor({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [saved, setSaved] = useState(false);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [form, setForm] = useState({
    name: '',
    websiteUrl: '',
    description: '',
    industry: '',
    audience: '',
    offer: '',
    valueProposition: '',
    differentiators: '',
    coreMessage: '',
    tone: '',
    primaryColor: '#67c79f',
    wordsToUse: '',
    wordsToAvoid: '',
    restrictions: '',
  });

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/brands/' + brandId, { cache: 'no-store' });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error || 'Could not load brand');
      const x = b.brand as Brand;
      setBrand(x);
      setForm({
        name: x.name,
        websiteUrl: x.website_url || '',
        description: x.description || '',
        industry: x.industry || '',
        audience: x.target_audience || '',
        offer: text(x.offer_details?.coreOffer),
        valueProposition: text(x.positioning?.valueProposition),
        differentiators: lines(x.positioning?.differentiators),
        coreMessage: text(x.messaging?.coreMessage),
        tone: text(x.messaging?.tone),
        primaryColor: x.primary_color || '#67c79f',
        wordsToUse: lines(x.messaging?.wordsToUse),
        wordsToAvoid: lines(x.messaging?.wordsToAvoid),
        restrictions: text(x.messaging?.restrictions),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load brand');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !brand) void load();
  }, [open, brand]);

  async function save() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const r = await fetch('/api/brands/' + brandId, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          websiteUrl: form.websiteUrl || null,
          description: form.description || null,
          industry: form.industry || null,
          targetAudience: form.audience || null,
          primaryColor: form.primaryColor,
          offerDetails: { coreOffer: form.offer },
          positioning: {
            valueProposition: form.valueProposition,
            differentiators: form.differentiators.split('\n').map(v => v.trim()).filter(Boolean),
          },
          messaging: {
            coreMessage: form.coreMessage,
            tone: form.tone,
            wordsToUse: form.wordsToUse.split('\n').map(v => v.trim()).filter(Boolean),
            wordsToAvoid: form.wordsToAvoid.split('\n').map(v => v.trim()).filter(Boolean),
            restrictions: form.restrictions,
          },
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error || 'Could not update brand');
      setBrand(b.brand);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update brand');
    } finally {
      setSaving(false);
    }
  }

  async function deleteBrand() {
    if (!brand || deleteConfirm.trim() !== brand.name.trim()) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const r = await fetch('/api/brands/' + brandId, { method: 'DELETE' });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error || 'Could not delete brand');
      router.replace('/brands');
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete brand');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button type="button" className="badge" onClick={() => setOpen(true)}>
        <Edit3 size={14} /> Edit brand
      </button>

      {open ? (
        <div
          className="editor-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget && !saving && !deleting) setOpen(false);
          }}
        >
          <section className="card editor-modal" role="dialog" aria-modal="true" aria-labelledby="brand-editor-title">
            <div className="section-title">
              <div>
                <div className="eyebrow">Brand settings</div>
                <h2 id="brand-editor-title">Edit {brand?.name || 'brand'}</h2>
              </div>
              <button type="button" className="badge" onClick={() => setOpen(false)} disabled={saving || deleting}>
                Close
              </button>
            </div>

            {loading ? (
              <p className="subtitle"><LoaderCircle size={14} className="spin" /> Loading…</p>
            ) : (
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
                  <button type="button" className="badge" onClick={() => setOpen(false)} disabled={saving || deleting}>Cancel</button>
                  <button type="button" className="badge auth-submit" onClick={save} disabled={saving || deleting}>
                    {saving ? <><LoaderCircle size={14} className="spin" /> Saving…</> : <><Check size={14} /> Save changes</>}
                  </button>
                </div>

                <div className="card" style={{ marginTop: 18, borderColor: 'rgba(239,68,68,.32)' }}>
                  <div className="section-title">
                    <div>
                      <div className="eyebrow">Danger zone</div>
                      <h3 style={{ margin: '4px 0' }}>Delete this brand</h3>
                    </div>
                    <Trash2 size={16} />
                  </div>
                  <p className="subtitle" style={{ marginTop: 0 }}>
                    Permanently removes this brand and its research, sources, Brand Brain, strategy, content and campaign data.
                  </p>

                  {!deleteOpen ? (
                    <button
                      type="button"
                      className="badge tone-danger"
                      onClick={() => { setDeleteOpen(true); setDeleteConfirm(''); setDeleteError(''); }}
                      disabled={saving || deleting}
                    >
                      <Trash2 size={14} /> Delete brand permanently
                    </button>
                  ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div className="field-note" role="alert">
                        <AlertTriangle size={14} /> This cannot be undone. Type <strong>{brand?.name}</strong> to confirm.
                      </div>
                      <input
                        aria-label="Confirm brand deletion"
                        value={deleteConfirm}
                        onChange={e => setDeleteConfirm(e.target.value)}
                        placeholder={brand?.name || 'Brand name'}
                        autoComplete="off"
                      />
                      {deleteError ? <div className="field-note" role="alert">{deleteError}</div> : null}
                      <div className="onboarding-actions">
                        <button type="button" className="badge" onClick={() => { setDeleteOpen(false); setDeleteConfirm(''); setDeleteError(''); }} disabled={deleting}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="badge tone-danger"
                          onClick={deleteBrand}
                          disabled={deleting || deleteConfirm.trim() !== brand?.name.trim()}
                        >
                          {deleting ? <><LoaderCircle size={14} className="spin" /> Deleting…</> : <><Trash2 size={14} /> Confirm permanent deletion</>}
                        </button>
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
