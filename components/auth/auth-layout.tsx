import Link from 'next/link';
import { ArrowRight, CheckCircle2, FileCheck2, Search, Sparkles, Target } from 'lucide-react';
import type { ReactNode } from 'react';

export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="auth-shell">
      <div
        className="auth-layout-grid"
        style={{
          width: 'min(1380px, 100%)',
          marginInline: 'auto',
          justifyContent: 'center',
        }}
      >
        <aside className="auth-showcase" aria-label="How UpTrendifyOS works">
          <Link href="/" className="auth-brand" aria-label="UpTrendifyOS home" style={{ justifyContent: 'flex-start', marginBottom: 0 }}>
            <span className="logo" /> UpTrendifyOS
          </Link>
          <span className="auth-showcase-kicker">Your marketing operating system</span>
          <div>
            <h2>Understand the brand first. Then make better marketing decisions.</h2>
            <p>
              UpTrendifyOS connects research, human review, strategy, content, campaigns and approval in one calm workspace.
              You always know what the system is doing and what comes next.
            </p>
          </div>
          <div className="auth-showcase-flow">
            <div className="auth-flow-row"><span className="auth-flow-icon"><Search size={17} /></span><span className="auth-flow-copy"><strong>1. Research</strong><span>Understand the public business, not just a prompt.</span></span><ArrowRight size={15} color="var(--muted)" /></div>
            <div className="auth-flow-row"><span className="auth-flow-icon"><Sparkles size={17} /></span><span className="auth-flow-copy"><strong>2. Brand Intelligence</strong><span>Turn evidence into reviewable brand knowledge.</span></span><ArrowRight size={15} color="var(--muted)" /></div>
            <div className="auth-flow-row"><span className="auth-flow-icon"><Target size={17} /></span><span className="auth-flow-copy"><strong>3. Strategy & Content</strong><span>Move from verified truth to concrete marketing work.</span></span><ArrowRight size={15} color="var(--muted)" /></div>
            <div className="auth-flow-row"><span className="auth-flow-icon"><FileCheck2 size={17} /></span><span className="auth-flow-copy"><strong>4. Approval & Publishing</strong><span>Nothing is sent out without the right human gate.</span></span><CheckCircle2 size={15} color="var(--accent)" /></div>
          </div>
          <div className="auth-benefit-row">
            <div className="auth-benefit"><strong>Light by default</strong><span>Designed for long work sessions without visual overload.</span></div>
            <div className="auth-benefit"><strong>Human control</strong><span>AI suggestions stay reviewable until you trust them.</span></div>
            <div className="auth-benefit"><strong>Clear next step</strong><span>The workspace keeps the workflow visible as you move.</span></div>
          </div>
        </aside>
        <section
          className="auth-card-wrap"
          style={{
            justifySelf: 'center',
            width: 'min(100%, 520px)',
          }}
        >
          <div className="auth-head">
            <div className="eyebrow">{eyebrow}</div>
            <h1>{title}</h1>
            <p className="subtitle">{subtitle}</p>
          </div>
          {children}
          {footer ? <div className="auth-footer">{footer}</div> : null}
        </section>
      </div>
    </main>
  );
}
