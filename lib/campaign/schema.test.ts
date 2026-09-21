import { describe, it, expect } from 'vitest';
import { campaignCreateSchema, campaignUpdateSchema } from './schema';

const STRATEGY_ID = '00000000-0000-4000-8000-00000000000a';

const VALID = {
  name: 'Summer Growth',
  objective: 'Drive qualified demos',
  description: 'Hero campaign across all channels',
  strategyId: STRATEGY_ID,
  startDate: '2026-01-01',
  endDate: '2026-03-31',
  budget: 25000,
  currency: 'usd',
  channels: ['meta_ads', 'email'],
};

describe('campaignCreateSchema', () => {
  it('parses a valid campaign and normalizes currency', () => {
    const result = campaignCreateSchema.safeParse(VALID);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.currency).toBe('USD');
  });

  it('accepts an empty planning shape (dates/budget/channels omitted)', () => {
    const result = campaignCreateSchema.safeParse({ name: 'Draft campaign', strategyId: STRATEGY_ID });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = campaignCreateSchema.safeParse({ ...VALID, name: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects a name that exceeds the maximum length', () => {
    const result = campaignCreateSchema.safeParse({ ...VALID, name: 'x'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('rejects a missing strategyId', () => {
    const result = campaignCreateSchema.safeParse({ name: 'Solo' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed strategyId', () => {
    const result = campaignCreateSchema.safeParse({ ...VALID, strategyId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects a negative budget', () => {
    const result = campaignCreateSchema.safeParse({ ...VALID, budget: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-finite budget', () => {
    const result = campaignCreateSchema.safeParse({ ...VALID, budget: Number.NaN });
    expect(result.success).toBe(false);
  });

  it('rejects an oversize budget', () => {
    const result = campaignCreateSchema.safeParse({ ...VALID, budget: 1e12 });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid currency code', () => {
    const result = campaignCreateSchema.safeParse({ ...VALID, currency: 'US' });
    expect(result.success).toBe(false);
  });

  it('rejects malformed dates', () => {
    const result = campaignCreateSchema.safeParse({ ...VALID, startDate: '2026/01/01' });
    expect(result.success).toBe(false);
  });

  it('rejects startDate after endDate', () => {
    const result = campaignCreateSchema.safeParse({ ...VALID, startDate: '2026-05-01', endDate: '2026-04-01' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown channel', () => {
    const result = campaignCreateSchema.safeParse({ ...VALID, channels: ['carrier_pigeon'] });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys (strict object)', () => {
    const result = campaignCreateSchema.safeParse({ ...VALID, strategyId: STRATEGY_ID, foo: 'bar' });
    expect(result.success).toBe(false);
  });
});

describe('campaignUpdateSchema', () => {
  it('accepts a partial update', () => {
    const result = campaignUpdateSchema.safeParse({ budget: 1000 });
    expect(result.success).toBe(true);
  });

  it('accepts an empty update body', () => {
    const result = campaignUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects an invalid date range in a partial update', () => {
    const result = campaignUpdateSchema.safeParse({ startDate: '2026-02-01', endDate: '2026-01-01' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys', () => {
    const result = campaignUpdateSchema.safeParse({ slippage: 0.5 });
    expect(result.success).toBe(false);
  });
});