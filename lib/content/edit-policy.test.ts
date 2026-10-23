import { describe, expect, it } from 'vitest';
import { EDITABLE_BODY_STATUSES } from './edit-policy';

describe('content body edit policy', () => {
  it('allows a creator to make a new version during review', () => {
    expect(EDITABLE_BODY_STATUSES).toContain('IN_REVIEW');
    expect(EDITABLE_BODY_STATUSES).toContain('CLIENT_REVIEW');
  });

  it('continues to support creator-owned revision states', () => {
    expect(EDITABLE_BODY_STATUSES).toEqual(
      expect.arrayContaining(['DRAFT', 'CHANGES_REQUESTED', 'REJECTED']),
    );
  });
});
