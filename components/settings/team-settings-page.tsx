'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, UserPlus } from 'lucide-react';
import { LoadingState } from '@/components/ui/feedback';

type Member = { id: string; user_id: string; role: string; name: string };
type Invitation = { id: string; email: string; role: string; expires_at: string; accepted_at: string | null; revoked_at: string | null };

const ROLES = ['ADMIN', 'STRATEGIST', 'EDITOR', 'APPROVER', 'CLIENT'];

export default function TeamSettingsPage() {
  const [data, setData] = useState<{ members: Member[]; invitations: Invitation[]; canManage: boolean } | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('EDITOR');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => fetch('/api/team', { cache: 'no-store' })
    .then(async (r) => {
      const b = await r.json();
      if (!b?.ok) throw new Error(b?.error || 'Could not load team');
      setData(b);
    })
    .catch((e) => setError(e instanceof Error ? e.message : 'Could not load team'));

  useEffect(() => { void load(); }, []);

  async function invite() {
    setMessage('');
    setError('');
    const r = await fetch('/api/team', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, role }),
    });
    const b = await r.json().catch(() => null);
    if (!r.ok) {
      setError(b?.error || 'Could not create invitation');
      return;
    }
    setEmail('');
    setMessage('Invitation created. Copy the generated invite link and send it to the teammate.');
    if (b.inviteLink) await navigator.clipboard?.writeText(b.inviteLink).catch(() => undefined);
    void load();
  }

  async function changeRole(userId: string, nextRole: string) {
    const r = await fetch('/api/team/members/' + userId, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: nextRole }),
    });
    const b = await r.json().catch(() => null);
    if (!r.ok) setError(b?.error || 'Could not change role');
    else void load();
  }

  async function revoke(id: string) {
    const r = await fetch('/api/team/invitations', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
    const b = await r.json().catch(() => null);
    if (!r.ok) setError(b?.error || 'Could not revoke invitation'); else void load();
  }

  async function remove(userId: string) {
    if (!window.confirm('Remove this member from the workspace?')) return;
    const r = await fetch('/api/team/members/' + userId, { method: 'DELETE' });
    const b = await r.json().catch(() => null);
    if (!r.ok) setError(b?.error || 'Could not remove member');
    else void load();
  }

  if (!data) {
    return <div className="settings-page"><LoadingState label="Loading team…" /></div>;
  }

  return (
    <div className="settings-page">
      <div className="topbar">
        <div>
          <div className="eyebrow">Settings · Team</div>
          <h1>Team & roles</h1>
          <p className="subtitle">Everyone works inside the same workspace. Roles control what each person can do.</p>
        </div>
        <button className="badge" onClick={() => load()}><RefreshCw size={14} /> Refresh</button>
      </div>

      {error ? <p className="field-note" role="alert">{error}</p> : null}
      {message ? <p className="field-note">{message}</p> : null}

      {data.canManage ? (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="eyebrow">Invite a teammate</div>
          <div className="onboarding-grid" style={{ marginTop: 10 }}>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></label>
            <label>Role<select value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((x) => <option key={x}>{x}</option>)}</select></label>
          </div>
          <button className="badge auth-submit" style={{ marginTop: 12 }} disabled={!email} onClick={invite}><UserPlus size={14} /> Create invite link</button>
        </section>
      ) : null}

      <section className="card">
        <div className="section-title">
          <div><div className="eyebrow">Workspace members</div><h2>{data.members.length} people</h2></div>
        </div>
        <div className="team-list">
          {data.members.map((member) => (
            <div className="team-row" key={member.id}>
              <div>
                <strong>{member.name}</strong>
                <span className="activity-meta">{member.role}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {member.role === 'OWNER' ? <span className="badge">OWNER</span> : data.canManage ? (
                  <>
                    <select value={member.role} onChange={(e) => changeRole(member.user_id, e.target.value)}>
                      <option value="ADMIN">ADMIN</option>
                      <option value="STRATEGIST">STRATEGIST</option>
                      <option value="EDITOR">EDITOR</option>
                      <option value="APPROVER">APPROVER</option>
                      <option value="CLIENT">CLIENT</option>
                    </select>
                    <button className="badge tone-danger" onClick={() => remove(member.user_id)}>Remove</button>
                  </>
                ) : <span className="badge">{member.role}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="section-title">
          <div><div className="eyebrow">Pending invitations</div><h2>{data.invitations.filter((x) => !x.accepted_at && !x.revoked_at).length}</h2></div>
        </div>
        <div className="team-list">
          {data.invitations.filter((x) => !x.accepted_at).map((inv) => (
            <div className="team-row" key={inv.id}>
              <div>
                <strong>{inv.email}</strong>
                <span className="activity-meta">{inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}</span>
              </div>
              {data.canManage && !inv.revoked_at ? <button className="badge tone-danger" onClick={() => revoke(inv.id)}>Revoke</button> : <span className="badge tone-muted">{inv.revoked_at ? 'Revoked' : 'Pending'}</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
