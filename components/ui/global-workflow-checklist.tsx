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
      subtitle: 'The checklist changes with the working surface, so it tells you what to click next instead of repeating the whole lifecycle.',
      tasks: [
        { id: 'dashboard-brands', title: 'Open Brands', detail: 'Choose the brand you want to work on.', matches: ['Brands'] },
        { id: 'dashboard-brand', title: 'Open the brand workspace', detail: 'Start with Research before moving into Brand Brain.', matches: ['Open brand workspace'] },
      ],
    };
  }

  if (brandId && view === 'brain') {
    return {
      title: 'Brand Brain · next actions',
      subtitle: 'Review the suggestions here. Do not skip the human approval gate.',
      tasks: [
        { id: 'brain-review', title: 'Review the current suggestions', detail: 'Inspect the evidence and edit anything that needs correction.' },
        { id: 'brain-approve', title: 'Approve or edit the required findings', detail: 'Approved findings become authoritative brand rules for downstream generation.', matches: ['Approve', 'Save changes'] },
        { id: 'brain-strategy', title: 'Click “Continue to Strategy”', detail: 'After the required findings are approved, continue into the Strategy workspace.', matches: ['Continue to Strategy'] },
      ],
    };
  }

  if (brandId && view === 'strategy') {
    return {
      title: 'Strategy · next actions',
      subtitle: 'This checklist follows the strategy page, not the whole product lifecycle.',
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
      subtitle: 'Start here, then follow the page-specific guidance as the workflow advances.',
      tasks: [
        { id: 'brand-research', title: 'Run Research', detail: 'Start the evidence collection for this brand.', matches: ['Run research', 'Start research'] },
        { id: 'brand-brain', title: 'Open Brand Brain', detail: 'When Research is ready, review the generated intelligence.', matches: ['Brand Brain'] },
        { id: 'brand-strategy', title: 'Open Strategy after approval', detail: 'Do not generate strategy until the required Brand Brain findings are approved.', matches: ['Strategy'] },
      ],
    };
  }

  if (brandId && pathname.endsWith('/campaigns/new')) {
    return {
      title: 'New campaign · next actions',
      subtitle: 'Only campaign-specific inputs are needed here. Brand rules continue to ground downstream work.',
      tasks: [
        { id: 'campaign-ground', title: 'Choose an approved strategy', detail: 'Select at least one approved strategy to ground the campaign.', matches: ['approved strategies'] },
        { id: 'campaign-create', title: 'Create the campaign', detail: 'Leave optional fields blank when the approved brand rules already provide enough context.', matches: ['Create campaign'] },
        { id: 'campaign-plan', title: 'After creation, move it to Planned', detail: 'Open the new campaign, confirm its details, then move Draft → Planned when it is ready for content creation.', locked: true },
        { id: 'campaign-content', title: 'Click “Create content for this campaign”', detail: 'That is the handoff from campaign planning into Content Studio.', locked: true },
      ],
    };
  }

  if (campaignMatch && brandId) {
    return {
      title: 'Campaign · next actions',
      subtitle: 'This is the execution handoff. Follow the highlighted action instead of hunting through the page.',
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
      subtitle: 'Build the brief here. The next decision happens on the content detail page.',
      tasks: [
        { id: 'content-brief', title: 'Create the content brief', detail: 'Use the campaign context and leave optional fields blank when approved brand rules already cover them.', matches: ['Create content'] },
        { id: 'content-return', title: 'Return to the campaign', detail: 'After creation, the app returns you to the linked campaign. That is expected.', locked: true },
        { id: 'content-open-detail', title: 'Open the created content', detail: 'From the campaign, click the content item to enter Content Detail and generate the version.', locked: true },
      ],
    };
  }

  if (contentMatch && brandId) {
    return {
      title: 'Content detail · next actions',
      subtitle: 'This page creates and prepares the exact version. Final approval stays in Approvals.',
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
      subtitle: 'This is the human decision boundary. Approve the exact version before queueing it for publishing.',
      tasks: [
        { id: 'approval-preview', title: 'Open the content preview', detail: 'Inspect the rendered channel preview before making the decision.', matches: ['Preview'] },
        { id: 'approval-approve', title: 'Approve the exact version', detail: 'Use the approval action on the version you reviewed.', matches: ['Approve'] },
        { id: 'approval-queue', title: 'Queue the approved version for publishing', detail: 'After approval, move it into the publishing queue.', matches: ['Queue for publishing'] },
        { id: 'publishing-preview', title: 'Open the publishing preview', detail: 'Check the selected channel and final rendered output.', matches: ['Preview'] },
        { id: 'publishing-confirm', title: 'Confirm publish to the connected channel', detail: 'Publishing must report a real outcome. It never silently succeeds.', matches: ['Confirm publish', 'Publish'] },
      ],
    };
  }

  if (pathname === '/campaigns' || pathname.startsWith('/content')) {
    return {
      title: 'Workspace · next actions',
      subtitle: 'Use the contextual brand workspace when you need the campaign or content-specific handoff.',
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
