export type ChecklistTaskState = 'done' | 'running' | 'failed';

export type ChecklistSignals = {
  brandCount: number;
  researchRunCount: number;
  researchActive: boolean;
  researchDone: boolean;
  researchLatestStatus: string | null;
  brainSuggestionCount: number;
  brainPendingCount: number;
  brainReviewedCount: number;
  brainGatePassed: boolean;
  strategyCount: number;
  strategyActive: boolean;
  strategyReady: boolean;
  strategyLatestStatus: string | null;
  contentCount: number;
  contentGeneratedCount: number;
  contentInReviewCount: number;
  contentApprovedCount: number;
  contentReadyToPublishCount: number;
  contentPublishedCount: number;
  campaignCount: number;
  campaignPlannedCount: number;
  campaignActiveCount: number;
  campaignCompletedCount: number;
};

export type ChecklistResourceState = {
  content?: { status?: string | null; generationStatus?: string | null; versionCount?: number } | null;
  campaign?: { status?: string | null; contentCount?: number; strategyCount?: number } | null;
};

export type ChecklistStateContext = {
  pathname: string;
  view: string | null;
  signals: ChecklistSignals | null;
  resource: ChecklistResourceState | null;
};

const SERVER_DRIVEN_TASKS = new Set([
  'dashboard-brands', 'dashboard-brand', 'brain-review', 'brain-approve', 'brain-strategy',
  'strategy-generate', 'strategy-review', 'strategy-campaign', 'brand-research', 'brand-brain',
  'brand-strategy', 'campaign-plan-detail', 'campaign-content-detail', 'campaign-return',
  'content-generate', 'content-approval', 'content-approvals', 'approval-approve',
  'approval-queue', 'publishing-confirm', 'workspace-brand',
]);

export function isServerDrivenChecklistTask(taskId: string): boolean {
  return SERVER_DRIVEN_TASKS.has(taskId);
}

function stateFromJob(status: string | null | undefined, completed: boolean): ChecklistTaskState | null {
  const normalized = (status ?? '').toUpperCase();
  if (normalized === 'QUEUED' || normalized === 'RUNNING') return 'running';
  if (completed || normalized === 'COMPLETED' || normalized === 'SUCCEEDED') return 'done';
  if (normalized === 'FAILED') return 'failed';
  return null;
}

function hasBrandRoute(pathname: string): boolean {
  return /^\/brands\/[^/]+$/.test(pathname);
}

export function getChecklistTaskState(taskId: string, context: ChecklistStateContext): ChecklistTaskState | null {
  const { pathname, view, signals, resource } = context;
  const isNewCampaign = /^\/brands\/[^/]+\/campaigns\/new\/?$/.test(pathname);
  const content = resource?.content;
  const campaign = resource?.campaign;
  const contentStatus = content?.status?.toUpperCase() ?? '';
  const campaignStatus = campaign?.status?.toUpperCase() ?? '';

  switch (taskId) {
    case 'dashboard-brands':
      return signals ? (signals.brandCount > 0 ? 'done' : null) : null;
    case 'dashboard-brand':
    case 'workspace-brand':
      return hasBrandRoute(pathname) ? 'done' : null;
    case 'brand-research': {
      if (!signals) return null;
      const jobState = stateFromJob(signals.researchLatestStatus, signals.researchDone);
      if (signals.researchActive) return 'running';
      if (signals.researchDone) return 'done';
      if (jobState === 'failed') return 'failed';
      return signals.researchRunCount > 0 ? jobState : null;
    }
    case 'brand-brain':
      return (signals?.brainSuggestionCount ?? 0) > 0 || view === 'brain' ? 'done' : null;
    case 'brain-review':
      return signals && signals.brainSuggestionCount > 0 && signals.brainPendingCount === 0 ? 'done' : null;
    case 'brain-approve':
      return signals?.brainGatePassed ? 'done' : null;
    case 'brain-strategy':
    case 'brand-strategy':
      if (signals?.strategyActive) return 'running';
      return view === 'strategy' || Boolean(signals?.strategyReady) ? 'done' : null;
    case 'strategy-generate':
      if (!signals) return null;
      if (signals.strategyActive) return 'running';
      if (signals.strategyReady) return 'done';
      return signals.strategyLatestStatus?.toUpperCase() === 'FAILED' ? 'failed' : null;
    case 'strategy-review':
      return signals?.strategyReady ? 'done' : null;
    case 'strategy-campaign':
      return isNewCampaign || (signals?.campaignCount ?? 0) > 0 ? 'done' : null;
    case 'campaign-plan-detail':
      return ['PLANNED', 'ACTIVE', 'IN_PROGRESS', 'COMPLETED'].includes(campaignStatus) ? 'done' : null;
    case 'campaign-content-detail':
    case 'campaign-return':
      return (campaign?.contentCount ?? 0) > 0 ? 'done' : null;
    case 'content-generate': {
      if (!content) return null;
      const generationStatus = content.generationStatus?.toUpperCase() ?? '';
      const generated = (content.versionCount ?? 0) > 0 ||
        ['IN_REVIEW', 'CLIENT_REVIEW', 'APPROVED', 'READY_TO_PUBLISH', 'PUBLISHED'].includes(contentStatus);
      return stateFromJob(generationStatus, generated);
    }
    case 'content-approval':
      return ['IN_REVIEW', 'CLIENT_REVIEW', 'APPROVED', 'READY_TO_PUBLISH', 'PUBLISHED'].includes(contentStatus) ? 'done' : null;
    case 'content-approvals':
      return ['APPROVED', 'READY_TO_PUBLISH', 'PUBLISHED'].includes(contentStatus) ? 'done' : null;
    case 'approval-approve':
      return (signals?.contentApprovedCount ?? 0) > 0 ? 'done' : null;
    case 'approval-queue':
      return (signals?.contentReadyToPublishCount ?? 0) > 0 || (signals?.contentPublishedCount ?? 0) > 0 ? 'done' : null;
    case 'publishing-confirm':
      return (signals?.contentPublishedCount ?? 0) > 0 ? 'done' : null;
    default:
      return null;
  }
}
