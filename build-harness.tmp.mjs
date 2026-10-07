import { readFileSync, writeFileSync } from 'node:fs';

// Build a harness page that imports the app's real stylesheets in the same
// order as app/layout.tsx, then renders the exact chip-toggle markup used by
// the campaign channel selector. This exercises the real cascade (including the
// cool-light-theme `!important` override) without needing an authenticated app.
const cssFiles = [
  'globals.css',
  'design-system.css',
  'workspace-layout.css',
  'public-pages.css',
  'shared-theme.css',
  'brand-brain-ux.css',
  'authenticated-ui.css',
  'cool-light-theme.css',
  'ui-foundation.css',
  'brand-profile.css',
];

const css = cssFiles
  .map((f) => readFileSync(`app/${f}`, 'utf8'))
  .join('\n');

const html = `<!doctype html>
<html lang="en" data-theme="light">
<head><meta charset="utf-8"><style>${css}</style></head>
<body>
  <div class="chip-row">
    <button type="button" id="selected" class="chip chip-toggle chip-toggle-active" aria-pressed="true">Meta / Instagram ads</button>
    <button type="button" id="unselected" class="chip chip-toggle" aria-pressed="false">Google ads</button>
    <button type="button" id="disabled" class="chip chip-toggle" disabled>SMS</button>
    <button type="button" id="selectedDisabled" class="chip chip-toggle chip-toggle-active" aria-pressed="true" disabled>Other</button>
    <button type="button" id="hover" class="chip chip-toggle">Hover probe</button>
    <button type="button" id="focus" class="chip chip-toggle">Focus probe</button>
  </div>
</body>
</html>`;

writeFileSync('/tmp/chip-harness.html', html);
console.log('harness written');
