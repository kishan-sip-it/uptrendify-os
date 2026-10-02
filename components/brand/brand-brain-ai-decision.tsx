'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Edit3, LoaderCircle, Sparkles, ThumbsDown, X } from 'lucide-react';

type Suggestion = {
  id: string;
  label: string;
  proposed_value: string | string[] | Array<{ name: string; description?: string | null }> | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EDITED' | 'NOT_FOUND';
  evidence: Array<{ claim?: string; excerpt?: string | null; url?: string }>;
  evidence_strength: 'strong' | 'partial' | 'weak' | null;
  ai_decision: 'APPROVE' | 'REJECT' | 'REVIEW' | null;
  ai_confidence: number | null;
  ai_reason: string | null;
};

type Decision = {
  suggestionId: string;
  decision: 'APPROVE' | 'REJECT' | 'REVIEW';
  confidence: number;
  reason: string;
};

type BrainPayload = {
  suggestions: Suggestion[];
  suggestionCounts: { pending: number; total: number };
};

function valueText(value: Suggestion['proposed_value']) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((entry) => typeof entry === 'string' ? entry : `${entry.name}${entry.description ? ` — ${entry.description}` : ''}`).join('\n');
}

const tone = (decision: Decision['decision']) => decision === 'APPROVE' ? 'tone-good' : decision === 'REJECT' ? 'tone-danger' : 'tone-warn';
const label = (decision: Decision['decision']) => decision === 'APPROVE' ? 'AI recommends approve' : decision === 'REJECT' ? 'AI recommends reject' : 'Human review';

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
    const body = await response.json() as BrainPayload;
    setBrain(body);
    setDecisions((body.suggestions ?? [])
      .filter((item) => item.status === 'PENDING' && item.ai_decision)
      .map((item) => ({
        suggestionId: item.id,
        decision: item.ai_decision!,
        confidence: item.ai_confidence ?? 0,
        reason: item.ai_reason ?? 'AI recommendation is ready for human review.',
      })));
  }, [brandId]);

  useEffect(() => {
    if (!canManage) return;
    void load().catch(() => undefined);
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ brandId?: string }>).detail;
      if (!detail?.brandId || detail.brandId === brandId) void load().catch(() => undefined);
    };
    window.addEventListener('uptrendify:brand-brain-updated', onUpdated);
    return () => window.removeEventListener('uptrendify:brand-brain-updated', onUpdated);
  }, [brandId, canManage, load]);

  const pending = useMemo(() => new Map((brain?.suggestions ?? []).filter((item) => item.status === 'PENDING').map((item) => [item.id, item])), [brain]);
  const grouped = useMemo(() => ({
    APPROVE: decisions.filter((item) => item.decision === 'APPROVE'),
    REJECT: decisions.filter((item) => item.decision === 'REJECT'),
    REVIEW: decisions.filter((item) => item.decision === 'REVIEW'),
  }), [decisions]);
  const pendingCount = brain?.suggestionCounts.pending ?? 0;
  const recommendedCount = decisions.filter((item) => pending.has(item.suggestionId)).length;

  const runAiDecision = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/brain/ai-decision`, { method: 'POST' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'AI decision engine could not complete.');
      setDecisions(body.decisions ?? []);
      setActiveGroup((body.decisions ?? []).some((item: Decision) => item.decision === 'APPROVE') ? 'APPROVE' : 'REVIEW');
      setOpen(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI decision engine could not complete.');
    } finally { setBusy(false); }
  };

  const editSuggestion = async (id: string, value: string) => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/brain/suggestions/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'edit', value }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not edit this suggestion.');
      setEditingId(null);
      await load();
      window.dispatchEvent(new CustomEvent('uptrendify:brand-brain-updated', { detail: { brandId } }));
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not edit this suggestion.'); }
    finally { setBusy(false); }
  };

  const approveNow = async (id: string) => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/brain/suggestions/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not approve this suggestion.');
      await load();
      window.dispatchEvent(new CustomEvent('uptrendify:brand-brain-updated', { detail: { brandId } }));
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not approve this suggestion.'); }
    finally { setBusy(false); }
  };

  const changeDecision = async (id: string, decision: Decision['decision']) => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/brain/suggestions/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'ai_decision', decision }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not update the AI recommendation.');
      setDecisions((current) => current.map((item) => item.suggestionId === id ? { ...item, decision } : item));
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update the AI recommendation.'); }
    finally { setBusy(false); }
  };

  const confirmBatch = async () => {
    const approveIds = grouped.APPROVE.map((item) => item.suggestionId).filter((id) => pending.has(id));
    const rejectIds = grouped.REJECT.map((item) => item.suggestionId).filter((id) => pending.has(id));
    if (approveIds.length === 0 && rejectIds.length === 0) { setOpen(false); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/brain/ai-decision/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approveIds, rejectIds }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not confirm the AI batch.');
      setOpen(false);
      await load();
      window.dispatchEvent(new CustomEvent('uptrendify:brand-brain-updated', { detail: { brandId } }));
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not confirm the AI batch.'); }
    finally { setBusy(false); }
  };

  if (!canManage) return null;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 12px' }}>
        <button type="button" className="badge auth-submit" onClick={() => decisions.length ? setOpen(true) : void runAiDecision()} disabled={busy || pendingCount === 0} style={{ border: 0, padding: '9px 14px', cursor: busy || pendingCount === 0 ? 'not-allowed' : 'pointer', opacity: busy || pendingCount === 0 ? .55 : 1 }}>
          {busy ? <><LoaderCircle size={14} className="spin" /> Working…</> : <><Sparkles size={14} /> {recommendedCount ? `Review AI recommendations · ${recommendedCount}` : `Let AI decide${pendingCount ? ` · ${pendingCount}` : ''}`}</>}
        </button>
        {recommendedCount > 0 ? <span className="subtitle" style={{ fontSize: 12 }}>AI recommendations are saved until you act on them. Nothing is authoritative until you confirm.</span> : null}
        {error ? <span role="alert" style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</span> : null}
      </div>

      {open ? (
        <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }} onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-label="AI Brand Brain recommendation review" style={{ width: 'min(1080px,100%)', maxHeight: 'min(90vh,940px)', overflow: 'auto', border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--line))', borderRadius: 20, background: 'var(--surface)', boxShadow: '0 30px 90px rgba(0,0,0,.44)', padding: 20 }}>
            <div className="section-title" style={{ gap: 12, alignItems: 'flex-start' }}>
              <div><div className="eyebrow"><Sparkles size={13} /> Optional AI review</div><h2 style={{ margin: '5px 0' }}>Review AI recommendations</h2><p className="subtitle" style={{ margin: 0 }}>AI recommends a path from the existing evidence. It does not approve or reject anything by itself.</p></div>
              <button type="button" className="badge" aria-label="Close AI review" onClick={() => setOpen(false)} disabled={busy} style={{ border: 0, cursor: busy ? 'not-allowed' : 'pointer' }}><X size={15} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10, margin: '18px 0' }}>
              {(['APPROVE', 'REJECT', 'REVIEW'] as const).map((group) => (
                <button key={group} type="button" onClick={() => setActiveGroup(group)} style={{ textAlign: 'left', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', background: activeGroup === group ? 'color-mix(in srgb,var(--accent) 10%,var(--surface))' : 'var(--surface)', color: 'var(--text)', border: `1px solid ${activeGroup === group ? 'color-mix(in srgb,var(--accent) 48%,var(--line))' : 'var(--line)'}` }}>
                  <div className="eyebrow">{group === 'APPROVE' ? 'AI recommends approval' : group === 'REJECT' ? 'AI recommends rejection' : 'Human review'}</div>
                  <strong style={{ display: 'block', fontSize: 28, marginTop: 3 }}>{grouped[group].filter((item) => pending.has(item.suggestionId)).length}</strong>
                  <span className="subtitle" style={{ fontSize: 12 }}>{group === 'REVIEW' ? 'Stays pending' : 'Awaiting your confirmation'}</span>
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {grouped[activeGroup].map((decision) => {
                const suggestion = pending.get(decision.suggestionId);
                if (!suggestion) return null;
                const isEditing = editingId === suggestion.id;
                return (
                  <article key={suggestion.id} style={{ padding: '15px 0', borderTop: '1px solid color-mix(in srgb,var(--line) 82%,transparent)' }}>
                    <div className="suggestion-card-head"><div className="suggestion-title-row"><h4 className="suggestion-label">{suggestion.label}</h4><span className={`badge ${tone(decision.decision)}`}>{label(decision.decision)}</span><span className="badge tone-muted">{Math.round(decision.confidence * 100)}% confidence</span></div></div>
                    <pre className="suggestion-value" style={{ marginTop: 9 }}>{valueText(suggestion.proposed_value)}</pre>
                    <div className="suggestion-evidence" style={{ marginTop: 9 }}><span className="badge tone-info">{suggestion.evidence_strength ? `${suggestion.evidence_strength} evidence` : 'Evidence unclear'}</span><span className="suggestion-evidence-claim">{decision.reason}</span></div>
                    {suggestion.evidence.slice(0, 3).map((item, index) => <div key={`${suggestion.id}-e-${index}`} className="suggestion-evidence" style={{ marginTop: 6 }}><span className="suggestion-evidence-claim">{item.claim || item.excerpt || 'Supporting evidence available'}</span>{item.url ? <a className="suggestion-evidence-source" href={item.url} target="_blank" rel="noreferrer">View source</a> : null}</div>)}
                    {isEditing ? (
                      <div className="suggestion-editor" style={{ marginTop: 12 }}><textarea className="suggestion-edit-input" value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} /><div className="suggestion-actions"><button type="button" className="badge" disabled={busy || !draft.trim()} onClick={() => void editSuggestion(suggestion.id, draft)}><Check size={13} /> Save edit</button><button type="button" className="badge" disabled={busy} onClick={() => setEditingId(null)}><X size={13} /> Cancel</button></div></div>
                    ) : (
                      <div className="suggestion-actions" style={{ marginTop: 12 }}>
                        <button type="button" className="badge" disabled={busy} onClick={() => { setEditingId(suggestion.id); setDraft(valueText(suggestion.proposed_value)); }}><Edit3 size={13} /> Edit</button>
                        <button type="button" className="badge" disabled={busy} onClick={() => void changeDecision(suggestion.id, 'REVIEW')}><X size={13} /> Move to Human Review</button>
                        {decision.decision !== 'REVIEW' ? <button type="button" className="badge tone-good" disabled={busy} onClick={() => void approveNow(suggestion.id)}><CheckCircle2 size={13} /> Approve now</button> : null}
                        {decision.decision !== 'REJECT' ? <button type="button" className="badge tone-danger" disabled={busy} onClick={() => void changeDecision(suggestion.id, 'REJECT')}><ThumbsDown size={13} /> Recommend reject</button> : null}
                      </div>
                    )}
                  </article>
                );
              })}
              {grouped[activeGroup].filter((item) => pending.has(item.suggestionId)).length === 0 ? <p className="subtitle" style={{ padding: '18px 0' }}>Nothing in this group.</p> : null}
            </div>

            <div className="section-title" style={{ marginTop: 18, gap: 10, flexWrap: 'wrap', paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <button type="button" className="badge" onClick={() => setOpen(false)} disabled={busy}>Select yourself</button>
              <button type="button" className="badge" onClick={() => void runAiDecision()} disabled={busy || pendingCount === 0} style={{ marginLeft: 'auto' }}><Sparkles size={13} /> Re-run AI on pending</button>
              <span className="subtitle" style={{ fontSize: 12 }}>Human Review items stay pending and are excluded from batch confirmation.</span>
              <button type="button" className="badge auth-submit" onClick={() => void confirmBatch()} disabled={busy} style={{ border: 0, padding: '9px 14px' }}>{busy ? <><LoaderCircle size={14} className="spin" /> Applying…</> : <><Check size={14} /> Human confirms AI batch</>}</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
