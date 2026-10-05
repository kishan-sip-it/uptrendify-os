import type { Metadata } from 'next';
import './globals.css';
import './design-system.css';
import './workspace-layout.css';
import './public-pages.css';
import './shared-theme.css';
import './brand-brain-ux.css';
import './authenticated-ui.css';
import './cool-light-theme.css';
import './ui-foundation.css';
import './brand-profile.css';
import './responsive-hardening.css';
import './selection-contrast.css';
import './interactive-state-contrast.css';
import './contextual-workflow.css';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { NetworkStatus } from '@/components/ui/NetworkStatus';
import { GlobalWorkflowChecklist } from '@/components/ui/global-workflow-checklist';
import { PublicUtilityBar } from '@/components/public/public-utility-bar';

export const metadata: Metadata = {
  title: 'UpTrendifyOS — AI Marketing Agency OS',
  description: 'Research, understand, plan, create, approve and publish marketing work from one guided workspace.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeBoot = `(() => { try { const t = localStorage.getItem('uptrendify-theme'); document.documentElement.dataset.theme = t === 'dark' ? 'dark' : 'light'; } catch { document.documentElement.dataset.theme = 'light'; } })()`;
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBoot }} /></head>
      <body><NetworkStatus /><GlobalWorkflowChecklist /><PublicUtilityBar />{children}<SpeedInsights /></body>
    </html>
  );
}
