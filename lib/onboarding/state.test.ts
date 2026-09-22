import { describe, expect, it } from 'vitest';
import { completedStepsWith, mergeOnboardingDraft } from './state';

describe('onboarding persistence helpers', () => {
  const empty = { workspaceName: '', websiteUrl: '', primaryColor: '#67c79f' };

  it('restores stored draft values without losing new fields', () => {
    expect(mergeOnboardingDraft(empty, { workspaceName: 'Northstar', websiteUrl: 'https://example.com' })).toEqual({
      workspaceName: 'Northstar',
      websiteUrl: 'https://example.com',
      primaryColor: '#67c79f',
    });
  });

  it('returns a safe fresh draft for malformed stored data', () => {
    expect(mergeOnboardingDraft(empty, 'not-an-object')).toEqual(empty);
    expect(mergeOnboardingDraft(empty, null)).toEqual(empty);
  });

  it('adds completed steps without duplicates and keeps ordering', () => {
    expect(completedStepsWith([0, 2], 1)).toEqual([0, 1, 2]);
    expect(completedStepsWith([0, 1, 2], 1)).toEqual([0, 1, 2]);
  });
});
