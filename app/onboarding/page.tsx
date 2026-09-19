'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, LoaderCircle, Rocket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { ErrorState, LoadingState } from '@/components/ui/feedback';
import { AuthLayout } from '@/components/auth/auth-layout';

const TIMEZONES = (() => {
  try {
    const zones = Intl.supportedValuesOf?.('timeZone') ?? [];
    return zones.length > 0 ? zones : ['America/New_York', 'America/Los_Angeles', 'Europe/London', 'UTC', 'Asia/Tokyo'];
  } catch {
    return ['UTC'];
  }
})();

const STEPS = ['Profile', 'First brand', 'Launch'];

export default function OnboardingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'ready'>('checking');
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdBrandId, setCreatedBrandId] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/login';
        return;
      }
      const response = await fetch('/api/auth/profile');
      if (!response.ok) throw new Error('Could not load your profile');
      const body = await response.json();
      if (body?.profile?.onboarding_completed) {
        router.replace('/dashboard');
        return;
      }
      setStatus('ready');
    }
    check().catch(() => window.location.assign('/login'));
  }, [router]);

  async function handleProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: String(form.get('firstName') ?? ''),
          lastName: String(form.get('lastName') ?? '') || null,
          teamSize: String(form.get('teamSize') ?? '') || null,
          timezone: String(form.get('timezone') ?? '') || null,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Could not save your profile');
      }
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile');
    } finally {
      setLoading(false);
    }
  }

  async function handleBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientName: String(form.get('clientName') ?? ''),
          brandName: String(form.get('brandName') ?? ''),
          websiteUrl: String(form.get('websiteUrl') ?? ''),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not create your brand');
      setCreatedBrandId(body.brand.id as string);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your brand');
    } finally {
      setLoading(false);
    }
  }

  async function finish(runResearch: boolean) {
    setLoading(true);
    setError('');
    try {
      if (runResearch && createdBrandId) {
        const research = await fetch(`/api/brands/${createdBrandId}/research`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!research.ok) {
          const body = await research.json().catch(() => null);
          if (research.status !== 409) throw new Error(body?.error || 'Could not start research');
        }
      }
      const complete = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ onboardingComplete: true }),
      });
      if (!complete.ok) {
        const body = await complete.json().catch(() => null);
        throw new Error(body?.error || 'Could not finish setup');
      }
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish setup');
      setLoading(false);
    }
  }

  if (status === 'checking') {
    return (
      <AuthLayout eyebrow="Welcome" title="Let's set up your workspace." subtitle="" footer={null}>
        <LoadingState label="Preparing onboarding…" />
      </AuthLayout>
    );
  }

  const stepTitles = [
    { eyebrow: 'Step 1 of 3', title: 'Who runs the show?', subtitle: 'Tell us about you. Workspace permissions are controlled by your organization membership.' },
    { eyebrow: 'Step 2 of 3', title: 'Add your first client brand.', subtitle: 'We\u2019ll research its public website and draft a Brand Brain you can review.' },
    { eyebrow: 'Step 3 of 3', title: 'Ready for launch.', subtitle: 'Start research now or add it later from the brand page.' },
  ];
  const meta = stepTitles[step];

  return (
    <AuthLayout eyebrow={meta.eyebrow} title={meta.title} subtitle={meta.subtitle} footer={null}>
      <div className="onboarding-progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((label, i) => (
          <div className={`ob-step${i <= step ? ' done' : ''}${i === step ? ' current' : ''}`} key={label}>
            <span className="ob-step-dot">{i < step ? <Check size={12} /> : i + 1}</span>
            <span className="ob-step-label">{label}</span>
          </div>
        ))}
      </div>

      {step === 0 ? (
        <form onSubmit={handleProfile} className="card auth-card-form">
          <div className="onboarding-grid">
            <label>First name<input name="firstName" required maxLength={120} placeholder="Jane" autoFocus /></label>
            <label>Last name<input name="lastName" maxLength={120} placeholder="Doe" /></label>
          </div>
          <div className="onboarding-grid">
            <label>Team size<input name="teamSize" maxLength={40} placeholder="e.g. 2–5 people" /></label>
            <label>
              Timezone
              <select name="timezone" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}>
                {TIMEZONES.map((zone) => <option value={zone} key={zone}>{zone}</option>)}
              </select>
            </label>
          </div>
          {error && <ErrorState message={error} />}
          <button type="submit" disabled={loading} className="badge auth-submit">
            {loading ? <><LoaderCircle size={15} className="spin" /> Saving…</> : <>Continue <ArrowRight size={15} /></>}
          </button>
        </form>
      ) : null}

      {step === 1 ? (
        <form onSubmit={handleBrand} className="card auth-card-form">
          <label>Client (your business name for them)<input name="clientName" required maxLength={120} placeholder="e.g. Northwind" autoFocus /></label>
          <label>Brand name<input name="brandName" required maxLength={120} placeholder="e.g. Aurora" /></label>
          <label>
            Website to research
            <input name="websiteUrl" type="url" required placeholder="https://aurora.example.com" />
          </label>
          {error && <ErrorState message={error} />}
          <div className="onboarding-actions">
            <button type="button" className="badge" onClick={() => { setError(''); setStep(0); }} disabled={loading} style={{ border: 0, cursor: 'pointer' }}>
              <ChevronLeft size={15} /> Back
            </button>
            <button type="submit" disabled={loading} className="badge auth-submit" style={{ flex: 1 }}>
              {loading ? <><LoaderCircle size={15} className="spin" /> Creating…</> : <>Create brand <ArrowRight size={15} /></>}
            </button>
          </div>
        </form>
      ) : null}

      {step === 2 ? (
        <div className="card auth-card-form">
          <p className="subtitle" style={{ marginBottom: 16 }}>
            {createdBrandId ? 'Your brand is ready. Start AI research now — it runs in the background while you explore.' : 'Your brand is ready.'}
          </p>
          {error && <ErrorState message={error} />}
          <div className="onboarding-actions">
            <button type="button" className="badge" onClick={() => finish(false)} disabled={loading} style={{ flex: 1, border: 0, cursor: 'pointer' }}>
              {loading ? <><LoaderCircle size={15} className="spin" /> Wrapping up…</> : <>Do it later</>}
            </button>
            <button type="button" className="badge auth-submit" onClick={() => finish(true)} disabled={loading} style={{ flex: 1 }}>
              {loading ? <><LoaderCircle size={15} className="spin" /> Starting research…</> : <>Start research <Rocket size={15} /></>}
            </button>
          </div>
        </div>
      ) : null}
    </AuthLayout>
  );
}