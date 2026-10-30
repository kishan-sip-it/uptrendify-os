'use client';

import { AlertCircle, CheckCircle2, Circle, ClipboardCheck, LockKeyhole, RefreshCw, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getChecklistTaskState, isServerDrivenChecklistTask, type ChecklistResourceState, type ChecklistSignals } from '@/lib/workflow/checklist-state';

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

const CHECKLIST_STORAGE_PREFIX = 'uptrendify:contextual-checklist:v2:';

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
  const [signals, setSignals] = useState<ChecklistSignals | null>(null);
  const [resource, setResource] = useState<ChecklistResourceState | null>(null);
  const [syncState, setSyncState] = useState<'checking' | 'live' | 'offline'>('checking');
  const [checklistOpen, setChecklistOpen] = useState(false);
  const checklistToggleRef = useRef<HTMLButtonElement | null>(null);
  const [refreshingChecklist, setRefreshingChecklist] = useState(false);
  const [controlMessage, setControlMessage] = useState<string | null>(null);
  const closeChecklist = useCallback(() => {
    setChecklistOpen(false);
    window.requestAnimationFrame(() => checklistToggleRef.current?.focus());
  }, []);
  type RefreshResult = { active: boolean; successful: boolean };
  const refreshRef = useRef<() => Promise<RefreshResult>>(async () => ({ active: false, successful: false }));
  const brandId = pathname.match(/^\/brands\/([^/]+)/)?.[1] ?? null;
  const contentIdMatch = pathname.match(/^\/brands\/[^/]+\/content\/([^/]+)$/);
  const contentId = contentIdMatch?.[1] && contentIdMatch[1] !== 'new' ? contentIdMatch[1] : null;
  const campaignMatch = pathname.match(/^\/brands\/([^/]+)\/campaigns\/([^/]+)$/);
  const campaignId = campaignMatch && campaignMatch[2] !== 'new' ? campaignMatch[2] : null;

  useEffect(() => {
    setChecklistOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!checklistOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeChecklist();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [checklistOpen, closeChecklist, pathname]);

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
    setSignals(null);
    setResource(null);
    setSyncState('checking');
  }, [pathname, brandId, contentId, campaignId]);

  const refreshChecklistData = useCallback(async (): Promise<RefreshResult> => {
    const requests: Promise<void>[] = [];
    let active = false;
    let successfulReads = 0;

    const workflowUrl = brandId
      ? '/api/workflow?brandId=' + encodeURIComponent(brandId)
      : '/api/workflow';

    requests.push((async () => {
      try {
        const response = await fetch(workflowUrl, { cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json() as {
          currentBrandId?: string | null;
          checklistSignals?: ChecklistSignals;
        };
        if (window.location.pathname !== pathname) return;
        if (brandId && body.currentBrandId !== brandId) return;
        if (body.checklistSignals) {
          setSignals(body.checklistSignals);
          active = active ||
            body.checklistSignals.researchActive ||
            body.checklistSignals.strategyActive;
        }
        successfulReads += 1;
      } catch {
        // A transient read failure must not interrupt the actual workflow.
      }
    })());

    if (contentId && brandId) {
      requests.push((async () => {
        try {
          const response = await fetch('/api/brands/' + encodeURIComponent(brandId) + '/content/' + encodeURIComponent(contentId), { cache: 'no-store' });
          if (!response.ok) return;
          const body = await response.json() as {
            item?: { status?: string | null };
            generation?: { status?: string | null } | null;
            versions?: unknown[];
          };
          if (window.location.pathname !== pathname) return;
          const generationStatus = body.generation?.status ?? null;
          setResource((current) => ({
            ...current,
            content: {
              status: body.item?.status ?? null,
              generationStatus,
              versionCount: Array.isArray(body.versions) ? body.versions.length : 0,
            },
          }));
          active = active || ['QUEUED', 'RUNNING'].includes((generationStatus ?? '').toUpperCase());
          successfulReads += 1;
        } catch {
          // Checklist status is advisory; keep the page usable when a read fails.
        }
      })());
    } else if (campaignId && brandId) {
      requests.push((async () => {
        try {
          const response = await fetch('/api/brands/' + encodeURIComponent(brandId) + '/campaigns/' + encodeURIComponent(campaignId), { cache: 'no-store' });
          if (!response.ok) return;
          const body = await response.json() as {
            campaign?: { status?: string | null; strategies?: unknown[] };
            content?: unknown[];
            contentItems?: unknown[];
            items?: unknown[];
          };
          if (window.location.pathname !== pathname) return;
          const campaign = body.campaign;
          const linkedContent = body.contentItems ?? body.content ?? body.items ?? [];
          setResource((current) => ({
            ...current,
            campaign: {
              status: campaign?.status ?? null,
              contentCount: Array.isArray(linkedContent) ? linkedContent.length : 0,
              strategyCount: Array.isArray(campaign?.strategies) ? campaign.strategies.length : 0,
            },
          }));
          successfulReads += 1;
        } catch {
          // Retain previously loaded resource status on transient errors.
        }
      })());
    }

    await Promise.all(requests);
    setSyncState(successfulReads > 0 ? 'live' : 'offline');
    return { active, successful: successfulReads > 0 };
  }, [brandId, campaignId, contentId, pathname]);

  useEffect(() => {
    refreshRef.current = refreshChecklistData;
  }, [refreshChecklistData]);

  useEffect(() => {
    if (!config) return;
    let stopped = false;
    let timer: number | null = null;

    const tick = async () => {
      if (document.hidden) {
        if (!stopped) timer = window.setTimeout(tick, 10000);
        return;
      }
      const result = await refreshRef.current();
      if (stopped) return;
      timer = window.setTimeout(tick, result.active ? 2400 : 6000);
    };

    const refreshAfterInteraction = () => {
      if (stopped) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void refreshRef.current().then((result) => {
          if (!stopped) timer = window.setTimeout(tick, result.active ? 2400 : 6000);
        });
      }, 450);
    };

    const onVisibilityChange = () => {
      if (!document.hidden) refreshAfterInteraction();
    };

    document.addEventListener('click', refreshAfterInteraction, true);
    document.addEventListener('submit', refreshAfterInteraction, true);
    document.addEventListener('change', refreshAfterInteraction, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    void tick();

    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('click', refreshAfterInteraction, true);
      document.removeEventListener('submit', refreshAfterInteraction, true);
      document.removeEventListener('change', refreshAfterInteraction, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [config, pathname]);

  useEffect(() => {
    if (!config) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.closest('.contextual-workflow-checklist')) return;
      const actionable = target.closest('button, a');
      if (!actionable) return;
      const text = actionable.textContent ?? '';
      const next = { ...completed };
      let changed = false;
      for (const task of config.tasks) {
        if (isServerDrivenChecklistTask(task.id)) continue;
        if (!next[task.id] && taskMatchesClick(task, text)) {
          next[task.id] = true;
          changed = true;
          break;
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

  const stateContext = { pathname, view, signals, resource };
  const nextTask = config.tasks.find((task) =>
    getChecklistTaskState(task.id, stateContext) === 'running',
  ) ?? config.tasks.find((task) => {
    const derived = getChecklistTaskState(task.id, stateContext);
    const done = derived === 'done' || (derived === null && Boolean(completed[task.id]));
    return !done && !task.locked;
  });

  async function refreshWholeChecklist() {
    if (refreshingChecklist) return;
    setRefreshingChecklist(true);
    setControlMessage('Refreshing the complete live checklist…');
    try {
      const result = await refreshRef.current();
      const time = new Date().toLocaleTimeString();
      setControlMessage(result.successful
        ? 'Whole checklist status refreshed at ' + time + '.'
        : 'Live workflow data could not be reached. Automatic retries remain enabled.');
    } catch {
      setControlMessage('The checklist refresh failed. Automatic retries remain enabled.');
    } finally {
      setRefreshingChecklist(false);
    }
  }

  async function resetCurrentChecklistProgress() {
    if (refreshingChecklist) return;
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Manual checklist state is best-effort and must never block the workflow.
    }
    setCompleted({});
    setRefreshingChecklist(true);
    setControlMessage('Manual progress for this checklist reset. Refreshing live status…');
    try {
      const result = await refreshRef.current();
      const time = new Date().toLocaleTimeString();
      setControlMessage(result.successful
        ? 'This checklist reset; live status refreshed at ' + time + '.'
        : 'This checklist reset. Live status is unavailable; automatic retries remain enabled.');
    } catch {
      setControlMessage('This checklist reset. Live status refresh failed; automatic retries remain enabled.');
    } finally {
      setRefreshingChecklist(false);
    }
  }

  return (
    <>
      <aside id="contextual-workflow-checklist" className={"contextual-workflow-checklist" + (checklistOpen ? " is-open" : "")} aria-label="Contextual workflow checklist">
        <div className="contextual-workflow-header">
          <ClipboardCheck size={16} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div className="contextual-workflow-header-copy">
            <div className="contextual-workflow-title">{config.title}</div>
            <div className="contextual-workflow-subtitle">{config.subtitle}</div>
            <div className={'contextual-workflow-sync is-' + syncState} role="status" aria-live="polite">
              {syncState === 'live' ? 'Synced with live workflow status' : syncState === 'offline' ? 'Live status unavailable · retrying automatically' : 'Checking live workflow status…'}
            </div>
            {controlMessage ? <div className="contextual-workflow-sync" role="status" aria-live="polite">{controlMessage}</div> : null}
          </div>
          <div className="contextual-workflow-controls">
            <button type="button" className="contextual-workflow-control" onClick={() => void resetCurrentChecklistProgress()} disabled={refreshingChecklist} aria-label="Reset manual progress for this checklist" title="Reset this checklist">
              <RotateCcw size={14} />
            </button>
            <button type="button" className="contextual-workflow-control" onClick={() => void refreshWholeChecklist()} disabled={refreshingChecklist} aria-label="Refresh the complete live workflow checklist" title="Refresh whole checklist">
              <RefreshCw size={14} className={refreshingChecklist ? 'spin' : undefined} />
            </button>
          </div>
        </div>
        <div className="contextual-workflow-list">
          {config.tasks.map((task, index) => {
            const derived = getChecklistTaskState(task.id, stateContext);
            const done = derived === 'done' || derived === 'running' || (derived === null && Boolean(completed[task.id]));
            const failed = derived === 'failed';
            const previousPending = config.tasks.slice(0, index).some((item) => {
              const previousState = getChecklistTaskState(item.id, stateContext);
              const previousDone = previousState === 'done' || previousState === 'running' ||
                (previousState === null && Boolean(completed[item.id]));
              return !previousDone && !item.locked;
            });
            const current = !done && !failed && !previousPending && !task.locked;
            return (
              <div className={'contextual-workflow-item' +
                (done ? ' is-done' : current ? ' is-current' : '') +
                (derived === 'running' ? ' is-running' : '') +
                (failed ? ' is-failed' : '') +
                (task.locked ? ' is-locked' : '')} key={task.id}>
                <span aria-hidden="true">
                  {done ? <CheckCircle2 size={15} color={derived === 'running' ? 'var(--accent)' : 'var(--text-success)'} /> :
                    failed ? <AlertCircle size={15} color="var(--status-danger, #dc2626)" /> :
                    task.locked ? <LockKeyhole size={14} color="var(--muted)" /> :
                    <Circle size={15} color={current ? 'var(--accent)' : 'var(--muted)'} />}
                </span>
                <span>
                  <span className="contextual-workflow-label">{task.title}</span>
                  {derived === 'running' && <span className="contextual-workflow-state is-running">Running · updates automatically</span>}
                  {failed && <span className="contextual-workflow-state is-failed">Last attempt failed · retry to continue</span>}
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
      <button
        type="button"
        className="contextual-workflow-toggle"
        ref={checklistToggleRef}
        onClick={() => setChecklistOpen((open) => !open)}
        aria-controls="contextual-workflow-checklist"
        aria-expanded={checklistOpen}
        aria-label={checklistOpen ? 'Close workflow checklist' : 'Open workflow checklist'}
        title={checklistOpen ? 'Close workflow checklist' : 'Open workflow checklist'}
      >
        {checklistOpen ? <X size={16} /> : <ClipboardCheck size={16} />}
        <span>{checklistOpen ? 'Close checklist' : 'Workflow checklist'}</span>
      </button>
    </>
  );
}
