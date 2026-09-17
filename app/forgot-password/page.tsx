'use client';

import { FormEvent, useState } from 'react';
import { LoaderCircle, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { ErrorState } from '@/components/ui/feedback';
import { AuthLayout } from '@/components/auth/auth-layout';

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const supabase = createSupabaseBrowserClient();
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout
        eyebrow="Reset password"
        title="Almost there."
        subtitle="If that email belongs to a workspace, we sent a password reset link. It expires shortly."
        footer={<Link href="/login" className="auth-link">← Back to sign in</Link>}
      >
        <div className="card auth-card-form auth-success-card">
          <span className="auth-success-icon"><MailCheck size={22} /></span>
          <p>Check your inbox to continue.</p>
          <Link href="/login" className="badge" style={{ justifyContent: 'center', textDecoration: 'none' }}>Back to sign in</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Recovery"
      title="Reset your password."
      subtitle="Enter the email linked to your workspace and we'll send you a reset link."
      footer={
        <div className="auth-footer-links">
          <Link href="/login">Back to sign in</Link>
          <Link href="/register">Create an account</Link>
          <Link href="/">Home</Link>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="card auth-card-form">
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" placeholder="you@agency.com" autoFocus />
        </label>
        <button type="submit" disabled={loading} className="badge auth-submit">
          {loading ? <><LoaderCircle size={15} className="spin" /> Sending…</> : <>Send reset link</>}
        </button>
        {error && <ErrorState message={error} />}
      </form>
    </AuthLayout>
  );
}