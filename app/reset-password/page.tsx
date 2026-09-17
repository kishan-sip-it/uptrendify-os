'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { ErrorState, LoadingState } from '@/components/ui/feedback';
import { AuthLayout } from '@/components/auth/auth-layout';

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<'checking' | 'ready' | 'unchanged'>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function check() {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/forgot-password';
        return;
      }
      setStatus(user.is_anonymous ? 'unchanged' : 'ready');
    }
    check().catch(() => window.location.assign('/login'));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    if (password !== confirm) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setDone(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (status === 'checking') {
    return (
      <AuthLayout eyebrow="Reset password" title="Reset your password." subtitle="" footer={null}>
        <LoadingState label="Checking recovery session…" />
      </AuthLayout>
    );
  }

  if (status === 'unchanged') {
    return (
      <AuthLayout
        eyebrow="Reset password"
        title="Request a fresh link."
        subtitle="Your reset link has expired. Start the recovery again to receive a new one."
        footer={<Link href="/forgot-password" className="auth-link">← Back to recovery</Link>}
      >
        <div className="card auth-card-form">
          <ErrorState message="This session doesn't support password recovery." />
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout
        eyebrow="Password updated"
        title="Your password is set."
        subtitle="Sign in with your new password to continue."
        footer={<Link href="/login" className="auth-link">← Back to sign in</Link>}
      >
        <div className="card auth-card-form">
          <div className="auth-success-card">
            <span className="auth-success-icon"><CheckCircle2 size={22} /></span>
            <Link href="/login" className="badge" style={{ justifyContent: 'center', textDecoration: 'none' }}>Go to sign in</Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Recovery"
      title="Choose a new password."
      subtitle="Make it strong — this is the key to every client workspace."
      footer={<Link href="/forgot-password" className="auth-link">← Back to recovery</Link>}
    >
      <form onSubmit={handleSubmit} className="card auth-card-form">
        <label>
          New password
          <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" autoFocus />
        </label>
        <label>
          Confirm password
          <input name="confirm" type="password" required minLength={8} autoComplete="new-password" placeholder="Repeat the new password" />
        </label>
        <button type="submit" disabled={loading} className="badge auth-submit">
          {loading ? <><LoaderCircle size={15} className="spin" /> Updating…</> : <>Update password</>}
        </button>
        {error && <ErrorState message={error} />}
      </form>
    </AuthLayout>
  );
}