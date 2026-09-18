'use client';

import { FormEvent, useEffect, useState } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { ErrorState } from '@/components/ui/feedback';
import { AuthLayout } from '@/components/auth/auth-layout';

type Step = 'checking' | 'auth';

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function check() {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStep('auth');
        return;
      }
      const response = await fetch('/api/auth/bootstrap');
      const body = response.ok ? await response.json() : null;
      if (body?.organization) {
        window.location.href = '/dashboard';
        return;
      }

      // A confirmed/signed-in account can bootstrap from its signup metadata.
      const bootstrap = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (bootstrap.ok) {
        window.location.href = '/dashboard';
        return;
      }
      setStep('auth');
    }
    check().catch(() => setStep('auth'));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const organizationName = String(form.get('organizationName') ?? '').trim();
    if (organizationName.length < 2) {
      setError('Organization name is required to create your account.');
      setLoading(false);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { organizationName },
        },
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      if (!data.user) {
        setError('Account creation did not return a user. Please try again.');
        return;
      }

      // This product currently runs without email-confirmation gating.
      // If the hosted Supabase project still requires confirmation, signup will
      // return a user without a session and the protected workspace bootstrap
      // cannot run until that Auth setting is disabled.
      if (!data.session) {
        setError('Account created, but email confirmation is still enabled in Supabase Auth. Disable email confirmations for this environment and register again.');
        return;
      }

      const bootstrap = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationName }),
      });
      if (!bootstrap.ok) {
        const body = await bootstrap.json().catch(() => null);
        setError(body?.error || 'Could not create your workspace.');
        return;
      }
      window.location.href = '/dashboard';
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'checking') {
    return (
      <AuthLayout
        eyebrow="Account"
        title="One workspace, ready in minutes."
        subtitle="Checking your session…"
        footer={<Link href="/" className="auth-link">← Back to home</Link>}
      >
        <div className="card auth-card-form"><span className="spinner" aria-hidden="true" /></div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Create your workspace"
      title="Start your agency command center."
      subtitle="Research, review and strategy for every client brand — all in one OS."
      footer={
        <div className="auth-footer-links">
          <Link href="/login">Already have an account? Sign in</Link>
          <Link href="/">Back to home</Link>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="card auth-card-form">
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" placeholder="you@agency.com" autoFocus />
        </label>
        <label>
          Password
          <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
        </label>
        <label>
          Agency name
          <input name="organizationName" required maxLength={120} placeholder="e.g. Northwind Agency" />
        </label>
        <button type="submit" disabled={loading} className="badge auth-submit">
          {loading ? <><LoaderCircle size={15} className="spin" /> Creating…</> : <>Create workspace <Sparkles size={15} /></>}
        </button>
        {error && <ErrorState message={error} />}
      </form>
    </AuthLayout>
  );
}
