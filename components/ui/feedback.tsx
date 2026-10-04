import { AlertCircle, CheckCircle2, LoaderCircle, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

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
    <div className="empty-state" role="status">
      <Sparkles size={20} color="var(--text-muted)" style={{ margin: 0 }} />
      <h3 style={{ margin: 0 }}>{title}</h3>
      {description && <p className="subtitle" style={{ margin: 0, maxWidth: 420 }}>{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="panel-status panel-status-danger" role="alert">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <AlertCircle size={16} style={{ color: 'var(--status-danger)', marginTop: 2, flexShrink: 0 }} />
        <span>{message}</span>
      </div>
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