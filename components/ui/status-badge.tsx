import { CircleDot } from 'lucide-react';

import { getStatusMeta } from '@/components/ui/status-map';

export function StatusBadge({
  status,
  showDot = true,
  className = '',
}: {
  status: string;
  showDot?: boolean;
  className?: string;
}) {
  const key = status.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const meta = STATUS_META[key] ?? { label: humanizeStatus(status), tone: 'neutral' as const };
  const legacyTone = meta.tone === 'success' ? 'good'
    : meta.tone === 'warning' ? 'warn'
      : meta.tone === 'danger' ? 'danger'
        : meta.tone === 'info' ? 'info'
          : meta.tone === 'brand' ? 'brand'
            : 'muted';

  return (
    <span
      className={['badge', 'tone-' + legacyTone, 'ui-status-badge', 'ui-status-badge--' + meta.tone, className].filter(Boolean).join(' ')}
      data-status={key}
      aria-label={'Status: ' + meta.label}
    >
      {showDot ? (
        meta.live
          ? <span className="status-dot live ui-status-dot" aria-hidden="true" />
          : <CircleDot size={10} className="ui-status-dot-static" aria-hidden="true" />
      ) : null}
      <span>{meta.label}</span>
    </span>
  );
}
