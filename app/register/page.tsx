'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, Sparkles, Users } from 'lucide-react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { ErrorState } from '@/components/ui/feedback';
import { AuthLayout } from '@/components/auth/auth-layout';

type Step = 'checking' | 'invite' | 'auth';

type InvitePreview = {
  invitedEmail: string;
  role: string;
  organizationName: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
};

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

function inviteTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const token = new URL(window.location.href).searchParams.get('invite');
  return token && /^[a-f0-9]{24,}$/i.test(token) ? token : null;
}

function pendingInvitationMessage(body: { code?: string; error?: string } | null, pendingCode: string): string | null {
  if (body?.code === pendingCode) {
    return 'You have a pending team invitation. Open your invitation link to join your team.';
  }
  if (body?.error?.includes('INVITATION_PENDING_ACCEPTANCE')) {
    return 'You have a pending team invitation. Open your invitation link to join your team.';
  }
  return null;
}

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  useEffect(() => {
    const token = inviteTokenFromUrl();
    if (!token) {
      (async () => {
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
        const bootstrapBody = await bootstrap.json().catch(() => null);
        if (bootstrap.ok) {
          window.location.href = '/dashboard';
          return;
        }
        const pendingMessage = pendingInvitationMessage(bootstrapBody, 'INVITATION_PENDING_ACCEPTANCE');
        if (pendingMessage) setError(pendingMessage);
        setStep('auth');
      })().catch(() => setStep('auth'));
      return;
    }
    setInviteToken(token);

    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();

      const previewResponse = await fetch(`/api/invitations/accept?token=${encodeURIComponent(token)}`);
      const previewBody = await previewResponse.json().catch(() => null);
      if (!previewResponse.ok) {
        setError(previewBody?.error || 'This invitation could not be found.');
        setStep('auth');
        return;
      }
      setInvite(previewBody.invitation as InvitePreview);

      if (user) {
        const acceptResponse = await fetch('/api/invitations/accept', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const acceptBody = await acceptResponse.json().catch(() => null);
        if (!acceptResponse.ok) {
          setError(acceptBody?.error || 'Could not accept the invitation.');
          setStep('auth');
          return;
        }
        window.location.href = '/dashboard';
        return;
      }

      setStep('invite');
    })().catch(() => {
      setError('Something went wrong while loading the invitation.');
      setStep('auth');
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const organizationName = inviteToken ? '' : String(form.get('organizationName') ?? '').trim();

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
    if (!inviteToken && organizationName.length < 2) {
      setError('Agency or workspace name is required to create your account.');
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: inviteToken
          ? { data: { inviteToken } }
          : { data: { organizationName } },
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

        if (!alreadyExists) {
          setError(signUpError.message);
          return;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError('An account with this email already exists. Sign in instead.');
          return;
        }
      } else if (!signUpData.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError(signInError.message);
          return;
        }
      }

      if (inviteToken) {
        const acceptResponse = await fetch('/api/invitations/accept', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: inviteToken }),
        });
        const acceptBody = await acceptResponse.json().catch(() => null);
        const pendingMessage = pendingInvitationMessage(acceptBody, 'INVITATION_PENDING_ACCEPTANCE');
        if (!acceptResponse.ok) {
          setError(acceptBody?.error || pendingMessage || 'Could not accept the invitation.');
          return;
        }
        window.location.href = '/dashboard';
        return;
      }

      const bootstrap = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationName }),
      });
      const bootstrapBody = await bootstrap.json().catch(() => null);
      if (!bootstrap.ok) {
        setError(
          pendingInvitationMessage(bootstrapBody, 'INVITATION_PENDING_ACCEPTANCE') ||
            bootstrapBody?.error ||
            'Your account was created, but workspace setup could not be completed. Please try registration again.',
        );
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

  if (step === 'invite' && invite) {
    return (
      <AuthLayout
        eyebrow="Team invitation"
        title={`Join ${invite.organizationName}.`}
        subtitle={`You were invited as a ${invite.role.toLowerCase()} member. Create an account to accept.`}
        footer={
          <div className="auth-footer-links">
            <Link href="/login">Already have an account? Sign in</Link>
            <Link href="/">Back to home</Link>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="card auth-card-form">
          <div className="activity-meta" style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 11, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="org-avatar">{invite.organizationName.slice(0, 1).toUpperCase()}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invite.organizationName}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Users size={12} /> {invite.invitedEmail} · {invite.role.toLowerCase()}
              </div>
            </div>
          </div>
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" readOnly value={invite.invitedEmail} onChange={() => undefined} />
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
          <button type="submit" disabled={loading} className="badge auth-submit">
            {loading ? <><LoaderCircle size={15} className="spin" /> Accepting…</> : <>Accept invitation <Sparkles size={15} /></>}
          </button>
          {error && <ErrorState message={error} />}
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Create your workspace"
      title="Start your agency command center."
      subtitle="Research, review and strategy for every client brand — all in one OS. Brand workspaces are added after signup."
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
          Agency / Workspace name
          <input name="organizationName" required minLength={2} maxLength={120} placeholder="e.g. Aurora Labs" />
        </label>
        <button type="submit" disabled={loading} className="badge auth-submit">
          {loading ? <><LoaderCircle size={15} className="spin" /> Creating…</> : <>Create workspace <Sparkles size={15} /></>}
        </button>
        {error && <ErrorState message={error} />}
      </form>
    </AuthLayout>
  );
}