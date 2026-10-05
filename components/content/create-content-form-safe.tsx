'use client';

import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Plus } from 'lucide-react';
import { ErrorState } from '@/components/ui/feedback';
import { CONTENT_CHANNELS, CONTENT_TYPES, channelLabel, contentTypeLabel, type ContentIntentLike } from '@/lib/content/schema';

type DraftIntent = ContentIntentLike & { campaignId?: string | null; clientId?: string | null };
const EMPTY_INTENT: DraftIntent = { type: 'social_post', channel: 'linkedin', title: '', objective: '', audience: '', context: '', tone: '', cta: '', instructions: '', campaignId: '' };
const CHANNELS_BY_TYPE: Record<string, readonly string[]> = {
  social_post: ['linkedin', 'facebook', 'instagram', 'x', 'tiktok', 'youtube', 'pr', 'webinar', 'podcast', 'other'],
  ad_copy: ['linkedin_ads', 'facebook_ads', 'instagram', 'meta_ads', 'google_ads', 'other'],
  blog_outline: ['blog', 'website', 'linkedin', 'other'],
  blog_draft: ['blog', 'website', 'linkedin', 'other'],
  email: ['email', 'newsletter', 'other'],
  landing_page: ['landing_page', 'website', 'other'],
  video_script: ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', 'other'],
  cta_headlines: ['google_ads', 'meta_ads', 'linkedin_ads', 'facebook_ads', 'landing_page', 'website', 'other'],
};
const TYPES_BY_CHANNEL: Record<string, string[]> = {};
for (const [type, channels] of Object.entries(CHANNELS_BY_TYPE)) for (const channel of channels) TYPES_BY_CHANNEL[channel] = [...(TYPES_BY_CHANNEL[channel] ?? []), type];

export function CreateContentFormSafe({ brandId, initialCampaignId, onCreated }: { brandId: string; initialCampaignId?: string | null; onCreated?: (contentId: string) => void }) {
  const [intent, setIntent] = useState<DraftIntent>(() => ({ ...EMPTY_INTENT, campaignId: initialCampaignId ?? '' }));
  const [otherSpecification, setOtherSpecification] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [campaignOptions, setCampaignOptions] = useState<Array<{ id: string; name: string }>>([]);
  const compatibleChannels = useMemo(() => CHANNELS_BY_TYPE[intent.type] ?? [...CONTENT_CHANNELS], [intent.type]);
  const compatibleTypes = useMemo(() => TYPES_BY_CHANNEL[intent.channel] ?? CONTENT_TYPES.map((entry) => entry.value), [intent.channel]);
  useEffect(() => { if (!compatibleChannels.includes(intent.channel)) { setIntent((previous) => ({ ...previous, channel: compatibleChannels[0] ?? 'other' })); setOtherSpecification(''); } }, [compatibleChannels, intent.channel]);
  useEffect(() => { if (!compatibleTypes.includes(intent.type)) setIntent((previous) => ({ ...previous, type: compatibleTypes[0] ?? 'social_post' })); }, [compatibleTypes, intent.type]);
  useEffect(() => { let cancelled = false; fetch(`/api/brands/${brandId}/campaigns?limit=100`, { cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).then((body) => { if (cancelled) return; setCampaignOptions((body?.campaigns ?? []).map((campaign: { id: string; name: string }) => ({ id: campaign.id, name: campaign.name }))); }).catch(() => undefined); return () => { cancelled = true; }; }, [brandId]);
  const set = <K extends keyof DraftIntent>(key: K, value: DraftIntent[K]) => setIntent((previous) => ({ ...previous, [key]: value }));
  const creationLabel = `${contentTypeLabel(intent.type)} · ${channelLabel(intent.channel)}`;
  async function submit() {
    setBusy(true); setError(null);
    try {
      const optionalKeys = ['objective', 'audience', 'context', 'tone', 'cta', 'instructions'] as const;
      const payload: Record<string, string> = { type: intent.type, channel: intent.channel, title: intent.title.trim() };
      for (const key of optionalKeys) { const value = intent[key]; if (typeof value === 'string' && value.trim()) payload[key] = value.trim(); }
      if (intent.channel === 'other') { if (!otherSpecification.trim()) throw new Error('Please specify the channel or format you want to create.'); payload.instructions = [payload.instructions, `Other channel / format specification: ${otherSpecification.trim()}`].filter(Boolean).join('\n\n'); }
      if (intent.campaignId) payload.campaignId = intent.campaignId;
      const response = await fetch(`/api/brands/${brandId}/content`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (response.status === 401) { window.location.href = '/login'; return; }
      const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error || 'Could not create content item'); if (!body?.contentId) throw new Error('Content was created but no content id was returned.'); onCreated?.(body.contentId);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create content item'); } finally { setBusy(false); }
  }
  const disabled = busy || !intent.title.trim() || (intent.channel === 'other' && !otherSpecification.trim());
  return <div className="card content-form">
    <div><div className="eyebrow">New content</div><h2 style={{ margin: '5px 0' }}>Create {creationLabel}</h2><p className="subtitle" style={{ margin: 0 }}>Only compatible content formats are shown for the selected channel, and only compatible channels are shown for the selected format.</p></div>
    <div className="creation-state" aria-live="polite"><div className="creation-state-copy"><span className="creation-state-title">Current creation</span><span className="creation-state-detail">{creationLabel}{intent.campaignId ? ' · linked to campaign' : ' · no campaign linked yet'}</span></div></div>
    <div className="content-form-row"><label>Type<select value={intent.type} onChange={(event) => set('type', event.target.value)}>{CONTENT_TYPES.filter((entry) => compatibleTypes.includes(entry.value)).map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label><label>Channel<select value={intent.channel} onChange={(event) => { const next = event.target.value; set('channel', next); if (next !== 'other') setOtherSpecification(''); }}>{CONTENT_CHANNELS.filter((channel) => compatibleChannels.includes(channel)).map((channel) => <option key={channel} value={channel}>{channelLabel(channel)}</option>)}</select></label></div>
    {intent.channel === 'other' ? <label>Other channel / format · Please specify<input value={otherSpecification} onChange={(event) => setOtherSpecification(event.target.value)} placeholder="e.g. founder letter, Product Hunt launch, community post" /></label> : null}
    <label>Title / topic<input value={intent.title} onChange={(event) => set('title', event.target.value)} placeholder="e.g. Win back ICP accounts with a faster brand POV" /></label>
    <label>Objective (optional)<input value={intent.objective ?? ''} onChange={(event) => set('objective', event.target.value)} placeholder="What should this content achieve?" /></label>
    <label>Audience (optional)<input value={intent.audience ?? ''} onChange={(event) => set('audience', event.target.value)} placeholder="Who is this for?" /></label>
    <label>Campaign / context (optional)<textarea value={intent.context ?? ''} onChange={(event) => set('context', event.target.value)} placeholder="Launch, campaign, season, or context the model should know" /></label>
    <label>Link to a campaign (optional)<select value={intent.campaignId ?? ''} onChange={(event) => set('campaignId', event.target.value || '')}><option value="">No campaign</option>{campaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
    <label>Tone / style (optional)<input value={intent.tone ?? ''} onChange={(event) => set('tone', event.target.value)} placeholder="e.g. confident, evidence-first" /></label>
    <label>CTA direction (optional)<input value={intent.cta ?? ''} onChange={(event) => set('cta', event.target.value)} placeholder="e.g. book a demo" /></label>
    <label>Additional instructions (optional)<textarea value={intent.instructions ?? ''} onChange={(event) => set('instructions', event.target.value)} placeholder="Anything the model must respect" /></label>
    {error ? <ErrorState message={error} /> : null}
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button type="button" className="badge auth-submit" onClick={submit} disabled={disabled} style={{ border: 0, cursor: disabled ? 'not-allowed' : 'pointer', padding: '9px 14px', opacity: disabled ? .6 : 1 }}>{busy ? <><LoaderCircle size={14} className="spin" /> Creating {creationLabel}…</> : <><Plus size={14} /> Create {creationLabel}</>}</button></div>
  </div>;
}
