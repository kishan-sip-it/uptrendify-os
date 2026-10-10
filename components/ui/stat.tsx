import type { CSSProperties, ReactNode } from 'react';

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  className = '',
  style,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: 'default' | 'brand' | 'success' | 'warning' | 'danger';
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <article className={['card', 'ui-stat', 'ui-stat--' + tone, className].filter(Boolean).join(' ')} style={style}>
      <div className="ui-stat-label">
        {icon ? <span className="ui-stat-icon" aria-hidden="true">{icon}</span> : null}
        <span>{label}</span>
      </div>
      <div className="ui-stat-value">{value}</div>
      {hint ? <p className="ui-stat-hint">{hint}</p> : null}
    </article>
  );
}
