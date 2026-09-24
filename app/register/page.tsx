'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, LoaderCircle, MailCheck, RefreshCw, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { getEmailConfirmationRedirectUrl } from '@/lib/auth/email-redirect';
import { ErrorState } from '@/components/ui/feedback';
import { AuthLayout } from '@/components/auth/auth-layout';

type Step = 'checking' | 'auth' | 'confirmation';

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
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [checkingConfirmation, setCheckingConfirmation] = useState(false);
  const [confirmationCheckingMessage, setConfirmationCheckingMessage] = useState(
    'Waiting for email confirmation on the device where you started signup…',
  );

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
        window.location.href = body.organization.onboardingCompleted ? '/dashboard' : '/onboarding';
        return;
      }

      const bootstrap = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (bootstrap.ok) {
        window.location.href = '/onboarding';
        return;
      }
      setStep('auth');
    }
    check().catch(() => setStep('auth'));
  }, []);

  function confirmationRedirectUrl() {
    return getEmailConfirmationRedirectUrl(
      window.location.origin,
      process.env.NEXT_PUBLIC_APP_URL,
    );
  }

  async function continueFromConfirmedEmail() {
    if (!confirmationEmail || !password || checkingConfirmation) return false;

    setCheckingConfirmation(true);
    setConfirmationCheckingMessage('Checking your email confirmation…');

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: confirmationEmail,
        password,
      });

      if (signInError) {
        const message = signInError.message.toLowerCase();

        if (message.includes('email not confirmed')) {
          setConfirmationCheckingMessage(
            'Your email is not confirmed yet. The moment it is confirmed, this device will continue automatically.',
          );
          return false;
        }

        if (message.includes('too many requests') || message.includes('rate limit')) {
          setConfirmationCheckingMessage(
            'Supabase is rate-limiting confirmation checks. We will retry automatically shortly.',
          );
          return false;
        }

        setConfirmationCheckingMessage(
          'Your email is confirmed, but this device could not complete sign-in yet. Please use Check now again.',
        );
        return false;
      }

      const accessToken = data.session?.access_token;
      const bootstrap = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(accessToken ? { authorization: 'Bearer ' + accessToken } : {}),
        },
        body: JSON.stringify({ organizationName: '' }),
        cache: 'no-store',
      });
      const payload = await bootstrap.json().catch(() => null);

      if (!bootstrap.ok) {
        setConfirmationCheckingMessage(
          payload?.error || 'Email confirmed, but workspace setup is still finishing. We will keep trying.',
        );
        return false;
      }

      window.location.href = payload?.organization?.onboardingCompleted ? '/dashboard' : '/onboarding';
      return true;
    } catch {
      setConfirmationCheckingMessage(
        'We could not check the confirmation yet. This device will retry automatically.',
      );
      return false;
    } finally {
      setCheckingConfirmation(false);
    }
  }

  useEffect(() => {
    if (step !== 'confirmation' || !confirmationEmail || !password) return;

    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      if (cancelled) return;
      const moved = await continueFromConfirmedEmail();
      if (!cancelled && !moved) {
        timer = window.setTimeout(poll, 15000);
      }
    };

    timer = window.setTimeout(poll, 5000);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [step, confirmationEmail, password]);

  async function resendConfirmation() {
    if (!confirmationEmail || resending) return;
    setResending(true);
    setError('');
    setResent(false);
    try {
      const supabase = createSupabaseBrowserClient({ flowType: 'pkce' });
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: confirmationEmail,
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
    if (/^\d+$/.test(password)) {
      setError('Password is too weak. Use a mix of letters, numbers and symbols.');
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
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { organizationName },
          emailRedirectTo: confirmationRedirectUrl(),
        },
      });

      if (signUpError) {
        const message = signUpError.message.toLowerCase();

        if (message.includes('rate limit') || message.includes('too many requests')) {
          setError('Registration is temporarily rate-limited by Supabase Auth. Please wait and try again.');
          return;
        }

        const alreadyExists =
          message.includes('already registered') ||
          message.includes('already been registered') ||
          message.includes('already exists') ||
          message.includes('user already exists');

        if (alreadyExists) {
          setError('An account already exists for this email. Sign in instead.');
          return;
        }

        setError(signUpError.message);
        return;
      } else if (!signUpData.session) {
        setConfirmationEmail(email);
        setConfirmationCheckingMessage(
          'Waiting for email confirmation on the device where you started signup…',
        );
        setStep('confirmation');
        return;
      }

      const bootstrapHeaders: Record<string, string> = { 'content-type': 'application/json' };
      const accessToken = signUpData.session?.access_token;
      if (accessToken) bootstrapHeaders.authorization = 'Bearer ' + accessToken;

      const bootstrap = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: bootstrapHeaders,
        body: JSON.stringify({ organizationName }),
        cache: 'no-store',
      });
      const bootstrapBody = await bootstrap.json().catch(() => null);
      if (!bootstrap.ok) {
        setError(
          bootstrapBody?.error ||
            'Your account was created, but workspace setup could not be completed. Please try registration again.',
        );
        return;
      }

      window.location.href = '/onboarding';
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

  if (step === 'confirmation') {
    return (
      <AuthLayout
        eyebrow="Confirm your email"
        title="Check your inbox."
        subtitle={`We sent a confirmation link to ${confirmationEmail}. Open it to finish creating your workspace.`}
        footer={
          <div className="auth-footer-links">
            <Link href="/login">Go to sign in</Link>
            <button
              type="button"
              className="auth-link"
              onClick={() => {
                setError('');
                setResent(false);
                setStep('auth');
              }}
            >
              <ArrowLeft size={14} /> Use a different email
            </button>
          </div>
        }
      >
        <div className="card auth-card-form" style={{ display: 'grid', gap: 14 }}>
          <div className="badge" style={{ justifyContent: 'flex-start' }}>
            <MailCheck size={15} /> Confirmation email sent
          </div>
          <p className="field-note" style={{ margin: 0 }}>
            Open the confirmation email on any device. This device stays connected to the signup flow and will continue automatically after the email is confirmed.
          </p>
          <div className="field-note" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <LoaderCircle size={14} className="spin" /> {confirmationCheckingMessage}
          </div>
          <button
            type="button"
            className="badge"
            disabled={checkingConfirmation}
            onClick={() => void continueFromConfirmedEmail()}
          >
            {checkingConfirmation ? <><LoaderCircle size={14} className="spin" /> Checking…</> : <>Check now</>}
          </button>
          <button
            type="button"
            className="badge auth-submit"
            disabled={resending}
            onClick={() => void resendConfirmation()}
          >
            {resending ? <><LoaderCircle size={15} className="spin" /> Sending…</> : <><RefreshCw size={15} /> Resend confirmation</>}
          </button>
          {resent ? (
            <div className="field-note" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <CheckCircle2 size={14} /> A fresh confirmation email was sent.
            </div>
          ) : null}
          {error && <ErrorState message={error} />}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Create your workspace"
      title="Build your marketing workspace."
      subtitle="Start with your workspace, set your brand rules, then let the workflow guide the rest."
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
          Workspace name
          <input name="organizationName" required minLength={2} maxLength={120} placeholder="e.g. Northstar Marketing" />
        </label>
        <button type="submit" disabled={loading} className="badge auth-submit">
          {loading ? <><LoaderCircle size={15} className="spin" /> Creating…</> : <>Create workspace <Sparkles size={15} /></>}
        </button>
        {error && <ErrorState message={error} />}
      </form>
    </AuthLayout>
  );
}
