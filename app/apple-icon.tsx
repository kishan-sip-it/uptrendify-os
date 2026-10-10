import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', borderRadius: 38, background: 'linear-gradient(135deg,#5B5BF0 0%,#8B5CF6 55%,#22D3EE 125%)', color: '#fff', fontSize: 112, fontWeight: 800 }}>↗</div>,
    size);
}