import { AlertCircle, CheckCircle2, LoaderCircle, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { CopyButton } from '@/components/ui/copy-button';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="panel-subtle" role="status" aria-live="polite">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)' }}>
        <LoaderCircle size={16} className="spin" />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <section className="empty-state ui-empty-state" role="status" aria-label={title}>
      <div className="ui-empty-state-icon" aria-hidden="true"><Sparkles size={21} /></div>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {description && <p className="subtitle" style={{ margin: 0, maxWidth: 440 }}>{description}</p>}
      {action && <div className="ui-empty-state-action">{action}</div>}
    </section>
  );
}

export function ErrorState({
  message,
  action,
  diagnostics,
}: {
  message: string;
  action?: ReactNode;
  diagnostics?: string;
}) {
  return (
    <div className="panel-status panel-status-danger ui-error-state" role="alert">
      <div className="ui-error-state-message">
        <AlertCircle size={17} style={{ color: 'var(--status-danger)', marginTop: 2, flexShrink: 0 }} />
        <span>{message}</span>
      </div>
      {(action || diagnostics) ? (
        <div className="ui-error-state-actions">
          {action}
          {diagnostics ? <CopyButton value={diagnostics} label="Copy diagnostics" /> : null}
        </div>
      ) : null}
    </div>
  );
}

export function SuccessState({ message }: { message: string }) {
  return (
    <div className="panel-status panel-status-success" role="status">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <CheckCircle2 size={16} style={{ color: 'var(--status-success)', marginTop: 2, flexShrink: 0 }} />
        <span>{message}</span>
      </div>
    </div>
  );
}