'use client';

import { FormEvent, useEffect, useState } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { ErrorState, LoadingState } from '@/components/ui/feedback';
import { AuthLayout } from '@/components/auth/auth-layout';

type Step = 'checking' | 'auth';

export default function LoginPage() {
  const [step, setStep] = useState<'checking' | 'auth'>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function resolveWorkspace() {
    const response = await fetch('/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Your account is valid, but the workspace could not be loaded.');
    }
    window.location.href = '/';
  }

  async function checkSession() {
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setStep('auth');
      return;
    }
    await resolveWorkspace();
  }

  useEffect(() => {
    checkSession().catch(() => setStep('auth'));
  }, []);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const supabase = createSupabaseBrowserClient();

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        return;
      }
      await resolveWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
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