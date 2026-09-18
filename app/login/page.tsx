'use client';

import { FormEvent, useEffect, useState } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { ErrorState, LoadingState } from '@/components/ui/feedback';
import { AuthLayout } from '@/components/auth/auth-layout';

type Step = 'checking' | 'auth';

const PENDING_WORKSPACE_KEY = 'uptrendify_pending_workspace';

type PendingWorkspace = { email: string; organizationName: string };

export default function LoginPage() {
  const [step, setStep] = useState<Step>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function finishWorkspaceSetup() {
    const pendingRaw = window.localStorage.getItem(PENDING_WORKSPACE_KEY);
    let pendingName = '';
    if (pendingRaw) {
      try {
        const pending = JSON.parse(pendingRaw) as PendingWorkspace;
        pendingName = pending.organizationName || '';
      } catch {
        window.localStorage.removeItem(PENDING_WORKSPACE_KEY);
      }
    }

    const response = await fetch('/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: pendingName ? JSON.stringify({ organizationName: pendingName }) : JSON.stringify({}),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || 'Your account is registered, but the workspace could not be loaded.');
    }

    window.localStorage.removeItem(PENDING_WORKSPACE_KEY);
    window.location.href = '/';
  }

  async function checkSession() {
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setStep('auth');
      return;
    }

    const response = await fetch('/api/auth/bootstrap');
    if (!response.ok) {
      throw new Error('Could not load your workspace.');
    }

    const body = await response.json();
    if (body?.organization) {
      window.location.href = '/';
      return;
    }

    await finishWorkspaceSetup();
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

      const response = await fetch('/api/auth/bootstrap');
      if (!response.ok) {
        setError('Could not load your workspace. Please try signing in again.');
        return;
      }

      const body = await response.json();
      if (body?.organization) {
        window.localStorage.removeItem(PENDING_WORKSPACE_KEY);
        window.location.href = '/';
        return;
      }

      // Never ask an already-registered user to type the organization again.
      // The server recovers the organization name from signup metadata; the
      // local pending value is only a backward-compatible fallback.
      await finishWorkspaceSetup();
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