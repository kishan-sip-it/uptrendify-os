'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, FileText, LoaderCircle, Plus } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback';
import {
  CONTENT_CHANNELS,
  CONTENT_TYPES,
  contentTypeLabel,
  channelLabel,
  type ContentIntentLike,
  type ContentStatus,
} from '@/lib/content/schema';

type CurrentVersion = {
  version: number;
  headline: string | null;
  bodyPreview: string;
  provider: string | null;
  model: string | null;
  createdAt: string;
} | null;

type ContentItem = {
  id: string;
  type: string;
  title: string;
  status: ContentStatus;
  channel: string | null;
  topic: string | null;
  clientId: string | null;
  createdAt: string;
  updatedAt: string;
  currentVersion: CurrentVersion;
  versionCount: number;
};

type Gate = {
  ok: boolean;
  code: string | null;
  message: string;
  counts: { suggestions: number; approved: number; missing: string[] };
  strategyReady: boolean;
};

type ListData = {
  items: ContentItem[];
  total: number;
  gate: Gate;
  canGenerate: boolean;
  canReview: boolean;
};

const STATUS_OPTIONS = ['DRAFT', 'IN_REVIEW', 'CLIENT_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'];

function toneFor(status: string): string {
  switch (status) {
    case 'APPROVED':
    case 'PUBLISHED':
    case 'SCHEDULED':
      return 'tone-good';
    case 'REJECTED': // fallthrough
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

type DraftIntent = ContentIntentLike & { clientId?: string | null; campaignId?: string | null };

const EMPTY_INTENT: DraftIntent = {
  type: 'social_post',
  channel: 'linkedin',
  title: '',
  objective: '',
  audience: '',
  context: '',
  tone: '',
  cta: '',
  instructions: '',
  campaignId: '',
};

function CreateForm({ brandId, onCreated }: { brandId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<DraftIntent>(EMPTY_INTENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaignOptions, setCampaignOptions] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/brands/${brandId}/campaigns?limit=100`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled) setCampaignOptions((body?.campaigns ?? []).map((campaign: { id: string; name: string }) => ({ id: campaign.id, name: campaign.name })));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, brandId]);

  const set = <K extends keyof DraftIntent>(key: K, value: DraftIntent[K]) => setIntent((prev) => ({ ...prev, [key]: value }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const optionalKeys = ['objective', 'audience', 'context', 'tone', 'cta', 'instructions', 'clientId'] as const;
      const payload: Record<string, string> = {
        type: intent.type,
        channel: intent.channel,
        title: intent.title.trim(),
      };
      for (const key of optionalKeys) {
        const value = intent[key];
        if (typeof value === 'string' && value.trim()) payload[key] = value.trim();
      }
      if (intent.campaignId) payload.campaignId = intent.campaignId;
      const response = await fetch(`/api/brands/${brandId}/content`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not create content item');
      setOpen(false);
      setIntent(EMPTY_INTENT);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create content item');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {open ? (
        <div className="card content-form">
          <div className="eyebrow" style={{ color: 'var(--accent-2)' }}>New content</div>
          <div className="content-form-row">
            <label>Type
              <select value={intent.type} onChange={(event) => set('type', event.target.value)}>
                {CONTENT_TYPES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
              </select>
            </label>
            <label>Channel
              <select value={intent.channel} onChange={(event) => set('channel', event.target.value)}>
                {CONTENT_CHANNELS.map((channel) => <option key={channel} value={channel}>{channelLabel(channel)}</option>)}
              </select>
            </label>
          </div>
          <label>Title / topic
            <input value={intent.title} onChange={(event) => set('title', event.target.value)} placeholder="e.g. Win back ICP accounts with a faster brand POV" />
          </label>
          <label>Objective (optional)
            <input value={intent.objective ?? ''} onChange={(event) => set('objective', event.target.value)} placeholder="What should this content achieve?" />
          </label>
          <label>Audience (optional)
            <input value={intent.audience ?? ''} onChange={(event) => set('audience', event.target.value)} placeholder="Who is this for?" />
          </label>
          <label>Campaign / context (optional)
            <textarea value={intent.context ?? ''} onChange={(event) => set('context', event.target.value)} placeholder="Launch, campaign, season, context the model should know" />
          </label>
          <label>Link to a campaign (optional)
            <select value={intent.campaignId ?? ''} onChange={(event) => set('campaignId', event.target.value || undefined)}>
              <option value="">No campaign</option>
              {campaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
          </label>
          <label>Tone / style (optional)
            <input value={intent.tone ?? ''} onChange={(event) => set('tone', event.target.value)} placeholder="e.g. confident, evidence-first" />
          </label>
          <label>CTA direction (optional)
            <input value={intent.cta ?? ''} onChange={(event) => set('cta', event.target.value)} placeholder="e.g. book a demo" />
          </label>
          <label>Additional instructions (optional)
            <textarea value={intent.instructions ?? ''} onChange={(event) => set('instructions', event.target.value)} placeholder="Anything the model must respect" />
          </label>
          {error ? <ErrorState message={error} /> : null}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="badge" onClick={submit} disabled={busy || !intent.title.trim()} style={{ border: 0, cursor: busy ? 'not-allowed' : 'pointer', padding: '9px 14px', opacity: busy || !intent.title.trim() ? 0.6 : 1 }}>
              {busy ? <><LoaderCircle size={14} className="spin" /> Creating…</> : <><Plus size={14} /> Create content brief</>}
            </button>
            <button type="button" className="badge tone-muted" onClick={() => setOpen(false)} style={{ border: 0, cursor: 'pointer', padding: '9px 14px' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="badge" onClick={() => setOpen(true)} style={{ border: 0, cursor: 'pointer', padding: '8px 12px' }}>
          <Plus size={14} /> New content
        </button>
      )}
    </div>
  );
}

export function ContentStudio({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      if (channelFilter) params.set('channel', channelFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (query) params.set('q', query);
      const encoded = params.toString();
      const response = await fetch(`/api/brands/${brandId}/content${encoded ? `?${encoded}` : ''}`, { cache: 'no-store' });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not load content');
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load content');
    } finally {
      setLoading(false);
    }
  }, [brandId, typeFilter, channelFilter, statusFilter, query]);

  useEffect(() => {
    load();
  }, [load]);

  const gate = data?.gate;
  const gateBlocked = gate && !gate.ok;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="section-title" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="eyebrow">Content Studio</div>
            <h2 style={{ margin: '5px 0' }}>{brandName} content workspace</h2>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <CreateForm brandId={brandId} onCreated={load} />
          </div>
        </div>
        <p className="subtitle" style={{ marginTop: 0 }}>
          Draft and generate on-brand marketing content, grounded in the approved Brand Brain and approved marketing strategy.
        </p>
        <div className="content-filters" style={{ marginTop: 14 }}>
          <input className="content-filter-input" placeholder="Search by title…" value={query} onChange={(event) => setQuery(event.target.value)} style={{ minWidth: 180 }} />
          <select className="content-filter-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">All types</option>
            {CONTENT_TYPES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
          <select className="content-filter-select" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
            <option value="">All channels</option>
            {CONTENT_CHANNELS.map((channel) => <option key={channel} value={channel}>{channelLabel(channel)}</option>)}
          </select>
          <select className="content-filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{labelFor(status)}</option>)}
          </select>
        </div>
      </div>

      {gateBlocked ? (
        <div className="card" style={{ borderColor: 'rgba(139,124,255,.35)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span className="status-dot" style={{ background: 'var(--accent-2)', marginTop: 5, flexShrink: 0 }} />
            <div>
              <div className="activity-title">Content generation is gated</div>
              <p className="activity-meta" style={{ marginTop: 6, lineHeight: 1.5, maxWidth: 720 }}>{gate?.message}</p>
              <div className="content-filters" style={{ marginTop: 8 }}>
                <span className="chip">Brain suggestions {gate?.counts.suggestions ?? 0}</span>
                <span className="chip">Approved {gate?.counts.approved ?? 0}</span>
                <span className="chip">Strategy ready {gate?.strategyReady ? 'yes' : 'no'}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="card" style={{ borderColor: 'rgba(239,68,68,.35)' }}><ErrorState message={error} /></div> : null}

      {loading ? (
        <LoadingState label="Loading content…" />
      ) : error ? null : !data || data.items.length === 0 ? (
        <EmptyState
          title="No content yet"
          description="Create a content brief — channel, audience, tone and intent — then generate on-brand copy grounded in your approved strategy and brand brain."
          action={data?.canGenerate ? <CreateForm brandId={brandId} onCreated={load} /> : undefined}
        />
      ) : (
        <div className="grid" style={{ gap: 12 }}>
          {data.items.map((item) => (
            <a className="card hover-lift content-item" href={`/brands/${brandId}/content/${item.id}`} key={item.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="status-dot" style={{ background: item.status === 'APPROVED' || item.status === 'PUBLISHED' || item.status === 'SCHEDULED' ? 'var(--accent)' : item.status === 'ARCHIVED' ? 'var(--muted)' : 'var(--accent-2)', marginTop: 1 }} />
                    <span className="activity-title">{item.title}</span>
                  </div>
                  <div className="content-filters" style={{ marginTop: 8 }}>
                    <span className="chip">{contentTypeLabel(item.type)}</span>
                    {item.channel ? <span className="chip">{channelLabel(item.channel)}</span> : null}
                    {item.currentVersion ? <span className="chip">v{item.currentVersion.version}</span> : null}
                    <span className={`badge ${toneFor(item.status)}`}>{labelFor(item.status)}</span>
                  </div>
                </div>
                <ChevronRight size={16} color="var(--muted)" style={{ flexShrink: 0 }} />
              </div>
              {item.currentVersion ? (
                <div className="content-item-preview">{item.currentVersion.headline || item.title}</div>
              ) : (
                <div className="activity-meta">Draft brief only — generate a first version.</div>
              )}
              <div className="content-item-footer">
                <span className="activity-meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <FileText size={13} /> {item.versionCount} version{item.versionCount === 1 ? '' : 's'}
                </span>
                <span className="activity-meta">Updated {timeAgo(item.updatedAt)}</span>
              </div>
            </a>
          ))}
          {data.total > data.items.length ? (
            <p className="activity-meta" style={{ textAlign: 'center', margin: 0, padding: 8 }}>Showing {data.items.length} of {data.total}. Refine filters to narrow results.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}