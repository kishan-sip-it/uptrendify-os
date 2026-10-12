import { describe, expect, it } from 'vitest';
import { DFD_LEVELS } from './graphs';

describe('UpTrendifyOS DFD graphs', () => {
  it('defines all three requested decomposition levels', () => {
    expect(Object.keys(DFD_LEVELS).sort()).toEqual(['0', '1', '2']);
    expect(DFD_LEVELS[0].nodes.some((node) => node.kind === 'system')).toBe(true);
  });

  it('keeps every labelled data flow connected to existing nodes', () => {
    for (const level of [0, 1, 2] as const) {
      const graph = DFD_LEVELS[level];
      const ids = new Set(graph.nodes.map((node) => node.id));
      expect(new Set(ids).size).toBe(graph.nodes.length);
      expect(graph.edges.length).toBeGreaterThan(0);
      for (const edge of graph.edges) {
        expect(edge.label.trim()).not.toBe('');
        expect(ids.has(edge.from), 'unknown source node: ' + edge.from).toBe(true);
        expect(ids.has(edge.to), 'unknown target node: ' + edge.to).toBe(true);
        expect(edge.from).not.toBe(edge.to);
      }
    }
  });

  it('includes the real core flows at the detailed website-scan level', () => {
    const ids = new Set(DFD_LEVELS[2].nodes.map((node) => node.id));
    expect(ids).toContain('validate');
    expect(ids).toContain('visual');
    expect(ids).toContain('enrich');
    expect(ids).toContain('merge');
    expect(ids).toContain('store');
    expect(DFD_LEVELS[2].edges.some((edge) => edge.from === 'merge' && edge.to === 'store')).toBe(true);
  });
});