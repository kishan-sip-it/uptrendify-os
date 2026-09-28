import { describe, expect, it } from 'vitest';
import { getEmailConfirmationRedirectUrl } from './email-redirect';

describe('getEmailConfirmationRedirectUrl', () => {
  it('uses the production URL when signup starts on localhost', () => {
    expect(
      getEmailConfirmationRedirectUrl('http://localhost:3000'),
    ).toBe('https://uptrendify-os.vercel.app/auth/confirm');
  });

  it('preserves a configured public application URL', () => {
    expect(
      getEmailConfirmationRedirectUrl(
        'http://localhost:3000',
        'https://custom.example.com',
      ),
    ).toBe('https://custom.example.com/auth/confirm');
  });

  it('rejects a localhost configured URL and falls back to production', () => {
    expect(
      getEmailConfirmationRedirectUrl(
        'https://uptrendify-os.vercel.app',
        'http://localhost:3000',
      ),
    ).toBe('https://uptrendify-os.vercel.app/auth/confirm');
  });

  it('keeps a real public origin for preview/production environments', () => {
    expect(
      getEmailConfirmationRedirectUrl('https://uptrendify-os-preview.vercel.app'),
    ).toBe('https://uptrendify-os-preview.vercel.app/auth/confirm');
  });
});
