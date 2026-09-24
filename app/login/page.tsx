'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, LoaderCircle, MailCheck, RefreshCw, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { getEmailConfirmationRedirectUrl } from '@/lib/auth/email-redirect';
import { ErrorState, LoadingState } from '@/components/ui/feedback';
import { AuthLayout } from '@/components/auth/auth-layout';

type Step = 'checking' | 'auth';

export default function LoginPage() {
  const [step, setStep] = useState<'checking' | 'auth'>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [confirmationNotice, setConfirmationNotice] = useState('');

  async function resolveWorkspace(accessToken?: string) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (accessToken) headers.authorization = 'Bearer ' + accessToken;

    let lastPayload: { error?: string } | null = null;
    let lastStatus = 0;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers,
        body: '{}',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      lastPayload = payload;
      lastStatus = response.status;

      if (response.ok) {
        window.location.href = payload?.organization?.onboardingCompleted ? '/dashboard' : '/onboarding';
        return;
      }

      if (attempt === 0 && (response.status === 401 || response.status === 503)) {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        continue;
      }

      break;
    }

    if (lastStatus === 401) {
      throw new Error('Your session could not be established. Please sign in again.');
    }
    throw new Error(lastPayload?.error || 'We could not load your workspace. Please try again.');
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
    const params = new URLSearchParams(window.location.search);
    const confirmation = params.get('confirmation');
    if (confirmation === 'confirmed') setConfirmationNotice('Your email is confirmed. You can sign in now.');
    if (confirmation === 'failed') setError('This confirmation link is invalid or expired. Request a new confirmation email and try again.');
    checkSession().catch(() => setStep('auth'));
  }, []);

  function confirmationRedirectUrl() {
    return new URL('/auth/confirm', window.location.origin).toString();
  }

  async function resendConfirmation() {
    const target = email.trim();
    if (!target || resending) return;
    setResending(true);
    setError('');
    setConfirmationNotice('');
    setResent(false);
    try {
      const supabase = createSupabaseBrowserClient({ flowType: 'pkce' });
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: target,
        options: { emailRedirectTo: confirmationRedirectUrl() },
      });

      if (resendError) {
        setError(resendError.message || 'We could not resend the confirmation email. Please try again.');
        return;
      }

      setResent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not resend the confirmation email.');
    } finally {
      setResending(false);
    }
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    setEmail(email);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        const message = authError.message.toLowerCase();
        if (message.includes('invalid login credentials') || message.includes('invalid credentials')) {
          setError('We could not sign you in with those details. Check your email and password, or create an account.');
        } else if (message.includes('email not confirmed')) {
          setError('This email has not been confirmed yet. We can send the confirmation email again.');
        } else if (message.includes('too many requests') || message.includes('rate limit')) {
          setError('Too many sign-in attempts. Please wait a moment and try again.');
        } else {
          setError('We could not sign you in right now. Please check your details and try again.');
        }
        return;
      }
      await resolveWorkspace(signInData.session?.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'checking') {
    return (
      <AuthLayout
        eyebrow="Command center"
        title="Preparing your workspace."
        subtitle="Checking your session…"
        footer={null}
      >
        <div className="card auth-card-form">
          <LoadingState label="Checking session…" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Command center"
      title="Welcome back."
      subtitle="Pick up where you left off — your workspace keeps the next step visible."
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
          <input name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
        </label>
        <label>
          Password
          <span style={{ position: 'relative', display: 'block' }}>
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              style={{ width: '100%', paddingRight: 44 }}
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((value) => !value)}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                border: 0,
                background: 'transparent',
                color: 'var(--muted)',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                padding: 4,
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </label>
        <button type="submit" disabled={loading} className="badge auth-submit">
          {loading ? <><LoaderCircle size={15} className="spin" /> Working…</> : <>Sign in <Sparkles size={15} /></>}
        </button>
        {confirmationNotice ? (
          <div className="field-note" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <CheckCircle2 size={14} /> {confirmationNotice}
          </div>
        ) : null}
        {error && <ErrorState message={error} />}
        {error.toLowerCase().includes('not been confirmed') ? (
          <button
            type="button"
            className="badge"
            disabled={resending || !email}
            onClick={() => void resendConfirmation()}
          >
            {resending ? <><LoaderCircle size={14} className="spin" /> Sending…</> : <><RefreshCw size={14} /> Resend confirmation email</>}
          </button>
        ) : null}
        {resent ? (
          <div className="field-note" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <MailCheck size={14} /> A fresh confirmation email was sent.
          </div>
        ) : null}
      </form>
    </AuthLayout>
  );
}