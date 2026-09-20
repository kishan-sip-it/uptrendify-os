'use client';

import { useRef } from 'react';

import './WarpText.css';

type WarpTextProps = {
  text: string;
  color?: string;
  fontSize?: string;
  fontWeight?: number;
  warpStrength?: number;
  speed?: number;
  pointerStrength?: number;
  className?: string;
};

export default function WarpText({
  text,
  color = '#f8f5ff',
  fontSize = 'clamp(2.5rem, 6vw, 5rem)',
  fontWeight = 800,
  warpStrength = 0.05,
  speed = 0.4,
  pointerStrength = 0.3,
  className = '',
}: WarpTextProps) {
  const rootRef = useRef<HTMLHeadingElement | null>(null);

  function handlePointerMove(event: React.PointerEvent<HTMLHeadingElement>) {
    const root = rootRef.current;
    if (!root || event.pointerType === 'touch') return;

    const words = root.querySelectorAll<HTMLElement>('.warp-text__word');
    const rect = root.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const maxDistance = Math.max(rect.width, rect.height) * 0.65;
    const strength = Math.min(0.12, Math.max(0, warpStrength)) * (0.4 + pointerStrength);

    words.forEach((word) => {
      const wordRect = word.getBoundingClientRect();
      const cx = wordRect.left - rect.left + wordRect.width / 2;
      const cy = wordRect.top - rect.top + wordRect.height / 2;
      const dx = cx - px;
      const dy = cy - py;
      const distance = Math.hypot(dx, dy);
      const influence = Math.max(0, 1 - distance / maxDistance);

      if (influence <= 0) {
        word.style.setProperty('--warp-x', '0px');
        word.style.setProperty('--warp-y', '0px');
        word.style.setProperty('--warp-rotate', '0deg');
        word.style.setProperty('--warp-scale', '1');
        return;
      }

      const safeDistance = Math.max(distance, 1);
      const amount = influence * influence * 36 * strength;
      const tx = (dx / safeDistance) * amount;
      const ty = (dy / safeDistance) * amount;
      const rotate = (dx / Math.max(rect.width, 1)) * 9 * influence * strength * 10;
      const scale = 1 + influence * 0.035 * Math.max(0.3, pointerStrength);

      word.style.setProperty('--warp-x', `${tx.toFixed(2)}px`);
      word.style.setProperty('--warp-y', `${ty.toFixed(2)}px`);
      word.style.setProperty('--warp-rotate', `${rotate.toFixed(2)}deg`);
      word.style.setProperty('--warp-scale', scale.toFixed(3));
    });
  }

  function resetPointer() {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('.warp-text__word').forEach((word) => {
      word.style.setProperty('--warp-x', '0px');
      word.style.setProperty('--warp-y', '0px');
      word.style.setProperty('--warp-rotate', '0deg');
      word.style.setProperty('--warp-scale', '1');
    });
  }

  const words = text.trim().split(/\s+/);

  return (
    <h1
      ref={rootRef}
      className={`warp-text ${className}`.trim()}
      style={{
        '--warp-color': color,
        '--warp-size': fontSize,
        '--warp-weight': String(fontWeight),
        '--warp-duration': `${Math.max(0.2, 1.2 - speed)}s`,
      } as React.CSSProperties}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
    >
      {words.map((word, index) => (
        <span className="warp-text__word" style={{ '--word-index': String(index) } as React.CSSProperties} key={`${word}-${index}`}>
          {word}
          {index < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </h1>
  );
}
