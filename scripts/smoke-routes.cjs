const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(process.env.REPO_ROOT || '/home/groovy/uptrendify-os');
const APP = process.env.VERIFY_APP || 'http://localhost:3000';

const results = [];
let failures = 0;
function check(name, ok, detail) {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` [${detail}]` : ''}`);
}

const routeFiles = [
  ['public landing /', 'app/page.tsx'],
  ['login', 'app/login/page.tsx'],
  ['register', 'app/register/page.tsx'],
  ['forgot-password', 'app/forgot-password/page.tsx'],
  ['reset-password', 'app/reset-password/page.tsx'],
  ['onboarding', 'app/onboarding/page.tsx'],
  ['dashboard', 'app/(app)/dashboard/page.tsx'],
  ['brands list', 'app/(app)/brands/page.tsx'],
  ['brand detail', 'app/(app)/brands/[brandId]/page.tsx'],
  ['brand brain review (embedded via BrandBrainReview)', 'app/(app)/brands/[brandId]/page.tsx'],
];

for (const [label, rel] of routeFiles) {
  const exists = fs.existsSync(path.join(ROOT, rel));
  check(`route file installed: ${label}`, exists, rel);
}

(async () => {
  for (const [label, p] of [
    ['/ landing', '/'],
    ['/login', '/login'],
    ['/register', '/register'],
    ['/forgot-password', '/forgot-password'],
    ['/reset-password', '/reset-password'],
  ]) {
    let status = -1;
    try {
      const res = await fetch(APP + p, { redirect: 'manual' });
      status = res.status;
    } catch (e) {}
    check(`public GET ${label} -> 200`, status === 200, `status=${status}`);
  }

  console.log(`\n${results.length} checks, ${failures} failure(s)`);
  process.exitCode = failures > 0 ? 1 : 0;
})();
