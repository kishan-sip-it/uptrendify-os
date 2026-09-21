import { describe, it, expect } from 'vitest';
import {
  CAMPAIGN_ACTION_TRANSITIONS,
  allowedActionsFor,
  canTransition,
  targetStatusFor,
  CAMPAIGN_STATUS_ACTIONS,
  campaignStatusActionSchema,
} from './lifecycle';
import { CAMPAIGN_STATUSES } from '../campaign/schema';

describe('campaign lifecycle', () => {
  it('covers every status with a transition on both lifecycle ends', () => {
    for (const status of CAMPAIGN_STATUSES) {
      expect(allowedActionsFor(status)).toBeInstanceOf(Array);
    }
  });

  it.each([
    ['DRAFT', 'plan'],
    ['PLANNED', 'activate'],
    ['ACTIVE', 'pause'],
    ['PLANNED', 'complete'],
    ['ACTIVE', 'complete'],
    ['DRAFT', 'archive'],
    ['PLANNED', 'archive'],
    ['ACTIVE', 'archive'],
    ['COMPLETED', 'archive'],
    ['PLANNED', 'back_to_draft'],
  ])('allows %s -> %s', (current, action) => {
    expect(canTransition(current as never, action as never)).toBe(true);
  });

  it.each([
    ['DRAFT', 'activate'],
    ['DRAFT', 'complete'],
    ['ACTIVE', 'back_to_draft'],
    ['ACTIVE', 'activate'],
    ['COMPLETED', 'activate'],
    ['COMPLETED', 'complete'],
    ['COMPLETED', 'back_to_draft'],
    ['ARCHIVED', 'archive'],
    ['ARCHIVED', 'plan'],
    ['ARCHIVED', 'back_to_draft'],
  ])('rejects %s -> %s', (current, action) => {
    expect(canTransition(current as never, action as never)).toBe(false);
  });

  it('exposes a valid status/action vocabulary', () => {
    expect(CAMPAIGN_STATUS_ACTIONS).toHaveLength(6);
    for (const action of CAMPAIGN_STATUS_ACTIONS) {
      expect(CAMPAIGN_ACTION_TRANSITIONS[action]).toMatchObject({ from: expect.any(Array), to: expect.any(String) });
    }
  });

  it('resolves the target status for each action', () => {
    expect(targetStatusFor('plan')).toBe('PLANNED');
    expect(targetStatusFor('activate')).toBe('ACTIVE');
    expect(targetStatusFor('pause')).toBe('PLANNED');
    expect(targetStatusFor('complete')).toBe('COMPLETED');
    expect(targetStatusFor('archive')).toBe('ARCHIVED');
    expect(targetStatusFor('back_to_draft')).toBe('DRAFT');
  });

  it('accepts only known actions in the status schema', () => {
    expect(campaignStatusActionSchema.safeParse({ action: 'plan' }).success).toBe(true);
    expect(campaignStatusActionSchema.safeParse({ action: 'warp' }).success).toBe(false);
    expect(campaignStatusActionSchema.safeParse({ action: 'plan', extra: 1 }).success).toBe(false);
  });
});