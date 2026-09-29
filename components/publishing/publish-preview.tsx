'use client';

import { X, Send } from 'lucide-react';
import { channelLabel, contentTypeLabel } from '@/lib/content/schema';

type PreviewItem = {
  brandName: string | null;
  title: string;
  type: string;
  channel: string | null;
  brandStyle: { primaryColor: string | null; secondaryColors: string[]; visualIdentity: Record<string, unknown> } | null;
  currentVersion: { version: number; headline: string; body: string; cta?: string | null } | null;
};

function safeColor(value: string | null | undefined, fallback: string) {
  return value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback;
}

function splitBody(body: string) {
  return body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
}

export function PublishPreview({ item, busy, onClose, onConfirm }: { item: PreviewItem; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const primary = safeColor(item.brandStyle?.primaryColor, '#8b7cff');
  const secondary = safeColor(item.brandStyle?.secondaryColors?.[0], '#d946ef');
  const body = item.currentVersion?.body ?? '';
  const paragraphs = splitBody(body);
  const channel = item.channel ?? 'selected channel';

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="publish-preview-title" style={{ position: 'fixed', inset: 0, zIndex: 1600, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(3,7,13,.72)', backdropFilter: 'blur(8px)' }}>
      <div style={{ width: 'min(900px, 100%)', maxHeight: 'min(860px, calc(100vh - 40px))', overflow: 'auto', border: '1px solid var(--border-strong)', borderRadius: 16, background: 'var(--surface-raised)', color: 'var(--text)', boxShadow: '0 28px 90px rgba(0,0,0,.4)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '16px 18px', borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--surface-raised) 94%, transparent)', backdropFilter: 'blur(12px)' }}>
          <div>
            <div className="eyebrow">Pre-publish review</div>
            <h2 id="publish-preview-title" style={{ margin: '5px 0 3px' }}>Preview for {channelLabel(channel)}</h2>
            <div className="activity-meta">{item.brandName ?? 'Brand'} · {contentTypeLabel(item.type)} · version {item.currentVersion?.version ?? '—'}</div>
          </div>
          <button type="button" className="badge tone-muted" onClick={onClose} disabled={busy} aria-label="Close preview" style={{ border: 0, cursor: busy ? 'not-allowed' : 'pointer', padding: 8 }}><X size={16} /></button>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 260px', gap: 18, alignItems: 'start' }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Channel preview</div>
              <div style={{ display: 'grid', placeItems: 'center', minHeight: 430, padding: 18, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
                {channel === 'email' ? (
                  <div style={{ width: 'min(560px, 100%)', background: '#fff', color: '#17202a', borderRadius: 10, overflow: 'hidden', boxShadow: '0 14px 40px rgba(0,0,0,.18)' }}>
                    <div style={{ height: 10, background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
                    <div style={{ padding: 24 }}><div style={{ fontWeight: 750, fontSize: 14, marginBottom: 20 }}>{item.brandName ?? 'Your brand'}</div><h3 style={{ fontSize: 24, lineHeight: 1.2, margin: '0 0 14px' }}>{item.currentVersion?.headline || item.title}</h3>{paragraphs.slice(0, 5).map((paragraph, index) => <p key={index} style={{ lineHeight: 1.65, margin: '0 0 14px' }}>{paragraph}</p>)}{item.currentVersion?.cta ? <div style={{ display: 'inline-block', padding: '10px 16px', borderRadius: 7, background: primary, color: '#fff', fontWeight: 700 }}>{item.currentVersion.cta}</div> : null}</div>
                  </div>
                ) : channel === 'website' ? (
                  <div style={{ width: 'min(640px, 100%)', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ height: 7, background: primary }} /><div style={{ padding: 28 }}><div style={{ color: primary, fontWeight: 750, marginBottom: 22 }}>{item.brandName ?? 'Your brand'}</div><h3 style={{ fontSize: 30, lineHeight: 1.15, margin: '0 0 16px', color: 'var(--text-strong)' }}>{item.currentVersion?.headline || item.title}</h3>{paragraphs.slice(0, 6).map((paragraph, index) => <p key={index} style={{ lineHeight: 1.65, margin: '0 0 14px' }}>{paragraph}</p>)}{item.currentVersion?.cta ? <span style={{ display: 'inline-block', padding: '10px 16px', borderRadius: 8, background: primary, color: '#fff', fontWeight: 700 }}>{item.currentVersion.cta}</span> : null}</div>
                  </div>
                ) : (
                  <div style={{ width: 'min(620px, 100%)', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}><span style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', background: primary, color: '#fff', fontSize: 11, fontWeight: 800 }}>{(item.brandName ?? 'B').slice(0, 1).toUpperCase()}</span><strong>{item.brandName ?? 'Your brand'}</strong><span className="activity-meta">· {channelLabel(channel)}</span></div>
                    <div style={{ padding: 20 }}><h3 style={{ margin: '0 0 12px', fontSize: 21, lineHeight: 1.25, color: 'var(--text-strong)' }}>{item.currentVersion?.headline || item.title}</h3>{paragraphs.slice(0, 8).map((paragraph, index) => <p key={index} style={{ lineHeight: 1.6, margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>{paragraph}</p>)}{item.currentVersion?.cta ? <div style={{ marginTop: 14, color: primary, fontWeight: 750 }}>{item.currentVersion.cta}</div> : null}</div>
                    <div style={{ height: 5, background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
                  </div>
                )}
              </div>
            </div>

            <aside style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface-raised)' }}>
              <div className="eyebrow">Applied brand context</div>
              <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
                <div><div className="activity-meta">Primary color</div><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}><span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 6, background: primary, border: '1px solid var(--border-strong)' }} /><code style={{ fontSize: 12 }}>{primary}</code></div></div>
                {item.brandStyle?.secondaryColors?.length ? <div><div className="activity-meta">Secondary palette</div><div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>{item.brandStyle.secondaryColors.slice(0, 4).map((color) => <span key={color} title={color} style={{ width: 22, height: 22, borderRadius: 6, background: safeColor(color, '#808080'), border: '1px solid var(--border-strong)' }} />)}</div></div> : null}
                <div><div className="activity-meta">Selected channel</div><strong style={{ display: 'block', marginTop: 4 }}>{channelLabel(channel)}</strong></div>
                <div><div className="activity-meta">Publishing state</div><strong style={{ display: 'block', marginTop: 4 }}>Ready to publish</strong></div>
              </div>
              <p className="field-help" style={{ marginTop: 14 }}>This is a channel presentation preview. No delivery occurs until you confirm Publish.</p>
            </aside>
          </div>
        </div>

        <div style={{ position: 'sticky', bottom: 0, display: 'flex', justifyContent: 'flex-end', gap: 9, padding: '14px 18px', borderTop: '1px solid var(--border)', background: 'color-mix(in srgb, var(--surface-raised) 96%, transparent)', backdropFilter: 'blur(12px)' }}>
          <button type="button" className="badge tone-muted" onClick={onClose} disabled={busy} style={{ border: 0, cursor: busy ? 'not-allowed' : 'pointer', padding: '9px 14px' }}>Back to queue</button>
          <button type="button" className="badge tone-good" onClick={onConfirm} disabled={busy || !item.channel || !item.currentVersion} style={{ border: 0, cursor: busy ? 'not-allowed' : 'pointer', padding: '9px 14px', display: 'inline-flex', alignItems: 'center', gap: 7, opacity: busy || !item.channel || !item.currentVersion ? 0.6 : 1 }}><Send size={14} /> {busy ? 'Publishing…' : `Confirm publish to ${channelLabel(channel)}`}</button>
        </div>
      </div>
    </div>
  );
}