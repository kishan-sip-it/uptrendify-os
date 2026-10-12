import { describe, expect, it } from 'vitest';
import { parseVisualIdentity, preferredPreviewFontFamily, resolveFontRoles, toVisualIdentity } from './identity-mapping';
import {
  collectColors,
  collectJavaScriptDesignTokens,
  extractBrandIdentity,
  extractDeclaredFonts,
  isBlockedWebsiteResponse,
  isRenderedReaderError,
  rankPalette,
  isNeutral,
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
 
describe('logo identity confidence', () => {
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
