import { describe, expect, it } from 'vitest';
import { readIdentity } from './identity-mapping';

function row(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Example',
    description: null,
    industry: null,
    primary_color: null,
    secondary_colors: [],
    visual_identity: {
      aiProfile: {
        products: [],
        services: [],
        audience: 'AI audience',
        personas: [],
        customerTypes: [],
        painPoints: [],
        useCases: [],
        tone: ['Professional'],
        terminology: [],
        recurringClaims: [],
        messagingThemes: [],
        valueProposition: 'AI value proposition',
        differentiators: [],
        positioningThemes: [],
        callsToAction: [],
        productCategories: [],
        businessModel: null,
        primaryMarket: null,
        geography: null,
        evidence: [],
      },
      voice: { tone: ['Professional'], personality: [], styleNotes: null },
    },
    positioning: {},
    messaging: {},
    audience_details: {},
    ...overrides,
  };
}

describe('readIdentity human overrides', () => {
  it('falls back to extracted AI values when no human override exists', () => {
    const identity = readIdentity(row());
    expect(identity.valueProposition).toBe('AI value proposition');
    expect(identity.audienceSummary).toBe('AI audience');
  });

  it('preserves an explicitly cleared positioning value instead of falling back to AI', () => {
    const identity = readIdentity(row({ positioning: { valueProposition: null } }));
    expect(identity.valueProposition).toBeNull();
  });

  it('preserves an explicitly cleared audience value instead of falling back to AI', () => {
    const identity = readIdentity(row({ audience_details: { summary: null } }));
    expect(identity.audienceSummary).toBeNull();
  });
});
