import { describe, it, expect } from 'vitest';
import {
  contentItemInputSchema,
  contentGenerationSchema,
  parseContentGeneration,
  ContentValidationError,
  contentTypeLabel,
  channelLabel,
} from './schema';

describe('contentItemInputSchema', () => {
  it('accepts a valid content brief', () => {
    const result = contentItemInputSchema.safeParse({
      type: 'social_post',
      channel: 'linkedin',
      title: 'Win back ICP accounts',
      objective: 'Drive demo requests',
      audience: 'Fractional CMOs',
      context: 'Q3 campaign',
      tone: 'confident',
      cta: 'Book a demo',
      instructions: 'Use only approved claims',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown content type', () => {
    const result = contentItemInputSchema.safeParse({ type: 'meme', channel: 'linkedin', title: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown channel', () => {
    const result = contentItemInputSchema.safeParse({ type: 'email', channel: 'pigeon', title: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields under strict mode', () => {
    const result = contentItemInputSchema.safeParse({ type: 'email', channel: 'email', title: 'x', hack: true });
    expect(result.success).toBe(false);
  });

  it('rejects an empty title', () => {
    const result = contentItemInputSchema.safeParse({ type: 'email', channel: 'email', title: '   ' });
    expect(result.success).toBe(false);
  });
});

describe('contentGenerationSchema', () => {
  it('accepts a valid generation', () => {
    const result = contentGenerationSchema.safeParse({
      headline: 'A headline',
      body: 'Body copy here.',
      cta: 'Learn more',
      channel: 'linkedin',
      content_type: 'social_post',
      rationale: 'Grounded in approved facts.',
      strategy_references: ['Messaging — core message'],
      brand_fact_references: ['Value proposition'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing body', () => {
    const result = contentGenerationSchema.safeParse({ headline: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields', () => {
    const result = contentGenerationSchema.safeParse({ headline: 'x', body: 'y', notAllowed: true });
    expect(result.success).toBe(false);
  });
});

describe('parseContentGeneration', () => {
  const intent = { type: 'social_post', channel: 'linkedin' };

  it('parses strict JSON output', () => {
    const result = parseContentGeneration(
      JSON.stringify({ headline: 'H', body: 'B', channel: 'linkedin', content_type: 'social_post' }),
      intent,
    );
    expect(result.headline).toBe('H');
    expect(result.strategy_references).toBeUndefined();
  });

  it('strips markdown fenced JSON', () => {
    const result = parseContentGeneration('```json\n{"headline":"H","body":"B","channel":"linkedin","content_type":"social_post"}\n```', intent);
    expect(result.body).toBe('B');
  });

  it('maps null optional fields to null, not undefined', () => {
    const result = parseContentGeneration(
      JSON.stringify({ headline: 'H', body: 'B', channel: 'linkedin', content_type: 'social_post', cta: null, rationale: null }),
      intent,
    );
    expect(result.cta).toBeNull();
  });

  it('throws when output is not JSON', () => {
    expect(() => parseContentGeneration('just words', intent)).toThrow(ContentValidationError);
  });

  it('throws when output targets the wrong channel', () => {
    expect(() =>
      parseContentGeneration(JSON.stringify({ headline: 'H', body: 'B', channel: 'instagram', content_type: 'social_post' }), intent),
    ).toThrow(/wrong channel/);
  });

  it('throws when output is the wrong content type', () => {
    expect(() =>
      parseContentGeneration(JSON.stringify({ headline: 'H', body: 'B', channel: 'linkedin', content_type: 'ad_copy' }), intent),
    ).toThrow(/wrong content type/);
  });

  it('accepts human-readable label variants with correct intent', () => {
    const result = parseContentGeneration(
      JSON.stringify({ headline: 'H', body: 'B', channel: 'LinkedIn', content_type: 'Social Post' }),
      intent,
    );
    expect(result.channel).toBe('linkedin');
    expect(result.content_type).toBe('social_post');
  });

  it('accepts snake-case spacing variants with correct intent', () => {
    const result = parseContentGeneration(
      JSON.stringify({ headline: 'H', body: 'B', channel: 'linkedin ads', content_type: 'social post' }),
      { type: 'social_post', channel: 'linkedin_ads' },
    );
    expect(result.channel).toBe('linkedin_ads');
    expect(result.content_type).toBe('social_post');
  });

  it('throws when label variant resolves to the wrong content type', () => {
    expect(() =>
      parseContentGeneration(JSON.stringify({ headline: 'H', body: 'B', channel: 'linkedin', content_type: 'Ad Copy' }), intent),
    ).toThrow(/wrong content type/);
  });

  it('throws when label variant resolves to the wrong channel', () => {
    expect(() =>
      parseContentGeneration(JSON.stringify({ headline: 'H', body: 'B', channel: 'Instagram', content_type: 'social_post' }), intent),
    ).toThrow(/wrong channel/);
  });

  it('throws on structural validation errors', () => {
    expect(() =>
      parseContentGeneration(JSON.stringify({ headline: 'H' }), intent),
    ).toThrow(ContentValidationError);
  });
});

describe('label helpers', () => {
  it('humanizes content types', () => {
    expect(contentTypeLabel('blog_outline')).toBe('Blog / Article Outline');
    expect(contentTypeLabel('unknown_thing')).toBe('Unknown Thing');
  });

  it('humanizes channels', () => {
    expect(channelLabel('linkedin_ads')).toBe('Linkedin Ads');
  });
});