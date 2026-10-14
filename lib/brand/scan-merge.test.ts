import { describe, expect, it } from 'vitest';
import { mergeExistingBrandScanPatch, mergeScanMetadata } from './scan-merge';

describe('repeat website scans merge saved metadata additively', () => {
  it('keeps existing identity and adds new palette, fonts, and evidence', () => {
    const merged = mergeExistingBrandScanPatch({
      description: 'Human-reviewed description',
      primary_color: '#112233',
      secondary_colors: ['#445566'],
      industry: 'Technology',
      target_audience: 'Existing audience',
      positioning: { valueProposition: 'Human-approved positioning', differentiators: ['Reliable'] },
      offer_details: { products: ['Existing product'], services: ['Existing service'] },
      audience_details: { summary: 'Existing audience', personas: [{ name: 'Operations lead' }] },
      messaging: { toneOfVoice: ['Clear'], terminology: ['workspace'] },
      visual_identity: {
        logoUrl: 'https://cdn.example.test/old-wordmark.svg',
        palette: [{ hex: '#112233', role: 'primary', sources: ['human-edit'] }],
        fonts: [{ family: 'Existing Sans', source: 'css-declaration', evidence: 'body selector' }],
        assets: [{ url: 'https://cdn.example.test/old-wordmark.svg', type: 'image' }],
        aiProfile: { products: ['Existing product'], valueProposition: 'Human-approved positioning' },
        inspected: ['homepage'],
        detectedAt: '2026-10-01T00:00:00.000Z',
      },
    }, {
      description: null,
      primaryColor: null,
      secondaryColors: [],
      industry: null,
      targetAudience: null,
      positioning: { valueProposition: null, differentiators: ['Fast setup'], positioningThemes: ['Simple onboarding'] },
      offerDetails: { products: [], services: ['New service'], keyFeatures: ['Automated reporting'] },
      audienceDetails: { summary: null, personas: [{ name: 'Marketing lead' }] },
      messaging: { toneOfVoice: ['Clear', 'Helpful'], terminology: ['automation'] },
      visualIdentity: {
        logoUrl: null,
        palette: [
          { hex: '#112233', role: 'primary', sources: ['css'] },
          { hex: '#AABBCC', role: 'accent', sources: ['external-stylesheet'] },
        ],
        fonts: [
          { family: 'Existing Sans', source: 'css-declaration', fontAssetUrl: 'https://cdn.example.test/font.woff2' },
          { family: 'New Serif', source: 'css-declaration', evidence: 'heading selector' },
        ],
        assets: [{ url: 'https://cdn.example.test/new-photo.webp', type: 'image' }],
        aiProfile: { products: [], services: ['New service'], differentiators: ['Fast setup'] },
        inspected: ['homepage', 'main stylesheet'],
        detectedAt: '2026-10-12T00:00:00.000Z',
      },
    });

    expect(merged.description).toBe('Human-reviewed description');
    expect(merged.primaryColor).toBe('#112233');
    expect(merged.secondaryColors).toEqual(['#445566']);
    expect(merged.positioning).toMatchObject({
      valueProposition: 'Human-approved positioning',
      differentiators: ['Reliable', 'Fast setup'],
      positioningThemes: ['Simple onboarding'],
    });
    expect(merged.offerDetails).toMatchObject({
      products: ['Existing product'],
      services: ['Existing service', 'New service'],
      keyFeatures: ['Automated reporting'],
    });
    expect(merged.audienceDetails).toMatchObject({
      summary: 'Existing audience',
      personas: [{ name: 'Operations lead' }, { name: 'Marketing lead' }],
    });
    expect(merged.visualIdentity).toMatchObject({
      logoUrl: 'https://cdn.example.test/old-wordmark.svg',
      palette: [
        { hex: '#112233', role: 'primary', sources: ['human-edit', 'css'] },
        { hex: '#AABBCC', role: 'accent', sources: ['external-stylesheet'] },
      ],
      fonts: [
        { family: 'Existing Sans', source: 'css-declaration', evidence: 'body selector', fontAssetUrl: 'https://cdn.example.test/font.woff2' },
        { family: 'New Serif', source: 'css-declaration', evidence: 'heading selector' },
      ],
      inspected: ['homepage', 'main stylesheet'],
      detectedAt: '2026-10-12T00:00:00.000Z',
    });
  });

  it('does not let empty arrays, nulls, or blank values erase saved fields', () => {
    expect(mergeScanMetadata({
      description: 'Verified description',
      fonts: [{ family: 'Brand Sans' }],
      keywords: ['analytics'],
    }, {
      description: ' ',
      fonts: [],
      keywords: [],
      logoUrl: null,
    })).toEqual({
      description: 'Verified description',
      fonts: [{ family: 'Brand Sans' }],
      keywords: ['analytics'],
    });
  });
});
