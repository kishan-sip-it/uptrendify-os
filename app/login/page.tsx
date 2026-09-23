'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { ErrorState, LoadingState } from '@/components/ui/feedback';
import { AuthLayout } from '@/components/auth/auth-layout';

type Step = 'checking' | 'auth';

export default function LoginPage() {
  const [step, setStep] = useState<'checking' | 'auth'>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function resolveWorkspace() {
    const response = await fetch('/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'We could not load your workspace. Please try again.');
    }
    window.location.href = payload?.organization?.onboardingCompleted ? '/dashboard' : '/onboarding';
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
        const message = authError.message.toLowerCase();
        if (message.includes('invalid login credentials') || message.includes('invalid credentials')) {
          setError('We could not sign you in with those details. Check your email and password, or create an account.');
        } else if (message.includes('email not confirmed')) {
          setError('Your email address still needs to be confirmed before you can sign in.');
        } else if (message.includes('too many requests') || message.includes('rate limit')) {
          setError('Too many sign-in attempts. Please wait a moment and try again.');
        } else {
          setError('We could not sign you in right now. Please check your details and try again.');
        }
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
        {error && <ErrorState message={error} />}
      </form>
    </AuthLayout>
  );
}