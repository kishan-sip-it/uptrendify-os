import { describe, expect, it } from 'vitest';
import { parseSearchHtml } from './discovery';

describe('brand website discovery parser', () => {
  it('extracts safe public result links and removes duplicate hosts', () => {
    const html = [
      '<a class="result__a" href="https://example.com">Example</a>',
      '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fabout">Example about</a>',
      '<a class="result__a" href="https://another.test">Another</a>',
      '<a class="result__a" href="http://localhost:3000/admin">Local</a>',
    ].join('');
    expect(parseSearchHtml(html)).toEqual([
      { title: 'example.com', url: 'https://example.com/' },
      { title: 'another.test', url: 'https://another.test/' },
    ]);
  });
});
