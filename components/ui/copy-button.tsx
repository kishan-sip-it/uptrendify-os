'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

export function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  className = '',
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className={['ui-copy-button', className].filter(Boolean).join(' ')} onClick={() => void copyValue()} disabled={!value}>
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}
