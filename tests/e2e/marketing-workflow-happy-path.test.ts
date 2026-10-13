import { describe, expect, it } from 'vitest';
import { deriveWorkflowState, type WorkflowInputs, type WorkflowKey } from '@/lib/workflow/derive';

const snapshot = (overrides: Partial<WorkflowInputs> = {}): WorkflowInputs => ({
  researchActive: false,
  researchDone: true,
  brandBrainReady: true,
  strategyReady: true,
  contentCount: 1,
  pendingApproval: false,
  readyToPublish: false,
  campaignCount: 1,
  ...overrides,
});

describe('marketing workflow happy-path journey', () => {
  it('moves through every stage and never skips campaign setup', () => {
    const journey: Array<{ name: string; input: WorkflowInputs; expected: WorkflowKey }> = [
      { name: 'research is running', input: snapshot({ researchActive: true }), expected: 'research' },
      { name: 'Brand Brain requires review', input: snapshot({ brandBrainReady: false }), expected: 'brand_brain' },
      { name: 'strategy is missing', input: snapshot({ strategyReady: false }), expected: 'strategy' },
      { name: 'first content is missing', input: snapshot({ contentCount: 0, campaignCount: 0 }), expected: 'content' },
      { name: 'campaign must exist before approval or publishing', input: snapshot({ campaignCount: 0, pendingApproval: true }), expected: 'campaigns' },
      { name: 'campaign exists and content awaits approval', input: snapshot({ pendingApproval: true }), expected: 'approval' },
      { name: 'approved content is ready to publish', input: snapshot({ readyToPublish: true }), expected: 'publishing' },
    ];
    for (const stage of journey) {
      expect(deriveWorkflowState(stage.input).currentKey, stage.name).toBe(stage.expected);
    }
  });
});
