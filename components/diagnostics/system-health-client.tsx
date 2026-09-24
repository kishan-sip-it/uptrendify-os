'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';

type Check = {
  key: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
};

type Diagnostics = {
  ok: boolean;
  checkedAt: string;
  build: { commit: string | null; environment: string; productionUrl: string | null };
  supabase: { projectRef: string | null; expectedProjectRef: string; source: string };
  checks: Check[];
};

function StatusIcon({ status }: { status: Check['status'] }) {
  if (status === 'pass') return <CheckCircle2 size={17} aria-hidden="true" />;
  return <CircleAlert size={17} aria-hidden="true" />;
}

export function SystemHealthClient() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/diagnostics', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Diagnostics could not complete');
      }
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Diagnostics could not complete');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const failed = data?.checks.filter((check) => check.status === 'fail') ?? [];
  const warnings = data?.checks.filter((check) => check.status === 'warn') ?? [];

  return (
    <div className="settings-page">
      <div className="topbar">
        <div>
          <div className="eyebrow">System Health</div>
          <h1>Production synchronization</h1>
          <p className="subtitle">
            One place to verify Browser → Vercel → Supabase alignment before a user ever sees a failure.
          </p>
        </div>
        <button type="button" className="badge" onClick={() => void load()} disabled={loading}>
          {loading ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}
          {loading ? 'Checking…' : 'Run diagnostics'}
        </button>
      </div>

      {error ? (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <div className="eyebrow">Diagnostic request failed</div>
          <p className="subtitle" style={{ marginBottom: 0 }}>{error}</p>
        </div>
      ) : null}

      {data ? (
        <>
          <section className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldCheck size={20} />
              <div>
                <div className="eyebrow">Overall status</div>
                <h2 style={{ margin: '2px 0 0' }}>
                  {data.ok ? 'Production is synchronized' : 'Synchronization needs attention'}
                </h2>
              </div>
            </div>
            <p className="subtitle" style={{ marginBottom: 0 }}>
              Checked {new Date(data.checkedAt).toLocaleString()} · {data.checks.length} runtime checks · {failed.length} failures · {warnings.length} warnings.
            </p>
          </section>

          <div className="settings-grid">
            <section className="card">
              <div className="section-title">
                <div>
                  <div className="eyebrow">Deployment</div>
                  <h2>Vercel runtime</h2>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <div><strong>Environment:</strong> {data.build.environment}</div>
                <div><strong>Commit:</strong> {data.build.commit ?? 'not exposed'}</div>
                <div><strong>Production URL:</strong> {data.build.productionUrl ?? 'not exposed'}</div>
              </div>
            </section>

            <section className="card">
              <div className="section-title">
                <div>
                  <div className="eyebrow">Supabase</div>
                  <h2>Effective project</h2>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <div><strong>Effective ref:</strong> {data.supabase.projectRef ?? 'unknown'}</div>
                <div><strong>Expected ref:</strong> {data.supabase.expectedProjectRef}</div>
                <div><strong>Config source:</strong> {data.supabase.source}</div>
              </div>
            </section>
          </div>

          <section className="card" style={{ marginTop: 16 }}>
            <div className="section-title">
              <div>
                <div className="eyebrow">Contract checks</div>
                <h2>Browser / Vercel / Supabase boundary</h2>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {data.checks.map((check) => (
                <div
                  key={check.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '24px minmax(0, 1fr)',
                    gap: 10,
                    padding: '11px 12px',
                    border: '1px solid var(--line)',
                    borderRadius: 12,
                    background: check.status === 'pass'
                      ? 'color-mix(in srgb, var(--accent) 5%, var(--panel))'
                      : 'var(--panel)',
                  }}
                >
                  <div aria-label={check.status}>
                    <StatusIcon status={check.status} />
                  </div>
                  <div>
                    <strong>{check.label}</strong>
                    <p className="field-note" style={{ margin: '3px 0 0' }}>{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
