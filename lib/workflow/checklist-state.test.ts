import { describe, expect, it } from 'vitest';
import {
  getChecklistTaskState,
  isServerDrivenChecklistTask,
  type ChecklistSignals,
} from './checklist-state';

const signals: ChecklistSignals = {
  brandCount: 1,
  researchRunCount: 1,
  researchActive: false,
  researchDone: false,
  researchLatestStatus: 'RUNNING',
  brainSuggestionCount: 0,
  brainPendingCount: 0,
  brainReviewedCount: 0,
  brainGatePassed: false,
  strategyCount: 0,
  strategyActive: false,
  strategyReady: false,
  strategyLatestStatus: null,
  contentCount: 0,
  contentGeneratedCount: 0,
  contentInReviewCount: 0,
  contentApprovedCount: 0,
  contentReadyToPublishCount: 0,
  contentPublishedCount: 0,
  campaignCount: 0,
  campaignPlannedCount: 0,
  campaignActiveCount: 0,
  campaignCompletedCount: 0,
};

describe('live contextual checklist state', () => {
  it('marks research as in progress as soon as a run is queued or running', () => {
    expect(getChecklistTaskState('brand-research', {
      pathname: '/brands/brand-1', view: null, signals, resource: null,
    })).toBe('running');
  });

  it('marks research done from persisted terminal state without a click', () => {
    expect(getChecklistTaskState('brand-research', {
      pathname: '/brands/brand-1',
      view: null,
      signals: { ...signals, researchDone: true, researchLatestStatus: 'COMPLETED' },
      resource: null,
    })).toBe('done');
  });

  it('keeps failed research retryable rather than marking it completed', () => {
    expect(getChecklistTaskState('brand-research', {
      pathname: '/brands/brand-1',
      view: null,
      signals: { ...signals, researchLatestStatus: 'FAILED' },
      resource: null,
    })).toBe('failed');
  });

  it('marks a strategy generation attempt while it is running', () => {
    expect(getChecklistTaskState('strategy-generate', {
      pathname: '/brands/brand-1',
      view: 'strategy',
      signals: { ...signals, strategyActive: true, strategyLatestStatus: 'RUNNING' },
      resource: null,
    })).toBe('running');
  });

  it('only marks the Brand Brain gate when the required approval gate is satisfied', () => {
    expect(getChecklistTaskState('brain-approve', {
      pathname: '/brands/brand-1', view: 'brain', signals, resource: null,
    })).toBeNull();
    expect(getChecklistTaskState('brain-approve', {
      pathname: '/brands/brand-1',
      view: 'brain',
      signals: { ...signals, brainGatePassed: true },
      resource: null,
    })).toBe('done');
  });

  it('marks a strategy review as complete when the strategy is ready, regardless of which buttons were clicked', () => {
    expect(getChecklistTaskState('strategy-review', {
      pathname: '/brands/brand-1', view: 'strategy',
      signals: { ...signals, strategyReady: true, strategyLatestStatus: 'SUCCEEDED' },
      resource: null,
    })).toBe('done');
  });

  it('waits for all suggestions to be reviewed before checking the review inbox step', () => {
    expect(getChecklistTaskState('brain-review', {
      pathname: '/brands/brand-1', view: 'brain',
      signals: { ...signals, brainSuggestionCount: 4, brainPendingCount: 1, brainReviewedCount: 3 },
      resource: null,
    })).toBeNull();
    expect(getChecklistTaskState('brain-review', {
      pathname: '/brands/brand-1', view: 'brain',
      signals: { ...signals, brainSuggestionCount: 4, brainPendingCount: 0, brainReviewedCount: 4 },
      resource: null,
    })).toBe('done');
  });

  it('marks content generation running or complete from the content detail API state', () => {
    const context = { pathname: '/brands/brand-1/content/content-1', view: null, signals, resource: {
      content: { status: 'DRAFT', generationStatus: 'RUNNING', versionCount: 0 },
    } };
    expect(getChecklistTaskState('content-generate', context)).toBe('running');
    expect(getChecklistTaskState('content-generate', {
      ...context,
      resource: { content: { status: 'DRAFT', generationStatus: 'SUCCEEDED', versionCount: 1 } },
    })).toBe('done');
  });

  it('uses the campaign item status rather than a click to detect planning', () => {
    expect(getChecklistTaskState('campaign-plan-detail', {
      pathname: '/brands/brand-1/campaigns/campaign-1', view: null, signals,
      resource: { campaign: { status: 'DRAFT', contentCount: 0, strategyCount: 1 } },
    })).toBeNull();
    expect(getChecklistTaskState('campaign-plan-detail', {
      pathname: '/brands/brand-1/campaigns/campaign-1', view: null, signals,
      resource: { campaign: { status: 'PLANNED', contentCount: 0, strategyCount: 1 } },
    })).toBe('done');
  });

  it('does not use click text as the source of truth for backend-backed tasks', () => {
    expect(isServerDrivenChecklistTask('brand-research')).toBe(true);
    expect(isServerDrivenChecklistTask('content-generate')).toBe(true);
    expect(isServerDrivenChecklistTask('approval-approve')).toBe(true);
  });
});
