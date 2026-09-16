'use client';

import { FormEvent, useEffect, useState } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { ErrorState, LoadingState } from '@/components/ui/feedback';

type Step = 'checking' | 'auth' | 'bootstrap';

type BootstrapOrg = { id: string; role: string; name: string | null } | null;

export default function LoginPage() {
  const [step, setStep] = useState<Step>('checking');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
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
      const { error: authError } = mode === 'signup'
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(authError.message);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError(mode === 'signup'
          ? 'Account created. Check your inbox to confirm your email before signing in.'
          : 'Could not verify your session.');
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

  return (
    <main className="main" style={{ maxWidth: 520, margin: '0 auto', paddingTop: 80 }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div className="brand-mark" style={{ justifyContent: 'center', padding: 0 }}><span className="logo" /> UpTrendifyOS</div>
        <h1 style={{ fontSize: 30 }}>
          {step === 'bootstrap' ? 'Name your agency workspace.' : 'Your agency command center.'}
        </h1>
        <p className="subtitle" style={{ margin: '0 auto' }}>
          {step === 'bootstrap'
            ? 'One workspace for every client brand, research run and AI workflow.'
            : 'Sign in or create an account to manage multi-brand growth operations.'}
        </p>
      </div>

      {step === 'bootstrap' ? (
        <form onSubmit={handleBootstrap} className="card" style={{ display: 'grid', gap: 16 }}>
          <label>Organization name<input name="organizationName" required placeholder="Acme Agency" maxLength={120} style={{ width: '100%' }} /></label>
          <button disabled={loading} className="badge" style={{ border: 0, justifyContent: 'center', padding: 14, cursor: 'pointer' }}>
            {loading ? <><LoaderCircle size={15} className="spin" /> Creating…</> : <>Create workspace <Sparkles size={15} /></>}
          </button>
          {error && <ErrorState message={error} />}
        </form>
      ) : (
        <form onSubmit={handleAuth} className="card" style={{ display: 'grid', gap: 16 }}>
          <label>Email<input name="email" type="email" required autoComplete="email" style={{ width: '100%' }} /></label>
          <label>Password<input name="password" type="password" required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} style={{ width: '100%' }} /></label>
          <button disabled={loading} className="badge" style={{ border: 0, justifyContent: 'center', padding: 14, cursor: 'pointer' }}>
            {loading ? <><LoaderCircle size={15} className="spin" /> Working…</> : <>{mode === 'signup' ? 'Create account' : 'Sign in'} <Sparkles size={15} /></>}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); }}
            className="metric-label"
            style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 4 }}
          >
            {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
          {error && <ErrorState message={error} />}
        </form>
      )}
    </main>
  );
}