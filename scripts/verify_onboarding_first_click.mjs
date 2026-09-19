/**
 * Regression check for the onboarding step 3 "Start research" bug.
 *
 * Scenario A (fresh session, first click): profile -> brand -> ONE research
 * request must start a run. A 409 means an earlier attempt left an active run
 * behind and the user would need a second click, so it fails the check.
 *
 * Scenario B ("Do it later"): completing onboarding without research must not
 * create any research run.
 *
 * Usage:
 *   APP_URL=https://uptrendify-os.vercel.app \
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   node scripts/verify_onboarding_first_click.mjs
 */
import { createBrowserClient } from '@supabase/ssr';

const APP_URL = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or _PUBLISHABLE_KEY) are required.');
  process.exit(1);
}

const failures = [];

function check(condition, message) {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures.push(message);
}

async function freshSession(label) {
  const jar = new Map();
  const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
      setAll: (entries) => entries.forEach(({ name, value }) => jar.set(name, value)),
    },
  });

  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const email = `ob_first_click_${label}_${stamp}@uptrendify.test`;
  const password = 'Password123!Secure';
  const organizationName = `FirstClickOrg_${stamp}`;

  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { organizationName } } });
  if (error) throw error;
  if (!data.session) {
    const signIn = await supabase.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;
  }

  const cookie = Array.from(jar.entries()).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
  const headers = { 'content-type': 'application/json', cookie };

  const call = async (path, init = {}) => {
    const res = await fetch(`${APP_URL}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body };
  };

  const bootstrap = await call('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify({ organizationName }) });
  if (bootstrap.status !== 201 && bootstrap.status !== 200) {
    throw new Error(`Bootstrap failed (${bootstrap.status}): ${JSON.stringify(bootstrap.body)}`);
  }

  return {
    call,
    cleanup: async () => {
      await call('/api/auth/workspace', { method: 'DELETE', body: JSON.stringify({ confirmation: 'DELETE WORKSPACE' }) });
      await call('/api/auth/account', { method: 'DELETE', body: JSON.stringify({ confirmation: 'DELETE' }) });
    },
  };
}

async function completeStepsOneAndTwo(call, stamp) {
  const profile = await call('/api/auth/profile', {
    method: 'POST',
    body: JSON.stringify({ firstName: 'Jane', lastName: 'Doe', teamSize: '2-5', timezone: 'UTC' }),
  });
  check(profile.status === 200, `step 1 profile saved (got ${profile.status})`);

  const brand = await call('/api/brands', {
    method: 'POST',
    body: JSON.stringify({ clientName: 'Acme Corp', brandName: `Acme Brand ${stamp}`, websiteUrl: 'https://example.com' }),
  });
  check(brand.status === 201 && Boolean(brand.body?.brand?.id), `step 2 brand created (got ${brand.status})`);
  return brand.body?.brand?.id;
}

async function scenarioFirstClick() {
  console.log('\n=== Scenario A: fresh session, single click on "Start research" ===');
  const session = await freshSession('research');
  try {
    const brandId = await completeStepsOneAndTwo(session.call, Date.now());
    if (!brandId) return;

    const research = await session.call(`/api/brands/${brandId}/research`, { method: 'POST', body: JSON.stringify({}) });
    console.log(`first click -> ${research.status} ${JSON.stringify(research.body)}`);
    check(research.status === 201, `first click starts research (got ${research.status}: ${JSON.stringify(research.body)})`);
    check(research.status !== 409, 'first click does not report an already-active run left behind by a failed attempt');

    const runs = await session.call(`/api/brands/${brandId}/research`);
    const list = runs.body?.runs ?? [];
    check(list.length === 1, `exactly one research run exists after one click (got ${list.length})`);
    check(
      list[0] && list[0].status !== 'FAILED',
      `the run created by the first click is not failed (got ${list[0]?.status}: ${list[0]?.errorCode ?? 'none'})`,
    );

    const complete = await session.call('/api/auth/profile', { method: 'POST', body: JSON.stringify({ onboardingComplete: true }) });
    check(complete.status === 200, `onboarding completes after starting research (got ${complete.status})`);
  } finally {
    await session.cleanup();
  }
}

async function scenarioDoItLater() {
  console.log('\n=== Scenario B: "Do it later" ===');
  const session = await freshSession('later');
  try {
    const brandId = await completeStepsOneAndTwo(session.call, Date.now());
    if (!brandId) return;

    const complete = await session.call('/api/auth/profile', { method: 'POST', body: JSON.stringify({ onboardingComplete: true }) });
    check(complete.status === 200, `onboarding completes without research (got ${complete.status})`);

    const runs = await session.call(`/api/brands/${brandId}/research`);
    check((runs.body?.runs ?? []).length === 0, 'no research run is created by "Do it later"');

    const profile = await session.call('/api/auth/profile');
    check(profile.body?.profile?.onboarding_completed === true, 'profile is marked onboarding_completed');
  } finally {
    await session.cleanup();
  }
}

console.log(`Target: ${APP_URL}`);
await scenarioFirstClick();
await scenarioDoItLater();

console.log('\n======================================================');
if (failures.length > 0) {
  console.error(`FAILED (${failures.length}):`);
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log('ONBOARDING FIRST-CLICK REGRESSION CHECK PASSED');
