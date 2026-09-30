'use client';

import { ArrowLeft, Check, LoaderCircle, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CAMPAIGN_CHANNELS, CAMPAIGN_CHANNEL_LABELS } from '@/lib/campaign/schema';
import { ErrorState, LoadingState } from '@/components/ui/feedback';

type StrategyOption = { id: string; title: string; version: number; status: string };

type CampaignDraft = {
  name: string;
  objective: string;
  description: string;
  strategyIds: string[];
  startDate: string;
  endDate: string;
  budget: string;
  currency: string;
  channels: string[];
  channelSpecification: string;
};

const EMPTY_DRAFT: CampaignDraft = {
  name: '', objective: '', description: '', strategyIds: [], startDate: '', endDate: '', budget: '', currency: 'USD', channels: [], channelSpecification: '',
};

function StrategyPicker({ options, value, onChange }: { options: StrategyOption[]; value: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((entry) => entry !== id) : [...value, id]);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span>Approved strategies</span>
        <span className="field-note">Select one or more. The first selected strategy is the primary.</span>
      </div>
      <div className="chip-row" style={{ marginTop: 8 }}>
        {options.map((strategy) => {
          const selected = value.includes(strategy.id);
          const primary = value[0] === strategy.id;
          return (
            <button type="button" key={strategy.id} className={`chip chip-toggle${selected ? ' chip-toggle-active' : ''}`} onClick={() => toggle(strategy.id)} aria-pressed={selected}>
              {selected ? <Check size={12} /> : null}{strategy.title} · v{strategy.version}{primary ? <span style={{ fontSize: 10, opacity: 0.8 }}>PRIMARY</span> : null}
            </button>
          );
        })}
      </div>
      {value.length === 0 ? <div className="field-help" style={{ marginTop: 6 }}>Choose at least one approved strategy to ground this campaign.</div> : null}
    </div>
  );
}

export function CampaignCreatePage({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [strategyOptions, setStrategyOptions] = useState<StrategyOption[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CampaignDraft>(EMPTY_DRAFT);
  const set = <K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
  const hasOther = draft.channels.includes('other');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/brands/${brandId}/campaigns`, { cache: 'no-store' });
        if (response.status === 401) { window.location.href = '/login'; return; }
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || 'Could not load campaign setup');
        if (!cancelled) { setStrategyOptions(body?.strategyOptions ?? []); setCanManage(Boolean(body?.canManage)); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load campaign setup');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [brandId]);

  const toggleChannel = (channel: string) => setDraft((prev) => ({ ...prev, channels: prev.channels.includes(channel) ? prev.channels.filter((entry) => entry !== channel) : [...prev.channels, channel] }));

  async function submit() {
    setBusy(true); setError(null);
    try {
      const payload: Record<string, unknown> = { name: draft.name.trim(), strategyIds: draft.strategyIds };
      if (draft.objective.trim()) payload.objective = draft.objective.trim();
      if (draft.description.trim()) payload.description = draft.description.trim();
      if (draft.startDate) payload.startDate = draft.startDate;
      if (draft.endDate) payload.endDate = draft.endDate;
      if (draft.budget.trim() && Number.isFinite(Number(draft.budget))) payload.budget = Number(draft.budget);
      if (draft.currency.trim()) payload.currency = draft.currency.trim();
      if (draft.channels.length > 0) payload.channels = draft.channels;
      if (hasOther) {
        if (!draft.channelSpecification.trim()) throw new Error('Please specify the Other channel or format.');
        payload.channelSpecification = draft.channelSpecification.trim();
      }
      const response = await fetch(`/api/brands/${brandId}/campaigns`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (response.status === 401) { window.location.href = '/login'; return; }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not create campaign');
      const campaignId = body?.campaign?.id ?? body?.id;
      if (!campaignId) throw new Error('Campaign was created but its destination could not be resolved.');
      window.location.href = `/brands/${brandId}/campaigns/${campaignId}?created=1`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create campaign');
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading campaign setup…" />;
  if (error && strategyOptions.length === 0) return <ErrorState message={error} />;
  if (!canManage) return <ErrorState message="You do not have permission to create campaigns in this brand workspace." />;

  const disabled = busy || !draft.name.trim() || !draft.strategyIds.length || !strategyOptions.length || (hasOther && !draft.channelSpecification.trim());

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 1040 }}>
      <a href={`/brands/${brandId}/campaigns`} className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, width: 'fit-content' }}><ArrowLeft size={15} /> Back to campaigns</a>
      <div className="card">
        <div className="eyebrow">New campaign</div>
        <h1 style={{ margin: '6px 0 8px' }}>Create a campaign for {brandName}</h1>
        <p className="subtitle" style={{ margin: 0, maxWidth: 820 }}>
          Start with the approved strategy set, then add only the campaign-specific details you know. Optional fields can stay blank because downstream content generation still uses this brand’s approved rules, audience, positioning and visual identity.
        </p>
      </div>

      {error ? <div className="card" style={{ borderColor: 'rgba(239,68,68,.35)' }}><ErrorState message={error} /></div> : null}
      {strategyOptions.length === 0 ? (
        <div className="card" style={{ borderColor: 'rgba(251,191,36,.4)' }}>
          <div className="eyebrow" style={{ color: '#fbbf24' }}>Strategy required</div>
          <h3 style={{ margin: '5px 0 7px' }}>Approve a strategy before creating the campaign</h3>
          <p className="subtitle" style={{ margin: 0 }}>A campaign must be grounded in at least one approved strategy. Generate or approve a new strategy version in the Strategy workspace first.</p>
          <a className="badge auth-submit" href={`/brands/${brandId}?view=strategy`} style={{ display: 'inline-flex', marginTop: 12, textDecoration: 'none' }}>Open Strategy →</a>
        </div>
      ) : null}

      {strategyOptions.length > 0 ? (
        <div className="card content-form">
          <div>
            <div className="eyebrow" style={{ color: 'var(--accent-2)' }}>1 · Ground the campaign</div>
            <h2 style={{ margin: '5px 0' }}>Choose the strategy set</h2>
            <p className="subtitle" style={{ margin: 0 }}>Multiple approved strategies can support one campaign. The first selected strategy remains the primary one.</p>
          </div>
          <label>Campaign name<input value={draft.name} onChange={(event) => set('name', event.target.value)} placeholder="e.g. Q4 Enterprise Software Scale" /></label>
          <label><StrategyPicker options={strategyOptions} value={draft.strategyIds} onChange={(ids) => set('strategyIds', ids)} /></label>

          <div className="eyebrow" style={{ color: 'var(--accent-2)', marginTop: 6 }}>2 · Add campaign details</div>
          <p className="field-help" style={{ margin: '-4px 0 2px' }}>Leave optional fields blank when the brand rules already provide enough context. The campaign remains grounded in those rules.</p>
          <label>Objective (optional)<input value={draft.objective} onChange={(event) => set('objective', event.target.value)} placeholder="What should this campaign achieve?" /></label>
          <label>Description (optional)<textarea value={draft.description} onChange={(event) => set('description', event.target.value)} placeholder="Planning notes, hypotheses, scope" /></label>
          <div className="content-form-row"><label>Start date<input type="date" value={draft.startDate} onChange={(event) => set('startDate', event.target.value)} /></label><label>End date<input type="date" value={draft.endDate} onChange={(event) => set('endDate', event.target.value)} /></label></div>
          <div className="content-form-row"><label>Budget (optional)<input type="number" inputMode="decimal" step="0.01" min="0" value={draft.budget} onChange={(event) => set('budget', event.target.value)} placeholder="e.g. 25000" /></label><label>Currency<input value={draft.currency} maxLength={3} onChange={(event) => set('currency', event.target.value.toUpperCase())} placeholder="USD" /></label></div>
          <label>Channels (optional)<div className="chip-row">{CAMPAIGN_CHANNELS.map((channel) => <button type="button" key={channel} className={`chip chip-toggle${draft.channels.includes(channel) ? ' chip-toggle-active' : ''}`} onClick={() => toggleChannel(channel)}>{CAMPAIGN_CHANNEL_LABELS[channel]}</button>)}</div></label>
          {hasOther ? <label>Other channel / format · Please specify<input value={draft.channelSpecification} onChange={(event) => set('channelSpecification', event.target.value)} placeholder="Please specify, e.g. founder letter, Product Hunt launch, community post…" aria-required="true" /><small className="field-help">This specification stays with the campaign and is available when campaign content is created.</small></label> : null}

          <div className="card" style={{ background: 'var(--panel-2)', borderColor: 'var(--line)' }}>
            <div className="eyebrow">What happens next</div>
            <p style={{ margin: '5px 0 0', lineHeight: 1.5 }}>Create the campaign as <strong>Draft</strong>. You will land on the campaign workspace with the next action highlighted. Move it to <strong>Planned</strong> when its details are ready, then continue into content creation and the existing approval workflow.</p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="badge auth-submit" onClick={submit} disabled={disabled} style={{ border: 0, cursor: disabled ? 'not-allowed' : 'pointer', padding: '10px 15px', opacity: disabled ? 0.6 : 1 }}>{busy ? <><LoaderCircle size={14} className="spin" /> Creating campaign…</> : <><Plus size={14} /> Create campaign</>}</button>
            <a href={`/brands/${brandId}/campaigns`} className="badge tone-muted" style={{ textDecoration: 'none', padding: '10px 15px' }}>Cancel</a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
