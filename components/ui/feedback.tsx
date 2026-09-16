import { AlertCircle, CheckCircle2, LoaderCircle, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="card" role="status" aria-live="polite">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)' }}>
        <LoaderCircle size={16} className="spin" />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <Sparkles size={20} color="var(--muted)" style={{ margin: '0 auto 10px', display: 'block' }} />
      <h3 style={{ margin: 0 }}>{title}</h3>
      {description && <p className="subtitle" style={{ margin: '8px auto 0', maxWidth: 420 }}>{description}</p>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="card" role="alert" style={{ borderColor: 'rgba(239,68,68,.35)', background: 'rgba(239,68,68,.08)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <AlertCircle size={16} style={{ color: '#f87171', marginTop: 2, flexShrink: 0 }} />
        <span>{message}</span>
      </div>
    </div>
  );
}

export function SuccessState({ message }: { message: string }) {
  return (
    <div className="card" role="status" style={{ borderColor: 'rgba(110,231,199,.3)', background: 'rgba(110,231,199,.06)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <CheckCircle2 size={16} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
        <span>{message}</span>
      </div>
    </div>
  );
}