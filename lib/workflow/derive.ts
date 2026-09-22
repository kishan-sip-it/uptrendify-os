export type WorkflowKey = 'research' | 'brand_brain' | 'strategy' | 'content' | 'campaigns' | 'approval' | 'publishing';

export type WorkflowInputs = {
  researchActive: boolean;
  researchDone: boolean;
  brandBrainReady: boolean;
  strategyReady: boolean;
  contentCount: number;
  pendingApproval: boolean;
  readyToPublish: boolean;
  campaignCount: number;
};

export function deriveWorkflowState(input: WorkflowInputs): { currentKey: WorkflowKey; nextAction: string } {
  if (input.researchActive) return { currentKey: 'research', nextAction: 'Let research finish' };
  if (!input.researchDone) return { currentKey: 'research', nextAction: 'Start research' };
  if (!input.brandBrainReady) return { currentKey: 'brand_brain', nextAction: 'Review Brand Intelligence' };
  if (!input.strategyReady) return { currentKey: 'strategy', nextAction: 'Generate strategy' };
  if (input.contentCount === 0) return { currentKey: 'content', nextAction: 'Create your first content' };
  if (input.readyToPublish) return { currentKey: 'publishing', nextAction: 'Publish approved content' };
  if (input.pendingApproval) return { currentKey: 'approval', nextAction: 'Review content awaiting approval' };
  if (input.campaignCount === 0) return { currentKey: 'campaigns', nextAction: 'Create a campaign' };
  return { currentKey: 'campaigns', nextAction: 'Review campaign performance and add content' };
}
