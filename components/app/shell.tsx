'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  ArrowUpRight, Boxes, CheckCircle2, ChevronDown, FileText, Globe2, LayoutGrid, LogOut, Menu, Plus, Settings, Sparkles, Target, Trash2, Users, X,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import HoldButton from '@/components/react-bits/HoldButton';
import { GuidedTour } from '@/components/tours/GuidedTour';

export type ShellBrand = { id: string; name: string; website_url: string | null; status: string | null };
export type ShellOrganization = { id: string; name: string; role: string };

const NAV_ITEMS = [
  { icon: LayoutGrid, label: 'Dashboard', href: '/dashboard', soon: false },
  { icon: Users, label: 'Brands', href: '/brands', soon: false },
  { icon: Target, label: 'Strategy', soon: true },
  { icon: FileText, label: 'Content Studio', href: '/content', soon: false },
  { icon: Boxes, label: 'Campaigns', href: '/campaigns', soon: false },
  { icon: CheckCircle2, label: 'Approvals', href: '/approvals', soon: false },
];

type OrgOption = { id: string; name: string; role: string };

function SwitchMenu({
  trigger,
  children,
}: {
  trigger: (props: { toggle: () => void; open: boolean }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="switch-menu" ref={ref}>
      {trigger({ toggle: () => setOpen((value) => !value), open })}
      {open ? <div className="switch-panel">{children(() => setOpen(false))}</div> : null}
    </div>
  );
}

export function AppShell({
  organization,
  brands,
  userEmail,
  userFirstName,
  replayActive = false,
  children,
}: {
  organization: ShellOrganization;
  brands: ShellBrand[];
  userEmail: string;
  userFirstName: string | null;
  replayActive?: boolean;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [greeting, setGreeting] = useState('Welcome back');
  const [orgs, setOrgs] = useState<OrgOption[] | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [workspaceRequired, setWorkspaceRequired] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceConfirmation, setWorkspaceConfirmation] = useState('');
  const pathname = usePathname();

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
  }, []);

  async function loadOrganizations() {
    if (orgs) {
      setOrgs(null);
      return;
    }
    setOrgLoading(true);
    setOrgError('');
    try {
      const response = await fetch('/api/auth/organizations', { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || 'Could not load workspaces');
      setOrgs(
        (body.organizations as OrgOption[]).map((org) => ({
          id: org.id,
          name: org.name,
          role: org.role,
        })),
      );
    } catch (error) {
      setOrgError(error instanceof Error ? error.message : 'Could not load workspaces');
    } finally {
      setOrgLoading(false);
    }
  }

  async function switchOrganization(orgId: string) {
    setOrgLoading(true);
    setOrgError('');
    try {
      const response = await fetch('/api/auth/organizations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not switch workspace');
      setOrgs(null);
      window.location.href = '/dashboard';
    } catch (error) {
      setOrgError(error instanceof Error ? error.message : 'Could not switch workspace');
      setOrgLoading(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  async function deleteWorkspace() {
    setWorkspaceLoading(true);
    setDeleteError('');
    try {
      const response = await fetch('/api/auth/workspace', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE WORKSPACE' }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setDeleteError(body?.error || 'Could not delete the workspace.');
        return;
      }

      setWorkspaceRequired(false);
      setDeleteError(body?.message || 'Workspace deleted. You can now delete your account.');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete the workspace.');
    } finally {
      setWorkspaceLoading(false);
    }
  }

  async function deleteAccount() {
    setDeleteLoading(true);
    setDeleteError('');
    try {
      const response = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setWorkspaceRequired(Boolean(body?.requiresWorkspaceDeletion));
        setDeleteError(body?.error || 'Could not delete your account.');
        return;
      }

      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      window.location.href = '/login';
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete your account.');
    } finally {
      setDeleteLoading(false);
    }
  }

  const guideStage = pathname.startsWith('/brands/') ? 'brand' : pathname.startsWith('/content') ? 'content' : pathname.startsWith('/campaigns') ? 'campaigns' : pathname.startsWith('/approvals') ? 'approvals' : pathname === '/dashboard' ? 'dashboard' : null;
  const guideSteps = guideStage === 'dashboard' ? [
    { title: 'This is your command center', body: 'Use the workflow bar to see what is complete, what needs your attention, and the single next action to take.' },
    { title: 'Follow the next action', body: 'Open the highlighted action instead of guessing which section comes next. UpTrendifyOS moves from research to strategy to content to approval.' },
    { title: 'You can always see where you are', body: 'The sidebar and current-stage indicator stay visible so you never need to inspect the URL.' },
  ] : guideStage === 'brand' ? [
    { title: 'Start with evidence', body: 'Research reads the public website, then Brand Brain turns the evidence into suggestions for human review.' },
    { title: 'Review before strategy', body: 'Open Brand Intelligence suggestions, inspect their evidence, then approve or edit the facts you trust.' },
    { title: 'Strategy comes after the gate', body: 'Once the Brand Brain gate is satisfied, the strategy workspace becomes the next guided step.' },
  ] : guideStage === 'content' ? [
    { title: 'Content Studio creates assets', body: 'Use approved brand intelligence and strategy context to create content you may actually publish.' },
    { title: 'Versions matter', body: 'Edits create new versions when required. Approval always applies to an exact content version.' },
  ] : guideStage === 'campaigns' ? [
    { title: 'Campaigns are initiatives', body: 'A campaign groups content around a marketing objective, audience, dates, channels and budget.' },
    { title: 'Content and campaigns are different', body: 'A campaign can contain many content items. Each content item keeps its own approval lifecycle.' },
  ] : guideStage === 'approvals' ? [
    { title: 'Approval protects the exact version', body: 'Review the content that is actually awaiting a decision. A later edited version does not inherit an older approval.' },
    { title: 'Then queue for publishing', body: 'Approved content can move to Ready to Publish. External publishing remains honest about channel connections.' },
  ] : [];
  const displayName = userFirstName || userEmail || 'Account';
  const initials = userFirstName
    ? userFirstName.slice(0, 2).toUpperCase()
    : (userEmail || 'U').slice(0, 1).toUpperCase();

  const nav = (
    <nav className="nav" aria-label="Workspace">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        if (item.soon) {
          return (
            <span className="nav-item nav-item-soon" key={item.label}>
              <Icon size={17} /> {item.label} <i className="chip chip-quiet" style={{ marginLeft: 'auto' }}>Soon</i>
            </span>
          );
        }
        return (
          <a className="nav-item" href={item.href} key={item.label} onClick={() => setMobileOpen(false)}>
            <Icon size={17} /> {item.label}
          </a>
        );
      })}
      <a className={'nav-item' + (pathname.startsWith('/settings') ? ' active' : '')} href="/settings" aria-current={pathname.startsWith('/settings') ? 'page' : undefined} onClick={() => setMobileOpen(false)}><Settings size={17}/> <span>Settings</span></a>\n      <a className="nav-item nav-item-accent" href="/brands/new" onClick={() => setMobileOpen(false)}>
        <Plus size={17} /> Add brand
      </a>
    </nav>
  );

  return (
    <main className={`shell${mobileOpen ? ' shell-mobile-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand-mark">
          <a className="brand-mark-link" href="/landing" aria-label="Go to the UpTrendifyOS landing page">
            <span className="logo" aria-hidden="true" /> UpTrendifyOS
          </a>
          <button type="button" className="sidebar-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="org-switcher">
          <SwitchMenu
            trigger={({ toggle, open }) => (
              <button
                type="button"
                className="org-switcher-trigger"
                onClick={() => { toggle(); loadOrganizations(); }}
                aria-expanded={open}
              >
                <span className="org-avatar">{organization.name.slice(0, 1).toUpperCase()}</span>
                <span className="org-meta">
                  <span className="org-name">{organization.name}</span>
                  <span className="org-role">{organization.role.toLowerCase()}</span>
                </span>
                {orgLoading ? <Loader /> : <ChevronDown size={14} className={open ? 'rotate-180' : ''} />}
              </button>
            )}
          >
            {(close) => (
              <div className="switch-panel-inner" role="menu">
                <div className="switch-title">Workspaces</div>
                <button type="button" className="switch-option switch-option-current" onClick={close}>
                  <span className="org-avatar">{organization.name.slice(0, 1).toUpperCase()}</span>
                  <span className="org-meta"><span className="org-name">{organization.name}</span><span className="org-role">current</span></span>
                  <CheckCircle2 size={14} className="switch-check" />
                </button>
                {(orgs ?? []).filter((org) => org.id !== organization.id).map((org) => (
                  <button type="button" className="switch-option" key={org.id} onClick={() => switchOrganization(org.id)}>
                    <span className="org-avatar">{org.name.slice(0, 1).toUpperCase()}</span>
                    <span className="org-meta"><span className="org-name">{org.name}</span><span className="org-role">{org.role.toLowerCase()}</span></span>
                  </button>
                ))}
                {orgLoading ? (
                  <div className="switch-hint">Loading workspaces…</div>
                ) : orgError ? (
                  <div className="switch-hint switch-error">{orgError}</div>
                ) : null}
                <a className="switch-link" href="/register" onClick={close}>
                  <Plus size={13} /> Create workspace
                </a>
              </div>
            )}
          </SwitchMenu>
        </div>

        {nav}

        <div className="card" style={{ marginTop: 28 }}>
          <div className="eyebrow">AI COMMAND</div>
          <p style={{ marginBottom: 8 }}>Ask UpTrendifyOS to find your next growth opportunity.</p>
          <div className="badge"><Sparkles size={13} /> Agent ready</div>
        </div>
        <div style={{ marginTop: 20 }}>
          <button type="button" className="logout-button" onClick={logout} disabled={loggingOut}>
            {loggingOut ? <Loader /> : <LogOut size={15} />} Sign out
          </button>
        </div>
      </aside>

      <section className="main">
        <div className="topbar topbar-compact">
          <button type="button" className="sidebar-open" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu size={18} />
          </button>

          <div className="brand-switcher">
            <SwitchMenu
              trigger={({ toggle, open }) => (
                <button type="button" className="brand-switcher-trigger" onClick={toggle} aria-expanded={open}>
                  <Globe2 size={15} />
                  <span className="brand-switcher-label">Current brand</span>
                </button>
              )}
            >
              {(close) => (
                <div className="switch-panel-inner" role="menu">
                  <div className="switch-title">Brands</div>
                  {brands.length === 0 ? (
                    <div className="switch-hint">No brands yet in {organization.name}.</div>
                  ) : (
                    brands.map((brand) => (
                      <a className="switch-option" href={`/brands/${brand.id}`} key={brand.id} onClick={close}>
                        <span className="switch-brand-dot" />
                        <span className="org-meta">
                          <span className="org-name">{brand.name}</span>
                          <span className="org-role">{brand.website_url?.replace(/^https?:\/\//, '') || 'Browse'}</span>
                        </span>
                        <ArrowUpRight size={13} className="switch-arrow" />
                      </a>
                    ))
                  )}
                  <a className="switch-link" href="/brands/new" onClick={close}>
                    <Plus size={13} /> Add a brand
                  </a>
                </div>
              )}
            </SwitchMenu>
          </div>

          <div className="topbar-title">
            <h1>{greeting}, {displayName.split(' ')[0]}.</h1>
          </div>

          {replayActive ? (
            <span className="badge replay-badge" title="AI execution is in replay mode — running on deterministic presentation data with no live model calls">
              Presentation Replay
            </span>
          ) : null}

          <a className="badge topbar-add" href="/brands/new"><Plus size={14} /> Add brand</a>

          <div className="user-menu">
            <SwitchMenu
              trigger={({ toggle, open }) => (
                <button type="button" className="user-avatar" onClick={toggle} aria-expanded={open} aria-label="Account menu" title={userEmail}>
                  {initials}
                </button>
              )}
            >
              {(close) => (
                <div className="switch-panel-inner" role="menu" style={{ minWidth: 240 }}>
                  <div className="switch-user">
                    <span className="user-avatar user-avatar-lg">{initials}</span>
                    <span className="org-meta">
                      <span className="org-name">{displayName}</span>
                      <span className="org-role">{userEmail}</span>
                    </span>
                  </div>
                  <a className="switch-option" href="/dashboard" onClick={close}>
                    <LayoutGrid size={13} /> Dashboard
                  </a>
                  <a className="switch-option" href="/brands" onClick={close}>
                    <Users size={13} /> Brands
                  </a>
                  <button type="button" className="switch-option" onClick={() => { close(); logout(); }}>
                    <LogOut size={13} /> Sign out
                  </button>
                  <button
                    type="button"
                    className="switch-option"
                    onClick={() => {
                      close();
                      setDeleteError('');
                      setDeleteConfirmation('');
                      setWorkspaceConfirmation('');
                      setDeleteOpen(true);
                    }}
                    style={{ color: '#f87171' }}
                  >
                    <Trash2 size={13} /> Delete account
                  </button>
                </div>
              )}
            </SwitchMenu>
          </div>
        </div>

        {children}
      </section>

      {deleteOpen ? (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleteLoading) setDeleteOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            background: 'rgba(3,7,12,.72)',
            backdropFilter: 'blur(7px)',
          }}
        >
          <section
            className="card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            style={{ maxWidth: 520, width: '100%', borderColor: 'rgba(248,113,113,.35)' }}
          >
            <div className="eyebrow" style={{ color: '#f87171' }}>Danger zone</div>
            <h2 id="delete-account-title" style={{ margin: '6px 0 8px' }}>Delete your account?</h2>
            <p className="subtitle">
              This removes your sign-in, workspace memberships and profile. Existing organization data and audit history are preserved where possible. If you are the only owner of a workspace, ownership must be transferred first.
            </p>

            {workspaceRequired ? (
              <div className="card" style={{ marginTop: 14, borderColor: 'rgba(248,113,113,.35)', background: 'rgba(248,113,113,.07)' }}>
                <div className="eyebrow" style={{ color: '#f87171' }}>Workspace required</div>
                <p style={{ margin: '6px 0 10px' }}>
                  You are the only owner of this workspace. Delete the workspace first; after that you can delete your account.
                </p>
                <p className="subtitle" style={{ margin: '6px 0 12px' }}>
                  Type <strong>DELETE WORKSPACE</strong> and hold the button for 2 seconds to permanently delete this workspace.
                </p>
                <input
                  type="text"
                  value={workspaceConfirmation}
                  onChange={(event) => setWorkspaceConfirmation(event.target.value)}
                  placeholder="Type DELETE WORKSPACE"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  style={{ width: '100%', marginBottom: 10 }}
                />
                <HoldButton
                  size="sm"
                  holdTime={2000}
                  resetAfter={1400}
                  backgroundColor="#24121A"
                  fillColor="#DC2626"
                  textColor="#fca5a5"
                  fillTextColor="#ffffff"
                  className="danger-hold-button"
                  disabled={workspaceLoading || workspaceConfirmation !== 'DELETE WORKSPACE'}
                  onHold={deleteWorkspace}
                >
                  <Trash2 size={14} /> Hold to delete workspace
                </HoldButton>
              </div>
            ) : null}

            {deleteError ? (
              <div role="alert" className="card" style={{ marginTop: 12, borderColor: 'rgba(239,68,68,.35)', background: 'rgba(239,68,68,.08)' }}>
                {deleteError}
              </div>
            ) : null}

            <div style={{ marginTop: 16 }}>
              <label className="subtitle" style={{ display: 'block', marginBottom: 6 }}>
                Type <strong>DELETE</strong> then hold to confirm deleting your account.
              </label>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                placeholder="Type DELETE"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="badge"
                onClick={() => setDeleteOpen(false)}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <HoldButton
                size="md"
                holdTime={2000}
                resetAfter={1400}
                backgroundColor="#24121A"
                fillColor="#DC2626"
                textColor="#fca5a5"
                fillTextColor="#ffffff"
                className="danger-hold-button"
                disabled={deleteLoading || deleteConfirmation !== 'DELETE'}
                onHold={deleteAccount}
              >
                <Trash2 size={14} /> Hold to delete account
              </HoldButton>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Loader() {
  return <span className="spinner" aria-hidden="true" />;
}