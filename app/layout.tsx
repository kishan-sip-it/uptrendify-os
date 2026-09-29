import type { Metadata } from 'next';
import './globals.css';
import './design-system.css';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { NetworkStatus } from '@/components/ui/NetworkStatus';

export const metadata: Metadata = {
  title: 'UpTrendifyOS — AI Marketing Agency OS',
  description: 'Research, understand, plan, create, approve and publish marketing work from one guided workspace.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeBoot = `(() => { try { const t = localStorage.getItem('uptrendify-theme'); document.documentElement.dataset.theme = t === 'dark' ? 'dark' : 'light'; } catch { document.documentElement.dataset.theme = 'light'; } })()`;
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBoot }} /></head>
      <body><NetworkStatus />{children}<SpeedInsights /></body>
    </html>
  );
}
