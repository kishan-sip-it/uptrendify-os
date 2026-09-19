'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { ErrorState } from '@/components/ui/feedback';
import { AuthLayout } from '@/components/auth/auth-layout';

type Step = 'checking' | 'auth';

function PasswordField({
  name,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  placeholder,
  label,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: string;
  placeholder: string;
  label: string;
}) {
  return (
    <label>
      {label}
      <span style={{ position: 'relative', display: 'block' }}>
        <input
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={visible ? 'text' : 'password'}
          required
          minLength={8}
          maxLength={72}
          autoComplete={autoComplete}
          placeholder={placeholder}
          style={{ width: '100%', paddingRight: 44 }}
        />
        <button
          type="button"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          onClick={onToggle}
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
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
    </label>
  );
}

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const organizationName = String(form.get('organizationName') ?? '').trim();

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password.length > 72) {
      setError('Password must be 72 characters or fewer.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (organizationName.length < 2) {
      setError('Organization name is required to create your account.');
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, organizationName }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setError(body?.error || 'Could not create your account.');
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        return;
      }

      const bootstrap = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationName }),
      });
      const bootstrapBody = await bootstrap.json().catch(() => null);
      if (!bootstrap.ok) {
        setError(bootstrapBody?.error || 'Could not create your workspace.');
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
        <PasswordField
          name="password"
          label="Password"
          value={password}
          onChange={setPassword}
          visible={showPassword}
          onToggle={() => setShowPassword((value) => !value)}
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
        <PasswordField
          name="confirmPassword"
          label="Confirm password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          visible={showConfirmPassword}
          onToggle={() => setShowConfirmPassword((value) => !value)}
          autoComplete="new-password"
          placeholder="Re-enter your password"
        />
        <label>
          Agency name
          <input name="organizationName" required minLength={2} maxLength={120} placeholder="e.g. Northwind Agency" />
        </label>
        <button type="submit" disabled={loading} className="badge auth-submit">
          {loading ? <><LoaderCircle size={15} className="spin" /> Creating…</> : <>Create workspace <Sparkles size={15} /></>}
        </button>
        {error && <ErrorState message={error} />}
      </form>
    </AuthLayout>
  );
}
