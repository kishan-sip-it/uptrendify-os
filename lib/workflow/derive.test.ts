import { describe, expect, it } from 'vitest';
import { deriveWorkflowState } from './derive';

const base = {
  researchActive: false,
  researchDone: true,
  brandBrainReady: true,
  strategyReady: true,
  contentCount: 1,
  pendingApproval: false,
  readyToPublish: false,
  campaignCount: 1,
};

describe('deriveWorkflowState', () => {
  it('starts with research when there is no completed run', () => {
    expect(deriveWorkflowState({ ...base, researchDone: false })).toEqual({ currentKey: 'research', nextAction: 'Start research' });
  });
  it('waits for active research', () => {
    expect(deriveWorkflowState({ ...base, researchActive: true })).toEqual({ currentKey: 'research', nextAction: 'Let research finish' });
  });
  it('stops at Brand Intelligence until its gate is ready', () => {
    expect(deriveWorkflowState({ ...base, brandBrainReady: false })).toEqual({ currentKey: 'brand_brain', nextAction: 'Review Brand Intelligence' });
  });
  it('stops at Strategy until a successful strategy exists', () => {
    expect(deriveWorkflowState({ ...base, strategyReady: false })).toEqual({ currentKey: 'strategy', nextAction: 'Generate strategy' });
  });
  it('asks for first content before campaign setup', () => {
    expect(deriveWorkflowState({ ...base, contentCount: 0 })).toEqual({ currentKey: 'content', nextAction: 'Create your first content' });
  });
  it('prioritizes publishing readiness', () => {
    expect(deriveWorkflowState({ ...base, readyToPublish: true })).toEqual({ currentKey: 'publishing', nextAction: 'Publish approved content' });
  });
  it('prioritizes approval over creating a campaign', () => {
    expect(deriveWorkflowState({ ...base, pendingApproval: true, campaignCount: 0 })).toEqual({ currentKey: 'approval', nextAction: 'Review content awaiting approval' });
  });
  it('asks for a campaign when content exists but no campaign does', () => {
    expect(deriveWorkflowState({ ...base, campaignCount: 0 })).toEqual({ currentKey: 'campaigns', nextAction: 'Create a campaign' });
  });
});
