import { describe, expect, it } from 'vitest';
import { getUserFacingAiError } from './user-facing-errors';

describe('getUserFacingAiError', () => {
  it('hides provider internals for rate limits', () => {
    expect(getUserFacingAiError('Provider returned 429: Rate limit reached for model openai/gpt-oss-20b. Please try again in 22.4s.')).toContain('temporarily rate-limited');
    expect(getUserFacingAiError('Provider returned 429: Rate limit reached for model openai/gpt-oss-20b. Please try again in 22.4s.')).not.toContain('org_');
  });
  it('turns content type mismatches into an actionable message', () => {
    expect(getUserFacingAiError('AI output produced the wrong content type (blog); expected social_post')).toContain('compatible');
  });
  it('classifies transient DNS failures as retryable research issues', () => {
    expect(getUserFacingAiError('getaddrinfo EBUSY samaaroh.freehosting.dev')).toContain('temporarily unreachable');
  });
});
