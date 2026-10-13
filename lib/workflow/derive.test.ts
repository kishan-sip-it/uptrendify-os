import { describe, expect, it } from 'vitest';
import { deriveWorkflowState } from './derive';

const base = {
  researchActive: false, researchDone: true, brandBrainReady: true, strategyReady: true,
  contentCount: 1, pendingApproval: false, readyToPublish: false, campaignCount: 1,
};

describe('deriveWorkflowState', () => {
  it('starts at research when no completed run exists', () => {
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
    expect(deriveWorkflowState({ ...base, contentCount: 0, campaignCount: 0 })).toEqual({ currentKey: 'content', nextAction: 'Create your first content' });
  });
  it('does not skip Campaigns while content awaits approval', () => {
    expect(deriveWorkflowState({ ...base, campaignCount: 0, pendingApproval: true })).toEqual({ currentKey: 'campaigns', nextAction: 'Create a campaign' });
  });
  it('does not skip Campaigns while content is ready to publish', () => {
    expect(deriveWorkflowState({ ...base, campaignCount: 0, readyToPublish: true })).toEqual({ currentKey: 'campaigns', nextAction: 'Create a campaign' });
  });
  it('moves to approval after a campaign exists', () => {
    expect(deriveWorkflowState({ ...base, campaignCount: 1, pendingApproval: true })).toEqual({ currentKey: 'approval', nextAction: 'Review content awaiting approval' });
  });
  it('moves to publishing after campaign setup', () => {
    expect(deriveWorkflowState({ ...base, campaignCount: 1, readyToPublish: true })).toEqual({ currentKey: 'publishing', nextAction: 'Publish approved content' });
  });
  it('keeps Campaigns current while organizing campaign work', () => {
    expect(deriveWorkflowState(base)).toEqual({ currentKey: 'campaigns', nextAction: 'Review campaign performance and add content' });
  });
});
