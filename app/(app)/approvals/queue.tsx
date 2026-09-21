'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, Search } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback';
import { CONTENT_STATUS_LABELS, channelLabel, contentTypeLabel } from '@/lib/content/schema';
import { QUEUE_STATUSES } from '@/lib/publish/schema';

type QueueReview = {
  id: string;
  decision: string;
  comment: string | null;
  reviewerId: string | null;
  contentVersionId: string | null;
  createdAt: string;
};

type CurrentVersion = {
  id: string;
  version: number;
  headline: string;
  bodyPreview: string;
  provider: string | null;
  model: string | null;
  createdAt: string;
} | null;

type QueueItem = {
  id: string;
  brandId: string;
  brandName: string | null;
  clientName: string | null;
  campaignName: string | null;
  type: string;
  title: string;
  status: string;
  channel: string | null;
  currentVersion: CurrentVersion;
  reviews: QueueReview[];
  createdAt: string;
  updatedAt: string;
};

type QueueResponse = {
  ok: boolean;
  items: QueueItem[];
  total: number;
  page: number;
  limit: number;
  canApprove: boolean;
  canPublish: boolean;
};

function statusTone(status: string): string {
  switch (status) {
    case 'READY_TO_PUBLISH':
    case 'CLIENT_REVIEW':
    case 'IN_REVIEW':
      return 'tone-info';
    case 'APPROVED':
      return 'tone-good';
    default:
      return 'tone-muted';
  }
}

function labelFor(status: string): string {
  return CONTENT_STATUS_LABELS[status as keyof typeof CONTENT_STATUS_LABELS] ?? status.toLowerCase().replaceAll('_', ' ');
}

function decisionLabel(decision: string): string {
  return (
    {
      submit: 'Submitted for review',
      approve: 'Approved',
      reject: 'Rejected',
      changes_requested: 'Changes requested',
      return_to_draft: 'Returned to draft',
      archive: 'Archived',
      queue_for_publish: 'Queued for publishing',
      back_to_approved: 'Returned to approved',
    }[decision] ?? decision.replaceAll('_', ' ')
  );
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ApprovalsQueue() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async (resetPage: boolean, pageToLoad: number, queryToUse: string, statusToUse: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(pageToLoad));
      params.set('limit', '30');
      if (queryToUse.trim()) params.set('q', queryToUse.trim());
      if (statusToUse) params.set('status', statusToUse);
      const response = await fetch(`/api/approvals?${params.toString()}`, { cache: 'no-store' });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = (await response.json().catch(() => null)) as QueueResponse | null;
      if (!response.ok || !body?.ok) throw new Error((body as { error?: string } | null)?.error || 'Could not load the approval queue');
      if (resetPage) {
        setData(body);
        setPage(1);
      } else {
        setData((previous) =>
          previous ? { ...body, items: [...previous.items, ...body.items] } : body,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the approval queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true, 1, '', '');
  }, [load]);

  function applyFilters() {
    load(true, 1, query, status);
  }

  async function run(action: 'approve' | 'changes_requested' | 'reject' | 'queue_for_publish' | 'back_to_approved' | 'publish', item: QueueItem) {
    setBusyId(item.id);
    setError(null);
    try {
      const url =
        action === 'publish'
          ? `/api/brands/${item.brandId}/content/${item.id}/publish`
          : `/api/brands/${item.brandId}/content/${item.id}/review`;
      const body =
        action === 'publish'
          ? JSON.stringify({ channel: item.channel })
          : JSON.stringify({ action });
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || 'The action could not be completed');
      load(true, 1, query, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The action could not be completed');
    } finally {
      setBusyId(null);
    }
  }

  const items = data?.items ?? [];
  const hasMore = (data?.total ?? 0) > items.length;

  return (
    <div>
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              className="content-filter-input"
              style={{ paddingLeft: 30, width: '100%' }}
              placeholder="Search titles…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyFilters();
              }}
            />
          </div>
          <select
            className="content-filter-input"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              load(true, 1, query, event.target.value);
            }}
            style={{ minWidth: 180 }}
          >
            <option value="">All statuses</option>
            {QUEUE_STATUSES.map((value) => (
              <option key={value} value={value}>{labelFor(value)}</option>
            ))}
          </select>
          <button type="button" className="badge" onClick={applyFilters} style={{ border: 0, cursor: 'pointer', padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Apply
          </button>
          <span className="metric-label">{data ? `${data.total} ${data.total === 1 ? 'item' : 'items'}` : ''}</span>
        </div>
      </div>

      {error ? (
        <div className="card" style={{ marginTop: 14, borderColor: 'rgba(239,68,68,.35)' }}>
          <ErrorState message={error} />
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div style={{ marginTop: 14 }}>
          <LoadingState label="Loading the approval queue…" />
        </div>
      ) : null}

      {!loading && items.length === 0 && !error ? (
        <div style={{ marginTop: 14 }}>
          <EmptyState
            title="Nothing awaiting approval"
            description="Content the organization has submitted for review or queued for publishing will appear here."
          />
        </div>
      ) : null}

      {items.map((item) => (
        <div key={item.id} className="card" style={{ marginTop: 14, padding: '18px 20px' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={`badge ${statusTone(item.status)}`}>{labelFor(item.status)}</span>
            <span className="metric-label">
              {item.clientName ? `${item.clientName} · ` : ''}
              {item.brandName ?? 'Brand'}
              {item.campaignName ? ` · campaign: ${item.campaignName}` : ''}
            </span>
            <span className="metric-label">{contentTypeLabel(item.type)}{item.channel ? ` · ${channelLabel(item.channel)}` : ''}</span>
            <span className="activity-meta" style={{ marginLeft: 'auto' }}>updated {timeAgo(item.updatedAt)}</span>
          </div>

          <a href={`/brands/${item.brandId}/content/${item.id}`} style={{ display: 'block', marginTop: 12, color: 'inherit', textDecoration: 'none' }}>
            <h3 style={{ margin: 0, fontWeight: 650 }}>{item.title}</h3>
          </a>

          {item.currentVersion ? (
            <div className="card" style={{ marginTop: 12, padding: '14px 16px', background: 'var(--panel-2)' }}>
              <div className="activity-meta" style={{ marginBottom: 6 }}>
                v{item.currentVersion.version}
                {item.currentVersion.model ? ` · ${item.currentVersion.model}` : ''}
                {item.currentVersion.headline ? ` · ${item.currentVersion.headline}` : ''}
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{item.currentVersion.bodyPreview || '(empty version body)'}</p>
            </div>
          ) : (
            <p className="subtitle" style={{ marginTop: 10 }}>No generated version exists yet.</p>
          )}

          {item.reviews.length > 0 ? (
            <div className="activity-list" style={{ marginTop: 12 }}>
              {item.reviews.map((review) => (
                <div className="activity-item" key={review.id}>
                  <span className="status-dot" style={{ background: review.decision === 'approve' || review.decision === 'queue_for_publish' ? 'var(--accent)' : review.decision === 'reject' ? '#f87171' : 'var(--accent-2)', marginTop: 5, flexShrink: 0 }} />
                  <div className="activity-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <span className="activity-title">{decisionLabel(review.decision)}</span>
                      <span className="activity-meta">{timeAgo(review.createdAt)}</span>
                    </div>
                    {review.comment ? <div className="activity-meta" style={{ marginTop: 4 }}>“{review.comment}”</div> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            {(data?.canApprove ?? false) ? (
              <>
                {['IN_REVIEW', 'CLIENT_REVIEW'].includes(item.status) ? (
                  <>
                    <button type="button" className="badge tone-good" disabled={busyId === item.id} onClick={() => run('approve', item)} style={{ border: 0, cursor: busyId === item.id ? 'not-allowed' : 'pointer', padding: '8px 12px', opacity: busyId === item.id ? 0.6 : 1 }}>
                      Approve
                    </button>
                    <button type="button" className="badge tone-info" disabled={busyId === item.id} onClick={() => run('changes_requested', item)} style={{ border: 0, cursor: busyId === item.id ? 'not-allowed' : 'pointer', padding: '8px 12px', opacity: busyId === item.id ? 0.6 : 1 }}>
                      Request changes
                    </button>
                    <button type="button" className="badge tone-danger" disabled={busyId === item.id} onClick={() => run('reject', item)} style={{ border: 0, cursor: busyId === item.id ? 'not-allowed' : 'pointer', padding: '8px 12px', opacity: busyId === item.id ? 0.6 : 1 }}>
                      Reject
                    </button>
                  </>
                ) : null}
                {item.status === 'APPROVED' ? (
                  <button type="button" className="badge tone-good" disabled={busyId === item.id} onClick={() => run('queue_for_publish', item)} style={{ border: 0, cursor: busyId === item.id ? 'not-allowed' : 'pointer', padding: '8px 12px', opacity: busyId === item.id ? 0.6 : 1 }}>
                    Queue for publishing
                  </button>
                ) : null}
                {item.status === 'READY_TO_PUBLISH' ? (
                  <button type="button" className="badge tone-info" disabled={busyId === item.id} onClick={() => run('back_to_approved', item)} style={{ border: 0, cursor: busyId === item.id ? 'not-allowed' : 'pointer', padding: '8px 12px', opacity: busyId === item.id ? 0.6 : 1 }}>
                    Back to approved
                  </button>
                ) : null}
              </>
            ) : null}
            {item.status === 'READY_TO_PUBLISH' && (data?.canPublish ?? false) ? (
              <button type="button" className="badge tone-good" disabled={busyId === item.id || !item.channel} onClick={() => run('publish', item)} style={{ border: 0, cursor: busyId === item.id ? 'not-allowed' : 'pointer', padding: '8px 12px', opacity: busyId === item.id || !item.channel ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Check size={13} /> {item.channel ? `Publish to ${channelLabel(item.channel)}` : 'Publish'}
              </button>
            ) : null}
            <a className="badge" href={`/brands/${item.brandId}/content/${item.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, padding: '8px 12px', textDecoration: 'none' }}>
              Open content
            </a>
          </div>
        </div>
      ))}

      {hasMore ? (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button type="button" className="badge" onClick={() => load(false, page + 1, query, status)} disabled={loading} style={{ border: 0, cursor: loading ? 'not-allowed' : 'pointer', padding: '9px 16px', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </div>
  );
}