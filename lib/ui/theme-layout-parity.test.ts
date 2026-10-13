import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function findStylesheets(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findStylesheets(path);
    return entry.isFile() && entry.name.endsWith('.css') ? [path] : [];
  });
}

describe('theme layout parity', () => {
  it('keeps dark theme overrides limited to visual tokens, not geometry or typography', () => {
    const appDirectory = resolve(process.cwd(), 'app');
    const stylesheetPaths = findStylesheets(appDirectory);
    const sizingDeclaration = /(?:^|;)\s*(?:width|min-width|max-width|height|min-height|max-height|padding(?:-[a-z]+)?|margin(?:-[a-z]+)?|gap|row-gap|column-gap|grid-template-columns|grid-template-rows|font-size|font-family|font|line-height|letter-spacing|zoom|transform|scale|flex-basis)\s*:/i;
    const violations: string[] = [];

    for (const path of stylesheetPaths) {
      const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      const rules = css.matchAll(/([^{}]+)\{([^{}]*)\}/g);
      for (const match of rules) {
        const selector = match[1] ?? '';
        const declarations = match[2] ?? '';
        if (/html\s*\[data-theme\s*=\s*["']dark["']\s*\]/i.test(selector) && sizingDeclaration.test(declarations)) {
          violations.push(path.replace(appDirectory + '/', '') + ': ' + selector.trim().replace(/\s+/g, ' '));
        }
      }
    }

    expect(stylesheetPaths.length).toBeGreaterThan(0);
    expect(violations, 'Dark mode should change colors/surfaces, not page width, spacing, or type scale').toEqual([]);
  });
});
