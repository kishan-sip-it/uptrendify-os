import { describe, it, expect } from 'vitest';
import { extractPage } from './extract';

describe('extractPage', () => {
  it('extracts title, description, headings, text and links', () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Test Page</title>
        <meta name="description" content="A test page for extraction" />
        <link rel="canonical" href="https://example.com/canonical" />
      </head>
      <body>
        <h1>Main Heading</h1>
        <h2>Section 1</h2>
        <p>Some important text content.</p>
        <h2>Section 2</h2>
        <p>More text here.</p>
        <a href="/about">About</a>
        <a href="https://other.com">Other</a>
      </body>
      </html>
    `;
    const result = extractPage(html, 'https://example.com/page');
    expect(result.title).toBe('Test Page');
    expect(result.description).toBe('A test page for extraction');
    expect(result.canonicalUrl).toBe('https://example.com/canonical');
    expect(result.headings).toEqual(['Main Heading', 'Section 1', 'Section 2']);
    expect(result.text).toContain('Some important text content');
    expect(result.text).toContain('More text here');
    expect(result.links).toContain('https://example.com/about');
    expect(result.links).toContain('https://other.com/');
  });

  it('strips scripts and styles from extracted text', () => {
    const html = `
      <html>
      <head><title>X</title><style>.foo { color: red; }</style></head>
      <body>
        <script>console.log('secret');</script>
        <p>Visible content</p>
        <noscript>No-script fallback</noscript>
      </body>
      </html>
    `;
    const result = extractPage(html, 'https://example.com');
    expect(result.text).toContain('Visible content');
    expect(result.text).not.toContain('console.log');
    expect(result.text).not.toContain('color: red');
    expect(result.text).not.toContain('No-script fallback');
  });

  it('returns null for missing title and description', () => {
    const html = '<html><body></body></html>';
    const result = extractPage(html, 'https://example.com');
    expect(result.title).toBeNull();
    expect(result.description).toBeNull();
    expect(result.canonicalUrl).toBeNull();
    expect(result.headings).toEqual([]);
  });

  it('limits extracted text length', () => {
    const text = 'word '.repeat(20000);
    const html = `<html><body><p>${text}</p></body></html>`;
    const result = extractPage(html, 'https://example.com');
    expect(result.text.length).toBeLessThanOrEqual(50000);
  });

  it('caps number of headings and links', () => {
    const headings = Array.from({ length: 100 }, (_, i) => `<h2>Heading ${i}</h2>`).join('');
    const links = Array.from({ length: 200 }, (_, i) => `<a href="/page-${i}">Link</a>`).join('');
    const html = `<html><body>${headings}${links}</body></html>`;
    const result = extractPage(html, 'https://example.com');
    expect(result.headings.length).toBeLessThanOrEqual(80);
    expect(result.links.length).toBeLessThanOrEqual(100);
  });
});