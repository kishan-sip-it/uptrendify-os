import type { Metadata, Viewport } from 'next';
import './globals.css';
import './design-system.css';
import './workspace-layout.css';
import './public-pages.css';
import './landing-hero.css';
import './shared-theme.css';
import './brand-brain-ux.css';
import './authenticated-ui.css';
import './cool-light-theme.css';
import './ui-foundation.css';
import './brand-profile.css';
import './responsive-hardening.css';
import './selection-contrast.css';
import './interactive-state-contrast.css';
import './ui-primitives.css';
import './responsive-system.css';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { NetworkStatus } from '@/components/ui/NetworkStatus';
import { GlobalWorkflowChecklist } from '@/components/ui/global-workflow-checklist';
import { PublicUtilityBar } from '@/components/public/public-utility-bar';

const configuredSiteUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'https://uptrendify-os.vercel.app');

function resolveSiteUrl(): URL {
  try { return new URL(configuredSiteUrl); }
  catch { return new URL('https://uptrendify-os.vercel.app'); }
}

const siteUrl = resolveSiteUrl();

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: 'UpTrendifyOS — AI Marketing Agency OS', template: '%s · UpTrendifyOS' },
  description: 'Research public websites, review evidence-backed brand intelligence, build strategies, create content, and move work through human approval in one connected marketing OS.',
  openGraph: {
    type: 'website',
    siteName: 'UpTrendifyOS',
    title: 'UpTrendifyOS — AI Marketing Agency OS',
    description: 'From a brand website to a complete marketing workflow.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'UpTrendifyOS marketing workflow' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UpTrendifyOS — AI Marketing Agency OS',
    description: 'From a brand website to a complete marketing workflow.',
    images: ['/opengraph-image'],
  },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F7FB' },
    { media: '(prefers-color-scheme: dark)', color: '#080A12' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeBoot = `(() => { try { const t = localStorage.getItem('uptrendify-theme'); document.documentElement.dataset.theme = t === 'dark' || t === 'system' ? t : 'light'; } catch { document.documentElement.dataset.theme = 'light'; } })()`;
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBoot }} /></head>
      <body><NetworkStatus /><GlobalWorkflowChecklist /><PublicUtilityBar />{children}<SpeedInsights /></body>
    </html>
  );
}
