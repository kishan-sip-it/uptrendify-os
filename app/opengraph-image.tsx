import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'UpTrendifyOS — From a brand website to a complete marketing workflow';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', padding: 62, color: '#F8FAFC', background: 'linear-gradient(135deg, #080A12 0%, #171A52 52%, #0E7490 135%)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 25, fontWeight: 750, letterSpacing: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#5B5BF0,#8B5CF6 55%,#22D3EE)', fontSize: 32 }}>↗</div>
        UPTRENDIFYOS
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 1000 }}>
        <div style={{ fontSize: 68, lineHeight: 1.03, fontWeight: 750, letterSpacing: -2.5 }}>From a brand website to a complete marketing workflow.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, color: '#C4B5FD', fontSize: 24 }}>Research → Review → Strategy → Content → Publish</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, color: '#CBD5E1' }}><span style={{ width: 8, height: 8, borderRadius: 999, background: '#34D399' }} />Human-reviewed brand intelligence. Connected marketing execution.</div>
    </div>, size);
}