import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'UpTrendifyOS — AI Marketing Agency OS',
  description: 'Research, understand, plan, create, approve and publish marketing work from one guided workspace.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeBoot = `(() => { try { const t = localStorage.getItem('uptrendify-theme'); document.documentElement.dataset.theme = (t === 'dark' || t === 'system' || t === 'light') ? t : 'light'; } catch {} })()`;
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBoot }} /></head>
      <body>{children}</body>
    </html>
  );
}
