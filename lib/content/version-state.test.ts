import { describe, expect, it } from 'vitest';
import { reconcileContentVersionState, type ContentVersionStateEntry } from './version-state';

const v = (version: number): ContentVersionStateEntry => ({
  id: 'v' + version,
  version,
  body: 'body-' + version,
  cta: null,
});

describe('reconcileContentVersionState', () => {
  it('does not roll back a newly saved version when a refresh returns the older pointer', () => {
    const result = reconcileContentVersionState([v(7)], [v(8), v(7)], 'v7', 'v8');

    expect(result.currentVersionId).toBe('v8');
    expect(result.versions.map((entry) => entry.id)).toEqual(['v8', 'v7']);
  });

  it('adopts a genuinely newer current version from the server', () => {
    const result = reconcileContentVersionState([v(9), v(8)], [v(8), v(7)], 'v9', 'v8');

    expect(result.currentVersionId).toBe('v9');
    expect(result.versions.map((entry) => entry.id)).toEqual(['v9', 'v8', 'v7']);
  });

  it('keeps the locally known current pointer when the server omits it from the version list', () => {
    const result = reconcileContentVersionState([v(7)], [v(8), v(7)], 'v8', 'v8');

    expect(result.currentVersionId).toBe('v8');
  });
});
