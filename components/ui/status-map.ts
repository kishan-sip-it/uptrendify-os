export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';
type StatusMeta = { label: string; tone: StatusTone; live?: boolean };

const STATUS_META: Record<string, StatusMeta> = {
  QUEUED: { label: 'Queued', tone: 'info', live: true },
  RUNNING: { label: 'Running', tone: 'info', live: true },
  COMPLETED: { label: 'Completed', tone: 'success' },
  SUCCEEDED: { label: 'Succeeded', tone: 'success' },
  SUCCESS: { label: 'Succeeded', tone: 'success' },
  PARTIAL: { label: 'Partial', tone: 'warning' },
  FAILED: { label: 'Failed', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  CANCELED: { label: 'Cancelled', tone: 'neutral' },
  SKIPPED: { label: 'Skipped', tone: 'neutral' },
  PENDING: { label: 'Needs review', tone: 'warning' },
  NEEDS_REVIEW: { label: 'Needs review', tone: 'warning' },
  IN_REVIEW: { label: 'In review', tone: 'info' },
  CLIENT_REVIEW: { label: 'Client review', tone: 'warning' },
  CHANGES_REQUESTED: { label: 'Changes requested', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  DRAFT: { label: 'Draft', tone: 'neutral' },
  ACTIVE: { label: 'Active', tone: 'success' },
  PLANNED: { label: 'Planned', tone: 'info' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
  SCHEDULED: { label: 'Scheduled', tone: 'info' },
  PUBLISHED: { label: 'Published', tone: 'success' },
  READY_TO_PUBLISH: { label: 'Ready to publish', tone: 'brand' },
  READY: { label: 'Ready', tone: 'success' },
  BLOCKED: { label: 'Blocked', tone: 'warning' },
  EXPIRED: { label: 'Expired', tone: 'danger' },
};

function humanizeStatus(status: string): string {
  return status.trim().replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Unknown';
}

export function getStatusMeta(status: string): StatusMeta {
  const key = status.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return STATUS_META[key] ?? { label: humanizeStatus(status), tone: 'neutral' };
}
