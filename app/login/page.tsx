'use client';

import { FormEvent, useEffect, useState } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { ErrorState, LoadingState } from '@/components/ui/feedback';
import { AuthLayout } from '@/components/auth/auth-layout';

type Step = 'checking' | 'auth' | 'bootstrap';

type BootstrapOrg = { id: string; role: string; name: string | null } | null;

export default function LoginPage() {
  const [step, setStep] = useState<Step>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function checkSession() {
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setStep('auth');
      return;
    }
    const response = await fetch('/api/auth/bootstrap');
    if (!response.ok) {
      setError('Could not load your workspace.');
      setStep('auth');
      return;
    }
    const body = (await response.json()) as { organization: BootstrapOrg };
    if (body.organization) {
      window.location.href = '/';
      return;
    }
    setStep('bootstrap');
  }

  useEffect(() => {
    checkSession().catch(() => setStep('auth'));
  }, []);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const supabase = createSupabaseBrowserClient();

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(authError.message);
        return;
      }

      const response = await fetch('/api/auth/bootstrap');
      const body = response.ok ? await response.json() : null;
      if (body?.organization) {
        window.location.href = '/';
        return;
      }
      setStep('bootstrap');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleBootstrap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const organizationName = String(form.get('organizationName') ?? '');

    try {
      const response = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationName }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error || 'Could not create your workspace.');
        return;
      }
      window.location.href = '/';
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'checking') {
    return (
      <main className="main" style={{ maxWidth: 520, margin: '0 auto', paddingTop: 120 }}>
        <LoadingState label="Checking session…" />
      </main>
    );
  }

  if (step === 'bootstrap') {
    return (
      <AuthLayout
        eyebrow="Workspace"
        title="Name your agency workspace."
        subtitle="One workspace for every client brand, research run and AI workflow."
        footer={
          <Link href="/" className="auth-link">← Back to home</Link>
        }
      >
        <form onSubmit={handleBootstrap} className="card auth-card-form">
          <label>
            Organization name
            <input name="organizationName" required placeholder="e.g. Northwind Agency" maxLength={120} autoFocus />
          </label>
          <button type="submit" disabled={loading} className="badge auth-submit">
            {loading ? <><LoaderCircle size={15} className="spin" /> Creating…</> : <>Create workspace <Sparkles size={15} /></>}
          </button>
          {error && <ErrorState message={error} />}
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Command center"
      title="Your agency command center."
      subtitle="Sign in to manage multi-brand research, reviews and strategy."
      footer={
        <div className="auth-footer-links">
          <Link href="/register">Create an account</Link>
          <Link href="/forgot-password">Forgot password?</Link>
          <Link href="/">Back to home</Link>
        </div>
      }
    >
      <form onSubmit={handleAuth} className="card auth-card-form">
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" placeholder="you@agency.com" />
        </label>
        <label>
          Password
          <input name="password" type="password" required autoComplete="current-password" placeholder="••••••••" />
        </label>
        <button type="submit" disabled={loading} className="badge auth-submit">
          {loading ? <><LoaderCircle size={15} className="spin" /> Working…</> : <>Sign in <Sparkles size={15} /></>}
        </button>
        {error && <ErrorState message={error} />}
      </form>
    </AuthLayout>
  );
}