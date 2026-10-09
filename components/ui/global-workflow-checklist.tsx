'use client';

import { CheckCircle2, Circle, ClipboardCheck, LockKeyhole, RefreshCw, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

type Task = {
  id: string;
  title: string;
  detail: string;
  matches?: string[];
  locked?: boolean;
};

type ChecklistConfig = {
  title: string;
  subtitle: string;
  tasks: Task[];
};

const CHECKLIST_STORAGE_PREFIX = 'uptrendify:contextual-checklist:';

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function routeConfig(pathname: string, view: string | null): ChecklistConfig | null {
  const brandMatch = pathname.match(/^\/brands\/([^/]+)/);
  const brandId = brandMatch?.[1] ?? null;
  const campaignMatch = pathname.match(/^\/brands\/[^/]+\/campaigns\/([^/]+)$/);
  const contentMatch = pathname.match(/^\/brands\/[^/]+\/content\/([^/]+)$/);

  if (pathname === '/dashboard') {
    return {
      title: 'What to do next',
      subtitle: 'Next actions for this page.',
      tasks: [
        { id: 'dashboard-brands', title: 'Open Brands', detail: 'Choose the brand you want to work on.', matches: ['Brands'] },
        { id: 'dashboard-brand', title: 'Open the brand workspace', detail: 'Run Research, then review Brand Brain.', matches: ['Open brand workspace'] },
      ],
    };
  }

  if (brandId && view === 'brain') {
    return {
      title: 'Brand Brain · next actions',
      subtitle: 'Review and approve the brand findings.',
      tasks: [
        { id: 'brain-review', title: 'Review the current suggestions', detail: 'Inspect the evidence and edit anything that needs correction.' },
        { id: 'brain-approve', title: 'Approve or edit the required findings', detail: 'Approved findings become the brand rules used by strategy and content.', matches: ['Approve', 'Save changes'] },
        { id: 'brain-strategy', title: 'Click “Continue to Strategy”', detail: 'After the required findings are approved, continue into the Strategy workspace.', matches: ['Continue to Strategy'] },
      ],
    };
  }

  if (brandId && view === 'strategy') {
    return {
      title: 'Strategy · next actions',
      subtitle: 'Next actions for strategy.',
      tasks: [
        { id: 'strategy-generate', title: 'Generate the strategy', detail: 'Use the approved Brand Brain context to create a strategy version.', matches: ['Generate Strategy', 'Generate strategy'] },
        { id: 'strategy-review', title: 'Review the generated strategy', detail: 'Check the objectives, positioning, channels and execution direction before using it.', matches: ['Approve', 'Save'] },
        { id: 'strategy-campaign', title: 'Click “Create Campaign”', detail: 'Once the strategy is ready, open the campaign creation page.', matches: ['Create Campaign'] },
      ],
    };
  }

  if (brandId && pathname === `/brands/${brandId}`) {
    return {
      title: 'Brand workspace · next actions',
      subtitle: 'Run Research, then review Brand Brain.',
      tasks: [
        { id: 'brand-research', title: 'Run Research', detail: 'Start the evidence collection for this brand.', matches: ['Run research', 'Start research'] },
        { id: 'brand-brain', title: 'Open Brand Brain', detail: 'When Research is ready, review the generated intelligence.', matches: ['Brand Brain'] },
        { id: 'brand-strategy', title: 'Open Strategy after approval', detail: 'Approve the required Brand Brain findings before creating strategy.', matches: ['Strategy'] },
      ],
    };
  }

  if (brandId && pathname.endsWith('/campaigns/new')) {
    return {
      title: 'New campaign · next actions',
      subtitle: 'Create a campaign from an approved strategy.',
      tasks: [
        { id: 'campaign-ground', title: 'Choose an approved strategy', detail: 'Select at least one approved strategy to ground the campaign.', matches: ['approved strategies'] },
        { id: 'campaign-create', title: 'Create the campaign', detail: 'Add only the details the approved strategy does not cover.', matches: ['Create campaign'] },
        { id: 'campaign-plan', title: 'After creation, move it to Planned', detail: 'Open the new campaign, confirm its details, then move Draft → Planned when it is ready for content creation.', locked: true },
        { id: 'campaign-content', title: 'Click “Create content for this campaign”', detail: 'Continue to Content Studio to create campaign assets.', locked: true },
      ],
    };
  }

  if (campaignMatch && brandId) {
    return {
      title: 'Campaign · next actions',
      subtitle: 'Plan the campaign, then create its content.',
      tasks: [
        { id: 'campaign-plan-detail', title: 'Move the campaign to Planned', detail: 'Draft is the planning state. Click “Move to Planned” when the campaign details are ready.', matches: ['Move to Planned'] },
        { id: 'campaign-content-detail', title: 'Click “Create content for this campaign”', detail: 'Use the campaign-linked Content Studio entry so the content keeps this campaign context.', matches: ['Create content for this campaign'] },
        { id: 'campaign-return', title: 'After content creation, return to this campaign', detail: 'The campaign remains the execution container. Open the created content from here to generate its version.', locked: true },
      ],
    };
  }

  if (brandId && pathname.endsWith('/content/new')) {
    return {
      title: 'Content creation · next actions',
      subtitle: 'Create the brief, then review the content version.',
      tasks: [
        { id: 'content-brief', title: 'Create the content brief', detail: 'Use the campaign context and leave optional fields blank when approved brand rules already cover them.', matches: ['Create content'] },
        { id: 'content-return', title: 'Return to the campaign', detail: 'Return to the linked campaign to continue.', locked: true },
        { id: 'content-open-detail', title: 'Open the created content', detail: 'From the campaign, click the content item to enter Content Detail and generate the version.', locked: true },
      ],
    };
  }

  if (contentMatch && brandId) {
    return {
      title: 'Content detail · next actions',
      subtitle: 'Generate a version, then send it for approval.',
      tasks: [
        { id: 'content-generate', title: 'Generate the content version', detail: 'Create the version from the approved brand and strategy context.', matches: ['Generate', 'Regenerate'] },
        { id: 'content-approval', title: 'Click “Send to approval queue”', detail: 'This sends the exact current version to the human Approval Queue.', matches: ['Send to approval queue', 'Send to approval'] },
        { id: 'content-approvals', title: 'Move to the Approval Queue', detail: 'Open Approvals to make the final version-specific decision.', locked: true },
      ],
    };
  }

  if (pathname === '/approvals' || pathname.startsWith('/approvals/')) {
    return {
      title: 'Approval & publishing · next actions',
      subtitle: 'Review the final version before publishing.',
      tasks: [
        { id: 'approval-preview', title: 'Open the content preview', detail: 'Inspect the rendered channel preview before making the decision.', matches: ['Preview'] },
        { id: 'approval-approve', title: 'Approve the exact version', detail: 'Use the approval action on the version you reviewed.', matches: ['Approve'] },
        { id: 'approval-queue', title: 'Queue the approved version for publishing', detail: 'After approval, move it into the publishing queue.', matches: ['Queue for publishing'] },
        { id: 'publishing-preview', title: 'Open the publishing preview', detail: 'Check the selected channel and final rendered output.', matches: ['Preview'] },
        { id: 'publishing-confirm', title: 'Confirm publish to the connected channel', detail: 'Confirm the result after publishing.', matches: ['Confirm publish', 'Publish'] },
      ],
    };
  }

  if (pathname === '/campaigns' || pathname.startsWith('/content')) {
    return {
      title: 'Workspace · next actions',
      subtitle: 'Open the brand workspace to continue.',
      tasks: [
        { id: 'workspace-brand', title: 'Open the relevant brand', detail: 'Enter the brand workspace so the next action stays attached to its strategy and campaign context.', matches: ['Brands'] },
      ],
    };
  }

  return null;
}

function getStorageKey(pathname: string, view: string | null): string {
  const brand = pathname.match(/^\/brands\/([^/]+)/)?.[1] ?? 'global';
  const campaign = pathname.match(/\/campaigns\/([^/]+)/)?.[1] ?? '';
  const content = pathname.match(/\/content\/([^/]+)/)?.[1] ?? '';
  return `${CHECKLIST_STORAGE_PREFIX}${brand}:${campaign}:${content}:${view ?? ''}`;
}

function taskMatchesClick(task: Task, text: string): boolean {
  if (!task.matches?.length) return false;
  const normalized = normalize(text);
  return task.matches.some((match) => normalized.includes(normalize(match)));
}

export function GlobalWorkflowChecklist() {
  const pathname = usePathname();
  const [view, setView] = useState<string | null>(null);
  const config = useMemo(() => routeConfig(pathname, view), [pathname, view]);
  const storageKey = useMemo(() => getStorageKey(pathname, view), [pathname, view]);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const syncView = () => setView(new URLSearchParams(window.location.search).get('view'));
    syncView();
    const onNavigation = () => {
      window.setTimeout(syncView, 0);
      window.setTimeout(syncView, 120);
    };
    window.addEventListener('popstate', syncView);
    window.addEventListener('hashchange', syncView);
    document.addEventListener('click', onNavigation, true);
    return () => {
      window.removeEventListener('popstate', syncView);
      window.removeEventListener('hashchange', syncView);
      document.removeEventListener('click', onNavigation, true);
    };
  }, [pathname]);

  useEffect(() => {
    if (!config) return;
    try {
      const stored = window.sessionStorage.getItem(storageKey);
      setCompleted(stored ? JSON.parse(stored) as Record<string, boolean> : {});
    } catch {
      setCompleted({});
    }
  }, [config, storageKey]);

  useEffect(() => {
    if (!config) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const actionable = target?.closest('button, a');
      if (!actionable) return;
      const text = actionable.textContent ?? '';
      const next = { ...completed };
      let changed = false;
      for (const task of config.tasks) {
        if (!next[task.id] && taskMatchesClick(task, text)) {
          next[task.id] = true;
          changed = true;
        }
      }
      if (!changed) return;
      setCompleted(next);
      try { window.sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* best effort */ }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [config, completed, storageKey]);

  if (!config) return null;

  const nextTask = config.tasks.find((task) => !completed[task.id] && !task.locked);

  function restartChecklist() {
    try { window.sessionStorage.removeItem(storageKey); } catch { /* best effort */ }
    setCompleted({});
  }

  function refreshAllChecklists() {
    try {
      const keysToRemove: string[] = [];
      for (let index = 0; index < window.sessionStorage.length; index += 1) {
        const key = window.sessionStorage.key(index);
        if (key?.startsWith(CHECKLIST_STORAGE_PREFIX)) keysToRemove.push(key);
      }
      keysToRemove.forEach((key) => window.sessionStorage.removeItem(key));
    } catch {
      // Best effort: checklist state is client-only and must never block the workflow.
    }
    setCompleted({});
  }

  return (
    <>
      <style jsx global>{`
        body:has(.contextual-workflow-checklist) .shell > .main { padding-right: 320px; }
        .contextual-workflow-checklist {
          position: fixed;
          right: 24px;
          top: 142px;
          width: 276px;
          max-height: calc(100vh - 166px);
          overflow-y: auto;
          z-index: 25;
          padding: 14px;
          border: 1px solid var(--line);
          border-radius: 16px;
          background: color-mix(in srgb, var(--surface-card) 96%, transparent);
          box-shadow: 0 18px 50px rgba(0,0,0,.2);
          backdrop-filter: blur(14px);
        }
        .contextual-workflow-header { display:flex; gap:9px; align-items:flex-start; margin-bottom:12px; }
        .contextual-workflow-header-copy { min-width:0; flex:1; }
        .contextual-workflow-title { color:var(--text); font-weight:700; font-size:13px; line-height:1.3; }
        .contextual-workflow-subtitle { color:var(--muted); font-size:11px; line-height:1.45; margin-top:3px; }
        .contextual-workflow-controls { display:flex; gap:4px; flex-shrink:0; }
        .contextual-workflow-control { width:28px; height:28px; display:grid; place-items:center; padding:0; border:1px solid var(--line); border-radius:8px; background:var(--surface-muted); color:var(--muted); cursor:pointer; }
        .contextual-workflow-control:hover { color:var(--text); border-color:var(--accent); background:color-mix(in srgb,var(--accent) 8%,var(--surface-muted)); }
        .contextual-workflow-control:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
        .contextual-workflow-list { display:grid; gap:5px; }
        .contextual-workflow-item { position:relative; display:grid; grid-template-columns:22px 1fr; gap:8px; padding:9px 8px; border-radius:10px; color:var(--muted); }
        .contextual-workflow-item.is-current { color:var(--text); background:color-mix(in srgb,var(--accent) 9%,var(--surface-muted)); border:1px solid color-mix(in srgb,var(--accent) 28%,var(--line)); }
        .contextual-workflow-item.is-done { color:var(--text); }
        .contextual-workflow-item.is-locked { opacity:.62; }
        .contextual-workflow-item + .contextual-workflow-item::before { content:''; position:absolute; left:18px; top:-5px; height:5px; border-left:1px solid var(--line); }
        .contextual-workflow-label { display:block; font-size:12px; font-weight:700; line-height:1.3; }
        .contextual-workflow-detail { display:block; margin-top:3px; color:var(--muted); font-size:10px; line-height:1.45; }
        .contextual-workflow-next { margin-top:11px; padding:10px; border:1px solid color-mix(in srgb,var(--accent-2) 28%,var(--line)); border-radius:11px; background:color-mix(in srgb,var(--accent-2) 7%,var(--surface-muted)); }
        .contextual-workflow-next strong { display:block; color:var(--text); font-size:11px; line-height:1.35; }
        .contextual-workflow-next span { display:block; margin-top:3px; color:var(--muted); font-size:10px; line-height:1.45; }
        @media (max-width: 1260px) {
          body:has(.contextual-workflow-checklist) .shell > .main { padding-right: 28px; }
          .contextual-workflow-checklist { display:none; }
        }
        @media (max-width: 720px) {
          body:has(.contextual-workflow-checklist) .shell > .main { padding-right:16px; }
        }
      `}</style>
      <aside className="contextual-workflow-checklist" aria-label="Contextual workflow checklist">
        <div className="contextual-workflow-header">
          <ClipboardCheck size={16} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div className="contextual-workflow-header-copy">
            <div className="contextual-workflow-title">{config.title}</div>
            <div className="contextual-workflow-subtitle">{config.subtitle}</div>
          </div>
          <div className="contextual-workflow-controls">
            <button type="button" className="contextual-workflow-control" onClick={restartChecklist} aria-label="Restart this checklist" title="Restart this checklist">
              <RotateCcw size={14} />
            </button>
            <button type="button" className="contextual-workflow-control" onClick={refreshAllChecklists} aria-label="Refresh all checklists" title="Refresh all checklists">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div className="contextual-workflow-list">
          {config.tasks.map((task, index) => {
            const done = Boolean(completed[task.id]);
            const current = !done && !config.tasks.slice(0, index).some((item) => !completed[item.id] && !item.locked);
            return (
              <div className={`contextual-workflow-item${done ? ' is-done' : current ? ' is-current' : ''}${task.locked ? ' is-locked' : ''}`} key={task.id}>
                <span aria-hidden="true">
                  {done ? <CheckCircle2 size={15} color="var(--text-success)" /> : task.locked ? <LockKeyhole size={14} color="var(--muted)" /> : <Circle size={15} color={current ? 'var(--accent)' : 'var(--muted)'} />}
                </span>
                <span>
                  <span className="contextual-workflow-label">{task.title}</span>
                  <span className="contextual-workflow-detail">{task.detail}</span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="contextual-workflow-next">
          <strong>{nextTask?.title ?? 'Phase guidance complete'}</strong>
          <span>{nextTask?.detail ?? 'The current page has no more required guidance. Continue using the main workflow controls.'}</span>
        </div>
      </aside>
    </>
  );
}
