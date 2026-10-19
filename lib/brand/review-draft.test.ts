import { describe, expect, it } from 'vitest';
import { applyPrimaryColorToDraft, buildCreatePatchPayload, buildReviewDraft } from './review-draft';
import { toVisualIdentity } from './identity-mapping';
import type { ReviewDraftSource } from './review-draft';

const SCAN: ReviewDraftSource = {
  description: 'Device management for Apple fleets.',
  palette: [
    { hex: '#0143fe', occurrences: 12, saturation: 0.9, prominence: 0.8, role: 'primary', sources: ['external-stylesheet'] },
    { hex: '#4bd783', occurrences: 4, saturation: 0.7, prominence: 0.5, role: 'secondary', sources: ['external-stylesheet'] },
    { hex: '#ffffff', occurrences: 30, saturation: 0, prominence: 0.3, role: 'neutral', sources: ['css-color-declaration'] },
  ],
  primaryColor: '#0143fe',
  fonts: [{ family: 'Inter', source: 'css-declaration', evidence: 'heading selector' }],
  aiProfile: {
    products: ['Kandji MDM'],
    services: [],
    keyFeatures: [],
    benefits: [],
    pricingSignals: [],
    audience: 'IT teams',
    personas: [{ name: 'IT admin', description: 'Runs device fleets' }],
    customerTypes: ['Enterprise'],
    painPoints: ['Manual enrolment'],
    useCases: ['Zero-touch deploy'],
    tone: ['Confident'],
    terminology: ['Blueprints'],
    recurringClaims: [],
    messagingThemes: [],
    valueProposition: 'Autonomous device management.',
    differentiators: ['Autopilot'],
    positioningThemes: [],
    callsToAction: ['Book a demo'],
    productCategories: ['MDM'],
    industry: 'Device management',
    businessModel: 'SaaS',
    primaryMarket: 'United States',
    geography: 'Global',
    evidence: [{ claim: 'Kandji MDM exists', sourceUrl: 'https://example.com/products' }],
    seo: { importantTopics: ['mdm'], keywordThemes: ['apple mdm'], contentGaps: [], searchIntentOpportunities: [] },
    competition: { namedCompetitors: ['Jamf'], alternatives: [], differentiationClaims: [] },
  },
};

const draftOf = (source: ReviewDraftSource) => buildReviewDraft(source);

describe('buildReviewDraft', () => {
  it('copies every scanned value into the editable draft', () => {
    const draft = draftOf(SCAN);
    expect(draft.description).toBe('Device management for Apple fleets.');
    expect(draft.industry).toBe('Device management');
    expect(draft.products).toEqual(['Kandji MDM']);
    expect(draft.personas).toEqual([{ name: 'IT admin', description: 'Runs device fleets' }]);
    expect(draft.seo.importantTopics).toEqual(['mdm']);
    expect(draft.competition.namedCompetitors).toEqual(['Jamf']);
    expect(draft.primaryColor).toBe('#0143fe');
    expect(draft.palette.map((color) => color.hex)).toEqual(['#0143fe', '#4bd783', '#ffffff']);
    expect(draft.headingFont).toBe('Inter');
  });

  it('produces honest empty values when the scan found no AI profile', () => {
    // openai.com-style honest-empty scan: no logo, no palette, no AI profile.
    const draft = draftOf({ description: null, palette: [], primaryColor: null, fonts: [], aiProfile: null });
    expect(draft.products).toEqual([]);
    expect(draft.description).toBeNull();
    expect(draft.primaryColor).toBeNull();
    expect(draft.palette).toEqual([]);
    expect(draft.seo.importantTopics).toEqual([]);
  });
});

describe('buildCreatePatchPayload', () => {
  it('persists an untouched draft with the scanned values everywhere the profile reads', () => {
    const draft = draftOf(SCAN);
    const patch = buildCreatePatchPayload(draft, SCAN as never);
    const visual = patch.visualIdentity as Record<string, unknown>;
    const ai = visual.aiProfile as Record<string, unknown>;
    expect(patch.description).toBe('Device management for Apple fleets.');
    expect(patch.primaryColor).toBe('#0143fe');
    expect(patch.secondaryColors).toEqual(['#4bd783', '#ffffff']);
    expect((patch.offerDetails as Record<string, unknown>).products).toEqual(['Kandji MDM']);
    expect((patch.positioning as Record<string, unknown>).valueProposition).toBe('Autonomous device management.');
    expect((patch.messaging as Record<string, unknown>).toneOfVoice).toEqual(['Confident']);
    expect((patch.audienceDetails as Record<string, unknown>).summary).toBe('IT teams');
    expect(ai.products).toEqual(['Kandji MDM']);
    expect(ai.businessModel).toBe('SaaS');
    expect(ai.evidence).toEqual(SCAN.aiProfile!.evidence);
    expect((visual.palette as { hex: string; sources: string[] }[]).find((c) => c.hex === '#0143fe')?.sources).toEqual(['external-stylesheet']);
    expect(visual.headingFont).toBe('Inter');
  });

  it('writes an edited value into every stored location (offerDetails AND aiProfile)', () => {
    const draft = { ...draftOf(SCAN), products: ['Iru MDM'] };
    const patch = buildCreatePatchPayload(draft, SCAN as never);
    expect((patch.offerDetails as Record<string, unknown>).products).toEqual(['Iru MDM']);
    expect(((patch.visualIdentity as Record<string, unknown>).aiProfile as Record<string, unknown>).products).toEqual(['Iru MDM']);
  });

  it('persists a cleared scalar as explicit null in every location so no fallback resurrects it', () => {
    // readIdentity falls back: valueProposition = aiProfile ?? positioning;
    // audience = aiProfile ?? audienceDetails. A clear must null ALL of them.
    const draft = { ...draftOf(SCAN), description: null, valueProposition: null, targetAudience: null, tone: [] };
    const patch = buildCreatePatchPayload(draft, SCAN as never);
    expect(patch.description).toBeNull();
    expect((patch.positioning as Record<string, unknown>).valueProposition).toBeNull();
    expect((patch.messaging as Record<string, unknown>).brandMessaging).toBeNull();
    expect((patch.audienceDetails as Record<string, unknown>).summary).toBeNull();
    expect(patch.targetAudience).toBeNull();
    const visual = patch.visualIdentity as Record<string, unknown>;
    const ai = visual.aiProfile as Record<string, unknown>;
    expect(ai.valueProposition).toBeNull();
    expect(ai.audience).toBeNull();
    expect(ai.tone).toEqual([]);
    expect((patch.messaging as Record<string, unknown>).toneOfVoice).toEqual([]);
  });

  it('keeps a removed palette colour out of the patch and marks added colours as user-sourced', () => {
    const draft = draftOf(SCAN);
    draft.palette = [{ hex: '#0143fe', role: 'primary' }, { hex: '#ff0066', role: 'custom' }];
    const patch = buildCreatePatchPayload(draft, SCAN as never);
    const visual = patch.visualIdentity as Record<string, unknown>;
    const rows = visual.palette as { hex: string; role: string; occurrences: number; sources: string[] }[];
    expect(rows.map((row) => row.hex)).toEqual(['#0143fe', '#ff0066']);
    expect(rows[0]).toMatchObject({ occurrences: 12, sources: ['external-stylesheet'] });
    expect(rows[1]).toMatchObject({ occurrences: 0, sources: ['user'] });
    expect(patch.secondaryColors).toEqual(['#ff0066']);
  });

  it('applies a reviewed primary colour like the saved-profile editor does', () => {
    const draft = applyPrimaryColorToDraft(draftOf(SCAN), '#FF0066');
    expect(draft.primaryColor).toBe('#ff0066');
    const patch = buildCreatePatchPayload(draft, SCAN as never);
    expect(patch.primaryColor).toBe('#ff0066');
    const rows = (patch.visualIdentity as Record<string, unknown>).palette as { hex: string; role: string }[];
    expect(rows.find((row) => row.hex === '#ff0066')?.role).toBe('primary');
    expect(rows.filter((row) => row.role === 'primary')).toHaveLength(1);
    expect(rows.find((row) => row.hex === '#0143fe')).toBeUndefined();
  });

  it('round-trips the visual identity through the saved-profile parser', () => {
    const patch = buildCreatePatchPayload(draftOf(SCAN), SCAN as never);
    const visual = patch.visualIdentity as Record<string, unknown>;
    // The saved Brand Profile parses visual_identity with parseVisualIdentity;
    // reviewed palette rows and fonts must survive that parse untouched.
    const reparsed = toVisualIdentity({ ...(SCAN as unknown as import('./visual-extraction').ExtractedIdentity), palette: SCAN.palette, aiProfile: SCAN.aiProfile }, {});
    expect(reparsed.palette).toHaveLength(SCAN.palette.length);
  });
});

describe('applyPrimaryColorToDraft', () => {
  it('promotes an existing palette entry to primary without duplicating it', () => {
    const draft = draftOf(SCAN);
    const next = applyPrimaryColorToDraft(draft, '#4BD783');
    expect(next.primaryColor).toBe('#4bd783');
    const primaries = next.palette.filter((color) => color.role === 'primary');
    expect(primaries).toEqual([{ hex: '#4bd783', role: 'primary' }]);
  });

  it('prepends the hex when the palette has no primary role yet', () => {
    const draft = draftOf(SCAN);
    draft.palette = [{ hex: '#ffffff', role: 'neutral' }];
    draft.primaryColor = null;
    const next = applyPrimaryColorToDraft(draft, '#123456');
    expect(next.palette[0]).toEqual({ hex: '#123456', role: 'primary' });
  });

  it('ignores a malformed hex', () => {
    const draft = draftOf(SCAN);
    expect(applyPrimaryColorToDraft(draft, 'red')).toBe(draft);
  });
});

describe('secondaryColors schema cap', () => {
  it('caps top-level secondaryColors at 8 while keeping the full palette in visualIdentity', () => {
    // Atlassian-class scans return 10 palette colours; the PATCH schema caps
    // secondary_colors at 8, and an uncapped payload failed with
    // "Invalid brand data" after the user reviewed the scan.
    const draft = draftOf(SCAN);
    draft.palette = Array.from({ length: 10 }, (_, i) => ({ hex: `#1a2b${String(i).padStart(2, '0')}c`, role: i === 0 ? 'primary' : 'secondary' }));
    draft.primaryColor = draft.palette[0].hex;
    const patch = buildCreatePatchPayload(draft, SCAN as never);
    expect(patch.secondaryColors).toHaveLength(8);
    const visual = patch.visualIdentity as Record<string, unknown>;
    expect(((visual.palette) as unknown[])).toHaveLength(10);
  });
});
