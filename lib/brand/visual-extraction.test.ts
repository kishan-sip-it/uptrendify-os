import { describe, expect, it } from 'vitest';
import {
  collectColors,
  collectJavaScriptDesignTokens,
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

  it('parses modern CSS color spaces and space-separated RGB/HSL syntax', () => {
    expect(parseCssColor('oklch(62% 0.19 28)')).not.toBeNull();
    expect(parseCssColor('oklab(62% 0.12 0.08)')).not.toBeNull();
    expect(parseCssColor('rgb(20 40 60 / 50%)')).toBe('#14283c');
    expect(parseCssColor('hsl(210 50% 40% / 25%)')).toBe('#336699');
    expect(parseCssColor('color(srgb 0.2 0.4 0.6)')).toBe('#336699');
    expect(parseCssColor('tomato')).toBe('#ff6347');
  });

  it('extracts HSL component tokens used by design systems', () => {
    const sink = new Map<string, { count: number; sources: Set<string> }>();
    collectColors(':root { --primary: 210 50% 40%; --brand-accent: oklch(62% 0.19 28); }', 'external-stylesheet', sink);
    const palette = rankPalette(sink, 8);
    expect(palette.map((color) => color.hex)).toContain('#336699');
    expect(palette.some((color) => color.sources.includes('semantic-css'))).toBe(true);
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

describe('JavaScript design-token extraction', () => {
  it('extracts brand colours from CSS-in-JS and theme objects without treating unrelated literals as palette', () => {
    const script = 'const theme = { colors: { primary: "#e11d48", accent: "oklch(62% 0.19 28)" }, analytics: { sample: "#00ff00" } };';
    const sink = new Map<string, { count: number; sources: Set<string> }>();
    collectJavaScriptDesignTokens(script, sink);
    expect([...sink.keys()]).toContain('#e11d48');
    expect([...sink.keys()].some((hex) => hex !== '#e11d48' && /^#[0-9a-f]{6}$/.test(hex))).toBe(true);
    expect(sink.get('#e11d48')?.sources).toContain('js-style-tokens');
    expect(sink.has('#00ff00')).toBe(false);
  });
});

describe('semantic CSS palette ranking', () => {
  it('prioritizes declared brand colors and real primary controls over incidental status colors', () => {
    const css = [
      ':root { --theme-primary: #3ecf8e; --color-accent: #a855f7; }',
      'header nav a { color: #3ecf8e; }',
      '.btn-primary { background-color: #3ecf8e; }',
      '.toast.error { background: #ff2d7d; }',
      '.partner-logo { border-color: #f97316; }',
    ].join('\n');
    const sink = new Map<string, { count: number; sources: Set<string> }>();
    collectColors(css, 'external-stylesheet', sink);
    const palette = rankPalette(sink, 8);
    expect(palette[0]?.hex).toBe('#3ecf8e');
    expect(palette.find((color) => color.hex === '#3ecf8e')?.sources).toContain('semantic-css');
    expect(palette.find((color) => color.hex === '#3ecf8e')?.sources).toContain('header-ui');
    expect(palette.find((color) => color.hex === '#ff2d7d')?.sources).not.toContain('primary-control');
    expect(palette.find((color) => color.hex === '#f97316')?.sources).not.toContain('primary-control');
  });
});
describe('extractBrandIdentity', () => {
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

  it('parses modern theme-color metadata rather than requiring hexadecimal notation', () => {
    const modernTheme = extractBrandIdentity('<html><head><meta name="theme-color" content="oklch(62% 0.19 28)" /></head><body><h1>Brand</h1></body></html>', 'https://example.com/');
    expect(modernTheme.primaryColor).not.toBeNull();
    expect(modernTheme.palette[0]?.sources).toContain('meta-theme-color');
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

describe('logo fallbacks for sparse public HTML', () => {
  it('uses a declared favicon as a logo fallback when the page has no visible logo image', () => {
    const html = `<html><head><title>Samaaroh</title><link rel="icon" href="/favicon.svg" /></head><body><main><h1>Samaaroh wedding services</h1></main></body></html>`;
    const identity = extractBrandIdentity(html, 'https://samaaroh.example/');
    expect(identity.faviconUrl).toBe('https://samaaroh.example/favicon.svg');
    expect(identity.logoUrl).toBe('https://samaaroh.example/favicon.svg');
  });

  it('detects a first-party logo hosted on an external asset CDN when the markup identifies it', () => {
    const html = `<html><head><title>Samaaroh</title></head><body><header><a href="/"><img src="https://cdn.assets-example.net/samaaroh-wordmark.svg" alt="Samaaroh logo" width="180" height="40" /></a></header><main><h1>Premium wedding services</h1></main></body></html>`;
    const identity = extractBrandIdentity(html, 'https://samaaroh.example/');
    expect(identity.logoUrl).toBe('https://cdn.assets-example.net/samaaroh-wordmark.svg');
  });

  it('reads organization logos nested inside a JSON-LD @graph', () => {
    const html = `<html><head><title>Example</title><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', name: 'Example', logo: { '@type': 'ImageObject', url: 'https://cdn.assets-example.net/example-logo.svg' } }] })}</script></head><body><h1>Example</h1></body></html>`;
    const identity = extractBrandIdentity(html, 'https://example.com/');
    expect(identity.logoUrl).toBe('https://cdn.assets-example.net/example-logo.svg');
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