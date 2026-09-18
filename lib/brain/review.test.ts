import { describe, it, expect } from 'vitest';
import { checkApprovalGate, GATE_MIN_APPROVED } from '@/lib/brain/review';
import type { SuggestionRow, SuggestionStatus } from '@/lib/brain/suggestions';

function row(status: SuggestionStatus, field = 'brand_name'): SuggestionRow {
  const now = new Date().toISOString();
  return {
    id: 'sug-1',
    field,
    label: 'Brand name',
    kind: 'business',
    proposed_value: 'value',
    status,
    evidence: [],
    evidence_strength: null,
    sources_examined: 8,
    confidence: 0.9,
    history: [],
    created_at: now,
    updated_at: now,
    reviewed_at: null,
  };
}

function rowsFor(fields: Array<[string, SuggestionStatus]>): SuggestionRow[] {
  return fields.map(([field, status]) => row(status, field));
}

function approved(field: string): [string, 'APPROVED'] {
  return [field, 'APPROVED'];
}

describe('checkApprovalGate', () => {
  it('passes when brand_name is approved and the minimum count is met', () => {
    const fields: Array<[string, SuggestionStatus]> = [
      approved('brand_name'),
      approved('brand_description'),
      approved('industry'),
      approved('target_audience'),
      approved('value_proposition'),
    ];
    const gate = checkApprovalGate(rowsFor(fields));
    expect(gate.ok).toBe(true);
    expect(gate.missing).toEqual([]);
  });

  it('accepts EDITED as satisfying a required field', () => {
    const fields: Array<[string, SuggestionStatus]> = [
      ['brand_name', 'EDITED'],
      approved('brand_description'),
      approved('industry'),
      approved('target_audience'),
      approved('value_proposition'),
    ];
    const gate = checkApprovalGate(rowsFor(fields));
    expect(gate.ok).toBe(true);
    expect(gate.missing).toEqual([]);
  });

  it('fails when brand_name is not approved even with enough approvals', () => {
    const fields: Array<[string, SuggestionStatus]> = [
      ['brand_name', 'PENDING'],
      approved('brand_description'),
      approved('industry'),
      approved('target_audience'),
      approved('value_proposition'),
      approved('differentiators'),
    ];
    const gate = checkApprovalGate(rowsFor(fields));
    expect(gate.ok).toBe(false);
    expect(gate.missing).toContain('brand_name');
  });

  it('fails when fewer than the minimum are approved', () => {
    const fields: Array<[string, SuggestionStatus]> = [
      approved('brand_name'),
      approved('brand_description'),
    ];
    const gate = checkApprovalGate(rowsFor(fields));
    expect(gate.ok).toBe(false);
  });

  it('exposes the presentation gate contract', () => {
    expect(GATE_MIN_APPROVED).toBe(4);
  });
});
