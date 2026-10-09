import { describe, expect, it } from 'vitest';
import {
  collectColors,
  extractBrandIdentity,
  rankPalette,
  isNeutral,
  normalizeHex,
  parseCssColor,
  readableTextOn,
  relativeLuminance,
  saturationOf,
  shouldUseRenderedWebsiteFallback,
} from './visual-extraction';

const PAGE = `<!doctype html>
<html>
<head>
  <title>Broya Living</title>
  <meta name="description" content="Better for you Bone Broth you can consume anytime, anywhere" />
  <meta property="og:site_name" content="Broya Living" />
  <meta name="theme-color" content="#B0352F" />
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;600&display=swap" rel="stylesheet" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <style>
    :root { --brand: #B0352F; --ink: #221F20; --sand: #F0D6AB; --leaf: #ADC35D; }
    body { color: #221F20; background: #ffffff; }
    .btn { background: #B0352F; color: #ffffff; }
    .btn:hover { background: #9c2b26; }
    .muted { color: #6b7280; }
    /* commented out legacy colour #00ff00 must not be counted */
  </style>
</head>
<body>
  <img src="/assets/wordmark.svg" alt="Broya Living logo" />
  <a href="https://www.instagram.com/broya">Instagram</a>
  <a href="https://www.linkedin.com/company/broya">LinkedIn</a>
  <a href="https://broya.com/about">About</a>
  <div style="color: #ADC35D">Accent</div>
</body>
</html>`;

describe('rendered website fallback detection', () => {
  it('flags a 200-response JavaScript shell with no meaningful body content', () => {
    const shell = `<!doctype html><html><head><title>Samaaroh</title><script>window.__NEXT_DATA__ = { veryLarge: '${'x'.repeat(900)}' };</script></head><body><div id="root"></div><div>Loading application…</div></body></html>`;
    expect(shouldUseRenderedWebsiteFallback(shell)).toBe(true);
  });

  it('does not flag a structured content-heavy public page', () => {
    const page = `<!doctype html><html><head><title>NASA</title><meta name="description" content="Explore missions and science"/></head><body><header>Explore</header><main><h1>Explore the universe</h1><p>${'NASA explores space, science, technology, and missions. '.repeat(30)}</p><h2>Our missions</h2><p>Discover science and research.</p></main></body></html>`;
    expect(shouldUseRenderedWebsiteFallback(page)).toBe(false);
  });
});

describe('parseCssColor', () => {
  it('parses hex, short hex, rgb, rgba and hsl', () => {
    expect(parseCssColor('#B0352F')).toBe('#b0352f');
    expect(parseCssColor('#abc')).toBe('#aabbcc');
    expect(parseCssColor('rgb(176, 53, 47)')).toBe('#b0352f');
    expect(parseCssColor('rgba(176,53,47,0.5)')).toBe('#b0352f');
    expect(parseCssColor('hsl(0, 66%, 44%)')).toBe('#ba2626');
  });

  it('rejects values that carry no usable colour', () => {
    expect(parseCssColor('transparent')).toBeNull();
    expect(parseCssColor('currentColor')).toBeNull();
    expect(parseCssColor('inherit')).toBeNull();
    expect(parseCssColor('not-a-colour')).toBeNull();
    expect(parseCssColor(undefined)).toBeNull();
  });
});

describe('normalizeHex', () => {
  it('expands shorthand and lowercases', () => {
    expect(normalizeHex('#FFF')).toBe('#ffffff');
    expect(normalizeHex('B0352F')).toBe('#b0352f');
    expect(normalizeHex('#12345')).toBeNull();
  });
});

describe('colour classification', () => {
  it('separates chromatic brand colours from neutrals', () => {
    expect(isNeutral('#ffffff')).toBe(true);
    expect(isNeutral('#000000')).toBe(true);
    expect(isNeutral('#6b7280')).toBe(true);
    expect(isNeutral('#b0352f')).toBe(false);
    expect(isNeutral('#adc35d')).toBe(false);
  });

  it('measures saturation and luminance', () => {
    expect(saturationOf('#ffffff')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 3);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 3);
  });

  it('chooses readable text for a brand colour background', () => {
    expect(readableTextOn('#f0d6ab')).toBe('#0f172a');
    expect(readableTextOn('#221f20')).toBe('#ffffff');
  });
});

describe('semantic CSS palette ranking', () => {\n  it('prioritizes declared brand colors and real primary controls over incidental status colors', () => {\n    const css = [\n      ':root { --theme-primary: #3ecf8e; --color-accent: #a855f7; }',\n      'header nav a { color: #3ecf8e; }',\n      '.btn-primary { background-color: #3ecf8e; }',\n      '.toast.error { background: #ff2d7d; }',\n      '.partner-logo { border-color: #f97316; }',\n    ].join('\\n');\n    const sink = new Map<string, { count: number; sources: Set<string> }>();\n    collectColors(css, 'external-stylesheet', sink);\n    const palette = rankPalette(sink, 8);\n    expect(palette[0]?.hex).toBe('#3ecf8e');\n    expect(palette.find((color) => color.hex === '#3ecf8e')?.sources).toContain('semantic-css');\n    expect(palette.find((color) => color.hex === '#3ecf8e')?.sources).toContain('header-ui');\n    expect(palette.find((color) => color.hex === '#ff2d7d')?.sources).not.toContain('primary-control');\n    expect(palette.find((color) => color.hex === '#f97316')?.sources).not.toContain('primary-control');\n  });\n});\ndescribe('extractBrandIdentity', () => {
  const identity = extractBrandIdentity(PAGE, 'https://broya.com/');

  it('reads identity metadata', () => {
    expect(identity.brandName).toBe('Broya Living');
    expect(identity.description).toContain('Bone Broth');
  });

  it('detects the real palette and leads with the declared theme colour', () => {
    expect(identity.primaryColor).toBe('#b0352f');
    expect(identity.palette.map((c) => c.hex)).toContain('#f0d6ab');
    expect(identity.palette.map((c) => c.hex)).toContain('#adc35d');
    expect(identity.palette[0]?.role).toBe('primary');
  });

  it('ranks neutral chrome separately from brand colours', () => {
    const roles = identity.palette.filter((c) => c.hex === '#221f20' || c.hex === '#6b7280');
    for (const entry of roles) expect(entry.role).toBe('neutral');
  });

  it('ignores colours inside CSS comments', () => {
    expect(identity.palette.map((c) => c.hex)).not.toContain('#00ff00');
  });

  it('detects fonts from the Google Fonts link', () => {
    expect(identity.fonts.map((f) => f.family)).toContain('Rubik');
    expect(identity.fonts[0]?.source).toBe('google-fonts');
  });

  it('detects a logo and a favicon', () => {
    expect(identity.logoUrl).toBe('https://broya.com/assets/wordmark.svg');
    expect(identity.faviconUrl).toBe('https://broya.com/apple-touch-icon.png');
  });

  it('detects third-party social profiles but not the brand own domain', () => {
    const platforms = identity.socialProfiles.map((p) => p.platform).sort();
    expect(platforms).toEqual(['Instagram', 'LinkedIn']);
    expect(identity.socialProfiles.every((p) => !p.url.includes('broya.com/about'))).toBe(true);
  });

  it('records what was inspected for provenance', () => {
    expect(identity.inspected.join(' ')).toContain('meta[name="theme-color"]');
  });
});

describe('extractBrandIdentity hardening', () => {
  it('ignores third-party logo images when a first-party wordmark exists', () => {
    const html = `
      <html>
        <head><title>Supabase</title><meta property="og:site_name" content="Supabase" /></head>
        <body>
          <header><img src="https://stripe.com/img/stripe-logo.svg" alt="Stripe logo" /></header>
          <nav><img src="/brand/supabase-wordmark.svg" alt="Supabase logo" /></nav>
        </body>
      </html>`;
    const identity = extractBrandIdentity(html, 'https://supabase.com/');
    expect(identity.logoUrl).toBe('https://supabase.com/brand/supabase-wordmark.svg');
    expect(identity.logoUrl).not.toContain('stripe.com');
  });


  it('does not let social-preview imagery outrank a semantic first-party logo', () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="/social/hero-share.png" />
          <script type="application/ld+json">${JSON.stringify({ '@type': 'Organization', name: 'Supabase', logo: '/img/supabase-logo.svg' })}</script>
        </head>
        <body>
          <header><a href="/"><img src="/img/supabase-logo.svg" alt="Supabase logo" width="180" height="36" /></a></header>
          <main><img src="/images/stripe-partner-logo.svg" alt="Stripe partner logo" width="320" height="120" /></main>
        </body>
      </html>`;
    const identity = extractBrandIdentity(html, 'https://supabase.com/');
    expect(identity.logoUrl).toBe('https://supabase.com/img/supabase-logo.svg');
  });

  it('penalizes obvious partner and social-preview imagery', () => {
    const html = `
      <html><head><style>:root { --brand-primary: #3ecf8e; }</style></head>
      <body>
        <header><img src="/img/logo.svg" alt="Brand logo" width="180" height="40" /></header>
        <img src="/img/stripe-partner-logo.svg" alt="Stripe partner logo" width="600" height="220" />
        <meta property="og:image" content="/social/share.png" />
      </body></html>`;
    const identity = extractBrandIdentity(html, 'https://example.com/');
    expect(identity.logoUrl).toBe('https://example.com/img/logo.svg');
  });

  it('prefers semantic CSS brand colours over incidental component colours', () => {
    const html = `
      <html>
        <head>
          <style>
            :root { --brand-primary: #3ecf8e; --primary-color: #3ecf8e; }
            .toast { background: #ff2d7d; }
            .button { background: #ff2d7d; }
            .brand { color: #3ecf8e; }
          </style>
        </head>
        <body></body>
      </html>`;
    const identity = extractBrandIdentity(html, 'https://supabase.com/');
    expect(identity.primaryColor).toBe('#3ecf8e');
  });
});

describe('extractBrandIdentity with no usable evidence', () => {
  const bare = extractBrandIdentity('<html><head></head><body><p>hi</p></body></html>', null);

  it('does not fabricate colour, font or logo values', () => {
    expect(bare.palette).toEqual([]);
    expect(bare.primaryColor).toBeNull();
    expect(bare.secondaryColors).toEqual([]);
    expect(bare.accentColors).toEqual([]);
    expect(bare.fonts).toEqual([]);
    expect(bare.logoUrl).toBeNull();
    expect(bare.faviconUrl).toBeNull();
    expect(bare.brandName).toBeNull();
    expect(bare.description).toBeNull();
  });

  it('reports a real warning instead of failing silently', () => {
    expect(bare.warnings.length).toBeGreaterThan(0);
  });
});