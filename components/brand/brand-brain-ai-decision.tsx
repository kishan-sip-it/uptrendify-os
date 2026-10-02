'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Edit3, ExternalLink, LoaderCircle, Sparkles, ThumbsDown, X } from 'lucide-react';

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

type BrainPayload = {
  suggestions: Suggestion[];
  suggestionCounts: {
    pending: number;
    approved: number;
    rejected?: number;
    edited?: number;
    total: number;
  };
};

type CenterFilter = 'all' | 'review' | 'strong' | string;

function valueText(value: Suggestion['proposed_value']) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((entry) => typeof entry === 'string' ? entry : `${entry.name}${entry.description ? ` — ${entry.description}` : ''}`)
    .join('\n');
}

function sectionLabel(value: string) {
  if (!value) return 'Other';
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}

function decisionTone(decision: Decision['decision']) {
  if (decision === 'APPROVE') return 'tone-good';
  if (decision === 'REJECT') return 'tone-danger';
  return 'tone-warn';
}

function decisionLabel(decision: Decision['decision']) {
  if (decision === 'APPROVE') return 'AI recommends approve';
  if (decision === 'REJECT') return 'AI recommends reject';
  return 'Human review';
}

export function BrandBrainAiDecision({ brandId, canManage }: { brandId: string; canManage: boolean }) {
  const [brain, setBrain] = useState<BrainPayload | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [open, setOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<Decision['decision']>('APPROVE');
  const [centerFilter, setCenterFilter] = useState<CenterFilter>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    const response = await fetch(`/api/brands/${brandId}/brain`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load Brand Brain suggestions.');
    setBrain(await response.json());
  }, [brandId]);

  useEffect(() => {
    if (canManage) load().catch(() => undefined);
  }, [canManage, load]);

  const pending = useMemo(
    () => new Map((brain?.suggestions ?? []).filter((item) => item.status === 'PENDING').map((item) => [item.id, item])),
    [brain],
  );

  const grouped = useMemo(() => ({
    APPROVE: decisions.filter((item) => item.decision === 'APPROVE'),
    REJECT: decisions.filter((item) => item.decision === 'REJECT'),
    REVIEW: decisions.filter((item) => item.decision === 'REVIEW'),
  }), [decisions]);

  const pendingCount = brain?.suggestionCounts.pending ?? 0;
  const approvedCount = (brain?.suggestionCounts.approved ?? 0) + (brain?.suggestionCounts.edited ?? 0) ?? 0;
  const rejectedCount = brain?.suggestionCounts.rejected ?? 0;

  const priorityDecisions = useMemo(() => {
    const candidates = decisions
      .map((decision) => ({ decision, suggestion: pending.get(decision.suggestionId) }))
      .filter((item): item is { decision: Decision; suggestion: Suggestion } => Boolean(item.suggestion))
      .filter(({ decision, suggestion }) => {
        if (centerFilter === 'all') return true;
        if (centerFilter === 'review') return decision.decision === 'REVIEW';
        if (centerFilter === 'strong') return suggestion.evidence_strength === 'strong';
        return suggestion.section === centerFilter;
      });
    return candidates.sort((a, b) => b.decision.confidence - a.decision.confidence).slice(0, 3);
  }, [centerFilter, decisions, pending]);

  const sectionFilters = useMemo(() => {
    const values = new Set<string>();
    for (const suggestion of brain?.suggestions ?? []) {
      if (suggestion.status === 'PENDING' && suggestion.section) values.add(suggestion.section);
    }
    return [...values].sort();
  }, [brain]);

  const runAiDecision = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/brain/ai-decision`, { method: 'POST' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'AI decision engine could not complete.');
      setDecisions(body.decisions ?? []);
      setActiveGroup('APPROVE');
      setCenterFilter('all');
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

  const editSuggestion = async (id: string, value: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/brain/suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'edit', value }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not edit this suggestion.');
      setDecisions((current) => current.map((item) => item.suggestionId === id ? { ...item, decision: 'REVIEW' } : item));
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not edit this suggestion.');
    } finally {
      setBusy(false);
    }
  };

  const approveNow = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/brain/suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not approve this suggestion.');
      setDecisions((current) => current.filter((item) => item.suggestionId !== id));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve this suggestion.');
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
      const response = await fetch(`/api/brands/${brandId}/brain/ai-decision/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approveIds, rejectIds }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not confirm the AI batch.');
      setOpen(false);
      setDecisions([]);
      await refresh();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm the AI batch.');
    } finally {
      setBusy(false);
    }
  };

  const openFilteredRecommendations = (filter: CenterFilter) => {
    setCenterFilter(filter);
    if (decisions.length > 0) {
      if (filter === 'review') setActiveGroup('REVIEW');
      else if (filter === 'all') setActiveGroup('APPROVE');
      setOpen(true);
    }
  };

  const scrollToManualReview = () => {
    document.getElementById('intelligence')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!canManage) return null;

  return (
    <>
      <section className="card" style={{ marginBottom: 16, borderColor: 'color-mix(in srgb, var(--accent) 30%, var(--line))', background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, var(--surface)), var(--surface))', boxShadow: '0 18px 60px color-mix(in srgb, var(--accent) 7%, transparent)' }}>
        <div className="section-title" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 260, flex: 1 }}>
            <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Sparkles size={14} /> Brand Brain · Decision Center</div>
            <h2 style={{ margin: '5px 0 6px' }}>Review the intelligence before it becomes authoritative.</h2>
            <p className="subtitle" style={{ margin: 0 }}>Manual review stays the default. <strong>Let AI decide</strong> is optional and only creates recommendations. No suggestion is approved or rejected just because AI ran.</p>
          </div>
          <button type="button" className="badge auth-submit" onClick={runAiDecision} disabled={busy || pendingCount === 0} style={{ border: 0, padding: '10px 15px', cursor: busy || pendingCount === 0 ? 'not-allowed' : 'pointer', opacity: busy || pendingCount === 0 ? .6 : 1, whiteSpace: 'nowrap' }}>
            {busy ? <><LoaderCircle size={14} className="spin" /> Thinking…</> : <><Sparkles size={14} /> Let AI decide{pendingCount ? ` · ${pendingCount}` : ''}</>}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10, marginTop: 18 }}>
          {[
            { label: 'Approved', value: approvedCount, note: 'authoritative facts' },
            { label: 'Pending', value: pendingCount, note: 'awaiting human decision' },
            { label: 'AI review', value: decisions.length ? grouped.REVIEW.length : 0, note: decisions.length ? 'AI recommends human review' : 'run AI to populate' },
          ].map((metric) => (
            <div key={metric.label} style={{ borderRadius: 14, padding: '13px 15px', background: 'color-mix(in srgb, var(--panel-2) 70%, var(--surface))', border: '1px solid color-mix(in srgb, var(--accent) 14%, var(--line))' }}>
              <div className="eyebrow">{metric.label}</div>
              <strong style={{ display: 'block', fontSize: 28, lineHeight: 1.1, marginTop: 4 }}>{metric.value}</strong>
              <span className="subtitle" style={{ fontSize: 12 }}>{metric.note}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }} aria-label="Brand Brain filters">
          <span className="eyebrow" style={{ marginRight: 3 }}>View</span>
          {[
            { key: 'all' as const, label: 'All' },
            { key: 'review' as const, label: 'Needs Review' },
            { key: 'strong' as const, label: 'Strong Evidence' },
          ].map((filter) => (
            <button key={filter.key} type="button" className="badge" onClick={() => openFilteredRecommendations(filter.key)} style={{ border: `1px solid ${centerFilter === filter.key ? 'color-mix(in srgb,var(--accent) 52%,var(--line))' : 'var(--line)'}`, background: centerFilter === filter.key ? 'color-mix(in srgb,var(--accent) 10%,var(--surface))' : 'var(--surface)', cursor: 'pointer' }}>
              {filter.label}
            </button>
          ))}
          {sectionFilters.map((section) => (
            <button key={section} type="button" className="badge" onClick={() => openFilteredRecommendations(section)} style={{ border: `1px solid ${centerFilter === section ? 'color-mix(in srgb,var(--accent) 52%,var(--line))' : 'var(--line)'}`, background: centerFilter === section ? 'color-mix(in srgb,var(--accent) 10%,var(--surface))' : 'var(--surface)', cursor: 'pointer' }}>
              {sectionLabel(section)}
            </button>
          ))}
        </div>

        <div style={{ height: 1, margin: '16px 0', background: 'linear-gradient(90deg, color-mix(in srgb,var(--accent) 45%,transparent), var(--line), transparent)' }} />

        <div className="section-title" style={{ marginBottom: 10 }}>
          <div>
            <div className="eyebrow">AI Priority</div>
            <h3 style={{ margin: '4px 0 0' }}>{decisions.length ? 'Highest-confidence recommendations' : 'No AI recommendations yet'}</h3>
          </div>
          {decisions.length ? <span className="badge tone-info">{decisions.length} recommendations</span> : null}
        </div>

        {priorityDecisions.length > 0 ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {priorityDecisions.map(({ decision, suggestion }, index) => (
              <button key={suggestion.id} type="button" onClick={() => { setActiveGroup(decision.decision); setOpen(true); }} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) auto', gap: 10, alignItems: 'center', textAlign: 'left', width: '100%', padding: '11px 12px', border: '0', borderTop: index === 0 ? '1px solid var(--line)' : '1px solid color-mix(in srgb,var(--line) 75%,transparent)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>
                <strong style={{ fontSize: 15 }}>{index + 1}</strong>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{suggestion.label}</strong>
                  <span className="subtitle" style={{ display: 'block', marginTop: 2, fontSize: 12 }}>{sectionLabel(suggestion.section)} · {suggestion.evidence_strength ? `${suggestion.evidence_strength} evidence` : 'evidence unclear'}</span>
                </span>
                <span className={`badge ${decisionTone(decision.decision)}`}>{Math.round(decision.confidence * 100)}% · {decision.decision}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="field-note" style={{ marginTop: 4 }}>AI Priority stays empty until you explicitly run <strong>Let AI decide</strong>. Manual selection remains available below.</div>
        )}

        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 14 }}>
          <button type="button" className="badge" onClick={scrollToManualReview} style={{ cursor: 'pointer' }}>Review suggestions yourself</button>
          {decisions.length ? <button type="button" className="badge" onClick={() => setOpen(true)} style={{ cursor: 'pointer' }}><Sparkles size={13} /> Open AI recommendations</button> : null}
        </div>

        {error ? <p className="subtitle" role="alert" style={{ color: 'var(--danger)', margin: '12px 0 0' }}>{error}</p> : null}
      </section>

      {open ? (
        <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,.74)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }} onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-label="AI Brand Brain recommendation review" style={{ width: 'min(1080px,100%)', maxHeight: 'min(90vh,940px)', overflow: 'auto', border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--line))', borderRadius: 20, background: 'var(--surface)', boxShadow: '0 30px 90px rgba(0,0,0,.42)', padding: 20 }}>
            <div className="section-title" style={{ gap: 12, alignItems: 'flex-start' }}>
              <div>
                <div className="eyebrow"><Sparkles size={13} /> AI recommendation review</div>
                <h2 style={{ margin: '5px 0' }}>Review before Brand Brain changes</h2>
                <p className="subtitle" style={{ margin: 0 }}>AI has only recommended these decisions. Nothing changes until you approve, reject, edit, or confirm the batch.</p>
              </div>
              <button type="button" className="badge" aria-label="Close AI review" onClick={() => setOpen(false)} disabled={busy} style={{ border: 0, cursor: busy ? 'not-allowed' : 'pointer' }}><X size={15} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10, margin: '18px 0' }}>
              {(['APPROVE', 'REJECT', 'REVIEW'] as const).map((group) => (
                <button key={group} type="button" onClick={() => setActiveGroup(group)} style={{ textAlign: 'left', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', background: activeGroup === group ? 'color-mix(in srgb,var(--accent) 10%,var(--surface))' : 'var(--surface)', color: 'var(--text)', border: `1px solid ${activeGroup === group ? 'color-mix(in srgb,var(--accent) 48%,var(--line))' : 'var(--line)'}` }}>
                  <div className="eyebrow">{group === 'APPROVE' ? 'AI recommends approval' : group === 'REJECT' ? 'AI recommends rejection' : 'Human review'}</div>
                  <strong style={{ display: 'block', fontSize: 28, marginTop: 3 }}>{grouped[group].length}</strong>
                  <span className="subtitle" style={{ fontSize: 12 }}>{group === 'REVIEW' ? 'Stays pending' : 'Awaiting your confirmation'}</span>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
              <span className="eyebrow" style={{ alignSelf: 'center' }}>Filter</span>
              {['all', 'review', 'strong', ...sectionFilters].map((filter) => (
                <button key={filter} type="button" className="badge" onClick={() => setCenterFilter(filter)} style={{ border: `1px solid ${centerFilter === filter ? 'color-mix(in srgb,var(--accent) 52%,var(--line))' : 'var(--line)'}`, background: centerFilter === filter ? 'color-mix(in srgb,var(--accent) 10%,var(--surface))' : 'var(--surface)', cursor: 'pointer' }}>
                  {filter === 'all' ? 'All' : filter === 'review' ? 'Needs Review' : filter === 'strong' ? 'Strong Evidence' : sectionLabel(filter)}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {grouped[activeGroup].filter((decision) => {
                const suggestion = pending.get(decision.suggestionId);
                if (!suggestion) return false;
                if (centerFilter === 'all') return true;
                if (centerFilter === 'review') return decision.decision === 'REVIEW';
                if (centerFilter === 'strong') return suggestion.evidence_strength === 'strong';
                return suggestion.section === centerFilter;
              }).map((decision) => {
                const suggestion = pending.get(decision.suggestionId);
                if (!suggestion) return null;
                const isEditing = editingId === suggestion.id;
                return (
                  <article key={suggestion.id} style={{ padding: '15px 0', borderTop: '1px solid color-mix(in srgb,var(--line) 82%,transparent)' }}>
                    <div className="suggestion-card-head">
                      <div className="suggestion-title-row">
                        <h4 className="suggestion-label">{suggestion.label}</h4>
                        <span className={`badge ${decisionTone(decision.decision)}`}>{decisionLabel(decision.decision)}</span>
                        <span className="badge tone-muted">{Math.round(decision.confidence * 100)}% recommendation confidence</span>
                      </div>
                    </div>
                    <pre className="suggestion-value" style={{ marginTop: 9 }}>{valueText(suggestion.proposed_value)}</pre>
                    <div className="suggestion-evidence" style={{ marginTop: 9 }}>
                      <span className="badge tone-info">{suggestion.evidence_strength ? `${suggestion.evidence_strength} evidence` : 'Evidence unclear'}</span>
                      <span className="suggestion-evidence-claim">{decision.reason}</span>
                    </div>
                    {suggestion.evidence.slice(0, 3).map((item, index) => (
                      <div key={`${suggestion.id}-e-${index}`} className="suggestion-evidence" style={{ marginTop: 6 }}>
                        <span className="suggestion-evidence-claim">{item.claim || item.excerpt || 'Supporting evidence available'}</span>
                        {item.url ? <a className="suggestion-evidence-source" href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={11} /> View source</a> : null}
                      </div>
                    ))}
                    {isEditing ? (
                      <div className="suggestion-editor" style={{ marginTop: 12 }}>
                        <textarea className="suggestion-edit-input" value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} />
                        <div className="suggestion-actions">
                          <button type="button" className="badge" disabled={busy || !draft.trim()} onClick={() => void editSuggestion(suggestion.id, draft)}><Check size={13} /> Save edit</button>
                          <button type="button" className="badge" disabled={busy} onClick={() => setEditingId(null)}><X size={13} /> Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="suggestion-actions" style={{ marginTop: 12 }}>
                        <button type="button" className="badge" disabled={busy} onClick={() => { setEditingId(suggestion.id); setDraft(valueText(suggestion.proposed_value)); }}><Edit3 size={13} /> Edit</button>
                        <button type="button" className="badge" disabled={busy} onClick={() => setDecisions((current) => current.map((item) => item.suggestionId === suggestion.id ? { ...item, decision: 'REVIEW' } : item))}><X size={13} /> Move to Human Review</button>
                        {decision.decision !== 'REVIEW' ? <button type="button" className="badge tone-good" disabled={busy} onClick={() => void approveNow(suggestion.id)}><CheckCircle2 size={13} /> Approve now</button> : null}
                        {decision.decision !== 'REJECT' ? <button type="button" className="badge tone-danger" disabled={busy} onClick={() => setDecisions((current) => current.map((item) => item.suggestionId === suggestion.id ? { ...item, decision: 'REJECT' } : item))}><ThumbsDown size={13} /> Recommend reject</button> : null}
                      </div>
                    )}
                  </article>
                );
              })}
              {grouped[activeGroup].filter((decision) => {
                const suggestion = pending.get(decision.suggestionId);
                if (!suggestion) return false;
                if (centerFilter === 'all') return true;
                if (centerFilter === 'review') return decision.decision === 'REVIEW';
                if (centerFilter === 'strong') return suggestion.evidence_strength === 'strong';
                return suggestion.section === centerFilter;
              }).length === 0 ? <p className="subtitle" style={{ padding: '18px 0' }}>Nothing matches this view.</p> : null}
            </div>

            <div className="section-title" style={{ marginTop: 18, gap: 10, flexWrap: 'wrap', paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <button type="button" className="badge" onClick={() => setOpen(false)} disabled={busy} style={{ border: 0, cursor: busy ? 'not-allowed' : 'pointer' }}>Select yourself</button>
              <div style={{ flex: 1 }} />
              <span className="subtitle" style={{ fontSize: 12 }}>Human Review items stay pending and are not included in the batch.</span>
              <button type="button" className="badge auth-submit" onClick={() => void confirmBatch()} disabled={busy} style={{ border: 0, cursor: busy ? 'not-allowed' : 'pointer', padding: '9px 14px' }}>{busy ? <><LoaderCircle size={14} className="spin" /> Applying…</> : <><Check size={14} /> Human confirms AI batch</>}</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
