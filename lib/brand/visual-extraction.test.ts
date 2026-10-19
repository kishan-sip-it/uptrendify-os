import { describe, expect, it } from 'vitest';
import { parseVisualIdentity, preferredPreviewFontFamily, resolveFontRoles, toVisualIdentity } from './identity-mapping';
import {
  collectColors,
  collectJavaScriptDesignTokens,
  extractBrandIdentity,
  extractRenderedLogoCandidates,
  extractDeclaredFonts,
  isBlockedWebsiteResponse,
  isRenderedReaderError,
  rankPalette,
  isNeutral,
  rankExtractedFonts,
  rebrandDeclaredName,
  normalizeHex,
  parseCssColor,
  readableTextOn,
  relativeLuminance,
  saturationOf,
  shouldUseRenderedWebsiteFallback,
  shouldRejectInsufficientWebsiteEvidence,
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

describe('rendered-reader logo candidates', () => {
  it('finds a labelled first-party wordmark while rejecting social and hero images', () => {
    const markdown = [
      '![Canva logo](https://static.canva.com/assets/canva-wordmark.svg)',
      '![Facebook logo](https://www.facebook.com/images/facebook-logo.svg)',
      '![Hero banner](https://www.canva.com/assets/hero-banner.png)',
      '![Product screenshot](https://www.canva.com/assets/product-screenshot.png)',
    ].join('\\n');
    expect(extractRenderedLogoCandidates(markdown, 'https://www.canva.com/')).toEqual([
      'https://static.canva.com/assets/canva-wordmark.svg',
    ]);
  });

  it('accepts an external CDN only when the image is explicitly identified as a logo', () => {
    expect(extractRenderedLogoCandidates(
      '![Acme wordmark](https://cdn.example.net/brandmark.svg)',
      'https://acme.example/',
    )).toEqual(['https://cdn.example.net/brandmark.svg']);
    expect(extractRenderedLogoCandidates(
      '![Company photo](https://cdn.example.net/acme-photo.png)',
      'https://acme.example/',
    )).toEqual([]);
  });
});

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
    expect(parseCssColor('color(display-p3 0.8 0.2 0.1)')).toMatch(/^#[0-9a-f]{6}$/);
    expect(parseCssColor('tomato')).toBe('#ff6347');
  });

  it('extracts HSL component tokens used by design systems', () => {
    const sink = new Map<string, { count: number; sources: Set<string> }>();
    collectColors(':root { --primary: 210 50% 40%; --brand-accent: oklch(62% 0.19 28); }', 'external-stylesheet', sink);
    const palette = rankPalette(sink, 8);
    expect(palette.map((color) => color.hex)).toContain('#336699');
    expect(palette.some((color) => color.sources.includes('semantic-css'))).toBe(true);
  });

  it('resolves CSS custom properties and named colours from declarations', () => {
    const sink = new Map<string, { count: number; sources: Set<string> }>();
    const css = ':root { --brand-rgb: 220 20 40; --theme-primary: #dc1428; } .button-primary { color: rgb(var(--brand-rgb)) !important; background-color: var(--theme-primary); border: 1px solid tomato; }';
    collectColors(css, 'external-stylesheet', sink);
    const palette = rankPalette(sink, 8);
    expect(palette.map((color) => color.hex)).toContain('#dc1428');
    expect(palette.map((color) => color.hex)).toContain('#ff6347');
    expect(palette.find((color) => color.hex === '#dc1428')?.sources).toContain('css-color-declaration');
  });

  it('recovers declared brand colours wrapped in color-mix after resolving CSS variables', () => {
    const sink = new Map<string, { count: number; sources: Set<string> }>();
    const css = ':root { --brand-primary: #c74634; } .button { background-color: color-mix(in srgb, var(--brand-primary) 12%, transparent); }';
    collectColors(css, 'external-stylesheet', sink);
    const palette = rankPalette(sink, 8);
    expect(palette.map((color) => color.hex)).toContain('#c74634');
    expect(palette.find((color) => color.hex === '#c74634')?.sources).toContain('css-color-declaration');
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
    expect(isNeutral('#70152d')).toBe(false);
    expect(isNeutral('#fff2a8')).toBe(false);
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
describe('semantic colour role ordering', () => {
  it('keeps explicitly declared primary and secondary tokens ahead of incidental CSS colours', () => {
    const sink = new Map<string, { count: number; sources: Set<string> }>();
    const css = [
      ':root { --primary: #0f766e; --secondary: #f59e0b; --accent: #2563eb; }',
      '.toast { background: #e11d48; border-color: #e11d48; color: #e11d48; }',
      '.alert { background: #e11d48; border-color: #e11d48; color: #e11d48; }',
      '.status { background: #e11d48; border-color: #e11d48; color: #e11d48; }',
    ].join('\n');
    collectColors(css, 'external-stylesheet', sink);
    const palette = rankPalette(sink, 8);
    expect(palette[0]?.hex).toBe('#0f766e');
    expect(palette[0]?.sources).toContain('semantic-primary-css');
    expect(palette[1]?.hex).toBe('#f59e0b');
    expect(palette[1]?.sources).toContain('semantic-secondary-css');
    expect(palette[2]?.hex).toBe('#2563eb');
    expect(palette[2]?.sources).toContain('semantic-accent-css');
  });
});

describe('raster and pastel colour evidence', () => {
  it('ranks dark chromatic brand UI above reverse-text cream and favicon pixels', () => {
    const sink = new Map<string, { count: number; sources: Set<string> }>([
      ['#fff5e0', { count: 18, sources: new Set(['css-color-declaration', 'semantic-css', 'semantic-primary-css', 'control-foreground']) }],
      ['#ff00b8', { count: 8, sources: new Set(['favicon-raster-color']) }],
      ['#590707', { count: 8, sources: new Set(['css-color-declaration', 'header-ui', 'primary-control']) }],
    ]);
    const palette = rankPalette(sink, 8);
    expect(palette[0]?.hex).toBe('#590707');
    expect(palette.find((color) => color.hex === '#fff5e0')?.role).toBe('neutral');
  });

  it('prefers a chromatic primary-logo sample over an unused green primary token', () => {
    const sink = new Map<string, { count: number; sources: Set<string> }>([
      ['#22c55e', { count: 12, sources: new Set(['css-color-declaration', 'semantic-css', 'semantic-primary-css']) }],
      ['#ff4d00', { count: 5, sources: new Set(['primary-logo-raster-color']) }],
    ]);
    expect(rankPalette(sink, 8)[0]?.hex).toBe('#ff4d00');
  });

  it('does not let a pale primary token with favicon-only corroboration outrank maroon used in site UI', () => {
    const sink = new Map<string, { count: number; sources: Set<string> }>([
      ['#fff5e0', { count: 18, sources: new Set(['css-color-declaration', 'semantic-css', 'semantic-primary-css', 'favicon-raster-color']) }],
      ['#70152d', { count: 8, sources: new Set(['semantic-css', 'semantic-brand-css', 'header-ui', 'primary-control']) }],
    ]);
    const palette = rankPalette(sink, 8);
    expect(palette[0]?.hex).toBe('#70152d');
    expect(palette.find((color) => color.hex === '#fff5e0')?.role).toBe('neutral');
  });

  it('preserves a pastel primary colour when the primary UI actually uses it', () => {
    const sink = new Map<string, { count: number; sources: Set<string> }>([
      ['#f0c7d5', { count: 2, sources: new Set(['semantic-css', 'semantic-primary-css', 'primary-control']) }],
    ]);
    expect(rankPalette(sink, 8)[0]).toMatchObject({ hex: '#f0c7d5', role: 'primary' });
  });

  it('does not return icon fonts as brand typography', () => {
    const fonts = rankExtractedFonts([
      { family: `normal 900 1em/1 "Font Awesome 7 Free"`, source: 'css-declaration', evidence: 'CSS font token --fa-font-solid' },
      { family: 'FabricMDL2Icons', source: 'css-declaration', evidence: 'CSS font token --icon-font' },
      { family: 'Segoe UI Variable Text', source: 'css-declaration', evidence: 'font-family from body/html selector' },
    ]);
    expect(fonts.map((font) => font.family)).toEqual(['Segoe UI Variable Text']);
  });
});

describe('semantic colour evidence conflicts', () => {
  it('does not let an unused primary token override a stronger colour used in the header and primary control', () => {
    const css = [
      ':root { --primary: #e11d48; --accent: #0f766e; }',
      'header nav a { color: var(--accent); }',
      '.btn-primary { background-color: var(--accent); }',
      '.toast.error { background: #e11d48; border-color: #e11d48; color: #e11d48; }',
    ].join('\n');
    const sink = new Map<string, { count: number; sources: Set<string> }>();
    collectColors(css, 'external-stylesheet', sink);
    const palette = rankPalette(sink, 8);
    expect(palette[0]?.hex).toBe('#0f766e');
    expect(palette.find((color) => color.hex === '#e11d48')?.sources).toContain('semantic-primary-css');
    expect(palette.find((color) => color.hex === '#0f766e')?.sources).toContain('header-ui');
    expect(palette.find((color) => color.hex === '#0f766e')?.sources).toContain('primary-control');
  });

  it('ignores repeated toast/error colours as primary-palette evidence', () => {
    const css = [
      ':root { --primary: #e11d48; --accent: #0f766e; }',
      'header nav a { color: var(--accent); }',
      '.btn-primary { background-color: var(--accent); }',
      '.toast.error { background: #e11d48; border-color: #e11d48; color: #e11d48; }',
    ].join('\\n');
    const sink = new Map<string, { count: number; sources: Set<string> }>();
    collectColors(css, 'external-stylesheet', sink);
    expect(rankPalette(sink, 8)[0]?.hex).toBe('#0f766e');
    expect(sink.get('#e11d48')?.count).toBeLessThan(sink.get('#0f766e')?.count ?? 0);
  });

  it('resolves nested variables in compound colour expressions and preserves semantic roles', () => {
    const css = [
      ':root { --brand-base: #0f766e; --primary: var(--brand-base); --surface: color-mix(in srgb, var(--missing, var(--brand-base)) 86%, white); }',
      'header nav a { color: var(--primary); }',
    ].join('\n');
    const sink = new Map<string, { count: number; sources: Set<string> }>();
    collectColors(css, 'external-stylesheet', sink);
    expect(sink.get('#0f766e')?.sources).toContain('semantic-primary-css');
    expect(rankPalette(sink, 8)[0]?.hex).toBe('#0f766e');
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


  it('ignores customer logos in structured data when choosing the website owner logo', () => {
    const html = `
      <html><head>
        <title>Notion</title><meta property="og:site_name" content="Notion" />
        <script type="application/ld+json">${JSON.stringify({
          '@graph': [
            { '@type': 'Organization', name: 'Ramp', url: 'https://ramp.com/', logo: 'https://assets.example/ramp-logo.svg' },
            { '@type': 'Organization', name: 'Notion, Inc.', url: 'https://www.notion.com/', logo: 'https://assets.example/notion-logo.svg' },
          ],
        })}</script>
      </head><body>
        <section class="customer-logo-strip"><img src="https://assets.example/ramp-logo.svg" alt="Ramp logo" width="220" height="70" /></section>
        <header><a href="/"><img src="https://assets.example/notion-logo.svg" alt="Notion logo" width="190" height="42" /></a></header>
      </body></html>`;
    const identity = extractBrandIdentity(html, 'https://www.notion.com/');
    expect(identity.logoUrl).toBe('https://assets.example/notion-logo.svg');
    expect(identity.logoUrl).not.toContain('ramp');
  });

  it('rejects an ambiguously named portrait inside a team card even when the CDN path is hashed', () => {
    const html = `
      <html><head>
        <title>Cognichip</title><meta property="og:site_name" content="Cognichip" />
        <script type="application/ld+json">${JSON.stringify({
          '@type': 'Organization', name: 'Cognichip', url: 'https://www.cognichip.ai/',
          logo: 'https://cdn.example/Cognichip-icon-color-600-min.jpg',
        })}</script>
      </head><body>
        <header><a href="/"><img src="https://cdn.example/Cognichip-icon-color-600-min.jpg" alt="Cognichip logo" /></a></header>
        <section class="team-member-card"><img src="/assets/ab/93f0a6c.jpg" alt="Satoshi" width="720" height="240" /></section>
      </body></html>`;
    const identity = extractBrandIdentity(html, 'https://www.cognichip.ai/');
    expect(identity.logoUrl).toBe('https://cdn.example/Cognichip-icon-color-600-min.jpg');
    expect(identity.logoUrl).not.toContain('93f0a6c');
  });

  it('rejects a team portrait as a logo even if it is a large page image', () => {
    const html = `
      <html><head>
        <title>Cognichip</title><meta property="og:site_name" content="Cognichip" />
        <script type="application/ld+json">${JSON.stringify({
          '@type': 'Organization', name: 'Cognichip', url: 'https://www.cognichip.ai/',
          logo: 'https://cdn.example/Cognichip-icon-color-600-min.jpg',
        })}</script>
      </head><body>
        <header><a href="/"><img src="https://cdn.example/Cognichip-icon-color-600-min.jpg" alt="Cognichip logo" /></a></header>
        <section class="team-member-card"><img src="https://cdn.example/team/satoshi-profile.jpg" alt="Satoshi" width="480" height="480" /></section>
      </body></html>`;
    const identity = extractBrandIdentity(html, 'https://www.cognichip.ai/');
    expect(identity.logoUrl).toBe('https://cdn.example/Cognichip-icon-color-600-min.jpg');
    expect(identity.logoUrl).not.toContain('satoshi');
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

  it('keeps a first-party header logo even when the image is not wrapped in a homepage link', () => {
    const html = '<html><head><title>Canva</title><meta property="og:site_name" content="Canva" /></head><body><header><img src="/assets/identity-mark-42a9.svg" alt="" width="36" height="36" /></header><main><h1>Visual Suite for Everyone</h1><p>Create designs for teams and businesses.</p></main></body></html>';
    const identity = extractBrandIdentity(html, 'https://www.canva.com/');
    expect(identity.logoUrl).toBe('https://www.canva.com/assets/identity-mark-42a9.svg');
  });

  it('uses the real lazy-loaded logo when src is only a data-URI placeholder', () => {
    const html = '<html><head><title>Canva</title><meta property="og:site_name" content="Canva" /></head><body><header><a href="/"><img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" data-src="/assets/canva-wordmark.svg" alt="Canva" /></a></header><main><h1>Visual Suite for Everyone</h1><p>Create designs for teams and businesses.</p></main></body></html>';
    const identity = extractBrandIdentity(html, 'https://www.canva.com/');
    expect(identity.logoUrl).toBe('https://www.canva.com/assets/canva-wordmark.svg');
  });

  it('detects a first-party logo hosted on an external asset CDN when the markup identifies it', () => {
    const html = `<html><head><title>Samaaroh</title></head><body><header><a href="/"><img src="https://cdn.assets-example.net/samaaroh-wordmark.svg" alt="Samaaroh logo" width="180" height="40" /></a></header><main><h1>Premium wedding services</h1></main></body></html>`;
    const identity = extractBrandIdentity(html, 'https://samaaroh.example/');
    expect(identity.logoUrl).toBe('https://cdn.assets-example.net/samaaroh-wordmark.svg');
  });

  it('recognizes a home-linked first-party header logo with a hashed asset path and empty alt text', () => {
    const html = '<html><head><title>Canva</title><meta property="og:site_name" content="Canva" /></head><body><header><a href="/"><img src="/assets/9f182a7.svg" alt="" /></a></header><main><h1>Visual Suite for Everyone</h1><p>Make socials, videos, slides, and more with Canva. ' + 'Create designs for teams and businesses. '.repeat(8) + '</p></main></body></html>';
    const identity = extractBrandIdentity(html, 'https://www.canva.com/');
    expect(identity.logoUrl).toBe('https://www.canva.com/assets/9f182a7.svg');
  });

  it('recognizes a hashed CDN wordmark linked from a locale homepage route', () => {
    const html = '<html><head><title>Canva</title><meta property="og:site_name" content="Canva" /></head><body><header><a href="/en/"><img src="https://static.canva-cdn.example/assets/9f182a7.svg" alt="" width="40" height="40" /></a></header><main><h1>Visual Suite for Everyone</h1><p>Make socials, videos, slides, and more with Canva. ' + 'Create designs for teams and businesses. '.repeat(8) + '</p></main></body></html>';
    const identity = extractBrandIdentity(html, 'https://www.canva.com/en/');
    expect(identity.logoUrl).toBe('https://static.canva-cdn.example/assets/9f182a7.svg');
  });

  it('keeps a high-confidence CDN header logo when its alt text is generic', () => {
    const html = '<html><head><title>Example</title><meta property="og:site_name" content="Example" /></head><body><header><a href="/en/"><img src="https://assets.example-cdn.test/a9f81.svg" class="logo" alt="header logo icon" /></a></header><main><h1>Example brand platform</h1><p>' + 'A real website with products, customers and services. '.repeat(6) + '</p></main></body></html>';
    const identity = extractBrandIdentity(html, 'https://www.example.com/en/');
    expect(identity.logoUrl).toBe('https://assets.example-cdn.test/a9f81.svg');
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
 
describe('logo identity confidence', () => {
  it('does not promote a linked Facebook mark to the Microsoft logo and trims an SEO title suffix', () => {
    const html = '<html><head><title>Microsoft – AI, Cloud, Productivity, Computing, Gaming & Apps</title></head><body>' +
      '<header><a href="https://www.facebook.com/Microsoft"><img src="https://cdn.example.test/icons/facebook-logo.svg" alt="Facebook logo" width="32" height="32" /></a></header>' +
      '<main><h1>Microsoft</h1><p>Explore Microsoft products, services and solutions for home and business.</p></main></body></html>';
    const identity = extractBrandIdentity(html, 'https://www.microsoft.com/en-in/');
    expect(identity.brandName).toBe('Microsoft');
    expect(identity.logoUrl).toBeNull();
  });

  it('keeps a first-party wordmark while excluding external social icons from logo ranking', () => {
    const html = '<html><head><title>Microsoft – AI, Cloud, Productivity, Computing, Gaming & Apps</title></head><body>' +
      '<header><a href="/en-in/"><img src="/assets/microsoft-logo.svg" alt="Microsoft logo" width="180" height="40" /></a>' +
      '<a href="https://www.facebook.com/Microsoft"><img src="/icons/facebook-logo.svg" alt="Facebook logo" width="32" height="32" /></a></header>' +
      '<main><h1>Microsoft</h1><p>Explore products and services. ' + 'Productivity, cloud, and tools for every business. '.repeat(5) + '</p></main></body></html>';
    const identity = extractBrandIdentity(html, 'https://www.microsoft.com/en-in/');
    expect(identity.brandName).toBe('Microsoft');
    expect(identity.logoUrl).toBe('https://www.microsoft.com/assets/microsoft-logo.svg');
  });

  it('does not mistake an unrelated customer logo in the header for the site logo', () => {
    const html = '<html><head><title>Salesforce: The Customer Company</title><meta property="og:site_name" content="Salesforce" /></head><body><header><a href="/"><img src="https://cdn.customer-assets.example/balaji-wafers.png" alt="Balaji Wafers" /></a></header><main><h1>Salesforce Customer 360</h1><p>Connect sales, service, marketing and commerce on one customer platform.</p></main></body></html>';
    const identity = extractBrandIdentity(html, 'https://www.salesforce.com/in/');
    expect(identity.brandName).toBe('Salesforce');
    expect(identity.logoUrl).toBeNull();
  });
  it('does not use a third-party favicon as the company logo', () => {
    const html = '<html><head><title>GitHub</title><link rel="icon" href="https://duolingo.example/favicon.ico" /></head><body><main><h1>GitHub</h1><p>Build software together.</p></main></body></html>';
    const identity = extractBrandIdentity(html, 'https://github.com/');
    expect(identity.faviconUrl).toBeNull();
    expect(identity.logoUrl).toBeNull();
  });
  it('does not promote an OpenGraph share image to a company logo', () => {
    const html = '<html><head><title>Notion</title><meta property="og:image" content="https://figma.example/figma-card.png" /></head><body><main><h1>Notion</h1><p>One workspace for your docs and projects.</p></main></body></html>';
    const identity = extractBrandIdentity(html, 'https://www.notion.so/');
    expect(identity.brandName).toBe('Notion');
    expect(identity.logoUrl).toBeNull();
  });
  it('uses structured organization identity ahead of a product-level OpenGraph title', () => {
    const html = '<html><head><title>Salesforce</title><meta property="og:title" content="Balaji Wafers promotion" /><script type="application/ld+json">' + JSON.stringify({ '@type': 'Organization', name: 'Salesforce' }) + '</script></head><body><h1>Salesforce</h1></body></html>';
    const identity = extractBrandIdentity(html, 'https://salesforce.com/');
    expect(identity.brandName).toBe('Salesforce');
  });
});


describe('website identity evidence threshold', () => {
  it('does not reject a concise page if a real visual identity was recovered', () => {
    expect(shouldRejectInsufficientWebsiteEvidence(120, true)).toBe(false);
  });

  it('rejects a page with too little text and no visual identity evidence', () => {
    expect(shouldRejectInsufficientWebsiteEvidence(120, false)).toBe(true);
    expect(shouldRejectInsufficientWebsiteEvidence(180, false)).toBe(false);
  });
});

describe('blocked website interstitial detection', () => {
  it('detects Microsoft-style HTTP 200 blocked-request pages', () => {
    expect(isBlockedWebsiteResponse('<html><head><title>Your request has been blocked. This could be due to several reasons.</title></head><body><main><h1>Your request has been blocked</h1></main></body></html>')).toBe(true);
  });

  it('does not classify a normal homepage as blocked', () => {
    expect(isBlockedWebsiteResponse('<html><head><title>Microsoft</title></head><body><main><h1>Welcome to Microsoft</h1><p>Explore products and services.</p></main></body></html>')).toBe(false);
  });
});

describe('complete company logo metadata', () => {
  it('prefers a same-site full wordmark image over a symbol-only structured logo', () => {
    const wordmark = 'https://www.ibm.com/content/dam/worldwide-content/creative-assets/s-migr/ul/g/18/f9/ibm_logo_pos_blue60_rgb.png/_jcr_content/renditions/cq5dam.web.1280.1280.jpeg';
    const symbol = 'https://www.ibm.com/brand/experienceguides/developer/b1db1ae501d522a1a4b49613fe07c9f1/01_8-bar-positive.svg';
    const html = `<html><head><title>IBM</title><meta property="og:site_name" content="IBM"/><meta property="og:image" content="${wordmark}"/><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Corporation', name: 'IBM', url: 'https://www.ibm.com/', logo: symbol })}</script></head><body><main><h1>IBM</h1><p>Global technology company.</p></main></body></html>`;
    expect(extractBrandIdentity(html, 'https://www.ibm.com/us-en').logoUrl).toBe(wordmark);
  });

  it('prefers a site-named header wordmark even when HTML omits its dimensions', () => {
    const symbol = 'https://acme.example/assets/brand-symbol.svg';
    const wordmark = 'https://acme.example/assets/header-artwork.svg';
    const html = '<html><head><title>Acme</title><meta property="og:site_name" content="Acme"/><script type="application/ld+json">' +
      JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme', logo: symbol }) +
      '</script></head><body><header><a href="/"><img src="/assets/header-artwork.svg" alt="Acme"/></a></header><main><h1>Acme</h1><p>Public company website with readable content.</p></main></body></html>';
    expect(extractBrandIdentity(html, 'https://acme.example/').logoUrl).toBe(wordmark);
  });

  it('prefers a wide, site-named header wordmark over a compact structured symbol', () => {
    const symbol = 'https://acme.example/assets/brand-symbol.svg';
    const wordmark = 'https://acme.example/assets/header-asset.svg';
    const html = `<html><head><title>Acme</title><meta property="og:site_name" content="Acme"/><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme', logo: symbol })}</script></head><body><header><a href="/"><img src="/assets/header-asset.svg" alt="Acme" width="240" height="40"/></a></header><main><h1>Acme</h1><p>Public company website with readable content.</p></main></body></html>`;
    expect(extractBrandIdentity(html, 'https://acme.example/').logoUrl).toBe(wordmark);
  });

  it('does not promote generic social images to logos just because the filename contains logo', () => {
    const html = '<html><head><title>Example</title><meta property="og:image" content="https://example.com/assets/social-logo-share-card.jpg"/></head><body><h1>Example</h1><p>Public company website with readable content.</p></body></html>';
    expect(extractBrandIdentity(html, 'https://example.com/').logoUrl).toBeNull();
  });
});

describe('rendered reader error detection', () => {
  it('rejects a reader response that wraps an upstream 403 error page', () => {
    expect(isRenderedReaderError('Title: fw_error_www\nURL Source: https://www.oracle.com/\nWarning: Target URL returned error 403: Forbidden\nThis site is experiencing technical difficulty.')).toBe(true);
  });

  it('does not reject real first-party page text', () => {
    expect(isRenderedReaderError('Title: Microsoft\nURL Source: https://www.microsoft.com/\nMarkdown Content: Explore Microsoft products, services and solutions.')).toBe(false);
  });
});

describe('declared website typography', () => {
  it('resolves nested CSS font variables and gives real body/heading assignments priority', () => {
    const css = [
      ':root { --font-body: var(--font-text, "Lato"); --font-text: "Lato", sans-serif; --font-display: "Playfair Display", serif; }',
      'body { font-family: var(--font-body); }',
      'h1, h2 { font-family: var(--font-display); }',
      '@font-face { font-family: "Lato"; src: url("https://fonts.example/lato.woff2") format("woff2"); }',
    ].join('\n');
    const fonts = extractDeclaredFonts(css);
    expect(fonts[0]?.family).toBe('Lato');
    expect(fonts[0]?.evidence).toContain('body/html selector');
    expect(fonts.some((font) => font.family === 'Playfair Display' && font.evidence.includes('heading selector'))).toBe(true);
    expect(resolveFontRoles(fonts)).toEqual({ headingFont: 'Playfair Display', bodyFont: 'Lato' });
  });

  it('preserves a verified font asset through the saved identity mapping', () => {
    const extracted = extractBrandIdentity('<html><head><title>Sample</title></head><body><h1>Sample</h1></body></html>', 'https://sample.example/');
    extracted.fonts = [{
      family: 'Lato',
      source: 'css-declaration',
      evidence: 'font-family from body/html selector',
      fontAssetUrl: 'https://fonts.example/lato.woff2',
      fontAssetFormat: 'woff2',
      fontWeight: '400',
      fontStyle: 'normal',
    }];
    const saved = toVisualIdentity(extracted);
    const loaded = parseVisualIdentity(saved);
    expect(loaded.fonts[0]?.fontAssetUrl).toBe('https://fonts.example/lato.woff2');
    expect(loaded.fonts[0]?.fontAssetFormat).toBe('woff2');
    expect(loaded.headingFont).toBe('Lato');
  });
});

describe('preview typography source priority', () => {
  it('prefers a CSS-declared font over an unrelated linked Google Font', () => {
    const fonts = [
      { family: 'Roboto', source: 'google-fonts' },
      { family: 'Source Sans 3', source: 'css-declaration' },
    ];
    expect(preferredPreviewFontFamily(fonts)).toBe('Source Sans 3');
    expect(resolveFontRoles(fonts)).toEqual({ headingFont: 'Source Sans 3', bodyFont: 'Roboto' });
  });

  it('uses a linked Google Font when no CSS font declaration is available', () => {
    expect(preferredPreviewFontFamily([{ family: 'Inter', source: 'google-fonts' }])).toBe('Inter');
  });

  it('does not invent a font when no evidence is available', () => {
    expect(preferredPreviewFontFamily([])).toBeNull();
    expect(resolveFontRoles([])).toEqual({ headingFont: null, bodyFont: null });
  });
});

describe('logo-selection accuracy regressions', () => {
  it('rejects a third-party CDN logo that names a different company (Salesforce icon for Workato)', () => {
    // Workato's header integration dropdown hosts partner icons on a first-party
    // Contentful CDN. An alt-less `salesforce-icon-light.svg` must not become the
    // requested brand's logo merely because its class contains "header".
    const html = `
      <html><head>
        <title>Workato | Enterprise Automation</title>
        <meta property="og:site_name" content="Workato" />
      </head><body>
        <header>
          <a href="/"><img src="/assets/workato-logo.svg" alt="Workato" width="160" height="34" /></a>
          <div class="header-dropdown-rebrand__link">
            <a href="/integrations/salesforce">
              <img class="header-dropdown-rebrand__link-icon" src="https://images.ctfassets.net/abc/salesforce-icon-light.svg" alt="" />
            </a>
          </div>
        </header>
      </body></html>`;
    const identity = extractBrandIdentity(html, 'https://www.workato.com/');
    expect(identity.logoUrl).toBe('https://www.workato.com/assets/workato-logo.svg');
    expect(identity.logoUrl).not.toContain('salesforce');
  });

  it('keeps a legitimate first-party brand logo that is hosted on a third-party CDN', () => {
    const html = `
      <html><head>
        <title>Harness</title>
        <meta property="og:site_name" content="Harness" />
      </head><body>
        <header>
          <a href="/"><img src="https://cdn.prod.website-files.com/abc/harness-main-white-logo.svg" alt="Harness" width="180" height="40" /></a>
        </header>
      </body></html>`;
    const identity = extractBrandIdentity(html, 'https://www.harness.io/');
    expect(identity.logoUrl).toBe('https://cdn.prod.website-files.com/abc/harness-main-white-logo.svg');
  });

  it('rejects a customer/partner logo placed in a header or promotional section', () => {
    const html = `
      <html><head>
        <title>Greenhouse</title>
        <meta property="og:site_name" content="Greenhouse" />
      </head><body>
        <header class="trusted-by">
          <img src="https://cdn.prod.website-files.com/abc/Coupang-logo.png" alt="" width="140" height="40" />
        </header>
        <section class="logo-strip">
          <img src="https://cdn.prod.website-files.com/abc/HelloFresh-logo.png" alt="HelloFresh" width="140" height="40" />
        </section>
        <nav><a href="/"><img src="/assets/greenhouse-logo.svg" alt="Greenhouse" width="190" height="42" /></a></nav>
      </body></html>`;
    const identity = extractBrandIdentity(html, 'https://www.greenhouse.io/');
    expect(identity.logoUrl).toBe('https://www.greenhouse.io/assets/greenhouse-logo.svg');
    expect(identity.logoUrl).not.toContain('coupang');
  });

  it('rejects an unrelated asset that merely has "logo" in its filename', () => {
    const html = `
      <html><head>
        <title>Kandji</title>
        <meta property="og:site_name" content="Kandji" />
      </head><body>
        <main>
          <img src="https://www.iru.com/assets/iru-logo.png" alt="IRU logo" width="200" height="60" />
        </main>
        <nav><a href="/"><img src="/assets/kandji-logo.svg" alt="Kandji" width="170" height="38" /></a></nav>
      </body></html>`;
    const identity = extractBrandIdentity(html, 'https://www.kandji.io/');
    expect(identity.logoUrl).toBe('https://www.kandji.io/assets/kandji-logo.svg');
    expect(identity.logoUrl).not.toContain('iru');
  });

  it('rejects a country flag asset in the logo slot', () => {
    const html = `
      <html><head>
        <title>MoveInSync</title>
        <meta property="og:site_name" content="MoveInSync" />
      </head><body>
        <header>
          <img class="cbs-flag" src="/wp-content/plugins/country-switcher-v2/assets/flags/in.svg" alt="IN" width="24" height="16" />
          <a href="/"><img src="/wp-content/uploads/2020/03/Header-Logo-White.svg" alt="Header-Logo-White" width="113" height="45" /></a>
        </header>
      </body></html>`;
    const identity = extractBrandIdentity(html, 'https://moveinsync.com/');
    expect(identity.logoUrl).toBe('https://moveinsync.com/wp-content/uploads/2020/03/Header-Logo-White.svg');
    expect(identity.logoUrl).not.toContain('flags');
  });

  it('falls back to a verified favicon when no defensible full logo exists', () => {
    const html = `
      <html><head>
        <title>Acme</title>
        <meta property="og:site_name" content="Acme" />
        <link rel="icon" href="/favicon.ico" />
      </head><body>
        <main>
          <img src="https://cdn.example/trusted-by/stripe-logo.svg" alt="Stripe" width="160" height="40" />
        </main>
      </body></html>`;
    const identity = extractBrandIdentity(html, 'https://www.acme.com/');
    expect(identity.logoUrl).toBe('https://www.acme.com/favicon.ico');
    expect(identity.logoUrl).not.toContain('stripe');
  });

  it('applies equivalent mismatch handling to the rendered-reader fallback', () => {
    const markdown = [
      '![Coupang-logo](https://cdn.prod.website-files.com/abc/Coupang-logo.png)',
      '![Greenhouse](https://cdn.prod.website-files.com/abc/greenhouse-logo.svg)',
      '![Stripe integration](https://cdn.example/trusted-by/stripe-logo.svg)',
      '![Country flag](https://cdn.example/flags/in.svg)',
    ].join('\n');
    expect(extractRenderedLogoCandidates(markdown, 'https://www.greenhouse.io/')).toEqual([
      'https://cdn.prod.website-files.com/abc/greenhouse-logo.svg',
    ]);
  });

  it('does not treat a short country code as a match for the brand name', () => {
    // "in" must not be considered part of "moveinsync"; the old substring logic
    // let a 24x16 flag beat the real 113x45 header wordmark.
    const html = `
      <html><head><title>MoveInSync</title><meta property="og:site_name" content="MoveInSync" /></head>
      <body><header>
        <img class="cbs-flag" src="/flags/in.svg" alt="IN" />
        <a href="/"><img src="/Header-Logo.svg" alt="Header-Logo" width="113" height="45" /></a>
      </header></body></html>`;
    const identity = extractBrandIdentity(html, 'https://moveinsync.com/');
    expect(identity.logoUrl).toBe('https://moveinsync.com/Header-Logo.svg');
  });
});

describe('decorative mega-menu icon regression', () => {
  // Reproduction of the Obsidian scan failure: the real wordmark sits in the
  // header, but a decorative dropdown/flyout icon (Group.svg) appeared later in
  // the DOM inside a mega-menu, inside a link named "Group", with large
  // dimensions and a hint filename — enough for the old scorer to promote it
  // over the actual site logo.
  const MEGA_MENU_PAGE = `<!doctype html>
    <html>
      <head><title>Obsidian</title><meta property="og:site_name" content="Obsidian" /></head>
      <body>
        <header>
          <a href="/" class="site-logo"><img src="/assets/logo-obsidian.svg" alt="Obsidian" width="136" height="34" /></a>
        </header>
        <nav class="mega-menu">
          <a href="/features/group" class="megamenu_group_link_icon">
            <img src="/assets/icons/Group.svg" alt="Group" width="48" height="48" />
          </a>
        </nav>
      </body>
    </html>`;

  it('a decorative mega-menu icon cannot outrank the real site logo', () => {
    const identity = extractBrandIdentity(MEGA_MENU_PAGE, 'https://obsidian.md/');
    expect(identity.logoUrl).toBe('https://obsidian.md/assets/logo-obsidian.svg');
  });

  it('a decorative mega-menu icon cannot outrank an honest favicon fallback', () => {
    // Same page without the wordmark: the correct answer is the favicon, never
    // the unrelated dropdown glyph.
    const noWordmark = MEGA_MENU_PAGE
      .replace(' <a href="/" class="site-logo"><img src="/assets/logo-obsidian.svg" alt="Obsidian" width="136" height="34" /></a>', '')
      .replace('<title>Obsidian</title>', '<title>Obsidian</title><link rel="icon" href="/favicon.ico" />');
    const identity = extractBrandIdentity(noWordmark, 'https://obsidian.md/');
    expect(identity.logoUrl).toBe('https://obsidian.md/favicon.ico');
    expect(identity.faviconUrl).toBe('https://obsidian.md/favicon.ico');
    expect(identity.warnings.join(' ')).toMatch(/logo/i);
    expect(identity.inspected.join(' ')).toContain('favicon fallback');
  });

  it('promotes a wordmark even when a later decorative icon scores higher on placement', () => {
    // Wordmark first in DOM order, decorative icon later with banner/link
    // context and larger dimensions — ranking must stay logo-first.
    const reordered = `<!doctype html>
      <html>
        <head><title>Obsidian</title><meta property="og:site_name" content="Obsidian" /></head>
        <body>
          <header><a href="/"><img src="/assets/logo-obsidian.svg" alt="Obsidian" width="136" height="34" /></a></header>
          <nav>
            <div class="megamenu_group_link_icon"><a href="/group"><img src="/assets/icons/Group.svg" alt="Group icon" width="64" height="64" /></a></div>
          </nav>
        </body>
      </html>`;
    const identity = extractBrandIdentity(reordered, 'https://obsidian.md/');
    expect(identity.logoUrl).toBe('https://obsidian.md/assets/logo-obsidian.svg');
  });
});

describe('rendered-reader cross-brand filename regressions', () => {
  it('rejects a 3-character unrelated brand token (iru-logo.png for kandji.io)', () => {
    // kandji.io's rendered page contained an IRU partner mark whose generic
    // "logo" alt let it through. The filename names a different brand and must
    // be rejected even though the alt is unhelpful.
    const markdown = '![logo](https://www.iru.com/assets/iru-logo.png)';
    expect(extractRenderedLogoCandidates(markdown, 'https://www.kandji.io/')).toEqual([]);
  });

  it('a generic "logo" alt cannot rescue a filename naming another brand on a same-site CDN', () => {
    // The path deliberately avoids words like "customers" — only the filename
    // identifies the other brand, and the CDN host is a same-site subdomain.
    const markdown = '![logo](https://cdn.greenhouse.io/assets/Coupang-logo.png)';
    expect(extractRenderedLogoCandidates(markdown, 'https://www.greenhouse.io/')).toEqual([]);
  });

  it('the token "ai" cannot falsely match "openai"', () => {
    // Under the old substring logic, alias.includes(candidate) made the short
    // technology token "ai" look like evidence of openai's own identity.
    const markdown = [
      '![AI](https://cdn.example.com/ai-logo.png)',
      '![AI platform](https://cdn.example.com/artificial-intelligence-logo.svg)',
    ].join('\n');
    expect(extractRenderedLogoCandidates(markdown, 'https://openai.com/')).toEqual([]);
  });

  it('still accepts openai branding that actually references openai', () => {
    const markdown = '![logo](https://cdn.openai.com/logo.svg)';
    expect(extractRenderedLogoCandidates(markdown, 'https://openai.com/'))
      .toEqual(['https://cdn.openai.com/logo.svg']);
  });

  it('keeps a hash-named CDN wordmark with a generic alt', () => {
    const markdown = '![logo](https://cdn.example.com/a1b2c3d4e5/logo.svg)';
    expect(extractRenderedLogoCandidates(markdown, 'https://www.kandji.io/'))
      .toEqual(['https://cdn.example.com/a1b2c3d4e5/logo.svg']);
  });

  it('keeps a third-party CDN wordmark whose filename names the site brand', () => {
    const markdown = '![logo](https://cdn.prod.website-files.com/abc/harness-logo.svg)';
    expect(extractRenderedLogoCandidates(markdown, 'https://www.harness.io/'))
      .toEqual(['https://cdn.prod.website-files.com/abc/harness-logo.svg']);
  });
});

describe('generic decorative navigation icon regressions', () => {
  // Exact reported failing case: Group.svg sits inside a generic nav link to
  // /features/group with no mega-menu/dropdown class names, and a favicon is
  // available. The icon is navigation chrome, never the company logo.
  const NAV_ICON_PAGE = (head: string, body: string) => `<!doctype html>
    <html>
      <head><title>ClickUp</title><meta property="og:site_name" content="ClickUp" />${head}</head>
      <body>
        <header>
          <nav aria-label="Main">
            <a href="/features/group"><img src="/assets/icons/Group.svg" alt="Group" width="48" height="48" /></a>
          </nav>
          ${body}
        </header>
      </body>
    </html>`;

  it('a generic nav-link icon cannot become the logo; the favicon fallback wins', () => {
    const html = NAV_ICON_PAGE('<link rel="icon" href="/favicon.ico" />', '');
    const identity = extractBrandIdentity(html, 'https://clickup.com/');
    expect(identity.logoUrl).toBe('https://clickup.com/favicon.ico');
    expect(identity.faviconUrl).toBe('https://clickup.com/favicon.ico');
    expect(identity.warnings.join(' ')).toMatch(/logo/i);
    expect(identity.inspected.join(' ')).toContain('favicon fallback');
  });

  it('a real home-linked site logo outranks the generic nav-link icon', () => {
    const html = NAV_ICON_PAGE('', '<a href="/" class="site-logo"><img src="/assets/logo-clickup.svg" alt="ClickUp" width="150" height="36" /></a>');
    const identity = extractBrandIdentity(html, 'https://clickup.com/');
    expect(identity.logoUrl).toBe('https://clickup.com/assets/logo-clickup.svg');
  });

  it('a generic nav-link icon wins nothing even without header wrapping', () => {
    // Same icon linked from body content: the same-site product link alone is
    // not logo evidence.
    const html = `<!doctype html>
      <html>
        <head><title>ClickUp</title><meta property="og:site_name" content="ClickUp" /><link rel="icon" href="/favicon.ico" /></head>
        <body>
          <main>
            <a href="/features/group"><img src="/assets/icons/Group.svg" alt="Group" width="48" height="48" /></a>
          </main>
        </body>
      </html>`;
    const identity = extractBrandIdentity(html, 'https://clickup.com/');
    expect(identity.logoUrl).toBe('https://clickup.com/favicon.ico');
  });
});

describe('context-filter accuracy regressions', () => {
  it('keeps a genuine banner-logo wordmark in the site header', () => {
    // "banner" in a header asset frequently refers to the ARIA banner (header)
    // landmark, not a promotional banner. A home-linked header image whose
    // filename identifies a logo must not be discarded as third-party.
    const html = `<!doctype html>
      <html>
        <head><title>Northwind</title><meta property="og:site_name" content="Northwind" /></head>
        <body>
          <header>
            <a href="/"><img src="/images/banner-logo.png" alt="" width="220" height="60" /></a>
          </header>
        </body>
      </html>`;
    const identity = extractBrandIdentity(html, 'https://www.northwind.com/');
    expect(identity.logoUrl).toBe('https://www.northwind.com/images/banner-logo.png');
  });

  it('rejects a generic-named customer logo inside an identified customer logo strip', () => {
    const html = `<!doctype html>
      <html>
        <head><title>Bluewave</title><meta property="og:site_name" content="Bluewave" /></head>
        <body>
          <header>
            <a href="/"><img src="/assets/bluewave-logo.svg" alt="Bluewave" width="170" height="40" /></a>
          </header>
          <section class="customers" aria-label="Trusted by leading teams">
            <img src="https://cdn.example.com/logos/acme-logo.png" alt="logo" width="140" height="40" />
          </section>
        </body>
      </html>`;
    const identity = extractBrandIdentity(html, 'https://www.bluewave.com/');
    expect(identity.logoUrl).toBe('https://www.bluewave.com/assets/bluewave-logo.svg');
    expect(identity.logoUrl).not.toContain('acme');
  });

  it('still rejects a promotional banner asset in the logo slot', () => {
    const html = `<!doctype html>
      <html>
        <head><title>Northwind</title><meta property="og:site_name" content="Northwind" /><link rel="icon" href="/favicon.ico" /></head>
        <body>
          <div class="promo-banner">
            <a href="/sale"><img src="/images/promo-banner-sale.svg" alt="Summer sale" width="700" height="90" /></a>
          </div>
        </body>
      </html>`;
    const identity = extractBrandIdentity(html, 'https://www.northwind.com/');
    expect(identity.logoUrl).toBe('https://www.northwind.com/favicon.ico');
  });
});

describe('nav topic-link illustrations are not the site logo', () => {
  const navIllustrationHtml = (alt: string, src: string) => `<!doctype html>
    <html>
      <head><title>Greenhouse</title><meta property="og:site_name" content="Greenhouse" /><link rel="icon" href="/favicon.ico" /></head>
      <body>
        <nav aria-label="main menu" class="nav">
          <a href="/" class="nav-brand"><img src="/logo.svg" alt="Greenhouse" /></a>
          <div class="nav-column">
            <a class="nav-topic-item" href="/content-topic/diversity-inclusion" aria-label="DE&I">
              <img src="${src}" alt="${alt}" />
            </a>
          </div>
        </nav>
        <main><h1>Greenhouse</h1><p>Hiring software.</p></main>
      </body>
    </html>`;

  it('rejects a person photo nav illustration whose caption merely starts with the site name', () => {
    const html = navIllustrationHtml(
      'Greenhouse DEI Icon and office worker facing camera in collared shirt',
      'https://cdn.prod.website-files.com/abc123_Greenhouse-DEI-Icon-and-office-worker-facing-cameria-in-collared-shirt.webp',
    );
    const identity = extractBrandIdentity(html, 'https://www.greenhouse.com/');
    expect(identity.logoUrl).toBe('https://www.greenhouse.com/logo.svg');
  });

  it('rejects a non-person topic illustration in a nav content link when the nav logo is missing', () => {
    const html = `<!doctype html>
      <html>
        <head><title>Greenhouse</title><meta property="og:site_name" content="Greenhouse" /></head>
        <body>
          <nav aria-label="main menu" class="nav">
            <a class="nav-topic-item" href="/content-topic/diversity-inclusion">
              <img src="https://cdn.prod.website-files.com/abc123_topic-illustration.svg" alt="Greenhouse topic" />
            </a>
          </nav>
          <main><h1>Greenhouse</h1><p>Hiring software.</p></main>
        </body>
      </html>`;
    const identity = extractBrandIdentity(html, 'https://www.greenhouse.com/');
    expect(identity.logoUrl).toBeNull();
  });

  it('keeps a real logo image inside a nav content link when it carries explicit logo wording', () => {
    const html = `<!doctype html>
      <html>
        <head><title>Northwind</title><meta property="og:site_name" content="Northwind" /></head>
        <body>
          <nav aria-label="main menu" class="nav">
            <a class="nav-topic-item" href="/products/platform">
              <img src="/images/northwind-logo.svg" alt="Northwind logo" />
            </a>
          </nav>
          <main><h1>Northwind</h1></main>
        </body>
      </html>`;
    const identity = extractBrandIdentity(html, 'https://www.northwind.com/');
    expect(identity.logoUrl).toBe('https://www.northwind.com/images/northwind-logo.svg');
  });
});

describe('person photographs are never the owner logo without brand-mark wording', () => {
  it('rejects a founder photo captioned with the brand name outside a logo slot', () => {
    const html = `<!doctype html>
      <html>
        <head><title>Acme</title><meta property="og:site_name" content="Acme" /></head>
        <body>
          <header>
            <div class="founder-section">
              <img src="/images/jane-doe-founder.jpg" alt="Acme founder Jane Doe" width="400" height="400" />
            </div>
          </header>
          <main><h1>Acme</h1></main>
        </body>
      </html>`;
    const identity = extractBrandIdentity(html, 'https://www.acme.com/');
    expect(identity.logoUrl).toBeNull();
  });
});

describe('page-declared icons hosted on generic CDN infrastructure', () => {
  it('accepts a cross-host icon link when the host is shared CDN infrastructure', () => {
    const html = `<!doctype html>
      <html>
        <head>
          <title>Greenhouse</title>
          <link rel="shortcut icon" href="https://cdn.prod.website-files.com/abc_gh_Icon-greenhouse-green.png" />
        </head>
        <body><main><h1>Greenhouse</h1></main></body>
      </html>`;
    const identity = extractBrandIdentity(html, 'https://www.greenhouse.com/');
    expect(identity.faviconUrl).toBe('https://cdn.prod.website-files.com/abc_gh_Icon-greenhouse-green.png');
  });

  it('still rejects a cross-brand host declared as the icon', () => {
    const html = '<html><head><title>GitHub</title><link rel="icon" href="https://duolingo.example/favicon.ico" /></head><body><main><h1>GitHub</h1></main></body></html>';
    const identity = extractBrandIdentity(html, 'https://github.com/');
    expect(identity.faviconUrl).toBeNull();
  });
});

describe('sub-brand scoped colours and gradient decorations stay out of the palette', () => {
  it('demotes podcast-scoped utility colours below declared brand tokens', () => {
    const css = [
      ':root{--color-brand-darkblue:#0143fe;--color-brand-green:#4bd783;--color-podcast-neon:#e5fc56;--color-podcast-satori:#2268d9;}',
      '.bg-podcast-Neon{background-color:var(--color-podcast-neon)}',
      '.podcast-prose a{color:var(--color-podcast-satori)}',
      '.btn-primary{background-color:var(--color-brand-darkblue)}',
      '.badge-green{background-color:var(--color-brand-green)}',
    ].join('\n');
    const sink = new Map<string, { count: number; sources: Set<string> }>();
    collectColors(css, 'external-stylesheet', sink);
    const palette = rankPalette(sink, 2);
    expect(palette.map((color) => color.hex)).toEqual(['#0143fe', '#4bd783']);
    // Sub-brand scoped usage never earns corroborating control/link evidence.
    expect(sink.get('#e5fc56')?.sources).not.toContain('primary-control');
    expect(sink.get('#2268d9')?.sources).not.toContain('link-accent');
  });

  it('never grants gradient stops control-colour evidence', () => {
    const css = [
      ':root{--accent:#ff9ae6;}',
      '.form-actions{background:linear-gradient(90deg,#ff9ae6,#afb3fe);}',
    ].join('\n');
    const sink = new Map<string, { count: number; sources: Set<string> }>();
    collectColors(css, 'external-stylesheet', sink);
    expect(sink.get('#ff9ae6')?.sources).not.toContain('primary-control');
    expect(sink.get('#afb3fe')?.sources).not.toContain('primary-control');
    expect(sink.get('#ff9ae6')?.sources).toContain('gradient-css');
  });

  it('does not count colour words inside var() names as named-colour declarations', () => {
    const css = '.panel{border-color:var(--color-red-600)}';
    const sink = new Map<string, { count: number; sources: Set<string> }>();
    collectColors(css, 'external-stylesheet', sink);
    expect(sink.get('#ff0000')).toBeUndefined();
  });

  it('keeps volume-only unattributed colours below attributed brand tokens', () => {
    const css = [
      ':root{--color-brand-darkorange:#ff5300;}',
      ...Array.from({ length: 60 }, (_, i) => `@keyframes frame-${i}{0%{color:color-mix(in lab,red,red)}}`),
      '.btn-primary{background-color:var(--color-brand-darkorange)}',
    ].join('\n');
    const sink = new Map<string, { count: number; sources: Set<string> }>();
    collectColors(css, 'external-stylesheet', sink);
    const palette = rankPalette(sink, 4);
    // The attributed brand token outranks the keyframe red despite its volume.
    expect(palette.map((color) => color.hex)).toEqual(['#ff5300', '#ff0000']);
  });
});

describe('rebrand declarations in page titles', () => {
  it('reads the current corporate name from a "Now X" title suffix', () => {
    // kandji.com resolves to Iru's kandji-mdm page, whose title still leads
    // with the historical product name: "... | Now Iru".
    expect(rebrandDeclaredName('Kandji Device Management and Security  | Now Iru')).toBe('Iru');
  });

  it('reads the current name from a "(formerly X)" leader', () => {
    expect(rebrandDeclaredName('Iru (formerly Kandji) | Securing devices, identity, and compliance.')).toBe('Iru');
  });

  it('reads "formerly known as" suffixes', () => {
    expect(rebrandDeclaredName('Acme — formerly known as WidgetCo')).toBe('WidgetCo');
  });

  it('leaves ordinary titles untouched', () => {
    expect(rebrandDeclaredName('Atlassian | Software')).toBeNull();
    expect(rebrandDeclaredName('OpenAI')).toBeNull();
    expect(rebrandDeclaredName('Microsoft – Official product page')).toBeNull();
    expect(rebrandDeclaredName(null)).toBeNull();
  });

  it('a rebranded page reports the current brand, keeping the historical name in the content', () => {
    const html = `<!doctype html>
      <html>
        <head>
          <title>Kandji Device Management and Security  | Now Iru</title>
          <meta name="description" content="Apple MDM solutions built for Mac, iPad and iPhone." />
          <link rel="icon" href="/favicon.ico" />
        </head>
        <body>
          <main><h1>Kandji is now Iru</h1><p>Kandji MDM capabilities continue under the Iru platform.</p></main>
        </body>
      </html>`;
    const identity = extractBrandIdentity(html, 'https://www.iru.com/kandji-mdm');
    expect(identity.brandName).toBe('Iru');
    expect(identity.description).toContain('Apple MDM');
  });
});

describe('byte-capped stylesheets stay fast to parse', () => {
  it('an unterminated tail (mid data-URI, no closing brace) cannot make colour extraction quadratic', () => {
    // Reproduces the Microsoft scan stall: fetchCss caps a stylesheet at 350KB,
    // cutting the file mid `url("data:...base64` with no closing brace. The
    // /([^{}]+)\{([^{}]*)\}/g rules loop then backtracked quadratically
    // (~90s for 345KB in production). The fix drops the unterminated tail.
    const completeRule = 'a{color:#123456;background:#0143fe;}';
    const truncated = completeRule + 'b{background-image:url("data:image/png;base64,' + 'QUJD'.repeat(30_000);
    const startedAt = Date.now();
    const sink = new Map<string, { count: number; sources: Set<string> }>();
    collectColors(truncated, 'external-stylesheet', sink);
    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThan(2_000);
    // Legit colours declared before the cut are still extracted.
    expect(sink.get('#123456')).toBeTruthy();
    expect(sink.get('#0143fe')).toBeTruthy();
  });

  it('a stylesheet with no complete rule at all yields no rule evidence without stalling', () => {
    const neverClosed = 'a{color:#123456;background-image:url("data:image/png;base64,' + 'QUJD'.repeat(40_000);
    const startedAt = Date.now();
    collectColors(neverClosed, 'external-stylesheet', new Map());
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });
});
