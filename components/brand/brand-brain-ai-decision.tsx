'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Edit3, LoaderCircle, Sparkles, ThumbsDown, X } from 'lucide-react';

type Suggestion = {
  id: string;
  field: string;
  label: string;
  section: string;
  kind: 'text' | 'list' | 'persona';
  proposed_value: string | string[] | Array<{ name: string; description?: string | null }> | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EDITED' | 'NOT_FOUND';
  evidence: Array<{ claim?: string; strength?: string; excerpt?: string | null; url?: string }>;
  evidence_strength: 'strong' | 'partial' | 'weak' | null;
  sources_examined: number;
  confidence: number | null;
};

type Decision = {
  suggestionId: string;
  decision: 'APPROVE' | 'REJECT' | 'REVIEW';
  confidence: number;
  reason: string;
};

type BrainPayload = { suggestions: Suggestion[]; suggestionCounts: { pending: number; total: number } };

function valueText(value: Suggestion['proposed_value']) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((entry) => typeof entry === 'string' ? entry : `${entry.name}${entry.description ? ` — ${entry.description}` : ''}`).join('\n');
}

export function BrandBrainAiDecision({ brandId, canManage }: { brandId: string; canManage: boolean }) {
  const [brain, setBrain] = useState<BrainPayload | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [open, setOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<Decision['decision']>('APPROVE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    const response = await fetch(`/api/brands/${brandId}/brain`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load Brand Brain suggestions.');
    const body = await response.json();
    setBrain(body);
  }, [brandId]);

  useEffect(() => {
    if (!canManage) return;
    load().catch(() => undefined);
  }, [canManage, load]);

  const pendingCount = brain?.suggestionCounts.pending ?? 0;
  const pending = useMemo(() => new Map((brain?.suggestions ?? []).filter((item) => item.status === 'PENDING').map((item) => [item.id, item])), [brain]);
  const grouped = useMemo(() => ({
    APPROVE: decisions.filter((item) => item.decision === 'APPROVE'),
    REJECT: decisions.filter((item) => item.decision === 'REJECT'),
    REVIEW: decisions.filter((item) => item.decision === 'REVIEW'),
  }), [decisions]);

  const runAiDecision = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/brain/ai-decision`, { method: 'POST' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'AI decision engine could not complete.');
      setDecisions(body.decisions ?? []);
      setActiveGroup('APPROVE');
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI decision engine could not complete.');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    await load();
    window.dispatchEvent(new CustomEvent('uptrendify:brand-brain-updated', { detail: { brandId } }));
  };

  const act = async (id: string, action: 'approve' | 'reject' | 'edit', value?: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/brain/suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...(value === undefined ? {} : { value }) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not update this suggestion.');
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this suggestion.');
    } finally {
      setBusy(false);
    }
  };

  const confirmBatch = async () => {
    const approveIds = grouped.APPROVE.map((item) => item.suggestionId).filter((id) => pending.has(id));
    const rejectIds = grouped.REJECT.map((item) => item.suggestionId).filter((id) => pending.has(id));
    if (approveIds.length === 0 && rejectIds.length === 0) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/brain/suggestions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'ai_confirm', approveIds, rejectIds }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not confirm the AI batch.');
      await refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm the AI batch.');
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) return null;

  return (
    <>
      <div className="card" style={{ marginBottom: 16, borderColor: 'color-mix(in srgb, var(--accent) 28%, var(--line))', background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 9%, var(--surface)), var(--surface))' }}>
        <div className="section-title" style={{ gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 260, flex: 1 }}>
            <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Sparkles size={14} /> Optional AI review</div>
            <h3 style={{ margin: '5px 0 6px' }}>Let AI decide the review priority</h3>
            <p className="subtitle" style={{ margin: 0 }}>
              AI recommends approvals, rejections, or human review from the existing evidence. Nothing becomes authoritative until you confirm it.
            </p>
          </div>
          <button type="button" className="badge auth-submit" onClick={runAiDecision} disabled={busy || pendingCount === 0} style={{ border: 0, padding: '10px 14px', cursor: busy || pendingCount === 0 ? 'not-allowed' : 'pointer', opacity: busy || pendingCount === 0 ? 0.6 : 1 }}>
            {busy ? <><LoaderCircle size={14} className="spin" /> Thinking…</> : <><Sparkles size={14} /> Let AI decide{pendingCount ? ` · ${pendingCount}` : ''}</>}
          </button>
        </div>
        {error ? <p className="subtitle" role="alert" style={{ color: 'var(--danger)', margin: '12px 0 0' }}>{error}</p> : null}
      </div>

      {open ? (
        <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }} onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-label="AI Brand Brain review" style={{ width: 'min(1040px, 100%)', maxHeight: 'min(88vh, 920px)', overflow: 'auto', border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--line))', borderRadius: 20, background: 'var(--surface)', boxShadow: '0 30px 90px rgba(0,0,0,.38)', padding: 20 }}>
            <div className="section-title" style={{ gap: 12, alignItems: 'flex-start' }}>
              <div>
                <div className="eyebrow"><Sparkles size={13} /> AI recommendation review</div>
                <h2 style={{ margin: '5px 0' }}>Review before Brand Brain changes</h2>
                <p className="subtitle" style={{ margin: 0 }}>These are recommendations, not authoritative facts. Edit or dismiss individual findings before confirming the batch.</p>
              </div>
              <button type="button" className="badge" aria-label="Close AI review" onClick={() => setOpen(false)} style={{ border: 0, cursor: 'pointer' }}><X size={15} /></button>
            </div>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, margin: '18px 0' }}>
              {(['APPROVE', 'REJECT', 'REVIEW'] as const).map((group) => (
                <button key={group} type="button" onClick={() => setActiveGroup(group)} style={{ textAlign: 'left', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', background: activeGroup === group ? 'color-mix(in srgb, var(--accent) 10%, var(--surface))' : 'var(--surface)', color: 'var(--text)', border: `1px solid ${activeGroup === group ? 'color-mix(in srgb, var(--accent) 48%, var(--line))' : 'var(--line)'}` }}>
                  <div className="eyebrow">{group === 'APPROVE' ? 'AI recommends approval' : group === 'REJECT' ? 'AI recommends rejection' : 'Human review'}</div>
                  <strong style={{ fontSize: 26 }}>{grouped[group].length}</strong>
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {grouped[activeGroup].map((decision) => {
                const suggestion = pending.get(decision.suggestionId);
                if (!suggestion) return null;
                const isEditing = editingId === suggestion.id;
                return (
                  <article key={suggestion.id} className="suggestion-card" style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
                    <div className="suggestion-card-head">
                      <div className="suggestion-title-row">
                        <h4 className="suggestion-label">{suggestion.label}</h4>
                        <span className={`badge ${decision.decision === 'APPROVE' ? 'tone-good' : decision.decision === 'REJECT' ? 'tone-danger' : 'tone-warn'}`}>
                          {decision.decision === 'APPROVE' ? 'AI recommends approve' : decision.decision === 'REJECT' ? 'AI recommends reject' : 'Human review'}
                        </span>
                        <span className="badge tone-muted">{Math.round(decision.confidence * 100)}% recommendation confidence</span>
                      </div>
                    </div>
                    <pre className="suggestion-value">{valueText(suggestion.proposed_value)}</pre>
                    <div className="suggestion-evidence" style={{ marginTop: 10 }}>
                      <span className="badge tone-info">{suggestion.evidence_strength ? `${suggestion.evidence_strength} evidence` : 'Evidence unclear'}</span>
                      <span className="suggestion-evidence-claim">{decision.reason}</span>
                    </div>
                    {suggestion.evidence.slice(0, 3).map((item, index) => (
                      <div key={`${suggestion.id}-e-${index}`} className="suggestion-evidence" style={{ marginTop: 6 }}>
                        <span className="suggestion-evidence-claim">{item.claim || item.excerpt || 'Supporting evidence available'}</span>
                        {item.url ? <a className="suggestion-evidence-source" href={item.url} target="_blank" rel="noreferrer">View source</a> : null}
                      </div>
                    ))}
                    {isEditing ? (
                      <div className="suggestion-editor" style={{ marginTop: 12 }}>
                        <textarea className="suggestion-edit-input" value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} />
                        <div className="suggestion-actions">
                          <button type="button" className="badge" disabled={busy || draft.trim() === ''} onClick={() => void act(suggestion.id, 'edit', draft)}><Check size={13} /> Save edit</button>
                          <button type="button" className="badge" disabled={busy} onClick={() => setEditingId(null)}><X size={13} /> Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="suggestion-actions" style={{ marginTop: 12 }}>
                        <button type="button" className="badge" disabled={busy} onClick={() => { setEditingId(suggestion.id); setDraft(valueText(suggestion.proposed_value)); }}><Edit3 size={13} /> Edit</button>
                        <button type="button" className="badge tone-danger" disabled={busy} onClick={() => void act(suggestion.id, 'reject')}><ThumbsDown size={13} /> Remove from AI batch</button>
                        {decision.decision === 'APPROVE' ? <button type="button" className="badge tone-good" disabled={busy} onClick={() => void act(suggestion.id, 'approve')}><CheckCircle2 size={13} /> Approve now</button> : null}
                      </div>
                    )}
                  </article>
                );
              })}
              {grouped[activeGroup].length === 0 ? <p className="subtitle">Nothing in this group.</p> : null}
            </div>

            <div className="section-title" style={{ marginTop: 18, gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="badge" onClick={() => setOpen(false)} disabled={busy} style={{ border: 0, cursor: 'pointer' }}>Select yourself</button>
              <div style={{ flex: 1 }} />
              <span className="subtitle" style={{ fontSize: 12 }}>Human Review items stay pending.</span>
              <button type="button" className="badge auth-submit" onClick={() => void confirmBatch()} disabled={busy} style={{ border: 0, cursor: busy ? 'not-allowed' : 'pointer', padding: '9px 14px' }}>
                {busy ? <><LoaderCircle size={14} className="spin" /> Applying…</> : <><Check size={14} /> Confirm AI batch</>}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
