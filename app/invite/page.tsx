'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, LoaderCircle, Mail, Users } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { ErrorState, LoadingState } from '@/components/ui/feedback';
import { AuthLayout } from '@/components/auth/auth-layout';

type InvitePreview = {
  invitedEmail: string;
  role: string;
  organizationName: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
};

function tokenFromUrl(): string {
  if (typeof window === 'undefined') return '';
  return new URL(window.location.href).searchParams.get('token') ?? '';
}

export default function InvitePage() {
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    setToken(tokenFromUrl() || null);
  }, []);

  useEffect(() => {
    const loadedToken = tokenFromUrl();
    if (!loadedToken) return;

    (async () => {
      try {
        const [previewResponse, userResponse] = await Promise.all([
          fetch(`/api/invitations/accept?token=${encodeURIComponent(loadedToken)}`),
          createSupabaseBrowserClient().auth.getUser(),
        ]);
        const body = await previewResponse.json().catch(() => null);
        if (!previewResponse.ok) {
          setError(body?.error || 'This invitation could not be found.');
          return;
        }
        setPreview(body.invitation as InvitePreview);
        setSignedIn(Boolean(userResponse.data.user));
      } catch {
        setError('Something went wrong while loading the invitation.');
      }
    })().catch(() => undefined);
  }, []);

  async function acceptInvitation() {
    if (!token) return;
    setAccepting(true);
    setError('');
    try {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error || 'Could not accept the invitation.');
        return;
      }
      window.location.href = '/dashboard';
    } catch {
      setError('Could not accept the invitation.');
    } finally {
      setAccepting(false);
    }
  }

  if (token === null) {
    return (
      <AuthLayout
        eyebrow="Invitation"
        title="Check your invitation link."
        subtitle="Open the exact link you were sent to accept your team invitation."
        footer={<Link href="/">Back to home</Link>}
      >
        <div className="card auth-card-form"><span className="unstyled">Missing invite link</span></div>
      </AuthLayout>
    );
  }

  if (!preview && !error) {
    return (
      <AuthLayout
        eyebrow="Invitation"
        title="Checking your invitation…"
        subtitle="Loading the details of your team invitation."
        footer={<Link href="/">Back to home</Link>}
      >
        <LoadingState label="Checking invitation…" />
      </AuthLayout>
    );
  }

  if (error) {
    return (
      <AuthLayout
        eyebrow="Invitation"
        title="Invitation unavailable."
        subtitle="This invitation link could not be used."
        footer={<Link href="/">Back to home</Link>}
      >
        <ErrorState message={error} />
      </AuthLayout>
    );
  }

  if (!preview) return null;
  const final = preview.status;

  return (
    <AuthLayout
      eyebrow="Team invitation"
      title={final === 'ACCEPTED' ? 'Already accepted.' : 'You were invited to a team.'}
      subtitle={
        final === 'ACCEPTED'
          ? 'This invitation has already been accepted for this email address.'
          : 'Review the invitation below and accept to join the workspace.'
      }
      footer={
        <div className="auth-footer-links">
          <Link href="/login?next=/login">Sign in</Link>
          <Link href="/">Back to home</Link>
        </div>
      }
    >
      <div className="card auth-card-form" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="org-avatar">{preview.organizationName.slice(0, 1).toUpperCase()}</span>
          <div>
            <div className="org-name">{preview.organizationName}</div>
            <div className="org-role">workspace</div>
          </div>
        </div>
        <div className="activity-meta" style={{ marginTop: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Mail size={13} /> {preview.invitedEmail}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Users size={13} /> as {preview.role.toLowerCase()}</span>
        </div>
        <span className={`badge tone-${final === 'PENDING' ? 'info' : final === 'ACCEPTED' ? 'good' : final === 'EXPIRED' ? 'warn' : 'muted'}`} style={{ marginTop: 12 }}>
          {final}
        </span>
      </div>

      {final === 'PENDING' ? (
        signedIn ? (
          <button type="button" className="badge auth-submit" onClick={acceptInvitation} disabled={accepting}>
            {accepting ? <LoaderCircle size={15} className="spin" /> : <CheckCircle2 size={15} />} Accept invitation
          </button>
        ) : (
          <>
            <Link className="badge auth-submit" href={`/login?next=${encodeURIComponent(`/invite?token=${token}`)}`} style={{ textDecoration: 'none' }}>
              Sign in & accept
            </Link>
            <div className="auth-footer-links" style={{ marginTop: 12 }}>
              <Link href={`/register?invite=${encodeURIComponent(token)}`}>Create an account & accept</Link>
            </div>
          </>
        )
      ) : null}
    </AuthLayout>
  );
}