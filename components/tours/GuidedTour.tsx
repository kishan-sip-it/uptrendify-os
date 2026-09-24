'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';

export type GuidedTourStep = { target?: string; title: string; body: string; actionLabel?: string };

export function GuidedTour({
  stageKey,
  steps,
  tourVersion = 1,
}: {
  stageKey: string;
  steps: GuidedTourStep[];
  tourVersion?: number;
}) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!open || !steps[index]?.target) return;

    const target = document.querySelector(steps[index].target);
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const safeTop = 128;
    const safeBottom = window.innerHeight - 180;

    if (rect.top < safeTop || rect.bottom > safeBottom) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }
  }, [open, index, stageKey, steps]);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/tours?stageKey=' + encodeURIComponent(stageKey), { cache: 'no-store' })
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setOpen(!body?.state);
      })
      .catch(() => undefined);

    const onLayout = () => setTick((value) => value + 1);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      void fetch('/api/tours', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stageKey, tourVersion, status: 'SKIPPED' }),
      }).catch(() => undefined);
    };

    window.addEventListener('resize', onLayout);
    window.addEventListener('scroll', onLayout, true);
    window.addEventListener('keydown', onKey);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', onLayout);
      window.removeEventListener('scroll', onLayout, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [stageKey, tourVersion]);

  if (!open || !steps[index]) return null;
  void tick;

  const step = steps[index];
  const target = step.target ? document.querySelector(step.target) : null;
  const rect = target?.getBoundingClientRect() ?? null;
  const placement = rect && rect.bottom + 285 > window.innerHeight && rect.top > 320 ? 'above' : 'below';
  const progress = Math.round(((index + 1) / Math.max(1, steps.length)) * 100);

  const cardStyle: React.CSSProperties = rect
    ? {
        position: 'fixed',
        zIndex: 2002,
        width: 'min(390px, calc(100vw - 32px))',
        top: placement === 'below'
          ? Math.min(window.innerHeight - 270, Math.max(16, rect.bottom + 17))
          : Math.max(16, rect.top - 260),
        left: Math.min(window.innerWidth - 406, Math.max(16, rect.left)),
      }
    : {
        position: 'fixed',
        zIndex: 2002,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(410px, calc(100vw - 32px))',
      };

  async function persist(status: 'SKIPPED' | 'COMPLETED') {
    setOpen(false);
    await fetch('/api/tours', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stageKey, tourVersion, status }),
    }).catch(() => undefined);
  }

  const next = () => {
    if (index < steps.length - 1) {
      setIndex((value) => value + 1);
    } else {
      void persist('COMPLETED');
    }
  };

  return (
    <>
      <div className="tour-backdrop" aria-hidden="true" />
      {rect ? (
        <>
          <div
            className="tour-highlight"
            style={{ top: rect.top - 7, left: rect.left - 7, width: rect.width + 14, height: rect.height + 14 }}
            aria-hidden="true"
          />
          <div
            className={'tour-pointer ' + placement}
            style={{
              left: Math.min(window.innerWidth - 28, Math.max(28, rect.left + rect.width / 2)),
              top: placement === 'below' ? rect.bottom + 9 : rect.top - 9,
            }}
            aria-hidden="true"
          />
        </>
      ) : null}

      <section
        className="tour-card"
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-label={'Guide step ' + (index + 1) + ' of ' + steps.length}
      >
        <div className="tour-progress-track"><span style={{ width: progress + '%' }} /></div>
        <div className="tour-card-top">
          <span className="eyebrow">Guide · {index + 1}/{steps.length}</span>
          <button type="button" className="tour-close" onClick={() => void persist('SKIPPED')} aria-label="Skip guide"><X size={15} /></button>
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        {step.actionLabel ? <div className="tour-action-hint"><Check size={13} /> {step.actionLabel}</div> : null}
        <div className="tour-card-actions">
          <button type="button" className="tour-link" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}><ArrowLeft size={14} /> Back</button>
          <button type="button" className="tour-link skip" onClick={() => void persist('SKIPPED')}>Skip</button>
          <button type="button" className="tour-primary" onClick={next}>
            {index < steps.length - 1 ? <>Next <ArrowRight size={14} /></> : <>Done <Check size={14} /></>}
          </button>
        </div>
      </section>
    </>
  );
}
