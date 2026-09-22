'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

export type GuidedTourStep = { target?: string; title: string; body: string };

export function GuidedTour({ stageKey, steps, tourVersion = 1 }: { stageKey: string; steps: GuidedTourStep[]; tourVersion?: number }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tours?stageKey=' + encodeURIComponent(stageKey), { cache: 'no-store' })
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setOpen(!body?.state);
      })
      .catch(() => undefined);
    const onLayout = () => setTick((v) => v + 1);
    window.addEventListener('resize', onLayout);
    window.addEventListener('scroll', onLayout, true);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onLayout);
      window.removeEventListener('scroll', onLayout, true);
    };
  }, [stageKey]);

  if (!open || !steps[index]) return null;
  void tick;

  const step = steps[index];
  const target = step.target ? document.querySelector(step.target) : null;
  const rect = target?.getBoundingClientRect() ?? null;
  const cardStyle: React.CSSProperties = rect
    ? {
        position: 'fixed',
        zIndex: 2002,
        width: 'min(390px, calc(100vw - 32px))',
        top: Math.min(window.innerHeight - 245, Math.max(16, rect.bottom + 14)),
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

  async function close(status: 'SKIPPED' | 'COMPLETED') {
    setOpen(false);
    await fetch('/api/tours', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stageKey, tourVersion, status }),
    }).catch(() => undefined);
  }

  return (
    <>
      <div className="tour-backdrop" aria-hidden="true" />
      {rect ? (
        <div
          className="tour-highlight"
          style={{ top: rect.top - 7, left: rect.left - 7, width: rect.width + 14, height: rect.height + 14 }}
          aria-hidden="true"
        />
      ) : null}
      <section className="tour-card" style={cardStyle} role="dialog" aria-modal="true" aria-label={'Guide step ' + (index + 1) + ' of ' + steps.length}>
        <div className="tour-card-top">
          <span className="eyebrow">Guide · {index + 1}/{steps.length}</span>
          <button type="button" className="tour-close" onClick={() => close('SKIPPED')} aria-label="Skip guide"><X size={15} /></button>
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-card-actions">
          <button type="button" className="tour-link" disabled={index === 0} onClick={() => setIndex((v) => Math.max(0, v - 1))}><ArrowLeft size={14} /> Back</button>
          <button type="button" className="tour-link skip" onClick={() => close('SKIPPED')}>Skip</button>
          {index < steps.length - 1 ? (
            <button type="button" className="tour-primary" onClick={() => setIndex((v) => v + 1)}>Next <ArrowRight size={14} /></button>
          ) : (
            <button type="button" className="tour-primary" onClick={() => close('COMPLETED')}>Done</button>
          )}
        </div>
      </section>
    </>
  );
}
