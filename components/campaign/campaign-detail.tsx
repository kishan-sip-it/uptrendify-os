'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, FileText, LoaderCircle, Pencil, X } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback';
import {
  CAMPAIGN_ACTION_LABELS,
  CAMPAIGN_ACTION_HINTS,
  allowedActionsFor,
  type CampaignStatusAction,
} from '@/lib/campaign/lifecycle';
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_STATUS_LABELS,
  type CampaignStatus,
} from '@/lib/campaign/schema';
import { statusTone } from '@/components/campaign/campaign-studio';
import type { Campaign } from '@/components/campaign/campaign-studio';

type ContentRef = {
  id: string;
  type: string;
  title: string;
  status: string;
  channel: string | null;
  createdAt: string;
  updatedAt: string;
};

type DetailData = {
  campaign: Campaign;
  content: ContentRef[];
  canManage: boolean;
};

function formatBudget(value: number | null, currency: string): string {
  if (value === null) return 'Not set';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toLocaleString('en-US')} ${currency}`;
  }
}

function formatDate(value: string | null): string {
  if (!value) return 'Not set';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function EditForm({
  brandId,
  campaignId,
  campaign,
  onSaved,
  onCancel,
}: {
  brandId: string;
  campaignId: string;
  campaign: Campaign;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(campaign.name);
  const [objective, setObjective] = useState(campaign.objective ?? '');
  const [description, setDescription] = useState(campaign.description ?? '');
  const [startDate, setStartDate] = useState(campaign.startDate ?? '');
  const [endDate, setEndDate] = useState(campaign.endDate ?? '');
  const [budget, setBudget] = useState(campaign.budget === null ? '' : String(campaign.budget));
  const [currency, setCurrency] = useState(campaign.currency);
  const [channels, setChannels] = useState<string[]>(campaign.channels);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleChannel = (channel: string) => {
    setChannels((prev) =>
      prev.includes(channel) ? prev.filter((entry) => entry !== channel) : [...prev, channel],
    );
  };

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { name: name.trim() };
      if (objective.trim() !== (campaign.objective ?? '')) payload.objective = objective.trim() || null;
      if (description.trim() !== (campaign.description ?? '')) payload.description = description.trim() || null;
      if (startDate !== (campaign.startDate ?? '')) payload.startDate = startDate || null;
      if (endDate !== (campaign.endDate ?? '')) payload.endDate = endDate || null;
      const numericBudget = budget.trim() ? Number(budget) : null;
      if ((numericBudget ?? null) !== (campaign.budget ?? null)) payload.budget = numericBudget;
      if (currency.trim().toUpperCase() !== campaign.currency) payload.currency = currency.trim().toUpperCase() || 'USD';
      const normalizedChannels = channels.map((channel) => channel as (typeof CAMPAIGN_CHANNELS)[number]);
      if (String(normalizedChannels) !== String(campaign.channels)) payload.channels = normalizedChannels;

      if (Object.keys(payload).length === 0) {
        setError('No changes to save');
        return;
      }

      const response = await fetch(`/api/brands/${brandId}/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not save campaign');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save campaign');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card content-form">
      <div className="eyebrow" style={{ color: 'var(--accent-2)' }}>Edit campaign</div>
      <label>Campaign name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>Objective (optional)
        <input value={objective} onChange={(event) => setObjective(event.target.value)} />
      </label>
      <label>Description (optional)
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <div className="content-form-row">
        <label>Start date
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label>End date
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
      </div>
      <div className="content-form-row">
        <label>Budget (optional)
          <input type="number" inputMode="decimal" step="0.01" min="0" value={budget} onChange={(event) => setBudget(event.target.value)} />
        </label>
        <label>Currency
          <input value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} />
        </label>
      </div>
      <label>Channels
        <div className="chip-row">
          {CAMPAIGN_CHANNELS.map((channel) => (
            <button
              type="button"
              key={channel}
              className={`chip chip-toggle${channels.includes(channel) ? ' chip-toggle-active' : ''}`}
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
          disabled={busy || !name.trim()}
          style={{ border: 0, cursor: busy ? 'not-allowed' : 'pointer', padding: '9px 14px', opacity: busy || !name.trim() ? 0.6 : 1 }}
        >
          {busy ? <><LoaderCircle size={14} className="spin" /> Saving…</> : 'Save changes'}
        </button>
        <button type="button" className="badge tone-muted" onClick={onCancel} disabled={busy} style={{ border: 0, cursor: 'pointer', padding: '9px 14px' }}>Cancel</button>
      </div>
    </div>
  );
}

export function CampaignDetail({
  brandId,
  brandName,
  campaignId,
}: {
  brandId: string;
  brandName: string;
  campaignId: string;
}) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<CampaignStatusAction | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/campaigns/${campaignId}`, { cache: 'no-store' });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not load campaign');
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load campaign');
    } finally {
      setLoading(false);
    }
  }, [brandId, campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(action: CampaignStatusAction) {
    setActionBusy(action);
    setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/campaigns/${campaignId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not update campaign status');
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update campaign status');
    } finally {
      setActionBusy(null);
    }
  }

  if (loading) return <LoadingState label="Loading campaign…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <EmptyState title="Campaign unavailable" />;

  const { campaign, content, canManage } = data;
  const actions = allowedActionsFor(campaign.status);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="section-title" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="eyebrow">Campaign</div>
            <h2 style={{ margin: '5px 0' }}>{campaign.name}</h2>
            <div className="content-filters" style={{ marginTop: 8 }}>
              <span className={`badge ${statusTone(campaign.status)}`}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</span>
              {campaign.strategy ? <span className="chip">Strategy v{campaign.strategy.version}</span> : null}
              {campaign.channels.length > 0 ? <span className="chip">{campaign.channels.length} channel{campaign.channels.length === 1 ? '' : 's'}</span> : null}
            </div>
          </div>
          {canManage ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="badge"
                onClick={() => { setEditing((value) => !value); setError(null); }}
                style={{ border: 0, cursor: 'pointer', padding: '8px 12px' }}
              >
                {editing ? <><X size={14} /> Close editor</> : <><Pencil size={14} /> Edit campaign</>}
              </button>
            </div>
          ) : null}
        </div>
        {canManage && actions.length > 0 ? (
          <div className="content-filters" style={{ marginTop: 14 }}>
            {actions.map((action) => (
              <button
                type="button"
                key={action}
                className="badge"
                onClick={() => runAction(action)}
                disabled={actionBusy !== null}
                title={CAMPAIGN_ACTION_HINTS[action]}
                style={{ border: 0, cursor: actionBusy ? 'not-allowed' : 'pointer', padding: '8px 12px' }}
              >
                {actionBusy === action ? <><LoaderCircle size={14} className="spin" /> Working…</> : CAMPAIGN_ACTION_LABELS[action]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <div className="card" style={{ borderColor: 'rgba(239,68,68,.35)' }}><ErrorState message={error} /></div> : null}

      {editing ? (
        <EditForm
          brandId={brandId}
          campaignId={campaignId}
          campaign={campaign}
          onSaved={() => { setEditing(false); load(); }}
          onCancel={() => setEditing(false)}
        />
      ) : null}

      <div className="grid" style={{ gap: 12 }}>
        <div className="card">
          <div className="eyebrow">Planning</div>
          <h3 style={{ margin: '6px 0 10px' }}>Campaign plan</h3>
          <dl className="detail-list">
            <div className="detail-row">
              <dt>Objective</dt>
              <dd>{campaign.objective || 'Not set'}</dd>
            </div>
            <div className="detail-row">
              <dt>Description</dt>
              <dd>{campaign.description || 'Not set'}</dd>
            </div>
            <div className="detail-row">
              <dt>Window</dt>
              <dd>{formatDate(campaign.startDate)} → {formatDate(campaign.endDate)}</dd>
            </div>
            <div className="detail-row">
              <dt>Budget</dt>
              <dd>{formatBudget(campaign.budget, campaign.currency)}</dd>
            </div>
            <div className="detail-row">
              <dt>Channels</dt>
              <dd>
                {campaign.channels.length > 0 ? (
                  <span className="chip-row">
                    {campaign.channels.map((channel) => (
                      <span className="chip" key={channel}>{CAMPAIGN_CHANNEL_LABELS[channel] ?? channel}</span>
                    ))}
                  </span>
                ) : 'Not set'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="card">
          <div className="eyebrow">Approved strategy</div>
          <h3 style={{ margin: '6px 0 10px' }}>{campaign.strategy?.title ?? 'No strategy'}</h3>
          {campaign.strategy ? (
            <>
              <p className="activity-meta" style={{ margin: 0 }}>
                Version {campaign.strategy.version} · status {campaign.strategy.status.toLowerCase()}
              </p>
              <div className="content-filters" style={{ marginTop: 10 }}>
                <span className="chip">{campaign.strategy.outputSummary?.objectives.length ?? 0} objectives</span>
                <span className="chip">{campaign.strategy.outputSummary?.channelCount ?? 0} channels</span>
                <span className="chip">KPIs {campaign.strategy.outputSummary?.hasKPIs ? 'defined' : 'missing'}</span>
              </div>
              {campaign.strategy.outputSummary && campaign.strategy.outputSummary.objectives.length > 0 ? (
                <ul className="strategy-objectives" style={{ margin: '12px 0 0', paddingLeft: 18 }}>
                  {campaign.strategy.outputSummary.objectives.slice(0, 4).map((objective, index) => (
                    <li key={index} style={{ marginBottom: 6, color: 'var(--muted)' }}>{objective}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="activity-meta" style={{ margin: 0 }}>This campaign has no approved strategy attached.</p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="section-title" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="eyebrow">Related content</div>
            <h3 style={{ margin: '5px 0' }}>Content linked to this campaign</h3>
          </div>
          <a className="badge" href={`/brands/${brandId}/content`} style={{ padding: '8px 12px' }}>
            <FileText size={14} /> Open Content Studio
          </a>
        </div>
        {content.length === 0 ? (
          <p className="activity-meta" style={{ margin: '12px 0 0' }}>
            No content items are linked yet. Link content briefs to this campaign when you create them in Content Studio.
          </p>
        ) : (
          <div className="grid" style={{ gap: 10, marginTop: 12 }}>
            {content.map((item) => (
              <a className="card hover-lift" href={`/brands/${brandId}/content/${item.id}`} key={item.id} style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span className="activity-title">{item.title}</span>
                  <span className="badge tone-muted">{item.status.toLowerCase().replaceAll('_', ' ')}</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}