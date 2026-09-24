'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Brain, FileSearch, Globe2, History, LoaderCircle, PlayCircle, Sparkles } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/ui/feedback';

type AiTaskInfo = {
  status: string;
  provider: string | null;
  model: string | null;
  errorMessage: string | null;
};

type RunInfo = {
  id: string;
  status: string;
  pagesProcessed: number;
  pagesDiscovered: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  ai: AiTaskInfo | null;
};

type FactInfo = {
  id: string;
  key: string;
  value: Record<string, unknown>;
  source_type: string;
  confidence: number | null;
  evidence_source_ids: string[];
  approved: boolean;
  updated_at: string;
};

type InsightInfo = {
  id: string;
  category: string;
  title: string;
  description: string;
  priority: number;
  evidence_source_ids: string[];
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type SourceInfo = {
  id: string;
  url: string;
  canonical_url: string | null;
  title: string | null;
  http_status: number | null;
  retrieved_at: string;
};

type BrainData = {
  facts: FactInfo[];
  insights: InsightInfo[];
  sources: SourceInfo[];
  latestRun: RunInfo | null;
  suggestionCounts?: { pending: number; approved: number; edited: number; notFound: number; total: number };
};

const LIVE_STATUSES = new Set(['QUEUED', 'RUNNING']);
const LIVE_AI_STATUSES = new Set(['QUEUED', 'RUNNING']);

const STATUS_LABELS: Record<string, string> = {
  QUEUED: 'Queued',
  RUNNING: 'Running',
  COMPLETED: 'Complete',
  PARTIAL: 'Partial',
  FAILED: 'Failed',
  SUCCEEDED: 'AI analysis complete',
  SKIPPED: 'AI skipped',
};

const SECTION_LABELS: Record<string, string> = {
  identity: 'Identity',
  audience: 'Audience',
  positioning: 'Positioning',
  offer: 'Offer',
  messaging: 'Messaging',
  seo: 'SEO',
  competition: 'Competition',
};

const FIELD_LABELS: Record<string, string> = {
  brandName: 'Brand name',
  companyDescription: 'What they do',
  industry: 'Industry',
  businessModel: 'Business model',
  primaryMarket: 'Primary market',
  geography: 'Geography',
  productCategories: 'Product categories',
  targetAudience: 'Target audience',
  buyerPersonas: 'Buyer personas',
  customerTypes: 'Customer types',
  painPoints: 'Pain points',
  useCases: 'Use cases',
  valueProposition: 'Value proposition',
  differentiators: 'Differentiators',
  positioningThemes: 'Positioning themes',
  brandMessaging: 'Brand messaging',
  productsAndServices: 'Products & services',
  keyFeatures: 'Key features',
  benefits: 'Benefits',
  pricingSignals: 'Pricing signals',
  callsToAction: 'Calls to action',
  recurringClaims: 'Recurring claims',
  toneOfVoice: 'Tone of voice',
  terminology: 'Terminology',
  messagingThemes: 'Messaging themes',
  importantTopics: 'Important topics',
  keywordThemes: 'Keyword themes',
  contentGaps: 'Content gaps',
  searchIntentOpportunities: 'Search intent opportunities',
  namedCompetitors: 'Named competitors',
  alternatives: 'Alternatives',
  differentiationClaims: 'Differentiation claims',
};

const FACT_LABELS: Record<string, string> = {
  brand_name: 'Brand name',
  brand_description: 'What the company does',
  industry: 'Industry',
  business_model: 'Business model',
  primary_market: 'Primary market',
  geography: 'Geographic focus',
  product_categories: 'Products & services',
  target_audience: 'Audience summary',
  buyer_personas: 'Ideal customer profiles',
  customer_types: 'Customer types',
  pain_points: 'Pain points',
  use_cases: 'Use cases',
  value_proposition: 'Value proposition',
  differentiators: 'Differentiators',
  positioning_themes: 'Market positioning',
  brand_messaging: 'Messaging direction',
  products_services: 'Products & services',
  key_features: 'Key features',
  benefits: 'Customer benefits',
  calls_to_action: 'Primary CTAs',
  tone_of_voice: 'Voice attributes',
  terminology: 'Brand vocabulary',
  important_topics: 'Key topics',
  keyword_themes: 'SEO keyword themes',
  competitors: 'Named competitors',
  alternatives: 'Alternatives',
};

const INSIGHT_CATEGORY_LABELS: Record<string, string> = {
  EVIDENCE: 'Verified evidence',
  POSITIONING: 'Positioning',
  AUDIENCE: 'Audience',
  MESSAGING: 'Messaging',
  SEO: 'SEO',
  COMPETITION: 'Competition',
};

function toneFor(status: string): string {
  if (status === 'COMPLETED' || status === 'SUCCEEDED') return 'tone-good';
  if (status === 'PARTIAL' || status === 'SKIPPED') return 'tone-warn';
  if (status === 'FAILED') return 'tone-danger';
  if (LIVE_STATUSES.has(status)) return 'tone-info';
  return 'tone-muted';
}

function labelFor(status: string): string {
  return STATUS_LABELS[status] ?? status.toLowerCase().replaceAll('_', ' ');
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

function present(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return (value as unknown[]).map(present).filter(Boolean).join(' · ');
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => (typeof v === 'string' ? v : present(v)))
      .filter(Boolean);
    return entries.join(' · ');
  }
  return String(value);
}

function FactGrid({ fact }: { fact: FactInfo }) {
  const label = FACT_LABELS[fact.key] ?? SECTION_LABELS[fact.key] ?? fact.key;
  const rendered = present(fact.value);
  return (
    <div className="card brain-fact hover-lift" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="section-title" style={{ marginBottom: 8 }}>
        <div>
          <div className="eyebrow">FACT · {fact.approved ? 'approved' : 'draft'}</div>
          <h3 style={{ margin: '4px 0 0', fontSize: 17 }}>{label}</h3>
        </div>
        {fact.confidence !== null ? <span className="badge tone-muted">{Math.round((fact.confidence ?? 0) * 100)}%</span> : null}
      </div>
      {rendered ? (
        <p className="fact-value" style={{ margin: 0 }}>{rendered}</p>
      ) : (
        <p className="metric-label" style={{ margin: 0 }}>No details captured yet.</p>
      )}
    </div>
  );
}

function EvidenceClaimsPanel({ claims }: { claims: InsightInfo[] }) {
  return (
    <div className="card">
      <div className="section-title">
        <div>
          <div className="eyebrow">Brand Brain</div>
          <h2 style={{ margin: '5px 0' }}>Verified evidence</h2>
        </div>
        <FileSearch size={18} color="var(--muted)" />
      </div>
      {claims.length === 0 ? (
        <EmptyState title="No verified claims yet" description="Run research to extract verifiable factual claims from the brand's website." />
      ) : (
        <ul className="evidence-list">
          {claims.map((claim) => (
            <li className="evidence-item" key={claim.id}>
              <CheckIcon /> {claim.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <span className="status-dot" style={{ background: 'var(--accent)', marginTop: 5, flexShrink: 0 }} />
  );
}

function InsightPanel({ grouped }: { grouped: Array<{ category: string; color: string; items: InsightInfo[] }> }) {
  return (
    <div className="card">
      <div className="section-title">
        <div>
          <div className="eyebrow">Analysis</div>
          <h2 style={{ margin: '5px 0' }}>Signals & opportunities</h2>
        </div>
        <Brain size={18} color="var(--muted)" />
      </div>
      {grouped.length === 0 ? (
        <EmptyState title="Nothing to show yet" description="AI insights from the brand's website will appear here after the first research run completes." />
      ) : (
        <div className="insight-groups">
          {grouped.map((group) => (
            <div key={group.category}>
              <div className="insight-group-label">{INSIGHT_CATEGORY_LABELS[group.category] ?? group.category}</div>
              <ul className="evidence-list">
                {group.items.map((item) => (
                  <li className="evidence-item" key={item.id}>
                    <span className="status-dot" style={{ background: group.color, marginTop: 5, flexShrink: 0 }} />
                    <div>
                      <div className="activity-title">{item.title}</div>
                      <div className="activity-meta">{item.description}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourcesPanel({ sources }: { sources: SourceInfo[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleSources = expanded ? sources : sources.slice(0, 5);

  return (
    <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="section-title">
        <div>
          <div className="eyebrow">Evidence</div>
          <h2 style={{ margin: '5px 0' }}>Sources analyzed</h2>
        </div>
        <Globe2 size={18} color="var(--muted)" />
      </div>
      {sources.length === 0 ? (
        <EmptyState title="No sources yet" description="Public pages captured during research will be listed here." />
      ) : (
        <ul className="source-list">
          {visibleSources.map((source) => (
            <li className="source-item" key={source.id}>
              <a href={source.url} target="_blank" rel="noreferrer">
                <span className="activity-title">{source.title || source.url}</span>
                <span className="activity-meta" style={{ wordBreak: 'break-all' }}>{source.url}</span>
              </a>
              <span className="badge tone-muted">HTTP {source.http_status ?? '—'}</span>
            </li>
          ))}
        </ul>
        {sources.length > 5 ? (
          <button
            type="button"
            className="badge"
            onClick={() => setExpanded((value) => !value)}
            style={{ border: 0, cursor: 'pointer', alignSelf: 'flex-start', marginTop: 10 }}
          >
            {expanded ? 'Show less' : `See more · ${sources.length - 5} more`}
          </button>
        ) : null}
      )}
    </div>
  );
}

function RunHistory({ runs }: { runs: RunInfo[] }) {
  return (
    <div className="card">
      <div className="section-title">
        <div>
          <div className="eyebrow">Activity</div>
          <h2 style={{ margin: '5px 0' }}>Research runs</h2>
        </div>
        <History size={18} color="var(--muted)" />
      </div>
      {runs.length === 0 ? (
        <EmptyState
          title="No research yet"
          description="Start research to crawl approved public pages, extract evidence and generate brand intelligence."
        />
      ) : (
        <div className="activity-list">
          {runs.map((run) => (
            <div className="activity-item" key={run.id}>
              <span className={`status-dot${LIVE_STATUSES.has(run.status) ? ' live' : ''}`} style={{ background: run.status === 'SUCCEEDED' ? 'var(--accent)' : undefined, marginTop: 4, flexShrink: 0 }} />
              <div className="activity-body" style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span className="badge" style={{ color: 'inherit', borderColor: 'var(--line)', background: 'var(--panel-2)' }}>{labelFor(run.status)}</span>
                  <span className="activity-meta">{timeAgo(run.createdAt)}</span>
                </div>
                <div className="activity-meta" style={{ marginTop: 8 }}>
                  {run.pagesDiscovered > 0 ? `${run.pagesProcessed}/${run.pagesDiscovered} pages analyzed` : `${run.pagesProcessed} page${run.pagesProcessed === 1 ? '' : 's'} analyzed`}
                  {run.ai ? ` · AI: ${run.ai.model || run.ai.provider || 'completed'}` : ''}
                </div>
                {run.status === 'FAILED' && run.errorMessage ? <div className="activity-error">{run.errorMessage}</div> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BrandOverview({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [brain, setBrain] = useState<BrainData | null>(null);
  const [factsExpanded, setFactsExpanded] = useState(false);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [brainResponse, runsResponse] = await Promise.all([
        fetch(`/api/brands/${brandId}/brain`, { cache: 'no-store' }),
        fetch(`/api/brands/${brandId}/research`, { cache: 'no-store' }),
      ]);
      if (brainResponse.status === 401 || runsResponse.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!brainResponse.ok) {
        const body = await brainResponse.json().catch(() => null);
        throw new Error(body?.error || 'Could not load brand brain');
      }
      if (!runsResponse.ok) {
        const body = await runsResponse.json().catch(() => null);
        throw new Error(body?.error || 'Could not load research runs');
      }
      const brainBody = await brainResponse.json();
      const runsBody = await runsResponse.json();
      setBrain(brainBody);
      setRuns(Array.isArray(runsBody.runs) ? runsBody.runs : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load brand overview');
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const startResearch = useCallback(async () => {
    setStarting(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/research`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not start research');
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not start research');
    } finally {
      setStarting(false);
    }
  }, [brandId, load]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const latest = runs[0];
    if (!latest || !LIVE_STATUSES.has(latest.status)) {
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
  }, [runs, load]);

  const latest = brain?.latestRun ?? runs[0] ?? null;
  const active = Boolean(
    latest && (
      LIVE_STATUSES.has(latest.status) ||
      (latest.ai && LIVE_AI_STATUSES.has(latest.ai.status))
    ),
  );

  const groupedCategories = [
    { category: 'POSITIONING', color: '#6ee7c7' },
    { category: 'AUDIENCE', color: '#8b7cff' },
    { category: 'MESSAGING', color: '#fbbf24' },
    { category: 'SEO', color: '#38bdf8' },
    { category: 'COMPETITION', color: '#fb7185' },
  ];
  const signals = groupedCategories
    .map((c) => ({ ...c, items: (brain?.insights ?? []).filter((i) => i.category === c.category) }))
    .filter((c) => c.items.length > 0);
  const evidenceClaims = (brain?.insights ?? []).filter((i) => i.category === 'EVIDENCE');

  const factCount = brain?.facts.length ?? 0;
  const visibleFacts = factsExpanded ? (brain?.facts ?? []) : (brain?.facts ?? []).slice(0, 6);
  const insightCount = brain?.insights.length ?? 0;
  const sourceCount = brain?.sources.length ?? 0;
  const pendingCount = brain?.suggestionCounts?.pending ?? 0;
  const lastFinishedAi = latest?.ai;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card" style={{ borderColor: active ? 'rgba(139,124,255,.45)' : undefined }}>
        <div className="section-title" style={{ marginBottom: '0 0 12px' }}>
          <div>
            <div className="eyebrow">Research workspace</div>
            <h2 style={{ margin: '5px 0' }}>{brandName} brand brain</h2>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {latest ? (
              <span className={`badge ${toneFor(latest.status)}`}>
                {active ? <span className="status-dot live" style={{ background: 'var(--accent-2)' }} /> : null}
                {labelFor(latest.status)}
              </span>
            ) : null}
            <button type="button" className="badge" onClick={startResearch} disabled={starting || active} style={{ border: 0, cursor: starting || active ? 'not-allowed' : 'pointer', padding: '8px 12px', opacity: starting || active ? 0.6 : 1 }}>
              {starting ? <><LoaderCircle size={14} className="spin" /> Starting…</> : active ? <><LoaderCircle size={14} className="spin" /> Research running…</> : <><PlayCircle size={14} /> {latest ? 'Re-run research' : 'Start research'}</>}
            </button>
          </div>
        </div>
        {lastFinishedAi ? (
          <p className="subtitle" style={{ marginTop: 0 }}>
            {lastFinishedAi.status === 'SUCCEEDED'
              ? `Brand intelligence generated with ${lastFinishedAi.model || lastFinishedAi.provider || 'AI'}.`
              : lastFinishedAi.status === 'FAILED'
                ? 'The AI analysis did not complete. Re-run research to try again.'
                : 'Brand intelligence is being generated from the collected evidence.'}
          </p>
        ) : (
          <p className="subtitle" style={{ marginTop: 0 }}>Start research to crawl the brand&apos;s public website, extract verifiable evidence and generate a structured brand intelligence profile.</p>
        )}
      </div>

      {actionError ? <div className="card" style={{ borderColor: 'rgba(239,68,68,.35)' }}><ErrorState message={actionError} /></div> : null}
      {error ? <div className="card" style={{ borderColor: 'rgba(239,68,68,.35)' }}><ErrorState message={error} /></div> : null}

      {loading ? (
        <div className="grid grid-3" aria-busy="true" aria-label="Loading brand brain">
          <div className="card brain-fact"><div className="skeleton" style={{ height: 14, width: '40%', borderRadius: 8 }} /><div className="skeleton" style={{ height: 12, width: '80%', borderRadius: 8, marginTop: 14 }} /></div>
          <div className="card brain-fact"><div className="skeleton" style={{ height: 14, width: '40%', borderRadius: 8 }} /><div className="skeleton" style={{ height: 12, width: '70%', borderRadius: 8, marginTop: 14 }} /></div>
          <div className="card brain-fact"><div className="skeleton" style={{ height: 14, width: '40%', borderRadius: 8 }} /><div className="skeleton" style={{ height: 12, width: '85%', borderRadius: 8, marginTop: 14 }} /></div>
        </div>
      ) : error ? null : (
        <>
          <div className="grid grid-4">
            <div className="card metric"><div className="metric-label"><Globe2 size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Sources</div><div className="metric-value">{sourceCount}</div></div>
            <div className="card metric"><div className="metric-label"><Brain size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Approved facts</div><div className="metric-value">{factCount}</div><div className="metric-hint">Human-approved or edited</div></div>
            <a className="card metric" href="#intelligence" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="metric-label"><Sparkles size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Suggestions</div>
              <div className="metric-value">{pendingCount}</div>
              <div className="metric-hint">{pendingCount > 0 ? 'Pending your review' : 'No items waiting'}</div>
            </a>
            <div className="card metric"><div className="metric-label"><History size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Runs</div><div className="metric-value">{runs.length}</div></div>
          </div>

          {active ? (
            <div className="card" style={{ borderColor: 'rgba(139,124,255,.45)' }}>
              <div className="section-title">
                <div>
                  <div className="eyebrow">Live job</div>
                  <h2 style={{ margin: '5px 0' }}>Research is running</h2>
                </div>
                <LoaderCircle size={16} className="spin" color="var(--accent-2)" />
              </div>
              <p className="subtitle" style={{ marginTop: 0 }}>The brand&apos;s public website is being analyzed. Sources, evidence and intelligence will appear here as soon as the run finishes.</p>
              <div className="progress"><span style={{ width: '55%' }} /></div>
            </div>
          ) : null}

          {factCount > 0 ? (
            <section>
              <div className="grid grid-3">
                {visibleFacts.map((fact) => <FactGrid fact={fact} key={fact.id} />)}
              </div>
              {factCount > 6 ? (
                <button
                  type="button"
                  className="badge"
                  onClick={() => setFactsExpanded((value) => !value)}
                  style={{ border: 0, cursor: 'pointer', marginTop: 12 }}
                >
                  {factsExpanded ? 'Show less' : `See more · ${factCount - 6} more facts`}
                </button>
              ) : null}
            </section>
          ) : null}

          <div className="brain-evidence-grid">
            {signals.length > 0 ? <InsightPanel grouped={signals} /> : null}
            <EvidenceClaimsPanel claims={evidenceClaims} />
            <SourcesPanel sources={brain?.sources ?? []} />
          </div>

          <div className="brain-run-history">
            <RunHistory runs={runs} />
          </div>
        </>
      )}
    </div>
  );
}