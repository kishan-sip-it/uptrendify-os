'use client';

import { CheckCircle2, Circle, ClipboardCheck, LockKeyhole } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const WORKFLOW = [
  { key: 'research', label: 'Research', description: 'Understand the business from its public evidence.' },
  { key: 'brain', label: 'Brand Brain', description: 'Review and approve the evidence-backed brand rules.' },
  { key: 'strategy', label: 'Strategy', description: 'Turn approved intelligence into an executable plan.' },
  { key: 'campaign', label: 'Campaign', description: 'Plan the initiative and move it to Planned.' },
  { key: 'content', label: 'Content', description: 'Create the exact content version for the campaign.' },
  { key: 'approval', label: 'Approval', description: 'Approve the exact version before publishing.' },
  { key: 'publishing', label: 'Publishing', description: 'Preview, queue and publish through the connected channel.' },
] as const;

type Stage = (typeof WORKFLOW)[number]['key'];

function resolveStage(pathname: string, view: string | null): Stage | null {
  if (pathname === '/dashboard' || pathname === '/brands' || pathname.startsWith('/brands/')) {
    if (view === 'brain') return 'brain';
    if (view === 'strategy') return 'strategy';
    if (/\/brands\/[^/]+\/campaigns(?:\/|$)/.test(pathname)) return 'campaign';
    if (/\/brands\/[^/]+\/content(?:\/|$)/.test(pathname) || pathname.startsWith('/content')) return 'content';
    return 'research';
  }
  if (pathname === '/campaigns' || pathname.startsWith('/campaigns/')) return 'campaign';
  if (pathname.startsWith('/approvals')) return 'approval';
  if (pathname.startsWith('/settings')) return null;
  if (pathname.startsWith('/content')) return 'content';
  return null;
}

function stageIndex(stage: Stage): number {
  return WORKFLOW.findIndex((item) => item.key === stage);
}

export function GlobalWorkflowChecklist() {
  const pathname = usePathname();
  const [view, setView] = useState<string | null>(null);

  useEffect(() => {
    const syncView = () => setView(new URLSearchParams(window.location.search).get('view'));
    syncView();
    window.addEventListener('popstate', syncView);
    window.addEventListener('hashchange', syncView);
    return () => {
      window.removeEventListener('popstate', syncView);
      window.removeEventListener('hashchange', syncView);
    };
  }, [pathname]);

  const stage = resolveStage(pathname, view);
  const show = Boolean(stage);
  const currentIndex = stage ? stageIndex(stage) : -1;
  const brandMatch = pathname.match(/^\/brands\/([^/]+)/);
  const brandId = brandMatch?.[1] ?? null;

  const hrefFor = (key: Stage): string | null => {
    if (key === 'research') return brandId ? `/brands/${brandId}` : '/brands';
    if (key === 'brain') return brandId ? `/brands/${brandId}?view=brain` : '/brands';
    if (key === 'strategy') return brandId ? `/brands/${brandId}?view=strategy` : '/brands';
    if (key === 'campaign') return brandId ? `/brands/${brandId}/campaigns` : '/campaigns';
    if (key === 'content') return brandId ? `/brands/${brandId}/content` : '/content';
    if (key === 'approval' || key === 'publishing') return '/approvals';
    return null;
  };

  const nextAction = stage === 'research'
    ? { title: 'Next: review Brand Brain', detail: 'Run research first, then move into the reviewable intelligence step.', href: hrefFor('brain') }
    : stage === 'brain'
      ? { title: 'Next: generate Strategy', detail: 'Approve or edit the required findings before generating strategy.', href: hrefFor('strategy') }
      : stage === 'strategy'
        ? { title: 'Next: create a Campaign', detail: 'Use an approved strategy to create the execution container.', href: hrefFor('campaign') }
        : stage === 'campaign'
          ? { title: 'Next: move to Planned, then create Content', detail: 'Keep the campaign in Draft while planning. Move it to Planned when ready, then create content.', href: brandId ? `/brands/${brandId}/campaigns` : '/campaigns' }
          : stage === 'content'
            ? { title: 'Next: generate a version, then send it to Approval', detail: 'Final approval belongs in the Approval Queue, not in Content detail.', href: hrefFor('approval') }
            : stage === 'approval'
              ? { title: 'Next: queue the approved version for Publishing', detail: 'Approve the exact version you reviewed, then use the publishing preview/queue.', href: hrefFor('publishing') }
              : { title: 'Publishing', detail: 'Confirm the connected channel and publish only the approved version.', href: hrefFor('publishing') };

  return (
    <>
      <style jsx global>{`
        body:has(.workflow-checklist) .shell > .main { padding-left: 274px; }
        .workflow-checklist {
          position: fixed;
          left: 266px;
          top: 142px;
          width: 228px;
          max-height: calc(100vh - 170px);
          overflow-y: auto;
          z-index: 25;
          padding: 14px;
          border: 1px solid var(--line);
          border-radius: 16px;
          background: color-mix(in srgb, var(--surface-card) 94%, transparent);
          box-shadow: 0 18px 50px rgba(0,0,0,.2);
          backdrop-filter: blur(14px);
        }
        .workflow-checklist-header { display:flex; gap:9px; align-items:flex-start; margin-bottom:12px; }
        .workflow-checklist-title { color:var(--text); font-weight:700; font-size:13px; line-height:1.3; }
        .workflow-checklist-subtitle { color:var(--muted); font-size:11px; line-height:1.45; margin-top:3px; }
        .workflow-checklist-list { display:grid; gap:4px; }
        .workflow-checklist-item { position:relative; display:grid; grid-template-columns:22px 1fr; gap:8px; padding:8px 7px; border-radius:10px; color:var(--muted); }
        .workflow-checklist-item.is-reached { color:var(--text); }
        .workflow-checklist-item.is-current { background:color-mix(in srgb, var(--accent) 10%, var(--surface-muted)); border:1px solid color-mix(in srgb, var(--accent) 30%, var(--line)); }
        .workflow-checklist-item.is-future { opacity:.7; }
        .workflow-checklist-item + .workflow-checklist-item::before { content:''; position:absolute; left:17px; top:-4px; height:4px; border-left:1px solid var(--line); }
        .workflow-checklist-link { color:inherit; text-decoration:none; display:block; min-width:0; }
        .workflow-checklist-link:hover .workflow-checklist-label { color:var(--text); }
        .workflow-checklist-label { font-size:12px; font-weight:700; line-height:1.25; }
        .workflow-checklist-description { display:block; margin-top:2px; font-size:10px; line-height:1.4; color:var(--muted); }
        .workflow-checklist-next { margin-top:11px; padding:10px; border:1px solid color-mix(in srgb, var(--accent-2) 28%, var(--line)); border-radius:11px; background:color-mix(in srgb, var(--accent-2) 7%, var(--surface-muted)); }
        .workflow-checklist-next strong { display:block; color:var(--text); font-size:11px; line-height:1.35; }
        .workflow-checklist-next span { display:block; margin-top:3px; color:var(--muted); font-size:10px; line-height:1.45; }
        .workflow-checklist-next a { display:inline-flex; margin-top:7px; color:var(--accent); font-size:10px; font-weight:700; text-decoration:none; }
        .workflow-checklist-next a:hover { text-decoration:underline; }
        .phase-briefing { animation: phase-flash-in .22s ease-out both, phase-flash-out .35s ease-in 6s forwards !important; }
        @keyframes phase-flash-out { to { opacity:0; transform:translateY(-8px) scale(.985); visibility:hidden; pointer-events:none; } }
        @media (max-width: 1199px) {
          body:has(.workflow-checklist) .shell > .main { padding-left: 28px; }
          .workflow-checklist { display:none; }
        }
        @media (max-width: 720px) {
          body:has(.workflow-checklist) .shell > .main { padding-left:16px; }
        }
      `}</style>
      {show ? (
        <aside className="workflow-checklist" aria-label="UpTrendifyOS workflow checklist">
          <div className="workflow-checklist-header">
            <ClipboardCheck size={16} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div className="workflow-checklist-title">Workflow checklist</div>
              <div className="workflow-checklist-subtitle">Your position in the full marketing flow. Backend gates still decide what is actually available.</div>
            </div>
          </div>
          <div className="workflow-checklist-list">
            {WORKFLOW.map((item, index) => {
              const reached = index <= currentIndex;
              const current = index === currentIndex;
              const href = hrefFor(item.key);
              const icon = reached ? <CheckCircle2 size={15} color={current ? 'var(--accent)' : 'var(--text-success)'} /> : <Circle size={15} color="var(--muted)" />;
              const content = <><span className="workflow-checklist-label">{item.label}{current ? ' · current' : ''}</span><span className="workflow-checklist-description">{item.description}</span></>;
              return (
                <div className={`workflow-checklist-item${reached ? ' is-reached' : ' is-future'}${current ? ' is-current' : ''}`} key={item.key} aria-current={current ? 'step' : undefined}>
                  <span>{icon}</span>
                  {href && index <= currentIndex ? <a className="workflow-checklist-link" href={href}>{content}</a> : <span className="workflow-checklist-link">{content}{index > currentIndex ? <LockKeyhole size={10} style={{ marginTop:4, color:'var(--muted)' }} /> : null}</span>}
                </div>
              );
            })}
          </div>
          <div className="workflow-checklist-next">
            <strong>{nextAction.title}</strong>
            <span>{nextAction.detail}</span>
            {nextAction.href ? <a href={nextAction.href}>Open next workspace →</a> : null}
          </div>
        </aside>
      ) : null}
    </>
  );
}
