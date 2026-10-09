'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Globe2, ListChecks, Plus, Search, Sparkles, Target, Users, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { StatusBadge as SharedStatusBadge } from '@/components/ui/status-badge';
import { Stat } from '@/components/ui/stat';
import { Skeleton } from '@/components/ui/skeleton';
import { RelativeTime } from '@/components/ui/relative-time';
import { SectionHeading } from '@/components/ui/section-heading';
import type { DashboardData, NextAction, RecentBrand, ResearchActivity, StrategyActivity } from '@/lib/dashboard/data';

const ACTION_ICONS: Record<NextAction['kind'], LucideIcon> = {
  brand: Plus,
  review: ListChecks,
  research: Globe2,
  retry: Zap,
  strategy: Target,
};



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


function MetricCard({ label, value, Icon, hint, delay }: { label: string; value: number; Icon: LucideIcon; hint?: string; delay: number }) {
  const animated = useCountUp(value);
  return (
    <Stat
      label={label}
      value={animated}
      hint={hint}
      icon={<Icon size={15} />}
      className="metric hover-lift animate-fade-up"
      style={{ animationDelay: String(delay) + 'ms' }}
    />
  );
}

function RecentBrandsPanel({ brands }: { brands: RecentBrand[] }) {
  return (
    <div className="card" style={{ gridColumn: 'span 2' }}>
      <SectionHeading className="section-title" eyebrow="Portfolio" title="Recent brands" />
      {brands.length === 0 ? (
        <EmptyState
          title="No brands yet"
          description="Add your first brand to start analyzing its public website and building strategies."
          action={<span className="field-note">Use <strong>Add brand</strong> in the left sidebar to create your first brand.</span>}
        />
      ) : (
        <div className="grid" id="brands">
          {brands.map((brand, i) => (
            <a className="card brand-card hover-lift animate-fade-up" href={`/brands/${brand.id}`} key={brand.id} style={{ animationDelay: `${i * 60}ms`, display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
                <div>
                  <h3 style={{ margin: 0 }}>{brand.name}</h3>
                  <div className="metric-label">{brand.industry || brand.website_url?.replace(/^https?:\/\//, '') || 'Brand'}</div>
                </div>
                <SharedStatusBadge status={brand.status ?? 'ACTIVE'} />
              </div>
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--muted)', fontSize: 13 }}>
                <span>Onboarded <RelativeTime date={brand.created_at} /></span>
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
      <SectionHeading className="section-title" eyebrow="Activity" title="Research runs" action={<Globe2 size={18} color="var(--muted)" />} />
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
                <div className="activity-body">
                  <div className="activity-title">{run.brand_name ?? 'Unknown brand'}</div>
                  <div className="activity-meta"><SharedStatusBadge status={run.status} /> · <RelativeTime date={run.created_at} /></div>
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
      <SectionHeading className="section-title" eyebrow="Activity" title="Strategy versions" action={<Target size={18} color="var(--muted)" />} />
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
                <div className="activity-body">
                  <div className="activity-title">
                    {run.brand_name ?? 'Unknown brand'}
                    <span className="chip" style={{ marginLeft: 8 }}>v{run.version}</span>
                  </div>
                  <div className="activity-meta"><SharedStatusBadge status={run.status} /> · <RelativeTime date={run.created_at} /></div>
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
      <SectionHeading className="section-title" eyebrow="Do this next" title="Recommended actions" />
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
              <div className="card" key={i} style={{ display: 'grid', gap: 10 }}>
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
    const message = error ?? 'Dashboard data is unavailable.';
    return (
      <div className="card ui-dashboard-error">
        <ErrorState
          message={message}
          action={<button type="button" onClick={() => void load()} className="badge" style={{ border: 0, cursor: 'pointer' }}><Search size={13} /> Try again</button>}
          diagnostics={'Dashboard load error: ' + message}
        />
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