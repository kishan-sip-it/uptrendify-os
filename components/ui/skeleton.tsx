import type { CSSProperties, ReactNode } from 'react';

export function Skeleton({
  height = 16,
  width = '100%',
  radius = 10,
  className = '',
  style,
}: {
  height?: number;
  width?: number | string;
  radius?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={['ui-skeleton', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      style={{ display: 'block', width, height, borderRadius: radius, ...style }}
    />
  );
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card ui-card-skeleton" aria-hidden="true">
      <Skeleton width="42%" height={16} />
      {Array.from({ length: Math.max(1, Math.min(rows, 8)) }, (_, index) => (
        <Skeleton key={index} width={index % 2 ? '62%' : '86%'} height={12} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <section className="ui-page-skeleton" aria-busy="true" aria-label="Loading page">
      <div className="ui-page-skeleton-header">
        <Skeleton width={180} height={14} />
        <Skeleton width="min(440px, 68%)" height={34} radius={9} />
        <Skeleton width="min(560px, 82%)" height={14} />
      </div>
      <div className="ui-page-skeleton-grid">
        {Array.from({ length: 4 }, (_, index) => <CardSkeleton key={index} rows={2 + (index % 2)} />)}
      </div>
    </section>
  );
}
