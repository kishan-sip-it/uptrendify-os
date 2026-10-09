import { describe, expect, it } from 'vitest';
import { getStatusMeta } from './status-map';

describe('shared status mapping', () => {
  it('normalizes active run states and marks only live states as live', () => {
    expect(getStatusMeta('RUNNING')).toEqual({ label: 'Running', tone: 'info', live: true });
    expect(getStatusMeta('queued')).toEqual({ label: 'Queued', tone: 'info', live: true });
    expect(getStatusMeta('COMPLETED')).toEqual({ label: 'Completed', tone: 'success' });
  });

  it('humanizes workflow states into the same labels throughout the UI', () => {
    expect(getStatusMeta('ready-to-publish')).toEqual({ label: 'Ready to publish', tone: 'brand' });
    expect(getStatusMeta('PENDING')).toEqual({ label: 'Needs review', tone: 'warning' });
    expect(getStatusMeta('CHANGES_REQUESTED')).toEqual({ label: 'Changes requested', tone: 'warning' });
    expect(getStatusMeta('A_CUSTOM_STATE')).toEqual({ label: 'A Custom State', tone: 'neutral' });
  });

  it('handles missing values without exposing raw empty text', () => {
    expect(getStatusMeta('')).toEqual({ label: 'Unknown', tone: 'neutral' });
  });
});
