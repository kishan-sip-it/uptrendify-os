import Link from 'next/link';
import type { ReactNode } from 'react';
import { CheckCircle2, Search, Sparkles, Target } from 'lucide-react';

const FLOW = [
  { icon: Search, title: 'Research', body: 'Understand the business from its public website.' },
  { icon: Sparkles, title: 'Brand Intelligence', body: 'Turn evidence into facts you can review.' },
  { icon: Target, title: 'Strategy', body: 'Build a marketing plan from approved context.' },
  { icon: CheckCircle2, title: 'Create, approve, publish', body: 'Move from content to campaigns without losing control.' },
] as const;

export function AuthLayout({ eyebrow, title, subtitle, children, footer }: {
  eyebrow: string; title: string; subtitle: string; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <main className="auth-shell">
      <div className="auth-frame">
        <section className="auth-story" aria-label="How UpTrendifyOS works">
          <Link href="/" className="auth-brand" aria-label="UpTrendifyOS home">
            <span className="logo" aria-hidden="true" /> UpTrendifyOS
          </Link>
          <div className="auth-story-copy">
            <div className="eyebrow">AI marketing operating system</div>
            <h2>From a brand website to a clear marketing workflow.</h2>
            <p>UpTrendifyOS learns the business, lets your team verify what matters, and carries that context into strategy, content and campaigns.</p>
          </div>
          <div className="auth-flow">
            {FLOW.map(({ icon: Icon, title: flowTitle, body }) => (
              <div className="auth-flow-item" key={flowTitle}>
                <span className="auth-flow-icon"><Icon size={17} /></span>
                <div><strong>{flowTitle}</strong><span>{body}</span></div>
              </div>
            ))}
          </div>
          <div className="auth-story-note">One workspace · reusable brand memory · human approval before anything ships</div>
        </section>
        <section className="auth-card-wrap">
          <div className="auth-head">
            <div className="eyebrow">{eyebrow}</div>
            <h1>{title}</h1>
            <p className="subtitle">{subtitle}</p>
          </div>
          {children}
          {footer ? <div className="auth-footer">{footer}</div> : null}
          <div className="auth-helper">Set it up once. Your brand, rules, approvals and theme stay editable later.</div>
        </section>
      </div>
    </main>
  );
}