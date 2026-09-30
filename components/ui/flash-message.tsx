'use client';

import { CheckCircle2, Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export function FlashMessage({
  message,
  detail,
  href,
  actionLabel = 'Continue',
  duration = 6500,
  tone = 'success',
}: {
  message: string;
  detail?: string;
  href?: string;
  actionLabel?: string;
  duration?: number;
  tone?: 'success' | 'info';
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), duration);
    return () => window.clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  return (
    <div
      className="card"
      role="status"
      aria-live="polite"
      style={{
        position: 'relative',
        borderColor: tone === 'success' ? 'color-mix(in srgb, var(--accent) 45%, var(--line))' : 'color-mix(in srgb, var(--accent-2) 45%, var(--line))',
        paddingRight: 44,
      }}
    >
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => setVisible(false)}
        style={{ position: 'absolute', top: 10, right: 10, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 5 }}
      >
        <X size={15} />
      </button>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {tone === 'success' ? <CheckCircle2 size={18} color="var(--accent)" style={{ marginTop: 1, flexShrink: 0 }} /> : <Info size={18} color="var(--accent-2)" style={{ marginTop: 1, flexShrink: 0 }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{message}</div>
          {detail ? <p className="activity-meta" style={{ margin: '4px 0 0', lineHeight: 1.5 }}>{detail}</p> : null}
          {href ? <a className="badge auth-submit" href={href} style={{ display: 'inline-flex', marginTop: 9, textDecoration: 'none' }}>{actionLabel} →</a> : null}
        </div>
      </div>
    </div>
  );
}
