'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight, Bot, CalendarDays, Check, CheckCircle2, ChevronDown, FileText, Globe2,
  Layers3, Menu, MessageSquareText, Play, Search, ShieldCheck, Sparkles, Target,
  Users, Workflow, X, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import styles from './landing.module.css';

type OrgRole = 'OWNER' | 'ADMIN' | 'STRATEGIST' | 'EDITOR' | 'APPROVER' | 'CLIENT';

type LandingAccount = {
  email: string;
  firstName: string;
  organizationName: string;
  role: OrgRole;
};

function isOrgRole(value: unknown): value is OrgRole {
  return value === 'OWNER' || value === 'ADMIN' || value === 'STRATEGIST' ||
    value === 'EDITOR' || value === 'APPROVER' || value === 'CLIENT';
}

const ROLE_DESTINATIONS: Record<OrgRole, { label: string; href: string }> = {
  OWNER: { label: 'Open workspace', href: '/dashboard' },
  ADMIN: { label: 'Open workspace', href: '/dashboard' },
  STRATEGIST: { label: 'Open Strategy', href: '/dashboard' },
  EDITOR: { label: 'Open Content Studio', href: '/brands' },
  APPROVER: { label: 'Open Approvals', href: '/approvals' },
  CLIENT: { label: 'Open workspace', href: '/dashboard' },
};

function initialsForAccount(account: LandingAccount) {
  const name = account.firstName.trim();
  return name ? name.slice(0, 2).toUpperCase() : (account.email || 'U').slice(0, 1).toUpperCase();
}

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.08 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${styles.reveal} ${visible ? styles.revealIn : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function AILoopGraphic() {
  return (
    <div className={styles.aiGraphic} aria-hidden="true">
      <div className={`${styles.aiNode} ${styles.nodeLeft}`}><div className={styles.nodeIcon}><FileText size={22} /></div><span>Brand</span></div>
      <div className={`${styles.aiNode} ${styles.nodeLeftBottom}`}><div className={styles.nodeIcon}><Globe2 size={22} /></div><span>Research</span></div>
      <div className={`${styles.aiNode} ${styles.nodeRight}`}><div className={styles.nodeIcon}><Workflow size={22} /></div><span>Strategy</span></div>
      <div className={`${styles.aiNode} ${styles.nodeRightBottom}`}><div className={styles.nodeIcon}><CalendarDays size={22} /></div><span>Campaigns</span></div>
      <div className={styles.aiCore}>
        <div className={styles.aiCoreGlow} />
        <div className={styles.aiCube}><span>AI</span></div>
        <div className={styles.aiBase} />
      </div>
      <div className={`${styles.aiArrow} ${styles.arrowOne}`} />
      <div className={`${styles.aiArrow} ${styles.arrowTwo}`} />
      <div className={`${styles.aiArrow} ${styles.arrowThree}`} />
      <div className={`${styles.aiArrow} ${styles.arrowFour}`} />
    </div>
  );
}

function ProductCard({ icon: Icon, title, body, number }: { icon: LucideIcon; title: string; body: string; number: string }) {
  return (
    <div className={styles.productCard}>
      <div className={styles.productCardTop}><span className={styles.cardNumber}>{number}</span><span className={styles.productIcon}><Icon size={20} /></span></div>
      <h3>{title}</h3>
      <p>{body}</p>
      <span className={styles.cardLink}>Explore <ArrowRight size={13} /></span>
    </div>
  );
}

function Mosaic() {
  return (
    <div className={styles.mosaic}>
      <div className={`${styles.mosaicCard} ${styles.mosaicSmall}`}>
        <div className={styles.miniIcons}><Search size={15} /><Bot size={15} /><CheckCircle2 size={15} /></div>
        <strong>Connected workflow</strong><span>Research → Review → Strategy</span>
      </div>
      <div className={`${styles.mosaicCard} ${styles.mosaicImage}`}>
        <div className={styles.orbitalPortrait}><div className={styles.portraitGlow} /><div className={styles.portraitFigure}><Users size={74} strokeWidth={1.2} /></div></div>
        <span className={styles.floatingTag}>UpTrendifyOS</span>
      </div>
      <div className={`${styles.mosaicCard} ${styles.mosaicMetric}`}>
        <span className={styles.metricValue}>100%</span><strong>Traceable context</strong><span>Every stage carries the brand context forward.</span>
      </div>
      <div className={`${styles.mosaicCard} ${styles.mosaicPhoto}`}>
        <div className={styles.abstractDashboard}><div /><div /><div /><div /><div /><div /></div>
      </div>
      <div className={`${styles.mosaicCard} ${styles.mosaicQuote}`}>
        <MessageSquareText size={18} /><p>“One operating system for the work between research and publishing.”</p><span>UpTrendifyOS workflow</span>
      </div>
    </div>
  );
}

function WorkflowStack({ reverse = false, eyebrow, title, body, items, icon: Icon }: { reverse?: boolean; eyebrow: string; title: string; body: string; items: string[]; icon: LucideIcon }) {
  return (
    <div className={`${styles.workflowFeature} ${reverse ? styles.workflowReverse : ''}`}>
      <div className={styles.workflowVisual}>
        <div className={styles.stackShadow} />
        <div className={`${styles.stackLayer} ${styles.layerOne}`}><Icon size={28} /></div>
        <div className={`${styles.stackLayer} ${styles.layerTwo}`}><Check size={26} /></div>
        <div className={`${styles.stackLayer} ${styles.layerThree}`}><Sparkles size={27} /></div>
        <div className={styles.stackLabel}>UpTrendifyOS</div>
      </div>
      <div className={styles.workflowCopy}>
        <span className={styles.eyebrow}>{eyebrow}</span><h3>{title}</h3><p>{body}</p>
        <ul>{items.map((item) => <li key={item}><CheckCircle2 size={15} />{item}</li>)}</ul>
        <a href="/about" className={styles.textLink}>Learn more <ArrowRight size={14} /></a>
      </div>
    </div>
  );
}

export function Landing() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accountLoading, setAccountLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [account, setAccount] = useState<LandingAccount | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAccount() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) { setAuthenticated(false); setAccount(null); }
          return;
        }
        if (!cancelled) setAuthenticated(true);
        const response = await fetch('/api/auth/organizations', { cache: 'no-store' });
        const body = await response.json().catch(() => null);
        const organizations = Array.isArray(body?.organizations) ? body.organizations : [];
        const current = organizations.find((item: { id?: string }) => item.id === body?.currentOrganizationId) ?? organizations[0] ?? null;
        if (!cancelled && current && isOrgRole(current.role)) {
          setAccount({ email: user.email ?? '', firstName: typeof user.user_metadata?.first_name === 'string' ? user.user_metadata.first_name : '', organizationName: current.name || 'Workspace', role: current.role });
        } else if (!cancelled) setAccount(null);
      } catch {
        if (!cancelled) setAccount(null);
      } finally {
        if (!cancelled) setAccountLoading(false);
      }
    }
    void loadAccount();
    return () => { cancelled = true; };
  }, []);

  async function handleStart() {
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      window.location.href = user ? '/dashboard' : '/register';
    } catch { window.location.href = '/register'; }
  }
  const closeMobile = () => setMobileOpen(false);

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <a href="/" className={styles.brand} aria-label="UpTrendifyOS home"><span className={styles.brandMark}><span /></span><span>UpTrendifyOS</span></a>
        <nav className={styles.navLinks} aria-label="Primary navigation"><a href="#platform">Platform</a><a href="#workflow">Workflow</a><a href="#teams">For teams</a><a href="/about">About</a></nav>
        <div className={styles.navActions}>
          {accountLoading ? <span className={styles.accountSkeleton} aria-hidden="true" /> : account ? <><span className={styles.accountPill} title={account.email}><span className={styles.accountAvatar}>{initialsForAccount(account)}</span><span><strong>{account.organizationName}</strong><small>{account.role.toLowerCase()}</small></span></span><a className={styles.darkButton} href={ROLE_DESTINATIONS[account.role].href}>{ROLE_DESTINATIONS[account.role].label}<ArrowRight size={14} /></a></> : authenticated ? <a className={styles.darkButton} href="/dashboard">Open workspace<ArrowRight size={14} /></a> : <><a className={styles.navSignIn} href="/login">Log in</a><a className={styles.darkButton} href="/register">Start free<ArrowRight size={14} /></a></>}
        </div>
        <button className={styles.menuButton} type="button" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle navigation" aria-expanded={mobileOpen}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button>
        {mobileOpen && <div className={styles.mobileMenu}><a href="#platform" onClick={closeMobile}>Platform</a><a href="#workflow" onClick={closeMobile}>Workflow</a><a href="#teams" onClick={closeMobile}>For teams</a><a href="/about" onClick={closeMobile}>About</a><a href="/contact" onClick={closeMobile}>Contact</a><a href="/feedback" onClick={closeMobile}>Feedback</a><a href="/report-issue" onClick={closeMobile}>Report issue</a>{account ? <a className={styles.darkButton} href={ROLE_DESTINATIONS[account.role].href} onClick={closeMobile}>{ROLE_DESTINATIONS[account.role].label}</a> : authenticated ? <a className={styles.darkButton} href="/dashboard" onClick={closeMobile}>Open workspace</a> : <><a href="/login" onClick={closeMobile}>Log in</a><a className={styles.darkButton} href="/register" onClick={closeMobile}>Start free</a></>}</div>}
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroGlow} />
          <Reveal className={styles.heroContent}>
            <span className={styles.eyebrow}><Sparkles size={13} /> AI Marketing Operating System</span>
            <h1>Automate the busywork.<br /><span>Focus on what matters.</span></h1>
            <p>Turn brand research into approved intelligence, strategy, campaigns and publish-ready content without losing context between teams.</p>
            <div className={styles.heroActions}><button className={styles.primaryButton} type="button" onClick={handleStart} disabled={loading}>{loading ? 'Working…' : <>Start your workspace <ArrowRight size={15} /></>}</button><a className={styles.playLink} href="#workflow"><span className={styles.playIcon}><Play size={11} fill="currentColor" /></span> See how it works</a></div>
          </Reveal>
          <Reveal delay={100} className={styles.heroVisualWrap}><AILoopGraphic /></Reveal>
        </section>

        <section className={styles.centerSection} id="platform">
          <Reveal><span className={styles.eyebrow}>Next-Gen <span className={styles.inlineIcons}>◈ ◉ ◇</span> Marketing Automation</span><h2>One connected system for the work that moves your brand forward.</h2><p className={styles.sectionIntro}>Research the business, build the Brand Brain, create strategy, organize campaigns, generate content, approve the exact version and prepare it for publishing.</p></Reveal>
          <div className={styles.productGrid}><Reveal delay={50}><ProductCard number="01" icon={Globe2} title="Evidence first" body="Start with public brand research and keep the source trail attached to the intelligence." /></Reveal><Reveal delay={120}><ProductCard number="02" icon={ShieldCheck} title="Human approval" body="Review the Brand Brain before it becomes trusted context for downstream strategy." /></Reveal><Reveal delay={190}><ProductCard number="03" icon={Workflow} title="Workflow aware" body="Move from approved truth to strategy, campaign, content, approval and publishing." /></Reveal></div>
        </section>

        <section className={styles.agentsSection} id="teams">
          <Reveal><span className={styles.eyebrow}>AI Agents for Every Team</span><h2>Built around the way marketing teams actually work.</h2><p className={styles.sectionIntro}>A shared operating system for agencies, growing teams and brand owners, with roles and tenant boundaries preserved underneath.</p></Reveal>
          <Reveal delay={90}><Mosaic /></Reveal>
        </section>

        <section className={styles.modularSection} id="workflow">
          <Reveal><span className={styles.eyebrow}>Modular workflows</span><h2>Build the workflow your team needs.</h2><p className={styles.sectionIntro}>Each stage has a clear responsibility, while the same approved brand context keeps the whole system connected.</p></Reveal>
          <Reveal delay={80}><WorkflowStack eyebrow="01 · Research → Brand Brain" title="Turn a public website into structured brand intelligence." body="UpTrendifyOS discovers the public footprint, extracts useful evidence and turns it into reviewable suggestions instead of hiding uncertainty behind a polished answer." items={['Source-aware research', 'Structured Brand Brain suggestions', 'Human approval before strategy']} icon={Search} /></Reveal>
          <Reveal delay={80}><WorkflowStack reverse eyebrow="02 · Strategy → Campaigns" title="Turn approved context into an actionable marketing plan." body="Once the Brand Brain gate is satisfied, strategy can use the approved context to define objectives, audiences, positioning, messaging and campaign direction." items={['Approved-context strategy', 'Campaign planning linked to strategy', 'Clear next action at every stage']} icon={Target} /></Reveal>
          <Reveal delay={80}><WorkflowStack eyebrow="03 · Content → Publishing" title="Create, review and publish without crossing the approval boundary." body="Content versions remain separate from final approval. The Approval Queue owns the decision, and publishing reports a real provider outcome rather than pretending a disconnected channel worked." items={['Versioned content', 'Central Approval Queue', 'SUCCESS / NOT_CONNECTED / FAILED outcomes']} icon={Zap} /></Reveal>
        </section>

        <section className={styles.testimonialSection}>
          <Reveal><span className={styles.eyebrow}>The UpTrendifyOS principle</span><div className={styles.testimonial}><div className={styles.quoteMark}>“</div><p>Research should become context. Context should become decisions. Decisions should become work.</p><span>UpTrendifyOS · Research → Review → Strategy → Execution</span></div></Reveal>
          <div className={styles.statsGrid}><Reveal delay={50}><div className={styles.stat}><strong>7</strong><span>connected workflow stages</span></div></Reveal><Reveal delay={100}><div className={styles.stat}><strong>1</strong><span>shared brand context</span></div></Reveal><Reveal delay={150}><div className={styles.stat}><strong>6</strong><span>role-aware workspace roles</span></div></Reveal><Reveal delay={200}><div className={styles.stat}><strong>0</strong><span>fake publishing success states</span></div></Reveal></div>
        </section>

        <section className={styles.ctaSection}>
          <div className={styles.ctaGlow} />
          <Reveal><span className={styles.eyebrow}>Ready to turn AI adoption into a usable workflow?</span><h2>Put your brand context to work.</h2><p>Start with research. Keep the evidence. Approve the truth. Then move into strategy, campaigns, content and publishing.</p><div className={styles.heroActions}><button className={styles.primaryButton} type="button" onClick={handleStart} disabled={loading}>{loading ? 'Working…' : <>Build your workspace <ArrowRight size={15} /></>}</button><a className={styles.outlineButton} href="/about">Explore UpTrendifyOS</a></div></Reveal>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}><a href="/" className={styles.brand}><span className={styles.brandMark}><span /></span>UpTrendifyOS</a><p>AI-powered marketing operations from research to publishing.</p></div>
        <div className={styles.footerColumns}><div><strong>Product</strong><a href="#platform">Platform</a><a href="#workflow">Workflow</a><a href="#teams">For teams</a></div><div><strong>Company</strong><a href="/about">About</a><a href="/contact">Contact</a><a href="/feedback">Feedback</a><a href="/report-issue">Report issue</a></div><div><strong>Legal</strong><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/login">Log in</a></div></div>
        <div className={styles.footerBottom}>© {new Date().getFullYear()} UpTrendifyOS · Research → Review → Strategy → Execution</div>
      </footer>
    </div>
  );
}
