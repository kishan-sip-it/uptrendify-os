import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = 'https://iipfwctyzdcuzlujmvte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpcGZ3Y3R5emRjdXpsdWptdnRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NDQ0OTIsImV4cCI6MjEwNTEyMDQ5Mn0.cWUvozi21t8fbWIfXiZWqp4PArNeplbZfgdCjDPihuU';
const APP_URL = 'https://uptrendify-os.vercel.app';

async function run() {
  console.log('=== Step 1: Initialize Supabase Client & User Signup ===');
  const cookieJar = new Map();
  const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          cookieJar.set(name, value);
        }
      },
    },
  });

  const timestamp = Date.now();
  const testEmail = `ob_verify_${timestamp}@uptrendify.test`;
  const testPassword = 'Password123!Secure';
  const orgName = `OnboardingOrg_${timestamp}`;

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: {
      data: { organizationName: orgName },
    },
  });

  if (signUpError) {
    console.error('SignUp Error:', signUpError);
    process.exit(1);
  }

  if (!signUpData.session) {
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    if (signInError) {
      console.error('SignIn Error:', signInError);
      process.exit(1);
    }
  }

  const cookieHeader = Array.from(cookieJar.entries())
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');

  console.log('=== Step 2: Bootstrap Organization ===');
  const bootstrapRes = await fetch(`${APP_URL}/api/auth/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieHeader },
    body: JSON.stringify({ organizationName: orgName }),
  });
  if (!bootstrapRes.ok) {
    console.error('Bootstrap failed:', await bootstrapRes.text());
    process.exit(1);
  }
  const bootstrapBody = await bootstrapRes.json();
  console.log('Bootstrap success! Org ID:', bootstrapBody.organization?.id);

  console.log('=== Step 3: Onboarding Step 1 - Save Profile ===');
  const profileRes = await fetch(`${APP_URL}/api/auth/profile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieHeader },
    body: JSON.stringify({
      firstName: 'Jane',
      lastName: 'Doe',
      teamSize: '2-5',
      timezone: 'UTC',
    }),
  });
  console.log('Profile save status:', profileRes.status);
  const profileBody = await profileRes.json();
  console.log('Profile save body:', profileBody);

  console.log('=== Step 4: Onboarding Step 2 - Create Brand ===');
  const brandRes = await fetch(`${APP_URL}/api/brands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieHeader },
    body: JSON.stringify({
      clientName: 'Acme Corp',
      brandName: `Acme Brand ${timestamp}`,
      websiteUrl: 'https://example.com',
    }),
  });
  console.log('Brand creation status:', brandRes.status);
  const brandBody = await brandRes.json();
  console.log('Brand creation body:', brandBody);

  if (!brandRes.ok || !brandBody.brand?.id) {
    console.error('Brand creation failed!');
    process.exit(1);
  }
  const brandId = brandBody.brand.id;
  console.log('Created Brand ID:', brandId);

  console.log('=== Step 5: Onboarding Step 3 - Start Research ===');
  const researchRes = await fetch(`${APP_URL}/api/brands/${brandId}/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieHeader },
    body: JSON.stringify({}),
  });
  console.log('Research request HTTP status:', researchRes.status);
  const researchBody = await researchRes.json();
  console.log('Research response body:', researchBody);

  if (researchRes.status === 400 && researchBody.error === 'Invalid research request') {
    console.error('FAILED! Received "Invalid research request" error!');
    process.exit(1);
  }

  if (researchRes.status === 201 || researchRes.status === 200 || researchRes.status === 409) {
    console.log('SUCCESS! Research API accepted the onboarding request smoothly!');
  } else {
    console.error('Unexpected research API response status:', researchRes.status);
    process.exit(1);
  }

  console.log('=== Step 6: Complete Onboarding ===');
  const completeRes = await fetch(`${APP_URL}/api/auth/profile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieHeader },
    body: JSON.stringify({ onboardingComplete: true }),
  });
  console.log('Complete Onboarding status:', completeRes.status);

  console.log('=== Step 7: Verify Profile Onboarding State ===');
  const checkProfileRes = await fetch(`${APP_URL}/api/auth/profile`, {
    method: 'GET',
    headers: { cookie: cookieHeader },
  });
  const checkProfileBody = await checkProfileRes.json();
  console.log('Profile onboarding_completed:', checkProfileBody.profile?.onboarding_completed);

  if (!checkProfileBody.profile?.onboarding_completed) {
    console.error('FAILED! Onboarding was not marked completed in profile!');
    process.exit(1);
  }

  console.log('=== Step 8: Clean Up Workspace & Account ===');
  await fetch(`${APP_URL}/api/auth/workspace`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', cookie: cookieHeader },
    body: JSON.stringify({ confirmation: 'DELETE WORKSPACE' }),
  });
  await fetch(`${APP_URL}/api/auth/account`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', cookie: cookieHeader },
    body: JSON.stringify({ confirmation: 'DELETE' }),
  });

  console.log('\n======================================================');
  console.log('ONBOARDING STEP 3 LIVE PRODUCTION VERIFICATION PASSED!');
  console.log('======================================================');
}

run().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
