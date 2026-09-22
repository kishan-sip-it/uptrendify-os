'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Check, Copy, LoaderCircle, Plus, UserPlus, Users, X } from 'lucide-react';
import { ErrorState, LoadingState } from '@/components/ui/feedback';

type TeamMember = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  joined_at: string;
};

type TeamInvitation = {
  id: string;
  invited_email: string;
  role: string;
  invited_by: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type TeamPermissions = {
  canInviteMembers: boolean;
  canUpdateMemberRole: boolean;
  canRemoveMember: boolean;
  inviteRoles: string[];
  assignableRoles: string[];
  myRole: string;
  myUserId: string;
};

type TeamPayload = {
  members: TeamMember[];
  invitations: TeamInvitation[];
  permissions: TeamPermissions;
};

function memberName(member: TeamMember): string {
  const name = [member.first_name, member.last_name].filter(Boolean).join(' ') || member.email || 'Member';
  return name;
}

function invitationStatus(invitation: TeamInvitation): 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED' {
  if (invitation.accepted_at) return 'ACCEPTED';
  if (invitation.revoked_at) return 'REVOKED';
  if (invitation.expires_at && new Date(invitation.expires_at).getTime() <= Date.now()) return 'EXPIRED';
  return 'PENDING';
}

function statusTone(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'tone-info';
    case 'ACCEPTED':
      return 'tone-good';
    case 'REVOKED':
      return 'tone-muted';
    case 'EXPIRED':
      return 'tone-warn';
    default:
      return 'tone-muted';
  }
}

function formatJoined(value: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
  } catch {
    return value;
  }
}

export function TeamSettings() {
  const [payload, setPayload] = useState<TeamPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('EDITOR');
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/team', { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not load the team');
      setPayload(body as TeamPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the team');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payload?.permissions.canInviteMembers) return;
    setInviting(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/team/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not create the invitation');
      setInviteEmail('');
      setMessage(`Invitation sent to ${body.invitation.invited_email}. Share the invite link below.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the invitation');
    } finally {
      setInviting(false);
    }
  }

  async function copyInviteLink(invitationId: string) {
    setError('');
    try {
      const response = await fetch(`/api/team/invitations/${invitationId}`, { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not load the invite link');
      const url = `${window.location.origin}/invite?token=${body.token}`;
      await navigator.clipboard.writeText(url);
      setCopiedToken(invitationId);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not copy the invite link');
    }
  }

  async function revokeInvitation(invitationId: string) {
    setError('');
    try {
      const response = await fetch(`/api/team/invitations/${invitationId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'revoke' }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not revoke the invitation');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke the invitation');
    }
  }

  async function changeRole(userId: string, role: string) {
    setError('');
    try {
      const response = await fetch(`/api/team/members/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not update the member role');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the member role');
    }
  }

  async function removeMember(userId: string) {
    setError('');
    try {
      const response = await fetch(`/api/team/members/${userId}`, { method: 'DELETE' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not remove the member');
      setConfirmRemove(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the member');
    }
  }

  if (loading) return <LoadingState label="Loading team…" />;
  if (!payload) return error ? <ErrorState message={error} /> : <LoadingState label="Loading team…" />;

  const { members, invitations, permissions } = payload;
  const pendingInvitations = invitations.filter((invitation) => invitationStatus(invitation) === 'PENDING');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {error ? <ErrorState message={error} /> : null}
      {message ? <div role="status" className="card" style={{ borderColor: 'rgba(110,231,199,.3)', background: 'rgba(110,231,199,.06)' }}>{message}</div> : null}

      <div className="card">
        <div className="section-title">
          <div>
            <div className="eyebrow">Members</div>
            <h2 style={{ margin: '5px 0' }}>{members.length} {members.length === 1 ? 'member' : 'members'}</h2>
          </div>
          <Users size={18} style={{ color: 'var(--muted)' }} />
        </div>

        {members.length === 0 ? (
          <p className="subtitle">No members yet.</p>
        ) : (
          <div>
            {members.map((member) => {
              const isSelf = member.user_id === permissions.myUserId;
              const canEditThisMember =
                permissions.canUpdateMemberRole &&
                !isSelf &&
                (permissions.myRole === 'OWNER' || member.role !== 'OWNER');
              const canRemoveThisMember =
                permissions.canRemoveMember &&
                !isSelf &&
                (permissions.myRole === 'OWNER' || member.role !== 'OWNER');
              return (
                <div
                  key={member.user_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    padding: '12px 0',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <span className="user-avatar" style={{ flexShrink: 0 }}>
                    {memberName(member).slice(0, 2).toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600 }}>
                      {memberName(member)}
                      {isSelf ? <span className="chip chip-quiet" style={{ marginLeft: 8 }}>You</span> : null}
                    </div>
                    <div className="activity-meta">
                      <span>{member.email ?? '—'}</span>
                      <span>joined {formatJoined(member.joined_at)}</span>
                    </div>
                  </div>
                  {canEditThisMember ? (
                    <select
                      className="content-filter-select"
                      value={member.role}
                      aria-label={`Change role for ${memberName(member)}`}
                      onChange={(event) => changeRole(member.user_id, event.target.value)}
                    >
                      {permissions.assignableRoles.map((role) => (
                        <option key={role} value={role}>{role.toLowerCase()}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="chip">{member.role.toLowerCase()}</span>
                  )}
                  {canRemoveThisMember ? (
                    confirmRemove === member.user_id ? (
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="badge"
                          style={{ borderColor: 'rgba(239,68,68,.4)', color: '#f87171' }}
                          onClick={() => removeMember(member.user_id)}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="badge"
                          onClick={() => setConfirmRemove(null)}
                          aria-label="Cancel removal"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="badge"
                        title={`Remove ${memberName(member)}`}
                        aria-label={`Remove ${memberName(member)}`}
                        onClick={() => setConfirmRemove(member.user_id)}
                      >
                        <X size={13} /> Remove
                      </button>
                    )
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {permissions.canInviteMembers ? (
        <>
          <div className="card">
            <div className="section-title">
              <div>
                <div className="eyebrow">Invite</div>
                <h2 style={{ margin: '5px 0' }}>Add a team member</h2>
              </div>
              <UserPlus size={18} style={{ color: 'var(--muted)' }} />
            </div>
            <form
              onSubmit={handleInvite}
              style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}
            >
              <input
                type="email"
                required
                placeholder="teammate@agency.com"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                className="content-filter-select"
                style={{ flex: 1, minWidth: 240 }}
                aria-label="Email to invite"
              />
              <select
                className="content-filter-select"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value)}
                aria-label="Invited role"
              >
                {permissions.inviteRoles.map((role) => (
                  <option key={role} value={role}>{role.toLowerCase()}</option>
                ))}
              </select>
              <button type="submit" className="badge" disabled={inviting || inviteEmail.length === 0}>
                {inviting ? <LoaderCircle size={14} className="spin" /> : <Plus size={14} />} Invite
              </button>
            </form>
          </div>

          <div className="card">
            <div className="section-title">
              <div>
                <div className="eyebrow">Pending invitations</div>
                <h2 style={{ margin: '5px 0' }}>{pendingInvitations.length} {pendingInvitations.length === 1 ? 'invitation' : 'invitations'}</h2>
              </div>
            </div>
            {pendingInvitations.length === 0 ? (
              <p className="subtitle">No pending invitations.</p>
            ) : (
              <div>
                {pendingInvitations.map((invitation) => {
                  const status = invitationStatus(invitation);
                  return (
                    <div
                      key={invitation.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                        padding: '12px 0',
                        borderBottom: '1px solid var(--line)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontWeight: 600 }}>{invitation.invited_email}</div>
                        <div className="activity-meta">
                          <span>invited as {invitation.role.toLowerCase()}</span>
                          <span className={`badge tone-${statusTone(status)}`}>{status}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="badge"
                        onClick={() => copyInviteLink(invitation.id)}
                        aria-label={`Copy invite link for ${invitation.invited_email}`}
                      >
                        {copiedToken === invitation.id ? <Check size={13} /> : <Copy size={13} />}
                        {copiedToken === invitation.id ? 'Copied' : 'Copy link'}
                      </button>
                      <button
                        type="button"
                        className="badge"
                        style={{ color: 'var(--muted)' }}
                        onClick={() => revokeInvitation(invitation.id)}
                        aria-label={`Revoke invitation for ${invitation.invited_email}`}
                      >
                        <X size={13} /> Revoke
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}