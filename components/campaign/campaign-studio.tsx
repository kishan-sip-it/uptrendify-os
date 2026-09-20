'use client';

import { useCallback, useEffect, useState } from 'react';
import { Boxes, ChevronRight, LoaderCircle, Plus } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback';
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  type CampaignStatus,
} from '@/lib/campaign/schema';
import { allowedActionsFor } from '@/lib/campaign/lifecycle';

type StrategySummary = {
  objectives: string[];
  channelCount: number;
  hasKPIs: boolean;
} | null;

type CampaignStrategy = {
  id: string;
  title: string;
  version: number;
  status: string;
  outputSummary: StrategySummary;
} | null;

export type Campaign = {
  id: string;
  name: string;
  objective: string | null;
  description: string | null;
  status: CampaignStatus;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  currency: string;
  channels: string[];
  clientId: string | null;
  strategyId: string | null;
  strategy: CampaignStrategy;
  createdAt: string;
  updatedAt: string;
  contentCount?: number;
};

type StrategyOption = { id: string; title: string; version: number; status: string };

type ListData = {
  campaigns: Campaign[];
  total: number;
  strategyOptions: StrategyOption[];
  canManage: boolean;
  gate: { hasApprovedStrategy: boolean };
};

export function statusTone(status: CampaignStatus): string {
  if (status === 'ACTIVE' || status === 'COMPLETED') return 'tone-good';
  if (status === 'PLANNED') return 'tone-info';
  return 'tone-muted';
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

function formatBudget(value: number | null, currency: string): string {
  if (value === null) return 'Not set';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toLocaleString('en-US')} ${currency}`;
  }
}

type CampaignDraft = {
  name: string;
  objective: string;
  description: string;
  strategyId: string;
  startDate: string;
  endDate: string;
  budget: string;
  currency: string;
  channels: string[];
};

const EMPTY_DRAFT: CampaignDraft = {
  name: '',
  objective: '',
  description: '',
  strategyId: '',
  startDate: '',
  endDate: '',
  budget: '',
  currency: 'USD',
  channels: [],
};

function CreateForm({
  brandId,
  strategyOptions,
  onCreated,
}: {
  brandId: string;
  strategyOptions: StrategyOption[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CampaignDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));

  const toggleChannel = (channel: string) => {
    setDraft((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((entry) => entry !== channel)
        : [...prev.channels, channel],
    }));
  };

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { name: draft.name.trim(), strategyId: draft.strategyId };
      if (draft.objective.trim()) payload.objective = draft.objective.trim();
      if (draft.description.trim()) payload.description = draft.description.trim();
      if (draft.startDate) payload.startDate = draft.startDate;
      if (draft.endDate) payload.endDate = draft.endDate;
      if (draft.budget.trim() && Number.isFinite(Number(draft.budget))) payload.budget = Number(draft.budget);
      if (draft.currency.trim()) payload.currency = draft.currency.trim();
      if (draft.channels.length > 0) payload.channels = draft.channels;

      const response = await fetch(`/api/brands/${brandId}/campaigns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not create campaign');
      setOpen(false);
      setDraft(EMPTY_DRAFT);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create campaign');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="badge" onClick={() => setOpen(true)} disabled={!strategyOptions.length || busy} style={{ border: 0, cursor: strategyOptions.length ? 'pointer' : 'not-allowed', padding: '8px 12px', opacity: strategyOptions.length ? 1 : 0.5 }}>
        <Plus size={14} /> New campaign
      </button>
    );
  }

  return (
    <div className="card content-form">
      <div className="eyebrow" style={{ color: 'var(--accent-2)' }}>New campaign</div>
      {strategyOptions.length === 0 ? (
        <ErrorState message="An approved strategy is required before a campaign can be created." />
      ) : null}
      <label>Campaign name
        <input value={draft.name} onChange={(event) => set('name', event.target.value)} placeholder="e.g. Summer Growth" />
      </label>
      <label>Approved strategy
        <select value={draft.strategyId} onChange={(event) => set('strategyId', event.target.value)}>
          <option value="">Select a strategy…</option>
          {strategyOptions.map((strategy) => (
            <option key={strategy.id} value={strategy.id}>
              {strategy.title} · v{strategy.version}
            </option>
          ))}
        </select>
      </label>
      <label>Objective (optional)
        <input value={draft.objective} onChange={(event) => set('objective', event.target.value)} placeholder="What should this campaign achieve?" />
      </label>
      <label>Description (optional)
        <textarea value={draft.description} onChange={(event) => set('description', event.target.value)} placeholder="Planning notes, hypotheses, scope" />
      </label>
      <div className="content-form-row">
        <label>Start date
          <input type="date" value={draft.startDate} onChange={(event) => set('startDate', event.target.value)} />
        </label>
        <label>End date
          <input type="date" value={draft.endDate} onChange={(event) => set('endDate', event.target.value)} />
        </label>
      </div>
      <div className="content-form-row">
        <label>Budget (optional)
          <input type="number" inputMode="decimal" step="0.01" min="0" value={draft.budget} onChange={(event) => set('budget', event.target.value)} placeholder="e.g. 25000" />
        </label>
        <label>Currency
          <input value={draft.currency} maxLength={3} onChange={(event) => set('currency', event.target.value.toUpperCase())} placeholder="USD" />
        </label>
      </div>
      <label>Channels (optional)
        <div className="chip-row">
          {CAMPAIGN_CHANNELS.map((channel) => (
            <button
              type="button"
              key={channel}
              className={`chip chip-toggle${draft.channels.includes(channel) ? ' chip-toggle-active' : ''}`}
              onClick={() => toggleChannel(channel)}
            >
              {CAMPAIGN_CHANNEL_LABELS[channel]}
            </button>
          ))}
        </div>
      </label>
      {error ? <ErrorState message={error} /> : null}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="badge"
          onClick={submit}
          disabled={busy || !draft.name.trim() || !draft.strategyId || !strategyOptions.length}
          style={{ border: 0, cursor: busy ? 'not-allowed' : 'pointer', padding: '9px 14px', opacity: busy || !draft.name.trim() || !draft.strategyId ? 0.6 : 1 }}
        >
          {busy ? <><LoaderCircle size={14} className="spin" /> Creating…</> : <><Plus size={14} /> Create campaign</>}
        </button>
        <button type="button" className="badge tone-muted" onClick={() => setOpen(false)} style={{ border: 0, cursor: 'pointer', padding: '9px 14px' }}>Cancel</button>
      </div>
    </div>
  );
}

export function CampaignStudio({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (channelFilter) params.set('channel', channelFilter);
      if (query) params.set('q', query);
      const encoded = params.toString();
      const response = await fetch(`/api/brands/${brandId}/campaigns${encoded ? `?${encoded}` : ''}`, { cache: 'no-store' });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not load campaigns');
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load campaigns');
    } finally {
      setLoading(false);
    }
  }, [brandId, statusFilter, channelFilter, query]);

  useEffect(() => {
    load();
  }, [load]);

  const canCreate = Boolean(data?.gate.hasApprovedStrategy);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="section-title" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="eyebrow">Campaigns</div>
            <h2 style={{ margin: '5px 0' }}>{brandName} campaign workspace</h2>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <CreateForm brandId={brandId} strategyOptions={data?.strategyOptions ?? []} onCreated={load} />
          </div>
        </div>
        <p className="subtitle" style={{ marginTop: 0 }}>
          Plan and run campaigns grounded in the approved strategy — budget, dates, channels and lifecycle.
        </p>
        <div className="content-filters" style={{ marginTop: 14 }}>
          <input className="content-filter-input" placeholder="Search by name…" value={query} onChange={(event) => setQuery(event.target.value)} style={{ minWidth: 180 }} />
          <select className="content-filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All statuses</option>
            {CAMPAIGN_STATUSES.map((status) => <option key={status} value={status}>{CAMPAIGN_STATUS_LABELS[status]}</option>)}
          </select>
          <select className="content-filter-select" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
            <option value="">All channels</option>
            {CAMPAIGN_CHANNELS.map((channel) => <option key={channel} value={channel}>{CAMPAIGN_CHANNEL_LABELS[channel]}</option>)}
          </select>
        </div>
      </div>

      {!canCreate && !loading && !error ? (
        <div className="card" style={{ borderColor: 'rgba(139,124,255,.35)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span className="status-dot" style={{ background: 'var(--accent-2)', marginTop: 5, flexShrink: 0 }} />
            <div>
              <div className="activity-title">Campaigns need an approved strategy</div>
              <p className="activity-meta" style={{ marginTop: 6, lineHeight: 1.5, maxWidth: 720 }}>
                Campaigns are grounded in the approved strategy for {brandName}. Generate and approve a strategy to unlock campaign planning.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="card" style={{ borderColor: 'rgba(239,68,68,.35)' }}><ErrorState message={error} /></div> : null}

      {loading ? (
        <LoadingState label="Loading campaigns…" />
      ) : error ? null : !data || data.campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create a campaign grounded in the approved strategy — add objectives, budget, dates and channels, then move it into planning."
          action={canCreate && data?.canManage ? <CreateForm brandId={brandId} strategyOptions={data?.strategyOptions ?? []} onCreated={load} /> : undefined}
        />
      ) : (
        <div className="grid" style={{ gap: 12 }}>
          {data.campaigns.map((campaign) => (
            <a className="card hover-lift content-item" href={`/brands/${brandId}/campaigns/${campaign.id}`} key={campaign.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="status-dot" style={{ background: campaign.status === 'ACTIVE' ? 'var(--accent)' : campaign.status === 'COMPLETED' || campaign.status === 'PLANNED' ? 'var(--accent-2)' : 'var(--muted)', marginTop: 1 }} />
                    <span className="activity-title">{campaign.name}</span>
                  </div>
                  <div className="content-filters" style={{ marginTop: 8 }}>
                    <span className={`badge ${statusTone(campaign.status)}`}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</span>
                    {campaign.strategy ? <span className="chip">Strategy v{campaign.strategy.version}</span> : null}
                    {campaign.channels.length > 0 ? <span className="chip">{campaign.channels.length} channel{campaign.channels.length === 1 ? '' : 's'}</span> : null}
                    {campaign.budget !== null ? <span className="chip">{formatBudget(campaign.budget, campaign.currency)}</span> : null}
                  </div>
                </div>
                <ChevronRight size={16} color="var(--muted)" style={{ flexShrink: 0 }} />
              </div>
              <div className="content-item-footer">
                <span className="activity-meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Boxes size={13} /> {campaign.contentCount ?? 0} content item{campaign.contentCount === 1 ? '' : 's'}
                </span>
                <span className="activity-meta">Created {timeAgo(campaign.createdAt)}</span>
              </div>
            </a>
          ))}
          {data.total > data.campaigns.length ? (
            <p className="activity-meta" style={{ textAlign: 'center', margin: 0, padding: 8 }}>Showing {data.campaigns.length} of {data.total}. Refine filters to narrow results.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}