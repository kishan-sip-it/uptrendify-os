'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, FileText, LoaderCircle, PlayCircle, RefreshCw } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback';
import { normalizeStrategyOutputForPresentation, type StrategyOutput } from '@/lib/strategy/schema';

type VersionMeta = {
  id: string;
  title: string;
  status: string;
  version: number;
  provider: string | null;
  model: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type LatestStrategy = {
  id: string;
  title: string;
  status: string;
  version: number;
  provider: string | null;
  model: string | null;
  output: StrategyOutput;
  inputSnapshot: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

type StrategyData = {
  latest: LatestStrategy | null;
  versions: VersionMeta[];
  canGenerate: boolean;
  approvalGate: {
    ok: boolean;
    approved: number;
    required: number;
    missing: string[];
  };
};

const LIVE_STATUSES = new Set(['QUEUED', 'RUNNING']);

export type StrategyView =
  | { kind: 'empty' }
  | { kind: 'live'; status: string }
  | { kind: 'failed' }
  | { kind: 'content' }
  | { kind: 'missing' }
  | { kind: 'unknown' };

export function resolveStrategyView(latest: LatestStrategy | null): StrategyView {
  if (!latest) return { kind: 'empty' };
  if (LIVE_STATUSES.has(latest.status)) return { kind: 'live', status: latest.status };
  if (latest.status === 'FAILED') return { kind: 'failed' };
  if (latest.status === 'SUCCEEDED') {
    return normalizeStrategyOutputForPresentation(latest.output) === null ? { kind: 'missing' } : { kind: 'content' };
  }
  return { kind: 'unknown' };
}

function toneFor(status: string): string {
  if (status === 'SUCCEEDED') return 'tone-good';
  if (status === 'FAILED') return 'tone-danger';
  if (LIVE_STATUSES.has(status)) return 'tone-info';
  return 'tone-muted';
}

function labelFor(status: string): string {
  return { QUEUED: 'Queued', RUNNING: 'Generating', SUCCEEDED: 'Complete', FAILED: 'Failed' }[status] ?? status.toLowerCase();
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
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

function TextBlock({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div id="strategy" className="strategy-block">
      <div className="strategy-block-label">{label}</div>
      <p style={{ margin: 0, lineHeight: 1.55 }}>{value}</p>
    </div>
  );
}

function ListBlock({ label, items }: { label: string; items?: string[] }) {
  const safe = items ?? [];
  if (safe.length === 0) return null;
  return (
    <div className="strategy-block">
      <div className="strategy-block-label">{label}</div>
      <ul className="evidence-list">
        {safe.map((item, index) => (
          <li className="evidence-item" key={`${label}-${index}`}>
            <span className="status-dot" style={{ background: 'var(--accent)', marginTop: 5, flexShrink: 0 }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({ title, eyebrow, defaultOpen, children }: { title: string; eyebrow: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details className="strategy-acc" open={defaultOpen}>
      <summary>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span className="eyebrow">{eyebrow}</span>
          {title}
        </span>
        <ChevronRight size={16} className="caret" />
      </summary>
      <div className="strategy-acc-body">{children}</div>
    </details>
  );
}

function ObjectiveCards({ objectives }: { objectives: StrategyOutput['objectives'] }) {
  if (!objectives || objectives.length === 0) return null;
  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      {objectives.map((objective, index) => (
        <div className="obj-card" key={`${objective.objective}-${index}`}>
          <div className="strategy-block-label" style={{ color: 'var(--accent)' }}>OBJECTIVE {index + 1} · {objective.timeHorizon || '—'}</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{objective.objective}</div>
          {objective.rationale ? <p className="activity-meta" style={{ margin: '6px 0 0' }}>{objective.rationale}</p> : null}
          {objective.successMetric ? <p className="activity-meta" style={{ margin: '4px 0 0' }}>Success metric: {objective.successMetric}</p> : null}
        </div>
      ))}
    </div>
  );
}

function ChannelCards({ channels }: { channels: StrategyOutput['channels'] }) {
  if (!channels || channels.length === 0) return null;
  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      {channels.map((channel, index) => (
        <div className="campaign-card" key={`${channel.channel}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{channel.channel}</div>
            {channel.purpose ? <p className="activity-meta" style={{ margin: '3px 0 0' }}>{channel.purpose}</p> : null}
            {channel.audience ? <p className="activity-meta" style={{ margin: '2px 0 0' }}>Audience: {channel.audience}</p> : null}
            {channel.contentTypes && channel.contentTypes.length > 0 ? (
              <p className="activity-meta" style={{ margin: '4px 0 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {channel.contentTypes.map((type, i) => <span className="chip" key={`${type}-${i}`}>{type}</span>)}
              </p>
            ) : null}
            {channel.strategicRole ? <p className="activity-meta" style={{ margin: '4px 0 0' }}>{channel.strategicRole}</p> : null}
          </div>
          {channel.confidence ? <span className="badge tone-muted">{channel.confidence}</span> : null}
        </div>
      ))}
    </div>
  );
}

function CampaignCards({ campaigns }: { campaigns: StrategyOutput['campaigns'] }) {
  if (!campaigns || campaigns.length === 0) return null;
  return (
    <div className="roadmap-grid" style={{ marginTop: 12 }}>
      {campaigns.map((campaign, index) => (
        <div className="campaign-card" key={`${campaign.name}-${index}`}>
          <div className="strategy-block-label" style={{ color: 'var(--accent-2)' }}>CAMPAIGN {index + 1}</div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{campaign.name}</div>
          {campaign.audience ? <p className="activity-meta" style={{ margin: '4px 0 0' }}>Audience: {campaign.audience}</p> : null}
          {campaign.objective ? <p className="activity-meta" style={{ margin: '4px 0 0' }}>{campaign.objective}</p> : null}
          {campaign.coreIdea ? <p className="activity-meta" style={{ margin: '4px 0 0' }}>{campaign.coreIdea}</p> : null}
          {campaign.channel ? <p className="activity-meta" style={{ margin: '4px 0 0' }}>Channel: {campaign.channel}</p> : null}
          {campaign.cta ? <p className="activity-meta" style={{ margin: '4px 0 0' }}>CTA: {campaign.cta}</p> : null}
          {campaign.sequence && campaign.sequence.length > 0 ? (
            <div style={{ marginTop: 8 }}>
              <div className="strategy-block-label">SEQUENCE</div>
              <ul className="evidence-list">
                {campaign.sequence.map((step, i) => (
                  <li className="evidence-item" key={`sequence-${i}`}><span className="chip">{i + 1}</span><span>{step}</span></li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function RoadmapColumns({ roadmap }: { roadmap: StrategyOutput['roadmap'] | null | undefined }) {
  const safeRoadmap = roadmap ?? { days1To30: [], days31To60: [], days61To90: [] };
  const columns: Array<{ label: string; items: StrategyOutput['roadmap']['days1To30'] }> = [
    { label: 'Days 1–30', items: safeRoadmap.days1To30 ?? [] },
    { label: 'Days 31–60', items: safeRoadmap.days31To60 ?? [] },
    { label: 'Days 61–90', items: safeRoadmap.days61To90 ?? [] },
  ];
  const hasAny = columns.some((column) => column.items.length > 0);
  if (!hasAny) return null;
  return (
    <div className="roadmap-grid" style={{ marginTop: 12 }}>
      {columns.map((column) => (
        <div key={column.label}>
          <div className="strategy-block-label">{column.label}</div>
          {column.items.length === 0 ? <p className="activity-meta" style={{ margin: 0 }}>Nothing scheduled yet.</p> : (
            <ul className="evidence-list">
              {column.items.map((item, index) => (
                <li className="evidence-item" key={`${column.label}-${index}`} style={{ alignItems: 'flex-start' }}>
                  <ChevronRight size={14} color="var(--accent)" style={{ marginTop: 3, flexShrink: 0 }} />
                  <span>
                    <span style={{ fontWeight: 600 }}>{item.action}</span>
                    {item.priority ? <span className="chip" style={{ marginLeft: 6, textTransform: 'lowercase' }}>{item.priority}</span> : null}
                    {item.reason ? <span className="activity-meta" style={{ display: 'block', marginTop: 2 }}>{item.reason}</span> : null}
                    {item.expectedOutcome ? <span className="activity-meta" style={{ display: 'block', marginTop: 2 }}>→ {item.expectedOutcome}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function AssumptionList({ assumptions }: { assumptions: StrategyOutput['assumptions'] }) {
  if (!assumptions || assumptions.length === 0) return null;
  return (
    <ul className="evidence-list" style={{ marginTop: 12 }}>
      {assumptions.map((assumption, index) => (
        <li className="evidence-item" key={`assumption-${index}`} style={{ alignItems: 'flex-start' }}>
          <span className="status-dot" style={{ background: '#fbbf24', marginTop: 5, flexShrink: 0 }} />
          <span>
            <span>{assumption.statement}</span>
            <span style={{ display: 'block', marginTop: 4 }}>
              <span className="chip">basis: {assumption.basis === 'assumption' ? 'assumption' : (assumption.basis || 'assumption')}</span>
              {assumption.impact ? <span className="activity-meta" style={{ marginLeft: 8 }}>Impact: {assumption.impact}</span> : null}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function VersionHistory({ versions }: { versions: VersionMeta[] }) {
  const earlier = versions.slice(1);
  if (earlier.length === 0) return null;
  return (
    <div className="card">
      <div className="section-title">
        <div>
          <div className="eyebrow">History</div>
          <h2 style={{ margin: '5px 0' }}>Previous versions</h2>
        </div>
        <FileText size={18} color="var(--muted)" />
      </div>
      <div className="activity-list">
        {earlier.map((version) => (
          <div className="activity-item" key={version.id}>
            <span className={`status-dot`} style={{ background: version.status === 'SUCCEEDED' ? 'var(--accent)' : version.status === 'FAILED' ? '#f87171' : 'var(--muted)', marginTop: 4, flexShrink: 0 }} />
            <div className="activity-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span className="badge" style={{ color: 'inherit', borderColor: 'var(--line)', background: 'var(--panel-2)' }}>v{version.version}</span>
                <span className="activity-meta">{timeAgo(version.createdAt)}</span>
              </div>
              <div className="activity-meta" style={{ marginTop: 6 }}>
                {labelFor(version.status)}
                {version.model ? ` · ${version.model}` : ''}
              </div>
              {version.status === 'FAILED' && version.errorMessage ? <div className="activity-error">{version.errorMessage}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StrategyMissingState({ canGenerate, onRegenerate }: { canGenerate: boolean; onRegenerate: () => void }) {
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card" style={{ borderColor: 'rgba(251,191,36,.4)' }}>
        <div className="eyebrow" style={{ color: '#fbbf24' }}>Outdated strategy version</div>
        <p style={{ margin: '8px 0 4px' }}>This strategy version is missing required fields. Regenerate strategy.</p>
        <p className="subtitle" style={{ margin: '0 0 14px' }}>
          The stored output does not match the current strategy schema. The version is preserved in history.
        </p>
        {canGenerate ? (
          <button type="button" className="badge" onClick={onRegenerate} disabled={false} style={{ border: 0, cursor: 'pointer', padding: '8px 12px' }}>
            <RefreshCw size={14} /> Regenerate strategy
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StrategyContent({ strategy, versions }: { strategy: LatestStrategy; versions: VersionMeta[] }) {
  const output = normalizeStrategyOutputForPresentation(strategy.output);
  if (!output) {
    return <StrategyMissingState canGenerate={false} onRegenerate={() => undefined} />;
  }
  const { executiveSummary, businessUnderstanding, objectives, icp, positioning, messaging, contentStrategy, seoStrategy, channels, campaigns, roadmap, kpis, risksAndGaps, assumptions } = output;

  return (
    <>
      <div className="card" style={{ borderColor: 'rgba(110,231,199,.25)' }}>
        <div className="section-title" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 0 }}>
          <div>
            <div className="eyebrow">Strategy · v{strategy.version}</div>
            <h2 style={{ margin: '5px 0 0', fontSize: 20 }}>{executiveSummary?.summary || strategy.title}</h2>
            {strategy.finishedAt ? (
              <p className="activity-meta" style={{ margin: '6px 0 0' }}>
                Generated {timeAgo(strategy.finishedAt)}
                {strategy.model ? ` with ${strategy.model}` : ''}
                {strategy.provider ? ` (${strategy.provider})` : ''}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <Section title="Executive summary" eyebrow="Overview" defaultOpen>
        <TextBlock label="Strategic direction" value={executiveSummary?.currentSituation} />
        <TextBlock label="Recommended approach" value={executiveSummary?.strategicDirection} />
      </Section>

      <Section title="Business understanding" eyebrow="Baseline">
        <TextBlock label="What they sell" value={businessUnderstanding?.whatCompanySells} />
        <TextBlock label="Target audience" value={businessUnderstanding?.targetAudience} />
        <ListBlock label="Problems solved" items={businessUnderstanding?.problemsSolved} />
        <TextBlock label="Value proposition" value={businessUnderstanding?.valueProposition} />
        <ListBlock label="Differentiators" items={businessUnderstanding?.differentiators} />
        <ListBlock label="Evidence basis" items={businessUnderstanding?.evidenceBasis} />
      </Section>

      <Section title="Strategic objectives" eyebrow="Goals">
        <ObjectiveCards objectives={objectives} />
      </Section>

      <Section title="Audience & ICP" eyebrow="Who">
        <TextBlock label="Primary audience" value={icp?.primaryAudience} />
        <TextBlock label="Secondary audience" value={icp?.secondaryAudience} />
        <ListBlock label="Pain points" items={icp?.painPoints} />
        <ListBlock label="Motivations" items={icp?.motivations} />
        <ListBlock label="Buying triggers" items={icp?.buyingTriggers} />
        <ListBlock label="Objections to overcome" items={icp?.objections} />
      </Section>

      <Section title="Positioning" eyebrow="Stand apart">
        <TextBlock label="Positioning statement" value={positioning?.positioningStatement} />
        <TextBlock label="Core promise" value={positioning?.corePromise} />
        <ListBlock label="Differentiators" items={positioning?.differentiators} />
        <ListBlock label="Proof points" items={positioning?.proofPoints} />
        <ListBlock label="Positioning gaps" items={positioning?.gaps} />
        <ListBlock label="Uncertainties" items={positioning?.uncertainties} />
      </Section>

      <Section title="Messaging" eyebrow="Say it">
        <TextBlock label="Core message" value={messaging?.coreMessage} />
        <ListBlock label="Supporting messages" items={messaging?.supportingMessages} />
        <ListBlock label="Value propositions" items={messaging?.valuePropositions} />
        <ListBlock label="CTA directions" items={messaging?.ctaDirections} />
        <TextBlock label="Tone of voice" value={messaging?.toneOfVoice} />
      </Section>

      <Section title="Content strategy" eyebrow="Produce">
        <ListBlock label="Content pillars" items={contentStrategy?.contentPillars} />
        <ListBlock label="Topic clusters" items={contentStrategy?.topicClusters} />
        <ListBlock label="Educational themes" items={contentStrategy?.educationalThemes} />
        <ListBlock label="Conversion themes" items={contentStrategy?.conversionThemes} />
        <ListBlock label="Trust-building themes" items={contentStrategy?.trustThemes} />
        <ListBlock label="Formats" items={contentStrategy?.contentFormats} />
      </Section>

      <Section title="SEO strategy" eyebrow="Get found">
        <ListBlock label="Keyword opportunities" items={seoStrategy?.keywordOpportunities} />
        {seoStrategy?.searchIntentCategories && seoStrategy.searchIntentCategories.length > 0 ? (
          <div className="strategy-block">
            <div className="strategy-block-label">Search intent</div>
            {seoStrategy.searchIntentCategories.map((category, index) => (
              <div key={`intent-${index}`} style={{ marginBottom: 8 }}>
                <span className="chip">{category.intent}</span>
                {category.topics && category.topics.length > 0 ? (
                  <p className="activity-meta" style={{ margin: '4px 0 0' }}>{category.topics.join(' · ')}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <ListBlock label="Priority topics" items={seoStrategy?.priorityTopics} />
        <ListBlock label="On-page opportunities" items={seoStrategy?.onPageOpportunities} />
        <ListBlock label="Internal linking" items={seoStrategy?.internalLinkingOpportunities} />
        <ListBlock label="Gaps" items={seoStrategy?.gaps} />
      </Section>

      <Section title="Channel strategy" eyebrow="Where">
        <ChannelCards channels={channels} />
      </Section>

      <Section title="Campaign concepts" eyebrow="Activate">
        <CampaignCards campaigns={campaigns} />
      </Section>

      <Section title="90-day roadmap" eyebrow="Execute">
        <RoadmapColumns roadmap={roadmap} />
      </Section>

      <Section title="KPIs" eyebrow="Measure">
        <div className="kpi-grid" style={{ marginTop: 12 }}>
          {[
            { label: 'Awareness', items: kpis?.awareness },
            { label: 'Traffic', items: kpis?.traffic },
            { label: 'SEO', items: kpis?.seo },
            { label: 'Engagement', items: kpis?.engagement },
            { label: 'Leads & conversions', items: kpis?.leadsAndConversions },
            { label: 'Revenue', items: kpis?.revenue },
          ].map((group) => (
            <div key={group.label}>
              <div className="strategy-block-label">{group.label}</div>
              {!group.items || group.items.length === 0 ? <p className="activity-meta" style={{ margin: 0 }}>—</p> : (
                <ul className="evidence-list">
                  {group.items.map((item, index) => (
                    <li className="evidence-item" key={`${group.label}-${index}`}><Check size={13} color="var(--accent)" style={{ marginTop: 3, flexShrink: 0 }} /><span>{item}</span></li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Risks & gaps" eyebrow="Watch">
        <ListBlock label="Missing information" items={risksAndGaps?.missingInformation} />
        <ListBlock label="Evidence limitations" items={risksAndGaps?.evidenceLimitations} />
        <ListBlock label="Strategic risks" items={risksAndGaps?.strategicRisks} />
        <ListBlock label="Dependencies" items={risksAndGaps?.dependencies} />
      </Section>

      <Section title="Assumptions" eyebrow="Not yet proven">
        <AssumptionList assumptions={assumptions} />
      </Section>

      <VersionHistory versions={versions} />
    </>
  );
}

export function BrandStrategy({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [data, setData] = useState<StrategyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/strategy`, { cache: 'no-store' });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not load strategy');
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load strategy');
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  const start = useCallback(async () => {
    setGenerating(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/strategy`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok && response.status !== 409) throw new Error(body?.error || 'Could not start strategy generation');
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not start strategy generation');
    } finally {
      setGenerating(false);
    }
  }, [brandId, load]);

  const regenerate = useCallback(async () => {
    if (!window.confirm('Generate a new strategy version from the current Brand Brain? The previous version stays in history.')) return;
    await start();
  }, [start]);

  useEffect(() => {
    load();
  }, [load]);

  const latest = data?.latest ?? null;
  const live = latest && LIVE_STATUSES.has(latest.status);
  const view = resolveStrategyView(latest);

  useEffect(() => {
    if (!live) {
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
  }, [live, load]);

  const canGenerate = data?.canGenerate ?? false;
  const approvalGate = data?.approvalGate ?? { ok: false, approved: 0, required: 4, missing: ['brand_name'] };
  const busy = generating || Boolean(live);
  const canStart = canGenerate && approvalGate.ok;

  return (
    <div className="grid" style={{ gap: 16 }} id={`strategy-${brandName.split(' ')[0] ?? 'v'}`}>
      <div className="card" style={{ borderColor: live ? 'rgba(139,124,255,.45)' : undefined }}>
        <div className="section-title" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="eyebrow">Strategy workspace</div>
            <h2 style={{ margin: '5px 0' }}>{brandName} marketing strategy</h2>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {latest ? <span className={`badge ${toneFor(latest.status)}`}>{live ? <span className="status-dot live" style={{ background: 'var(--accent-2)' }} /> : null}{labelFor(latest.status)}</span> : null}
            {canGenerate && approvalGate.ok ? (
              <button
                type="button"
                className="badge"
                onClick={latest ? regenerate : start}
                disabled={busy}
                style={{ border: 0, cursor: busy ? 'not-allowed' : 'pointer', padding: '8px 12px', opacity: busy ? 0.6 : 1 }}
              >
                {generating ? <><LoaderCircle size={14} className="spin" /> Starting…</> : live ? <><LoaderCircle size={14} className="spin" /> Generating…</> : latest ? <><RefreshCw size={14} /> Regenerate</> : <><PlayCircle size={14} /> Generate strategy</>}
              </button>
            ) : null}
          </div>
        </div>
        <p className="subtitle" style={{ marginTop: 0 }}>
          {latest
            ? 'An evidence-based marketing strategy generated from the brand brain, research evidence and verified claims.'
            : 'Generate a full marketing strategy from the brand brain: objectives, ICP, positioning, messaging, content, SEO, channels, campaigns, a 90-day roadmap, KPIs and risks.'}
        </p>
        {live ? (
          <div style={{ marginTop: 4 }}>
            <div className="activity-meta" style={{ marginBottom: 8 }}>The strategy is being generated from the brand brain. It usually takes under a minute.</div>
            <div className="progress" style={{ animation: 'none' }}><span style={{ width: '65%' }} /></div>
          </div>
        ) : null}
      </div>

      {actionError ? <div className="card" style={{ borderColor: 'rgba(239,68,68,.35)' }}><ErrorState message={actionError} /></div> : null}
      {error ? <div className="card" style={{ borderColor: 'rgba(239,68,68,.35)' }}><ErrorState message={error} /></div> : null}
      {!approvalGate.ok && canGenerate && !live ? (
        <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--accent) 35%, var(--line))' }}>
          <div className="eyebrow">Strategy gate</div>
          <h3 style={{ margin: '5px 0 7px' }}>Review Brand Brain before generating strategy</h3>
          <p className="subtitle" style={{ margin: 0 }}>
            {approvalGate.approved}/{approvalGate.required} approvals complete.
            {approvalGate.missing.length > 0 ? ` Required field waiting for approval: ${approvalGate.missing.join(', ')}.` : ' Approve or edit a few more suggestions to continue.'}
          </p>
          <div style={{ marginTop: 12 }}>
            <a className="badge" href="#intelligence">Review Brand Brain</a>
          </div>
        </div>
      ) : null}

      {loading ? (
        <LoadingState label="Loading strategy…" />
      ) : error ? null : view.kind === 'empty' ? (
        <EmptyState
          title="No strategy yet"
          description="There is no strategy for this brand yet. Get research running (or reset a run) to build the brand brain, then generate the strategy here."
          action={canGenerate && approvalGate.ok ? (
            <button type="button" className="badge" onClick={start} disabled={generating} style={{ border: 0, cursor: 'pointer', padding: '8px 12px' }}>
              {generating ? <><LoaderCircle size={14} className="spin" /> Starting…</> : <><PlayCircle size={14} /> Generate strategy</>}
            </button>
          ) : undefined}
        />
      ) : view.kind === 'live' ? (
        <div className="card" style={{ borderColor: 'rgba(139,124,255,.45)' }}>
          <div className="section-title" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div className="eyebrow">Generating strategy</div>
              <h2 style={{ margin: '5px 0' }}>Building {brandName}’s strategy</h2>
            </div>
            <LoaderCircle size={18} className="spin" color="var(--accent-2)" />
          </div>
          <p className="subtitle" style={{ marginBottom: 10 }}>
            {view.status === 'QUEUED'
              ? 'The strategy is queued and will start generating shortly. This page refreshes automatically.'
              : 'The strategy is being generated from the brand brain. It usually takes under a minute.'}
          </p>
          <div className="progress" style={{ animation: 'none' }}><span style={{ width: '65%' }} /></div>
        </div>
      ) : view.kind === 'failed' ? (
        <div className="grid" style={{ gap: 16 }}>
          <ErrorState message={latest?.errorMessage || 'Strategy generation did not complete.'} />
          {canGenerate ? (
            <div className="card" style={{ textAlign: 'center', padding: '26px 20px' }}>
              <p className="subtitle" style={{ margin: '0 0 14px' }}>Fix the underlying issue (check AI provider configuration) and regenerate when ready.</p>
              <button type="button" className="badge" onClick={start} disabled={generating} style={{ border: 0, cursor: 'pointer', padding: '8px 12px' }}>
                {generating ? <><LoaderCircle size={14} className="spin" /> Starting…</> : <><RefreshCw size={14} /> Retry generation</>}
              </button>
            </div>
          ) : null}
        </div>
      ) : view.kind === 'content' ? (
        <StrategyContent strategy={latest!} versions={data?.versions ?? []} />
      ) : view.kind === 'missing' ? (
        <StrategyMissingState canGenerate={canGenerate} onRegenerate={regenerate} />
      ) : (
        <EmptyState
          title="Unknown strategy status"
          description={`This strategy has an unexpected status. Regenerate it to rebuild it from the current Brand Brain.`}
          action={canGenerate ? (
            <button type="button" className="badge" onClick={start} disabled={generating} style={{ border: 0, cursor: 'pointer', padding: '8px 12px' }}>
              {generating ? <><LoaderCircle size={14} className="spin" /> Starting…</> : <><RefreshCw size={14} /> Regenerate strategy</>}
            </button>
          ) : undefined}
        />
      )}
    </div>
  );
}