'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArchiveRestore, ArrowLeft, LoaderCircle, Trash2 } from 'lucide-react';
import { ErrorState, LoadingState } from '@/components/ui/feedback';

type ArchivedItem = {
  id: string;
  brand_id: string;
  title?: string;
  name?: string;
  status: string;
  updated_at: string;
  brands?: { name?: string | null } | null;
};

export default function TrashPage() {
  const [content, setContent] = useState<ArchivedItem[]>([]);
  const [campaigns, setCampaigns] = useState<ArchivedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/workspace/trash', { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not load Trash');
      setContent(body.content ?? []);
      setCampaigns(body.campaigns ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Trash');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function restore(itemType: 'content' | 'campaign', itemId: string) {
    setBusy(itemType + ':' + itemId);
    setError('');
    try {
      const response = await fetch('/api/workspace/trash', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'restore', itemType, itemId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not restore the item');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore the item');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="main" style={{ maxWidth: 1100 }}>
      <div className="topbar">
        <div>
          <a href="/settings" className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <ArrowLeft size={15} /> Back to Settings
          </a>
          <h1>Trash & archive</h1>
          <p className="subtitle">Archived work is kept here instead of disappearing. Restore it when you are ready to use it again.</p>
        </div>
        <span className="badge tone-muted"><Trash2 size={13} /> Reversible workspace cleanup</span>
      </div>

      {error ? <ErrorState message={error} /> : null}

      {loading ? <LoadingState label="Loading archived work…" /> : (
        <div className="grid" style={{ gap: 16 }}>
          <section className="card">
            <div className="section-title">
              <div>
                <div className="eyebrow">Content</div>
                <h2 style={{ margin: '5px 0' }}>Archived content</h2>
              </div>
              <span className="badge tone-muted">{content.length}</span>
            </div>
            {content.length === 0 ? <p className="activity-meta">No archived content items.</p> : (
              <div className="settings-archive-list">
                {content.map((item) => (
                  <div className="settings-archive-row" key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.brands?.name ?? 'Brand'} · archived</small>
                    </div>
                    <button type="button" className="badge" onClick={() => void restore('content', item.id)} disabled={busy !== null}>
                      {busy === 'content:' + item.id ? <LoaderCircle size={13} className="spin" /> : <ArchiveRestore size={13} />} Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="section-title">
              <div>
                <div className="eyebrow">Campaigns</div>
                <h2 style={{ margin: '5px 0' }}>Archived campaigns</h2>
              </div>
              <span className="badge tone-muted">{campaigns.length}</span>
            </div>
            {campaigns.length === 0 ? <p className="activity-meta">No archived campaigns.</p> : (
              <div className="settings-archive-list">
                {campaigns.map((item) => (
                  <div className="settings-archive-row" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.brands?.name ?? 'Brand'} · archived</small>
                    </div>
                    <button type="button" className="badge" onClick={() => void restore('campaign', item.id)} disabled={busy !== null}>
                      {busy === 'campaign:' + item.id ? <LoaderCircle size={13} className="spin" /> : <ArchiveRestore size={13} />} Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
