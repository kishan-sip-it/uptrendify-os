'use client';

import { FormEvent, useEffect, useState } from 'react';
import { LoaderCircle, MailCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { ErrorState } from '@/components/ui/feedback';
import { AuthLayout } from '@/components/auth/auth-layout';

type Step = 'checking' | 'auth' | 'confirm';

const PENDING_WORKSPACE_KEY = 'uptrendify_pending_workspace';

type PendingWorkspace = { email: string; organizationName: string };

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
        window.location.href = '/';
        return;
      }

      // If the account is signed in but the workspace is not yet created,
      // restore the agency name captured before email confirmation.
      const pendingRaw = window.localStorage.getItem(PENDING_WORKSPACE_KEY);
      if (pendingRaw) {
        try {
          const pending = JSON.parse(pendingRaw) as PendingWorkspace;
          if (pending.email === (user.email ?? '').trim().toLowerCase() && pending.organizationName) {
            const bootstrap = await fetch('/api/auth/bootstrap', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ organizationName: pending.organizationName }),
            });
            if (bootstrap.ok) {
              window.localStorage.removeItem(PENDING_WORKSPACE_KEY);
              window.location.href = '/';
              return;
            }
          }
        } catch {
          window.localStorage.removeItem(PENDING_WORKSPACE_KEY);
        }
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
    const redirectTo = `${window.location.origin}/register?confirmed=1`;

    const supabase = createSupabaseBrowserClient();
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      if (!data.user) {
        setError('Account creation did not return a user. Please try again.');
        return;
      }

      // Supabase can create the user without an active session when email
      // confirmation is required. In that case, calling the protected
      // bootstrap endpoint immediately produces "Authentication required".
      // Save the workspace name and wait until the user confirms/signs in.
      if (!data.session) {
        const pending: PendingWorkspace = { email: email.toLowerCase(), organizationName };
        window.localStorage.setItem(PENDING_WORKSPACE_KEY, JSON.stringify(pending));
        setStep('confirm');
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
      window.location.href = '/';
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

  if (step === 'confirm') {
    return (
      <AuthLayout
        eyebrow="Confirm your email"
        title="Check your inbox."
        subtitle="We sent you a confirmation link. Click it to activate your account, then sign in to create your workspace."
        footer={
          <div className="auth-footer-links">
            <Link href="/login">Got it — sign in</Link>
            <Link href="/">Back to home</Link>
          </div>
        }
      >
        <div className="card auth-card-form auth-success-card">
          <span className="auth-success-icon"><MailCheck size={22} /></span>
          <p>After confirming your email, sign in once. We’ll finish creating the workspace using the agency name you entered.</p>
          <Link href="/login" className="badge" style={{ justifyContent: 'center', textDecoration: 'none' }}>Go to sign in</Link>
        </div>
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