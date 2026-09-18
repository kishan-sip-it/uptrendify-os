import { describe, it, expect } from 'vitest';
import { evaluateContentGate, type ContentSnapshot } from './context';
import type { SuggestionRow } from '@/lib/brain/suggestions';
import type { StrategyOutput } from '@/lib/strategy/schema';

function suggestionRow(partial: Partial<SuggestionRow>): SuggestionRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    field: 'brand_name',
    label: 'Brand name',
    kind: 'identity',
    proposed_value: 'Aurora Labs',
    status: 'APPROVED',
    evidence: [],
    evidence_strength: null,
    sources_examined: 3,
    confidence: 0.9,
    history: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    reviewed_at: null,
    ...partial,
  };
}

function snapshot(overrides: Partial<ContentSnapshot> = {}): ContentSnapshot {
  return {
    brand: { name: 'Aurora Labs', websiteUrl: 'https://aurora.example', industry: null, marketCountry: null, targetAudience: null },
    facts: [],
    insights: [],
    evidenceClaims: [],
    sources: [],
    suggestionRows: [],
    researchRunId: null,
    strategy: {
      id: 'strategy-id',
      version: 2,
      title: 'Aurora — Marketing Strategy',
      output: { objectives: [] } as unknown as StrategyOutput,
      provider: 'gemini',
      model: 'gemini-3.6-flash',
    },
    ...overrides,
  };
}

const approved = ['brand_name', 'brand_value_proposition', 'target_audience', 'problems_solved'];

describe('evaluateContentGate', () => {
  it('blocks when there is no brand brain at all', () => {
    const gate = evaluateContentGate(snapshot({ suggestionRows: [] }));
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe('INSUFFICIENT_BRAIN');
    expect(gate.message).toMatch(/Import the brand website/i);
  });

  it('blocks when the approval gate is not met', () => {
    const rows = approved.slice(0, 2).map((field, index) => suggestionRow({ id: `s-${index}`, field, status: 'APPROVED' }));
    const gate = evaluateContentGate(snapshot({ suggestionRows: rows }));
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe('INSUFFICIENT_APPROVED_BRAIN');
    expect(gate.counts.approved).toBe(2);
    expect(gate.counts.approved).toBeLessThan(4);
    expect(gate.message).toMatch(/approved/i);
  });

  it('blocks when the approval gate passes but there is no approved strategy', () => {
    const rows = approved.map((field, index) => suggestionRow({ id: `s-${index}`, field, status: 'APPROVED' }));
    const gate = evaluateContentGate(snapshot({ suggestionRows: rows, strategy: null }));
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe('INSUFFICIENT_STRATEGY');
    expect(gate.message).toMatch(/approved strategy is required/i);
  });

  it('unlocks generation when brain and strategy are ready', () => {
    const rows = approved.map((field, index) => suggestionRow({ id: `s-${index}`, field, status: 'APPROVED' }));
    const gate = evaluateContentGate(snapshot({ suggestionRows: rows }));
    expect(gate.ok).toBe(true);
    expect(gate.code).toBeNull();
    expect(gate.strategy.ready).toBe(true);
    expect(gate.strategy.version).toBe(2);
  });

  it('counts EDITED suggestions toward the approval requirement', () => {
    const rows = approved.map((field, index) => suggestionRow({ id: `s-${index}`, field, status: index === 0 ? 'EDITED' : 'APPROVED' }));
    const gate = evaluateContentGate(snapshot({ suggestionRows: rows }));
    expect(gate.ok).toBe(true);
    expect(gate.counts.approved).toBe(approved.length);
  });
});