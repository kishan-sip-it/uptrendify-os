'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ArrowUpRight, BookOpen, Boxes, CheckCircle2, ChevronDown, FileText, Globe2, LayoutGrid, LogOut, Menu, Plus, Settings, Sparkles, Target, Trash2, Users, X,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import HoldButton from '@/components/react-bits/HoldButton';
import { GuidedTour } from '@/components/tours/GuidedTour';
import { ThemeController } from '@/components/theme/theme-controller';

export type ShellBrand = { id: string; name: string; website_url: string | null; status: string | null };
export type ShellOrganization = { id: string; name: string; role: string };

const NAV_ITEMS = [
  { icon: LayoutGrid, label: 'Dashboard', href: '/dashboard', soon: false },
  { icon: Users, label: 'Brands', href: '/brands', soon: false },
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

  const [guideIdle, setGuideIdle] = useState(false);
  const [phaseBriefingVisible, setPhaseBriefingVisible] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  const isBrandContent = /\/brands\/[^/]+\/content(?:\/|$)/.test(pathname);
  const isContentDetail = /\/brands\/[^/]+\/content\/[^/]+$/.test(pathname);
  const isBrandCampaigns = /\/brands\/[^/]+\/campaigns(?:\/|$)/.test(pathname);
  const isCampaignDetail = /\/brands\/[^/]+\/campaigns\/[^/]+$/.test(pathname);
  const isBrandBrain = pathname.startsWith('/brands/') && searchParams.get('view') === 'brain';
  const isBrandStrategy = pathname.startsWith('/brands/') && searchParams.get('view') === 'strategy';
  const isBrandOverview = pathname.startsWith('/brands/') && !isBrandContent && !isBrandCampaigns && !isBrandBrain && !isBrandStrategy;
  const currentLocation = pathname === '/dashboard'
    ? 'Dashboard'
    : isContentDetail
      ? 'Content detail'
      : isBrandContent || pathname.startsWith('/content')
        ? 'Content Studio'
        : isCampaignDetail
          ? 'Campaign detail'
          : isBrandCampaigns
            ? 'Brand campaigns'
            : pathname === '/campaigns'
              ? 'All campaigns'
              : pathname.startsWith('/approvals')
                ? 'Content Approval'
                : pathname.startsWith('/settings')
                  ? 'Settings'
                  : isBrandBrain
                    ? 'Brand Brain'
                    : isBrandStrategy
                      ? 'Strategy'
                      : isBrandOverview
                        ? 'Brand overview'
                        : pathname.startsWith('/brands/')
                          ? 'Brand workspace'
                          : pathname === '/brands'
                            ? 'Brands'
                            : pathname.startsWith('/onboarding')
                              ? 'Setup'
                              : 'Workspace';

  const guideStage = isContentDetail
    ? 'content-detail'
    : isBrandContent || pathname.startsWith('/content')
      ? 'content'
      : isCampaignDetail
        ? 'campaign-detail'
        : isBrandCampaigns
          ? 'campaigns-brand'
          : pathname === '/campaigns'
            ? 'campaigns'
            : pathname.startsWith('/approvals')
              ? 'approvals'
              : pathname.startsWith('/settings')
                ? 'settings'
                : isBrandBrain
                  ? 'brand-brain'
                  : isBrandStrategy
                    ? 'strategy'
                    : isBrandOverview
                      ? 'brand'
                      : pathname === '/dashboard'
                        ? 'dashboard'
                        : null;

  const guideSteps = guideStage === 'dashboard' ? [
    { target: '#workflow', title: 'This is your command center', body: 'Use the workflow bar to see what is complete, what needs your attention, and the single next action to take.' },
    { target: '#workflow .workflow-next', title: 'Follow the next action', body: 'Open the highlighted action instead of guessing which section comes next. UpTrendifyOS moves from research to strategy to content to approval.' },
    { target: 'nav.nav', title: 'You can always see where you are', body: 'The sidebar and current-stage indicator stay visible so you never need to inspect the URL.' },
  ] : guideStage === 'brand' ? [
    { target: 'main', title: 'Brand workspace', body: 'This is the home for one brand. Use the contextual tabs to move between overview, Brand Brain, strategy, campaigns and content without returning to the dashboard.' },
    { target: '.brand-workspace-nav', title: 'Use the brand tabs for brand-scoped work', body: 'These tabs stay inside this brand. Global navigation remains available in the sidebar for organization-wide views.' },
  ] : guideStage === 'brand-brain' ? [
    { target: '#intelligence', title: 'Brand Brain turns research into reviewable intelligence', body: 'Research findings stay as suggestions until a human approves or edits them. Evidence remains attached so you can verify the reasoning.' },
    { target: '#intelligence .brain-topic-nav', title: 'Review one topic at a time', body: 'Use the topic navigation for Identity, Audience, Positioning, Offer, Messaging, SEO and Competition instead of scrolling through one long evidence wall.' },
    { target: '#intelligence .review-tabs', title: 'Filter by decision state', body: 'Needs review, Approved, Not found, Dismissed and All keep the review surface focused without removing any underlying evidence.' },
  ] : guideStage === 'strategy' ? [
    { target: 'main', title: 'Strategy is the planning layer', body: 'The strategy workspace turns approved Brand Brain information into objectives, positioning, channels, content direction and execution planning.' },
    { target: '.brand-workspace-nav', title: 'Stay in the brand context', body: 'Use the brand tabs to move between approved intelligence and strategy. The strategy gate remains authoritative before campaign planning.' },
  ] : guideStage === 'content' ? [
    { target: '#content-workspace', title: 'Content Studio creates assets', body: 'Use approved brand intelligence and strategy context to create content you may actually publish.' },
    { target: 'main', title: 'Versions matter', body: 'Edits create new versions when required. Approval always applies to an exact content version.' },
  ] : guideStage === 'content-detail' ? [
    { target: 'main', title: 'This is one content item', body: 'Review its status, brief, generated version, history and publishing state here. Final approval decisions belong in the Approval Queue.' },
    { target: '.brand-workspace-nav', title: 'Keep the workflow boundary clear', body: 'Use the Approval Queue for Approve, Request changes and Reject. Content detail is the context and evidence surface, not a second approval surface.' },
  ] : guideStage === 'campaigns' ? [
    { target: 'main', title: 'All campaigns', body: 'This is the organization-wide campaign index. Campaigns are grouped by client and brand so you can find the initiative before entering its brand-scoped workspace.' },
    { target: 'main', title: 'Open a specific campaign', body: 'Select a campaign to enter that campaign. From there, its linked content and execution context stay attached to the brand and campaign.' },
  ] : guideStage === 'campaigns-brand' ? [
    { target: '.brand-workspace-nav', title: 'Brand-scoped campaigns', body: 'This Campaigns tab shows campaigns for the current brand. The sidebar Campaigns entry is the organization-wide index, so the two surfaces have different scopes.' },
    { target: 'main', title: 'Create from approved strategy', body: 'Campaign creation remains grounded in the brand strategy gate. Once inside a campaign, its content stays connected to the campaign context.' },
  ] : guideStage === 'campaign-detail' ? [
    { target: 'main', title: 'Campaign execution', body: 'This is the detail surface for one campaign. Plan the initiative, inspect linked content and follow the content → approval → publishing lifecycle.' },
    { target: '.brand-workspace-nav', title: 'Campaign context stays inside the brand', body: 'The selected Campaigns tab is contextual. Use the global Campaigns entry when you need the organization-wide index again.' },
  ] : guideStage === 'approvals' ? [
    { target: 'nav a[href="/approvals"]', title: 'Approval protects the exact version', body: 'Review the content that is actually awaiting a decision. A later edited version does not inherit an older approval.' },
    { target: 'main', title: 'Then queue for publishing', body: 'Approved content can move to Ready to Publish. External publishing remains honest about channel connections.' },
  ] : guideStage === 'settings' ? [
    { target: '.settings-page', title: 'Settings keeps the workspace under control', body: 'Manage workspace identity, timezone, appearance, guides and recovery tools here. These controls change how your workspace behaves, not the research evidence itself.' },
    { target: '.settings-tools', title: 'Use the operational tools when needed', body: 'Replay GUIDE, open Trash, create workspaces and manage team access from one place.' },
  ] : [];

  const phaseBriefings: Record<string, { title: string; body: string }> = {
    dashboard: { title: 'Command center', body: 'Follow the single next action. Research and Brand Brain come first; strategy unlocks after human review.' },
    brand: { title: 'Brand overview', body: 'This is the home for one brand. Check research status, verified intelligence and the next action before moving into the contextual tabs.' },
    'brand-brain': { title: 'Brand Brain', body: 'Review evidence-backed suggestions by topic. Approve or edit what you trust before it can become authoritative brand information.' },
    strategy: { title: 'Strategy', body: 'Turn approved Brand Brain information into an actionable marketing plan. Campaign planning remains gated by strategy success.' },
    content: { title: 'Content Studio', body: 'Create a brief from approved context, then generate and review exact content versions before publishing.' },
    'content-detail': { title: 'Content detail', body: 'Inspect one content item, its version history and lifecycle here. Final approval decisions happen in the Approval Queue.' },
    campaigns: { title: 'All campaigns', body: 'Find campaigns across the organization, grouped by client and brand. Select a campaign to enter its execution context.' },
    'campaigns-brand': { title: 'Brand campaigns', body: 'This is the campaign workspace for the current brand. Create and manage initiatives here without losing the brand context.' },
    'campaign-detail': { title: 'Campaign detail', body: 'This campaign is the execution container for its linked content. Follow the campaign → content → approval → publishing flow.' },
    approvals: { title: 'Approvals', body: 'Approve the exact content version you reviewed. A later edit creates a new version that needs its own decision.' },
    settings: { title: 'Settings', body: 'Keep workspace identity, appearance, guides, team access and recovery tools organized here.' },
  };
  const displayName = userFirstName || userEmail || 'Account';
  const initials = userFirstName
    ? userFirstName.slice(0, 2).toUpperCase()
    : (userEmail || 'U').slice(0, 1).toUpperCase();

  useEffect(() => {
    if (!guideStage || !phaseBriefings[guideStage]) {
      setPhaseBriefingVisible(false);
      return;
    }
    const key = 'uptrendify-phase-intro:' + guideStage;
    const now = Date.now();
    try {
      const raw = window.localStorage.getItem(key);
      const seenAt = raw ? Number(raw) : 0;
      if (!seenAt || now - seenAt > 10 * 60 * 1000) {
        window.localStorage.setItem(key, String(now));
        setPhaseBriefingVisible(true);
      } else {
        setPhaseBriefingVisible(false);
      }
    } catch {
      setPhaseBriefingVisible(true);
    }
    const timeout = window.setTimeout(() => setPhaseBriefingVisible(false), 10 * 60 * 1000);
    return () => window.clearTimeout(timeout);
  }, [guideStage]);

  useEffect(() => {
    let idleTimer: number | undefined;
    const reset = () => {
      setGuideIdle(false);
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setGuideIdle(true), 45_000);
    };
    reset();
    const events = ['mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    return () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, []);

  function openGuide() {
    if (!guideStage || !guideSteps.length) return;
    window.dispatchEvent(new CustomEvent('uptrendify:open-guide', { detail: { stageKey: guideStage } }));
    setGuideIdle(false);
  }

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
        const active =
          item.label === 'Dashboard'
            ? pathname === '/dashboard'
            : item.label === 'Brands'
              ? pathname === '/brands' || pathname.startsWith('/brands/')
              : item.label === 'Content Studio'
                ? pathname.startsWith('/content')
                : item.label === 'Campaigns'
                  ? pathname === '/campaigns'
                  : item.label === 'Approvals'
                    ? pathname.startsWith('/approvals')
                    : false;

        return (
          <a
            className={'nav-item' + (active ? ' active' : '')}
            href={item.href}
            key={item.label}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={17} /> {item.label}
          </a>
        );
      })}
      <a className={'nav-item' + (pathname.startsWith('/settings') ? ' active' : '')} href="/settings" aria-current={pathname.startsWith('/settings') ? 'page' : undefined} onClick={() => setMobileOpen(false)}><Settings size={17}/> <span>Settings</span></a>
      <a className="nav-item nav-item-accent" href="/brands/new" onClick={() => setMobileOpen(false)}>
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
                <a className="switch-link" href="/settings/workspace/new" onClick={close}>
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

          <div className="topbar-actions">
            {guideStage && guideSteps.length ? (
              <button
                type="button"
                className={'guide-button' + (guideIdle ? ' guide-idle' : '')}
                onClick={openGuide}
                title="Open GUIDE for this phase"
              >
                <BookOpen size={14} /> GUIDE
              </button>
            ) : null}
            </div>

          <ThemeController compact />

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

        <div className="current-location" aria-live="polite">Current: {currentLocation}</div>
        {phaseBriefingVisible && guideStage && phaseBriefings[guideStage] ? (
          <section className="phase-briefing" aria-label="Phase introduction">
            <div className="phase-briefing-copy">
              <div className="eyebrow">NEW PHASE · {currentLocation}</div>
              <strong>{phaseBriefings[guideStage].title}</strong>
              <span>{phaseBriefings[guideStage].body}</span>
            </div>
            {guideSteps.length ? (
              <button type="button" className="badge" onClick={openGuide}><BookOpen size={13} /> Open GUIDE</button>
            ) : null}
            <button type="button" className="phase-briefing-close" onClick={() => setPhaseBriefingVisible(false)} aria-label="Dismiss phase introduction"><X size={14} /></button>
          </section>
        ) : null}
        {children}
        {guideStage && guideSteps.length ? <GuidedTour stageKey={guideStage} steps={guideSteps} /> : null}
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
              This permanently removes your sign-in and profile. Workspaces owned only by you are deleted with their workspace data; shared workspaces stay intact when another owner can continue managing them. If a workspace would be left without an owner, the account deletion stops before making changes and explains what must be transferred first.
            </p>

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
