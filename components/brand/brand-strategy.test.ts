import { describe, it, expect } from 'vitest';
import { resolveStrategyView, type LatestStrategy } from './brand-strategy';

type LatestFixture = Partial<Omit<LatestStrategy, 'output'>> & { output?: unknown };

function latest(overrides: LatestFixture = {}): LatestStrategy {
  const { output, ...rest } = overrides;
  return {
    id: 'strategy-1',
    title: 'Go-to-market strategy',
    status: 'QUEUED',
    version: 1,
    provider: null,
    model: null,
    inputSnapshot: {},
    errorCode: null,
    errorMessage: null,
    createdAt: null,
    startedAt: null,
    finishedAt: null,
    ...rest,
    output: (output ?? {}) as LatestStrategy['output'],
  };
}

function validOutput() {
  return {
    executiveSummary: { summary: 'Summary' },
    businessUnderstanding: {},
    objectives: [],
    icp: {},
    positioning: {},
    messaging: {},
    contentStrategy: {},
    seoStrategy: {},
    channels: [],
    campaigns: [],
    roadmap: {
      days1To30: [{ action: 'Launch', reason: 'Now', expectedOutcome: 'Adoption', priority: 'high' }],
      days31To60: [],
      days61To90: [],
    },
    kpis: {},
    risksAndGaps: {},
    assumptions: [],
  };
}

describe('resolveStrategyView', () => {
  it('never renders StrategyContent while QUEUED', () => {
    const view = resolveStrategyView(latest({ status: 'QUEUED' }));
    expect(view.kind).toBe('live');
    expect(view.kind).not.toBe('content');
  });

  it('never renders StrategyContent while RUNNING', () => {
    const view = resolveStrategyView(latest({ status: 'RUNNING' }));
    expect(view.kind).toBe('live');
    expect(view.kind).not.toBe('content');
  });

  it('renders content for SUCCEEDED with a valid roadmap', () => {
    const view = resolveStrategyView(latest({ status: 'SUCCEEDED', output: validOutput() }));
    expect(view.kind).toBe('content');
  });

  it('does not crash and reports missing output for SUCCEEDED without roadmap', () => {
    const output = validOutput();
    delete (output as { roadmap?: unknown }).roadmap;
    const view = resolveStrategyView(latest({ status: 'SUCCEEDED', output }));
    expect(view.kind).toBe('missing');
    expect(view.kind).not.toBe('content');
  });

  it('does not crash and reports missing output for SUCCEEDED with null output', () => {
    const view = resolveStrategyView(latest({ status: 'SUCCEEDED', output: null as unknown as LatestStrategy['output'] }));
    expect(view.kind).toBe('missing');
  });

  it('still shows the error/retry view for FAILED', () => {
    const view = resolveStrategyView(latest({ status: 'FAILED', errorMessage: 'boom' }));
    expect(view.kind).toBe('failed');
  });

  it('shows the empty state when there is no strategy', () => {
    expect(resolveStrategyView(null).kind).toBe('empty');
  });

  it('shows a safe fallback for unexpected terminal statuses', () => {
    const view = resolveStrategyView(latest({ status: 'CANCELLED' }));
    expect(view.kind).toBe('unknown');
    expect(view.kind).not.toBe('content');
  });
});