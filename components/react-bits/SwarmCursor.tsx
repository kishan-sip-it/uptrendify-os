'use client';

import { useEffect, useRef, type CSSProperties } from 'react';

import './SwarmCursor.css';

const PARTICLE_COUNT = 12;

type Point = { x: number; y: number; vx: number; vy: number };

export default function SwarmCursor({ color = '#A855F7', opacity = 0.32 }: { color?: string; opacity?: number }) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined') return;

    const particles = Array.from(root.querySelectorAll<HTMLElement>('.swarm-cursor__particle'));
    const points: Point[] = particles.map((_, index) => ({
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.5,
      vx: 0,
      vy: 0,
    }));
    let targetX = window.innerWidth * 0.5;
    let targetY = window.innerHeight * 0.5;
    let raf = 0;
    let active = false;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    if (reduceMotion) {
      root.hidden = true;
      return () => undefined;
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      targetX = event.clientX;
      targetY = event.clientY;
      active = true;
    };

    const onPointerLeave = () => {
      active = false;
    };

    const render = () => {
      const base = active ? 0.18 : 0.055;

      points.forEach((point, index) => {
        const leader = index === 0;
        const target = leader
          ? { x: targetX, y: targetY }
          : points[index - 1];

        const spring = leader ? base : 0.09 - index * 0.004;
        point.vx += (target.x - point.x) * spring;
        point.vy += (target.y - point.y) * spring;
        point.vx *= 0.72;
        point.vy *= 0.72;
        point.x += point.vx;
        point.y += point.vy;

        const scale = 1 - index * 0.045;
        const size = 1 - index / PARTICLE_COUNT;
        const opacityValue = (0.85 - index / (PARTICLE_COUNT * 1.15)) * opacity;
        particles[index].style.transform = `translate(${point.x}px, ${point.y}px) scale(${scale})`;
        particles[index].style.opacity = String(Math.max(0, opacityValue * size));
      });

      raf = window.requestAnimationFrame(render);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);
    raf = window.requestAnimationFrame(render);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.cancelAnimationFrame(raf);
    };
  }, [opacity]);

  return (
    <div ref={rootRef} className="swarm-cursor" aria-hidden="true">
      {Array.from({ length: PARTICLE_COUNT }, (_, index) => (
        <span
          key={index}
          className="swarm-cursor__particle"
          style={{ '--particle-index': String(index), background: color } as CSSProperties}
        />
      ))}
    </div>
  );
}
