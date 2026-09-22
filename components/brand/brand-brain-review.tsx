'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, Check, CheckCircle2, ExternalLink, LoaderCircle, Play, RefreshCw,
  Search, Sparkles, ThumbsDown, X, Wrench,
} from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback';

type EvidenceItem = {
  sourceId: string | null;
  url: string;
  urlTitle: string | null;
  excerpt: string | null;
  claim: string;
  strength: 'strong' | 'partial' | 'weak';
};

type Suggestion = {
  id: string;
  field: string;
  label: string;
  section: string;
  kind: 'text' | 'list' | 'persona';
  proposed_value: string | string[] | Array<{ name: string; description?: string | null }> | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EDITED' | 'NOT_FOUND';
  evidence: EvidenceItem[];
  evidence_strength: 'strong' | 'partial' | 'weak' | null;
  sources_examined: number;
  confidence: number | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};

type BrainResponse = {
  ok: boolean;
  facts: unknown[];
  insights: unknown[];
  sources: unknown[];
  latestRun: {
    id: string;
    status: string;
    pagesProcessed: number;
    pagesDiscovered: number;
    errorCode: string | null;
    errorMessage: string | null;
    createdAt: string;
    finishedAt: string | null;
    ai: { status: string; provider: string | null; model: string | null; errorMessage: string | null } | null;
  } | null;
  suggestions: Suggestion[];
  suggestionCounts: {
    pending: number;
    approved: number;
    rejected: number;
    edited: number;
    notFound: number;
    total: number;
    needsReview: number;
  };
  importInfo: { processed: number; failed: number; pagesDiscovered: number; pagesProcessed: number };
};

const LIVE_RUN_STATUSES = new Set(['QUEUED', 'RUNNING']);
const LIVE_AI_STATUSES = new Set(['QUEUED', 'RUNNING']);

const SECTIONS: Array<{ key: string; label: string }> = [
  { key: 'identity', label: 'Identity' },
  { key: 'audience', label: 'Audience' },
  { key: 'positioning', label: 'Positioning' },
  { key: 'offer', label: 'Offer' },
  { key: 'messaging', label: 'Messaging' },
  { key: 'seo', label: 'SEO topics' },
  { key: 'competition', label: 'Competition' },
];

export type ReviewRole = 'view' | 'manage';

function strengthLabel(strength: EvidenceItem['strength']) {
  if (strength === 'strong') return { label: 'Strong evidence', tone: 'tone-good' };
  if (strength === 'partial') return { label: 'Partial evidence', tone: 'tone-warn' };
  return { label: 'Weak evidence', tone: 'tone-muted' };
}

function formatValue(value: Suggestion['proposed_value']): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : `${entry.name.trim()}${entry.description ? ` — ${entry.description.trim()}` : ''}`))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function parseEditValue(kind: Suggestion['kind'], raw: string): string | string[] | Array<{ name: string; description?: string }> {
  if (kind === 'text') return raw.trim();
  const items = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (kind === 'persona') {
    return items.map((line) => {
      const separator = line.match(/(?:\s[—-]\s|\s•\s|\s\|\s)/);
      if (separator && separator.index !== undefined) {
        return { name: line.slice(0, separator.index).trim(), description: line.slice(separator.index + separator[0].length).trim() };
      }
      return { name: line };
    });
  }
  return items;
}

function personaLines(value: Suggestion['proposed_value'] | string[]): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      return `${entry.name.trim()}${entry.description ? ` — ${entry.description.trim()}` : ''}`;
    })
    .join('\n');
}

function UpsertButton({ children, onClick, disabled, title, tone }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string; tone?: 'warn' | 'neutral' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`badge action-badge ${tone === 'warn' ? 'tone-warn' : ''}`}
      style={{ border: 0, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, padding: '6px 10px' }}
    >
      {children}
    </button>
  );
}

function EvidenceBlock({ evidence, sourcesExamined }: { evidence: EvidenceItem[]; sourcesExamined: number }) {
  if (evidence.length === 0) {
    return (
      <div className="suggestion-evidence muted">
        <Search size={13} />
        <span>AI inference — no directly citable phrase found on the inspected pages ({sourcesExamined} page{sourcesExamined === 1 ? '' : 's'} examined). Review before approving.</span>
      </div>
    );
  }
  return (
    <ul className="suggestion-evidence-list">
      {evidence.map((item, index) => {
        const sl = strengthLabel(item.strength);
        return (
          <li key={`${item.url}-${index}`} className="suggestion-evidence">
            <span className={`badge ${sl.tone}`} style={{ padding: '2px 6px', fontSize: 11 }}>{sl.label}</span>
            <span className="suggestion-evidence-claim">{item.claim}</span>
            {item.urlTitle || item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer" className="suggestion-evidence-source">
                <ExternalLink size={11} /> {item.urlTitle || item.url}
              </a>
            ) : null}
            {item.excerpt ? <p className="suggestion-evidence-excerpt">“{item.excerpt}”</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

function SuggestionCard({
  suggestion,
  canManage,
  busyKey,
  onApprove,
  onReject,
  onRegenerate,
  onEdit,
}: {
  suggestion: Suggestion;
  canManage: boolean;
  busyKey: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRegenerate: (id: string) => void;
  onEdit: (id: string, value: string | string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => formatValue(suggestion.proposed_value));
  const busy = busyKey !== null && busyKey.startsWith(suggestion.id);

  useEffect(() => {
    setDraft(formatValue(suggestion.proposed_value));
  }, [suggestion.proposed_value]);

  const statusTone = {
    PENDING: 'tone-warn',
    APPROVED: 'tone-good',
    EDITED: 'tone-info',
    REJECTED: 'tone-danger',
    NOT_FOUND: 'tone-muted',
  }[suggestion.status];

  const statusLabel = {
    PENDING: 'Needs review',
    APPROVED: 'Approved',
    EDITED: 'Edited by you',
    REJECTED: 'Dismissed',
    NOT_FOUND: 'Not found on your site',
  }[suggestion.status];

  const isNotFound = suggestion.status === 'NOT_FOUND';

  return (
    <div className={`suggestion-card ${isNotFound ? 'suggestion-not-found' : ''}`} data-status={suggestion.status}>
      <div className="suggestion-card-head">
        <div className="suggestion-title-row">
          <h4 className="suggestion-label">{suggestion.label}</h4>
          <span className={`badge ${statusTone}`}>{statusLabel}</span>
          {suggestion.evidence_strength && !isNotFound ? (
            <span className={`badge ${strengthLabel(suggestion.evidence_strength).tone}`} style={{ padding: '2px 7px', fontSize: 11 }}>
              {strengthLabel(suggestion.evidence_strength).label}
            </span>
          ) : null}
        </div>
        {suggestion.status === 'APPROVED' || suggestion.status === 'EDITED' ? (
          <div className="suggestion-review-note">
            <CheckCircle2 size={13} /> Saved as an authoritative fact
          </div>
        ) : null}
      </div>

      {isNotFound ? (
        <div className="suggestion-not-found-body">
          <p className="subtitle" style={{ margin: '6px 0' }}>
            The AI could not find this on the current site. This stays blank until a human provides it — it is never guessed.
          </p>
          {canManage ? (
            <div className="suggestion-editor" style={{ marginTop: 10 }}>
              <textarea
                aria-label={`Provide a value for ${suggestion.label}`}
                className="suggestion-edit-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
              />
              <div className="suggestion-actions">
                <UpsertButton onClick={() => onEdit(suggestion.id, draft)} disabled={busy || draft.trim() === ''} title="Provide this field">
                  {busy ? <LoaderCircle size={14} className="spin" /> : <Wrench size={14} />} Provide it
                </UpsertButton>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <pre className="suggestion-value">{formatValue(suggestion.proposed_value)}</pre>
      )}

      {!isNotFound ? <EvidenceBlock evidence={suggestion.evidence} sourcesExamined={suggestion.sources_examined} /> : null}

      {canManage ? (
        <div className="suggestion-editor">
          {editing ? (
            <>
              <textarea
                aria-label={`Edit ${suggestion.label}`}
                className="suggestion-edit-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={Math.max(2, Math.min(8, draft.split('\n').length + 1))}
                placeholder={suggestion.kind === 'list' ? 'One item per line' : suggestion.kind === 'persona' ? 'Name — description, one per line' : 'Enter the corrected value…'}
              />
              <div className="suggestion-actions" style={{ marginBottom: 0 }}>
                <UpsertButton onClick={() => onEdit(suggestion.id, draft)} disabled={busy || draft.trim() === ''}>
                  {busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />} Save edit
                </UpsertButton>
                <UpsertButton onClick={() => { setEditing(false); setDraft(formatValue(suggestion.proposed_value)); }} disabled={busy}>
                  <X size={14} /> Cancel
                </UpsertButton>
              </div>
            </>
          ) : (
            <div className="suggestion-actions">
              {suggestion.status === 'PENDING' ? (
                <UpsertButton onClick={() => onApprove(suggestion.id)} disabled={busy} title="Approve and save as a brand fact">
                  {busy ? <LoaderCircle size={14} className="spin" /> : <CheckCircle2 size={14} />} Approve
                </UpsertButton>
              ) : null}
              {suggestion.status === 'NOT_FOUND' || suggestion.status === 'PENDING' ? (
                <UpsertButton onClick={() => { setEditing(true); }} disabled={busy} title="Provide or correct the value">
                  <Wrench size={14} /> Edit
                </UpsertButton>
              ) : (
                <UpsertButton onClick={() => { setEditing(true); setDraft(formatValue(suggestion.proposed_value)); }} disabled={busy} title="Correct the value">
                  <Wrench size={14} /> Edit
                </UpsertButton>
              )}
              <UpsertButton onClick={() => onRegenerate(suggestion.id)} disabled={busy} title="Ask the AI again for this field">
                <RefreshCw size={14} /> Regenerate
              </UpsertButton>
              {suggestion.status === 'PENDING' ? (
                <UpsertButton onClick={() => onReject(suggestion.id)} disabled={busy} title="Dismiss this suggestion">
                  <ThumbsDown size={14} /> Dismiss
                </UpsertButton>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ImportStepper({ data, live }: { data: BrainResponse; live: boolean }) {
  const run = data.latestRun;
  const { processed, failed, pagesDiscovered, pagesProcessed } = data.importInfo;
  const analyzed = (data.suggestionCounts.total ?? 0) > 0;

  const steps = [
    { label: 'Discover pages', state: pagesDiscovered > 0 || run?.status === 'COMPLETED' ? 'done' : live ? 'active' : 'todo' },
    { label: 'Read page content', state: data.suggestionCounts.total > 0 || pagesProcessed > 0 ? 'done' : live ? 'active' : 'todo' },
    { label: 'Generate brand intelligence', state: analyzed ? 'done' : live ? 'active' : 'todo' },
    { label: 'Review suggestions', state: data.suggestionCounts.needsReview === 0 ? 'done' : analyzed ? 'active' : 'todo' },
  ];

  return (
    <div className="import-stepper" aria-label="Intelligence import progress">
      <div className="import-step-list">
        {steps.map((step, index) => (
          <div key={step.label} className={`import-step ${step.state}`}>
            {step.state === 'done' ? (
              <span className="import-step-icon done"><Check size={12} /></span>
            ) : step.state === 'active' ? (
              <span className="import-step-icon active"><LoaderCircle size={12} className="spin" /></span>
            ) : (
              <span className="import-step-icon todo">{index + 1}</span>
            )}
            <span className="import-step-label">{step.label}</span>
          </div>
        ))}
      </div>
      <div className="import-stats">
        <span>{pagesProcessed}/{pagesDiscovered} pages read</span>
        {failed > 0 ? <span className="import-failures"><AlertCircle size={12} /> {failed} page{failed === 1 ? '' : 's'} could not be read</span> : null}
        <span>{data.suggestionCounts.total} suggestions</span>
        <span>{data.suggestionCounts.needsReview} need review</span>
      </div>
    </div>
  );
}

export function BrandBrainReview({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [data, setData] = useState<BrainResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [tab, setTab] = useState<'review' | 'approved' | 'notfound' | 'rejected' | 'all'>('review');
  const [sectionIndex, setSectionIndex] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [role, setRole] = useState<ReviewRole>('view');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/brain`, { cache: 'no-store' });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not load the brand brain');
      setData(body);
      try {
        const roleResponse = await fetch(`/api/brands/${brandId}/roles`, { cache: 'no-store' });
        if (roleResponse.ok) {
          const roleBody = await roleResponse.json();
          setRole(roleBody.canReviewSuggestions ? 'manage' : 'view');
        }
      } catch {
        setRole('view');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the brand brain');
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  const run = data?.latestRun ?? null;
  const live = Boolean(run && (LIVE_RUN_STATUSES.has(run.status) || (run.ai && LIVE_AI_STATUSES.has(run.ai.status))));

  useEffect(() => {
    let cancelled = false;
    if (!live) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (!pollRef.current) {
      pollRef.current = setInterval(() => { if (!cancelled) load(); }, 3000);
    }
    return () => { cancelled = true; if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [live, load]);

  useEffect(() => {
    load();
  }, [load]);

  const startResearch = useCallback(async () => {
    setStarting(true);
    setStartError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/research`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (response.status === 401) { window.location.href = '/login'; return; }
      const body = await response.json().catch(() => null);
      if (!response.ok && response.status !== 409) throw new Error(body?.error || 'Could not start the website import');
      await load();
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not start the website import');
    } finally {
      setStarting(false);
    }
  }, [brandId, load]);

  const mutate = useCallback(async (path: string, init: RequestInit) => {
    const response = await fetch(path, init);
    if (response.status === 401) { window.location.href = '/login'; return null; }
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || 'Could not update the suggestion');
    return body;
  }, []);

  const applyAction = useCallback(async (suggestionId: string, action: 'approve' | 'edit' | 'reject' | 'regenerate', value?: string | string[]) => {
    setBusyKey(`${suggestionId}-${action}`);
    setStartError(null);
    try {
      const payload = value === undefined ? { action } : { action, value };
      const body = await mutate(`/api/brands/${brandId}/brain/suggestions/${suggestionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (body) await load();
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not update the suggestion');
    } finally {
      setBusyKey(null);
    }
  }, [brandId, load, mutate]);

  const batch = useCallback(async (action: 'approve_all' | 'dismiss_all', fields?: string[]) => {
    setBusyKey(`batch-${action}`);
    setStartError(null);
    try {
      const body = await mutate(`/api/brands/${brandId}/brain/suggestions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, fields }),
      });
      if (body) await load();
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not process the batch action');
    } finally {
      setBusyKey(null);
    }
  }, [brandId, load, mutate]);

  const suggestions = data?.suggestions ?? [];
  const counts = data?.suggestionCounts ?? { pending: 0, approved: 0, rejected: 0, edited: 0, notFound: 0, total: 0, needsReview: 0 };
  const pendingRows = suggestions.filter((s) => s.status === 'PENDING');

  const filtered = useMemo(() => {
    if (tab === 'review') return suggestions.filter((s) => s.status === 'PENDING');
    if (tab === 'approved') return suggestions.filter((s) => s.status === 'APPROVED' || s.status === 'EDITED');
    if (tab === 'notfound') return suggestions.filter((s) => s.status === 'NOT_FOUND');
    if (tab === 'rejected') return suggestions.filter((s) => s.status === 'REJECTED');
    return suggestions;
  }, [tab, suggestions]);

  const grouped = useMemo(() => {
    const map = new Map<string, Suggestion[]>();
    for (const section of SECTIONS) {
      const items = filtered.filter((s) => s.section === section.key);
      if (items.length > 0) map.set(section.label, items);
    }
    const rest = filtered.filter((s) => !SECTIONS.some((section) => section.key === s.section));
    if (rest.length > 0) map.set('Other', rest);
    return map;
  }, [filtered]);

  useEffect(() => { setSectionIndex((current) => Math.min(current, Math.max(0, grouped.size - 1))); }, [grouped]);

  const canManage = role === 'manage';
  const tabs = [
    { key: 'review' as const, label: `Needs review`, count: counts.pending },
    { key: 'approved' as const, label: 'Approved', count: counts.approved + counts.edited },
    { key: 'notfound' as const, label: 'Not found', count: counts.notFound },
    { key: 'rejected' as const, label: 'Dismissed', count: counts.rejected },
    { key: 'all' as const, label: 'All', count: counts.total },
  ];

  const hasAnyRun = run !== null;
  const needsImport = !hasAnyRun || run.status === 'FAILED';

  return (
    <div className="grid" style={{ gap: 16 }} id="intelligence">
      <div className="card">
        <div className="section-title" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="eyebrow">Brand intelligence review</div>
            <h2 style={{ margin: '5px 0' }}>Brand Brain</h2>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {run ? <span className={`badge ${run.status === 'FAILED' ? 'tone-danger' : live ? 'tone-info' : 'tone-good'}`}>{live ? <span className="status-dot live" /> : null}{run.status}</span> : null}
            {needsImport && canManage ? (
              <button
                type="button"
                className="badge"
                onClick={startResearch}
                disabled={starting}
                style={{ border: 0, cursor: starting ? 'not-allowed' : 'pointer', padding: '8px 12px', opacity: starting ? 0.6 : 1 }}
              >
                {starting ? <><LoaderCircle size={14} className="spin" /> Starting…</> : <><Play size={14} /> Import from website</>}
              </button>
            ) : null}
          </div>
        </div>
        <p className="subtitle" style={{ marginTop: 0 }}>
          AI extracts brand intelligence from the website as <strong>suggestions</strong>. Nothing becomes an authoritative fact until a human approves or edits it.
        </p>

        {run ? <ImportStepper data={data!} live={live} /> : null}

        {startError ? <div className="card" style={{ borderColor: 'rgba(239,68,68,.35)', marginTop: 12 }}><ErrorState message={startError} /></div> : null}
        {error ? <div className="card" style={{ borderColor: 'rgba(239,68,68,.35)', marginTop: 12 }}><ErrorState message={error} /></div> : null}
      </div>

      {loading ? (
        <LoadingState label="Loading brand intelligence…" />
      ) : (data?.suggestionCounts.total ?? 0) === 0 ? (
        canManage && needsImport ? (
          <EmptyState
            title="Import this brand’s website"
            description="Research the site to build a Brand Brain. Every finding is reviewed by you before it can be used in a strategy."
            action={<button type="button" className="badge" onClick={startResearch} disabled={starting} style={{ border: 0, cursor: 'pointer', padding: '8px 14px' }}>{starting ? <><LoaderCircle size={14} className="spin" /> Starting…</> : <><Play size={14} /> Import from website</>}</button>}
          />
        ) : (
          <EmptyState title="No suggestions yet" description={`Run an import for ${brandName} to build its Brand Brain.`} />
        )
      ) : (
        <>
          <div className="card">
            <div className="review-tabs" role="tablist" aria-label="Suggestion filters">
              {tabs.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.key}
                  onClick={() => setTab(item.key)}
                  className={`review-tab ${tab === item.key ? 'active' : ''}`}
                >
                  {item.label} <span className="review-tab-count">{item.count}</span>
                </button>
              ))}
              <div className="review-batch" style={{ marginLeft: 'auto' }}>
                {canManage && pendingRows.length > 0 && tab === 'review' ? (
                  <>
                    <UpsertButton onClick={() => batch('approve_all')} disabled={busyKey !== null} title="Approve all pending suggestions">
                      {busyKey === 'batch-approve_all' ? <LoaderCircle size={14} className="spin" /> : <CheckCircle2 size={14} />} Approve all ({pendingRows.length})
                    </UpsertButton>
                    <UpsertButton onClick={() => batch('dismiss_all')} disabled={busyKey !== null} title="Dismiss all pending suggestions">
                      {busyKey === 'batch-dismiss_all' ? <LoaderCircle size={14} className="spin" /> : <ThumbsDown size={14} />} Dismiss all ({pendingRows.length})
                    </UpsertButton>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {grouped.size > 0 ? (
            <>
              <div className="brain-topic-nav" aria-label="Brand intelligence topics">
                {Array.from(grouped.entries()).map(([sectionLabel], index) => (
                  <button key={sectionLabel} type="button" className={'brain-topic-button ' + (sectionIndex === index ? 'active' : '')} onClick={() => setSectionIndex(index)}>
                    <span>{String(index + 1).padStart(2, '0')}</span>{sectionLabel}
                  </button>
                ))}
              </div>
              {(() => {
                const entry = Array.from(grouped.entries())[sectionIndex];
                if (!entry) return null;
                const [sectionLabel, items] = entry;
                return <div className="brain-topic-panel">
                  <div className="section-title suggestion-section-title">
                    <div><div className="eyebrow">Topic {sectionIndex + 1} of {grouped.size}</div><h3 style={{ margin: '4px 0 0' }}>{sectionLabel}</h3></div>
                    {canManage && tab === 'review' ? <button type="button" className="badge text-button" onClick={() => batch('dismiss_all', items.map((item) => item.field))} disabled={busyKey !== null} style={{ border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}><X size={12}/> Dismiss pending</button> : null}
                  </div>
                  <div className="grid" style={{ gap: 12 }}>
                    {items.map((suggestion) => <SuggestionCard key={suggestion.id} suggestion={suggestion} canManage={canManage} busyKey={busyKey} onApprove={(id) => applyAction(id, 'approve')} onReject={(id) => applyAction(id, 'reject')} onRegenerate={(id) => applyAction(id, 'regenerate')} onEdit={(id, value) => applyAction(id, 'edit', value)} />)}
                  </div>
                  <div className="brain-topic-actions">
                    <button type="button" className="badge" disabled={sectionIndex === 0} onClick={() => setSectionIndex((v) => Math.max(0, v - 1))}>← Previous topic</button>
                    <button type="button" className="badge auth-submit" disabled={sectionIndex >= grouped.size - 1} onClick={() => setSectionIndex((v) => Math.min(grouped.size - 1, v + 1))}>Next topic →</button>
                  </div>
                </div>;
              })()}
            </>
          ) : <EmptyState title="No suggestions in this view" description="Change the review filter to inspect another part of the Brand Brain." />}
        </>
      )}
    </div>
  );
}