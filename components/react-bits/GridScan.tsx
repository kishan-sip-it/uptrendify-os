'use client';

import type { CSSProperties } from 'react';

import './GridScan.css';

type GridScanProps = {
  backgroundColor?: string;
  gridColor?: string;
  scanColor?: string;
  density?: number;
  className?: string;
};

export default function GridScan({
  backgroundColor = '#120F17',
  gridColor = '#1e1829',
  scanColor = '#A855F7',
  density = 1,
  className = '',
}: GridScanProps) {
  const safeDensity = Math.max(0.5, Math.min(2, density));

  return (
    <div
      className={`grid-scan ${className}`.trim()}
      style={{
        '--grid-scan-bg': backgroundColor,
        '--grid-scan-line': gridColor,
        '--grid-scan-accent': scanColor,
        '--grid-scan-size': `${Math.max(34, 58 / safeDensity)}px`,
        '--grid-scan-duration': `${Math.max(3.8, 7.5 / safeDensity)}s`,
      } as CSSProperties}
      aria-hidden="true"
    >
      <div className="grid-scan__grid" />
      <div className="grid-scan__scan" />
      <div className="grid-scan__vignette" />
    </div>
  );
}
