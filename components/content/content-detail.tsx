'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, FileText, LoaderCircle, PlayCircle, RefreshCw, Save } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback';
import { contentTypeLabel, channelLabel } from '@/lib/content/schema';

type Version = {
  id: string;
  version: number;
  headline: string | null;
  body: string;
  cta: string | null;
  rationale: string | null;
  provider: string | null;
  model: string | null;
  authorUserId: string | null;
  strategyId: string | null;
  brandFactReferences: string[];
  strategyReferences: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
};

type Review = {
  id: string;
  decision: string;
  comment: string | null;
  reviewerId: string | null;
  contentVersionId: string | null;
  createdAt: string;
};

type ItemDetail = {
  id: string;
  type: string;
  title: string;
  status: string;
  channel: string | null;
  topic: string | null;
  objective: string | null;
  audience: string | null;
  tone: string | null;
  cta: string | null;
  instructions: string | null;
  campaignContext: string | null;
  clientId: string | null;
  strategyId: string | null;
  createdAt: string;
  updatedAt: string;
  currentVersionId: string | null;
};

type DetailData = {
  item: ItemDetail;
  versions: Version[];
  reviews: Review[];
  canGenerate: boolean;
  canReview: boolean;
};

function toneFor(status: string): string {
  switch (status) {
    case 'APPROVED':
    case 'SCHEDULED':
    case 'PUBLISHED':
      return 'tone-good';
    case 'REJECTED':
      return 'tone-danger';
    case 'IN_REVIEW':
    case 'CLIENT_REVIEW':
    case 'CHANGES_REQUESTED':
      return 'tone-info';
    case 'ARCHIVED':
      return 'tone-muted';
    default:
      return 'tone-muted';
  }
}

function labelFor(status: string): string {
  return status.toLowerCase().replaceAll('_', ' ');
}

function decisionLabel(decision: string): string {
  return {
    submit: 'Submitted for review',
    approve: 'Approved',
    reject: 'Rejected',
    changes_requested: 'Changes requested',
    return_to_draft: 'Returned to draft',
    archive: 'Archived',
    schedule: 'Scheduled',
    publish: 'Published',
  }[decision] ?? decision.replaceAll('_', ' ');
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ReviewActions({
  status,
  versionId,
  canGenerate,
  canReview,
  onAction,
  busy,
}: {
  status: string;
  versionId: string | null;
  canGenerate: boolean;
  canReview: boolean;
  onAction: (action: string, comment?: string) => Promise<void>;
  busy: boolean;
}) {
  const [comment, setComment] = useState('');

  const actions: Array<{ action: string; label: string; tone: string; allowed: boolean }> = [];
  if (status === 'DRAFT') actions.push({ action: 'submit', label: 'Submit for review', tone: 'tone-good', allowed: canGenerate });
  if (['IN_REVIEW', 'CLIENT_REVIEW', 'CHANGES_REQUESTED'].includes(status)) {
    actions.push({ action: 'approve', label: 'Approve', tone: 'tone-good', allowed: canReview });
    actions.push({ action: 'changes_requested', label: 'Request changes', tone: 'tone-info', allowed: canReview });
    actions.push({ action: 'reject', label: 'Reject', tone: 'tone-danger', allowed: canReview });
  }
  if (status === 'APPROVED') {
    actions.push({ action: 'schedule', label: 'Schedule', tone: 'tone-good', allowed: canReview });
    actions.push({ action: 'publish', label: 'Publish', tone: 'tone-good', allowed: canReview });
  }
  if (status === 'SCHEDULED' && canReview) actions.push({ action: 'publish', label: 'Publish', tone: 'tone-good', allowed: true });
  if (['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED'].includes(status) && canGenerate) {
    actions.push({ action: 'return_to_draft', label: 'Return to draft', tone: 'tone-muted', allowed: true });
  }
  if (['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHED', 'CHANGES_REQUESTED'].includes(status)) {
    actions.push({ action: 'archive', label: 'Archive', tone: 'tone-muted', allowed: canGenerate || canReview });
  }

  if (actions.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {versionId === null && status !== 'DRAFT' ? (
        <span className="chip tone-warn">No generated version to review yet</span>
      ) : null}
      {actions.map((action) => (
        <button
          type="button"
          key={action.action}
          className={`badge ${action.tone}`}
          disabled={busy}
          onClick={() => onAction(action.action, comment.trim() || undefined)}
          style={{ border: 0, cursor: busy ? 'not-allowed' : 'pointer', padding: '8px 12px', opacity: busy ? 0.6 : 1 }}
        >
          {action.label}
        </button>
      ))}
      <input
        className="content-filter-input"
        style={{ flex: 1, minWidth: 200 }}
        placeholder="Review comment (optional)"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
    </div>
  );
}

function EditorPage({
  brandId,
  item,
  onSaved,
}: {
  brandId: string;
  item: ItemDetail;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: item.title,
    objective: item.objective ?? '',
    audience: item.audience ?? '',
    campaignContext: item.campaignContext ?? '',
    tone: item.tone ?? '',
    cta: item.cta ?? '',
    instructions: item.instructions ?? '',
  });
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    setError(null);
    setBody('');
  }, [item.currentVersionId]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const payload: Record<string, unknown> = {};
      if (form.title !== item.title) payload.title = form.title;
      if (form.objective !== (item.objective ?? '')) payload.objective = form.objective || null;
      if (form.audience !== (item.audience ?? '')) payload.audience = form.audience || null;
      if (form.campaignContext !== (item.campaignContext ?? '')) payload.context = form.campaignContext || null;
      if (form.tone !== (item.tone ?? '')) payload.tone = form.tone || null;
      if (form.cta !== (item.cta ?? '')) payload.cta = form.cta || null;
      if (form.instructions !== (item.instructions ?? '')) payload.instructions = form.instructions || null;
      if (body.trim()) payload.body = body;

      if (Object.keys(payload).length === 0) {
        setError('Nothing changed to save.');
        return;
      }

      const response = await fetch(`/api/brands/${brandId}/content/${item.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Could not save content');
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save content');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card content-editor">
      <div className="section-title" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="eyebrow">Studio — edit draft</div>
          <h2 style={{ margin: '5px 0' }}>Brief & instrument</h2>
        </div>
        <button type="button" className={`badge ${saved ? 'tone-good' : ''}`} onClick={save} disabled={busy} style={{ border: 0, cursor: busy ? 'not-allowed' : 'pointer', padding: '8px 12px', opacity: busy ? 0.6 : 1 }}>
          {busy ? <><LoaderCircle size={14} className="spin" /> Saving…</> : saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save changes</>}
        </button>
      </div>
      <p className="subtitle" style={{ marginTop: 0 }}>Editing the body creates a new version so the review history stays intact.</p>
      <div className="content-form">
        <label>Title / topic
          <input value={form.title} onChange={(event) => set('title', event.target.value)} />
        </label>
        <div className="content-form-row">
          <label>Objective
            <input value={form.objective} onChange={(event) => set('objective', event.target.value)} />
          </label>
          <label>Audience
            <input value={form.audience} onChange={(event) => set('audience', event.target.value)} />
          </label>
        </div>
        <label>Campaign / context
          <textarea value={form.campaignContext} onChange={(event) => set('campaignContext', event.target.value)} />
        </label>
        <div className="content-form-row">
          <label>Tone / style
            <input value={form.tone} onChange={(event) => set('tone', event.target.value)} />
          </label>
          <label>CTA direction
            <input value={form.cta} onChange={(event) => set('cta', event.target.value)} />
          </label>
        </div>
        <label>Additional instructions
          <textarea value={form.instructions} onChange={(event) => set('instructions', event.target.value)} />
        </label>
        <label>Draft body (optional override)
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Edit the copy directly. Saving creates a new version marked as a manual edit."
          />
        </label>
        {error ? <ErrorState message={error} /> : null}
      </div>
    </div>
  );
}

function VersionView({ version, current }: { version: Version; current: boolean }) {
  return (
    <div className="card" style={{ borderColor: current ? 'rgba(110,231,199,.3)' : undefined }}>
      <div className="section-title" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
        <div>
          <div className="eyebrow">{current ? 'Current version' : 'Version history'} · v{version.version}</div>
          <h2 style={{ margin: '5px 0 0', fontSize: 18 }}>{version.headline || 'Untitled'}</h2>
        </div>
        <span className="badge tone-muted">Generated {timeAgo(version.createdAt)}{version.model ? ` · ${version.model}` : ''}{version.provider ? ` (${version.provider})` : ''}</span>
      </div>
      <div className="content-body">{version.body}</div>
      <div className="content-item-footer" style={{ marginTop: 14 }}>
        <span className="activity-meta">{version.cta ? `CTA: ${version.cta}` : 'No CTA set'}</span>
      </div>
      {version.rationale ? (
        <div className="review-note" style={{ marginTop: 12 }}>
          <div className="strategy-block-label">RATIONALE</div>
          <p className="activity-meta" style={{ margin: 0, lineHeight: 1.5 }}>{version.rationale}</p>
        </div>
      ) : null}
      {version.brandFactReferences.length > 0 || version.strategyReferences.length > 0 ? (
        <div className="content-filters" style={{ marginTop: 12 }}>
          {version.brandFactReferences.map((ref, index) => (
            <span className="chip" key={`fact-${index}`} style={{ borderColor: 'rgba(110,231,199,.25)', color: 'var(--accent)' }}>{ref}</span>
          ))}
          {version.strategyReferences.map((ref, index) => (
            <span className="chip" key={`strategy-${index}`} style={{ borderColor: 'rgba(139,124,255,.25)', color: '#b9adff' }}>{ref}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReviewsList({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) {
    return <p className="activity-meta" style={{ margin: 0 }}>No review activity yet.</p>;
  }
  return (
    <div className="activity-list">
      {reviews.map((review) => (
        <div className="activity-item" key={review.id}>
          <span className={`status-dot`} style={{ background: review.decision === 'approve' || review.decision === 'publish' || review.decision === 'schedule' ? 'var(--accent)' : review.decision === 'reject' ? '#f87171' : 'var(--accent-2)', marginTop: 5, flexShrink: 0 }} />
          <div className="activity-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span className="activity-title">{decisionLabel(review.decision)}</span>
              <span className="activity-meta">{timeAgo(review.createdAt)}</span>
            </div>
            {review.contentVersionId ? <div className="activity-meta" style={{ marginTop: 4 }}>Voted on the version in review at the time.</div> : null}
            {review.comment ? <div className="activity-meta" style={{ marginTop: 6, color: 'var(--text)', lineHeight: 1.5 }}>“{review.comment}”</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ContentDetail({ brandId }: { brandId: string }) {
  const [contentId, setContentId] = useState<string | null>(null);
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generatingRef = useRef(false);

  useEffect(() => {
    const segments = window.location.pathname.split('/').filter(Boolean);
    setContentId(segments[segments.length - 1] ?? null);
  }, []);

  const load = useCallback(async () => {
    if (!contentId) return;
    setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/content/${contentId}`, { cache: 'no-store' });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not load content');
      setData(body);
      setSelectedVersionId(body.item?.currentVersionId ?? null);
      if (body.item?.currentVersionId && generatingRef.current) {
        generatingRef.current = false;
        setGenerating(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load content');
    } finally {
      setLoading(false);
    }
  }, [brandId, contentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!generating) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (!pollRef.current) {
      pollRef.current = setInterval(() => {
        load();
      }, 2500);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [generating, load]);

  const generate = useCallback(async () => {
    if (!contentId) return;
    generatingRef.current = true;
    setGenerating(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/content/${contentId}/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok && response.status !== 409) throw new Error(body?.error || 'Could not start generation');
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not start generation');
      generatingRef.current = false;
      setGenerating(false);
    }
  }, [brandId, contentId, load]);

  const review = useCallback(async (action: string, comment?: string) => {
    if (!contentId) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/content/${contentId}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, comment: comment ?? null }),
      });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not update content status');
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update content status');
    } finally {
      setActionBusy(false);
    }
  }, [brandId, contentId, load]);

  const item = data?.item ?? null;
  const current = item ? (data?.versions.find((version) => version.id === item.currentVersionId) ?? null) : null;
  const selected = data?.versions.find((version) => version.id === selectedVersionId) ?? current ?? data?.versions[0] ?? null;
  const generatingLive = generating || (item?.status === 'IN_REVIEW' && current === null);
  const canGenerate = data?.canGenerate ?? false;

  return (
    <div className="grid" style={{ gap: 16 }}>
      {loading ? (
        <LoadingState label="Loading content…" />
      ) : error ? (
        <ErrorState message={error} />
      ) : !item ? (
        <EmptyState title="Content not found" description="This content item could not be loaded." />
      ) : (
        <>
          <div className="card">
            <div className="section-title" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div className="eyebrow">{contentTypeLabel(item.type)}{item.channel ? ` · ${channelLabel(item.channel)}` : ''}</div>
                <h2 style={{ margin: '5px 0' }}>{item.title}</h2>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className={`badge ${toneFor(item.status)}`}>{labelFor(item.status)}</span>
                {canGenerate ? (
                  <button type="button" className="badge" onClick={generate} disabled={generatingLive || item.status === 'ARCHIVED'} style={{ border: 0, cursor: generatingLive || item.status === 'ARCHIVED' ? 'not-allowed' : 'pointer', padding: '8px 12px', opacity: generatingLive || item.status === 'ARCHIVED' ? 0.6 : 1 }}>
                    {generating ? <><LoaderCircle size={14} className="spin" /> Generating…</> : current === null ? <><PlayCircle size={14} /> Generate content</> : <><RefreshCw size={14} /> Regenerate version</>}
                  </button>
                ) : null}
              </div>
            </div>
            <p className="subtitle" style={{ marginTop: 0 }}>
              Content is generated from the approved {item.strategyId ? 'strategy' : 'strategy and brand brain'} — every claim is traceable to approved brand intelligence. {generatingLive ? 'A new version will appear here when ready.' : ''}
            </p>
          </div>

          {actionError ? <div className="card" style={{ borderColor: 'rgba(239,68,68,.35)' }}><ErrorState message={actionError} /></div> : null}

          <div className="card">
            <div className="section-title">
              <div>
                <div className="eyebrow">Review workflow</div>
                <h2 style={{ margin: '5px 0' }}>Status: {labelFor(item.status)}</h2>
              </div>
              <FileText size={18} color="var(--muted)" />
            </div>
            <ReviewActions
              status={item.status}
              versionId={item.currentVersionId}
              canGenerate={canGenerate}
              canReview={data?.canReview ?? false}
              onAction={review}
              busy={actionBusy}
            />
            {generatingLive ? (
              <div style={{ marginTop: 14 }}>
                <div className="progress" style={{ animation: 'none' }}><span style={{ width: '65%' }} /></div>
                <div className="activity-meta" style={{ marginTop: 8 }}>Generating content from the approved strategy and brand brain. This usually takes under a minute.</div>
              </div>
            ) : null}
          </div>

          {canGenerate ? (
            <EditorPage
              brandId={brandId}
              item={item}
              onSaved={() => {
                load().then(() => setSelectedVersionId(null));
              }}
            />
          ) : null}

          {selected ? (
            <VersionView version={selected} current={selected.id === item.currentVersionId} />
          ) : (
            <EmptyState
              title="No version yet"
              description="This content item is still a brief. Generate a first version to start building copy from approved brand intelligence."
            />
          )}

          {(data?.versions.length ?? 0) > 1 ? (
            <div className="card">
              <div className="section-title">
                <div>
                  <div className="eyebrow">History</div>
                  <h2 style={{ margin: '5px 0' }}>All versions</h2>
                </div>
                <ChevronRight size={18} color="var(--muted)" />
              </div>
              <div className="activity-list">
                {data?.versions.map((version) => (
                  <button
                    type="button"
                    key={version.id}
                    onClick={() => setSelectedVersionId(version.id)}
                    className="activity-item"
                    style={{ width: '100%', textAlign: 'left', cursor: 'pointer', borderColor: version.id === selected?.id ? 'rgba(110,231,199,.35)' : undefined, background: version.id === selected?.id ? 'rgba(110,231,199,.04)' : undefined }}
                  >
                    <span className={`status-dot`} style={{ background: (version.metadata.manualEdit as boolean | undefined) ? '#fbbf24' : 'var(--accent)', marginTop: 5, flexShrink: 0 }} />
                    <div className="activity-body">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <span className="badge" style={{ color: 'inherit', borderColor: 'var(--line)', background: 'var(--panel-2)' }}>v{version.version}{version.id === item.currentVersionId ? ' · current' : ''}{version.metadata.manualEdit ? ' · manual' : ''}</span>
                        <span className="activity-meta">{timeAgo(version.createdAt)}</span>
                      </div>
                      <div className="activity-meta" style={{ marginTop: 6 }}>
                        {version.headline || '(untitled)'}
                        {version.model ? ` · ${version.model}` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="card">
            <div className="section-title">
              <div>
                <div className="eyebrow">Review log</div>
                <h2 style={{ margin: '5px 0' }}>Approvals & decisions</h2>
              </div>
              <Check size={18} color="var(--muted)" />
            </div>
            <ReviewsList reviews={data?.reviews ?? []} />
          </div>
        </>
      )}
    </div>
  );
}