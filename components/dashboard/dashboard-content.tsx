'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Globe2, ListChecks, Plus, Search, Sparkles, Target, Users, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import type { DashboardData, NextAction, RecentBrand, ResearchActivity, StrategyActivity } from '@/lib/dashboard/data';

const ACTION_ICONS: Record<NextAction['kind'], LucideIcon> = {
  brand: Plus,
  review: ListChecks,
  research: Globe2,
  retry: Zap,
  strategy: Target,
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  COMPLETED: 'Complete',
  PARTIAL: 'Partial',
  RUNNING: 'Running',
  QUEUED: 'Queued',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  DRAFT: 'Draft',
  IN_REVIEW: 'Needs review',
  CLIENT_REVIEW: 'Client review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

type Tone = 'good' | 'warn' | 'danger' | 'info' | 'muted';

function toneFor(status: string): Tone {
  switch (status) {
    case 'COMPLETED':
    case 'ACTIVE':
    case 'APPROVED':
    case 'PUBLISHED':
    case 'SUCCEEDED':
      return 'good';
    case 'PARTIAL':
    case 'IN_REVIEW':
    case 'CLIENT_REVIEW':
    case 'CHANGES_REQUESTED':
    case 'SCHEDULED':
      return 'warn';
    case 'FAILED':
      return 'danger';
    case 'QUEUED':
    case 'RUNNING':
      return 'info';
    default:
      return 'muted';
  }
}

function labelFor(status: string): string {
  return STATUS_LABELS[status] ?? status.toLowerCase().replaceAll('_', ' ');
}

function isLive(status: string): boolean {
  return status === 'RUNNING' || status === 'QUEUED';
}

function dotColor(status: string): string {
  switch (toneFor(status)) {
    case 'good':
      return 'var(--accent)';
    case 'warn':
      return '#fbbf24';
    case 'danger':
      return '#f87171';
    case 'info':
      return 'var(--accent-2)';
    default:
      return '#5b6b84';
  }
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

function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, duration]);

  return value;
}

function Skeleton({ height = 16, width = '100%', radius = 10 }: { height?: number; width?: number | string; radius?: number }) {
  return <span className="skeleton" style={{ display: 'block', width, height, borderRadius: radius }} />;
}

function MetricCard({ label, value, Icon, hint, delay }: { label: string; value: number; Icon: LucideIcon; hint?: string; delay: number }) {
  const animated = useCountUp(value);
  return (
    <div className="card metric hover-lift animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="metric-label"><Icon size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />{label}</div>
      <div className="metric-value">{animated}</div>
      {hint ? <div className="metric-hint">{hint}</div> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge tone-${toneFor(status)}`}>
      {isLive(status) ? <span className="status-dot live" style={{ background: dotColor(status) }} /> : null}
      {labelFor(status)}
    </span>
  );
}

function RecentBrandsPanel({ brands }: { brands: RecentBrand[] }) {
  return (
    <div className="card" style={{ gridColumn: 'span 2' }}>
      <div className="section-title">
        <div>
          <div className="eyebrow">Portfolio</div>
          <h2 style={{ margin: '5px 0' }}>Recent brands</h2>
        </div>
      </div>
      {brands.length === 0 ? (
        <EmptyState
          title="No brands yet"
          description="Add your first brand to start analyzing its public website and building strategies."
          action={<span className="field-note">Use <strong>Add brand</strong> in the left sidebar to create your first brand.</span>}
        />
      ) : (
        <div className="grid" id="brands">
          {brands.map((brand, i) => (
            <a className="card brand-card hover-lift animate-fade-up" href={`/brands/${brand.id}`} key={brand.id} style={{ background: '#0b111c', animationDelay: `${i * 60}ms`, display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
                <div>
                  <h3 style={{ margin: 0 }}>{brand.name}</h3>
                  <div className="metric-label">{brand.industry || brand.website_url?.replace(/^https?:\/\//, '') || 'Brand'}</div>
                </div>
                <StatusBadge status={brand.status ?? 'ACTIVE'} />
              </div>
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--muted)', fontSize: 13 }}>
                <span>Onboarded {timeAgo(brand.created_at)}</span>
                <ArrowRight size={16} />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ResearchActivityPanel({ activity }: { activity: ResearchActivity[] }) {
  return (
    <div className="card">
      <div className="section-title">
        <div>
          <div className="eyebrow">Activity</div>
          <h2 style={{ margin: '5px 0' }}>Research runs</h2>
        </div>
        <Globe2 size={18} color="var(--muted)" />
      </div>
      {activity.length === 0 ? (
        <EmptyState
          title="No research yet"
          description="Research runs will appear here once a brand's public website has been analyzed."
          action={<span className="field-note">Use <strong>Add brand</strong> in the left sidebar to start a research run.</span>}
        />
      ) : (
        <div className="activity-list">
          {activity.map((run, i) => (
            <a className="activity-item hover-lift animate-fade-up" href={`/brands/${run.brand_id}`} key={run.id} style={{ animationDelay: `${i * 50}ms`, display: 'block' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span className={`status-dot${isLive(run.status) ? ' live' : ''}`} style={{ background: dotColor(run.status), marginTop: 4, flexShrink: 0 }} />
                <div className="activity-body">
                  <div className="activity-title">{run.brand_name ?? 'Unknown brand'}</div>
                  <div className="activity-meta">{labelFor(run.status)} · {timeAgo(run.created_at)}</div>
                  {run.status === 'FAILED' && run.error_message ? <div className="activity-error">{run.error_message}</div> : null}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function StrategyActivityPanel({ activity }: { activity: StrategyActivity[] }) {
  return (
    <div className="card">
      <div className="section-title">
        <div>
          <div className="eyebrow">Activity</div>
          <h2 style={{ margin: '5px 0' }}>Strategy versions</h2>
        </div>
        <Target size={18} color="var(--muted)" />
      </div>
      {activity.length === 0 ? (
        <EmptyState
          title="No strategies yet"
          description="Generated strategies will appear here once a brand has been researched."
        />
      ) : (
        <div className="activity-list">
          {activity.map((run, i) => (
            <a className="activity-item hover-lift animate-fade-up" href={`/brands/${run.brand_id}`} key={run.id} style={{ animationDelay: `${i * 50}ms`, display: 'block' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span className={`status-dot${isLive(run.status) ? ' live' : ''}`} style={{ background: dotColor(run.status), marginTop: 4, flexShrink: 0 }} />
                <div className="activity-body">
                  <div className="activity-title">
                    {run.brand_name ?? 'Unknown brand'}
                    <span className="chip" style={{ marginLeft: 8 }}>v{run.version}</span>
                  </div>
                  <div className="activity-meta">{labelFor(run.status)} · {timeAgo(run.created_at)}</div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function NextActionsPanel({ actions }: { actions: NextAction[] }) {
  if (actions.length === 0) return null;
  return (
    <section className="next-actions" aria-label="Suggested next steps">
      <div className="section-title">
        <div>
          <div className="eyebrow">Do this next</div>
          <h2 style={{ margin: '5px 0' }}>Recommended actions</h2>
        </div>
      </div>
      <div className="next-actions-grid">
        {actions.map((action, i) => {
          const Icon = ACTION_ICONS[action.kind];
          return (
            <a className="next-action-card animate-fade-up" href={action.href} key={action.id} style={{ animationDelay: `${i * 60}ms` }}>
              <span className="next-action-icon"><Icon size={17} /></span>
              <div className="next-action-body">
                <div className="next-action-title">{action.title}</div>
                <div className="next-action-desc">{action.description}</div>
              </div>
              <span className="next-action-cta"><span className="next-action-cta-label">{action.cta}</span><ArrowRight size={14} /></span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-4">
        {[0, 1, 2, 3].map((i) => (
          <div className="card metric" key={i} style={{ display: 'grid', alignContent: 'start', gap: 12 }}>
            <Skeleton width={110} height={13} />
            <Skeleton width={56} height={32} radius={8} />
            <Skeleton width={84} height={11} />
          </div>
        ))}
      </div>
      <div className="grid grid-3" style={{ marginTop: 16 }}>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <Skeleton width={150} height={18} radius={8} />
          <div className="grid" style={{ marginTop: 16 }}>
            {[0, 1, 2, 3].map((i) => (
              <div className="card" key={i} style={{ background: '#0b111c', display: 'grid', gap: 10 }}>
                <Skeleton width="45%" height={16} radius={8} />
                <Skeleton width="70%" height={11} />
                <Skeleton width="35%" height={10} />
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <Skeleton width={130} height={18} radius={8} />
          <div className="activity-list" style={{ marginTop: 16 }}>
            {[0, 1, 2, 3].map((i) => (
              <div className="activity-item" key={i} style={{ display: 'grid', gap: 8 }}>
                <Skeleton width="70%" height={13} />
                <Skeleton width="40%" height={10} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export function DashboardContent() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dashboard', { cache: 'no-store' });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not load dashboard');
      setData(body?.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading dashboard">
        <DashboardSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card" style={{ borderColor: 'rgba(239,68,68,.35)' }}>
        <ErrorState message={error ?? 'Dashboard data is unavailable.'} />
        <div style={{ marginTop: 14 }}>
          <button type="button" onClick={load} className="badge" style={{ border: 0, cursor: 'pointer' }}>
            <Search size={13} /> Try again
          </button>
        </div>
      </div>
    );
  }

  const { counts } = data;
  const researchHint =
    counts.activeResearchRuns > 0
      ? `${counts.activeResearchRuns} running now`
      : counts.failedResearchRuns > 0
        ? `${counts.failedResearchRuns} failed`
        : 'All jobs finished';

  return (
    <>
      <NextActionsPanel actions={data.nextActions} />
      <div className="grid grid-4" style={{ marginTop: 16 }}>
        <MetricCard label="Active brands" value={counts.activeBrands} Icon={Users} delay={0} />
        <MetricCard label="Campaigns" value={counts.campaigns} Icon={Sparkles} delay={60} />
        <MetricCard label="Brand suggestions" value={counts.pendingSuggestions} Icon={ListChecks} hint={counts.pendingSuggestions > 0 ? 'Pending review' : 'Inbox clear'} delay={120} />
        <MetricCard label="Research jobs" value={counts.researchRuns} Icon={Globe2} hint={researchHint} delay={180} />
      </div>
      <div className="grid grid-3" style={{ marginTop: 16 }}>
        <RecentBrandsPanel brands={data.recentBrands} />
        <div className="grid" style={{ gap: 16 }}>
          <ResearchActivityPanel activity={data.recentResearch} />
          <StrategyActivityPanel activity={data.recentStrategies} />
        </div>
      </div>
    </>
  );
}