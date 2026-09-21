'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BarChart3, Blocks, Bot, FileCheck2, Globe2, Layers,
  LockKeyhole, Menu, Search, ShieldCheck, Sparkles, Target, Users, Workflow, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import BorderGlow from '@/components/react-bits/BorderGlow';
import GridScan from '@/components/ui/GridScan';
import SwarmCursor from '@/components/react-bits/SwarmCursor';
import WarpText from '@/components/react-bits/WarpText';

type StepState = 'pending' | 'running' | 'done';

const WORKFLOW: { icon: LucideIcon; label: string; note: string; tone: string }[] = [
  { icon: Search, label: 'Crawl your site', note: 'Public pages discovered', tone: '#60a5fa' },
  { icon: Bot, label: 'Extract intelligence', note: 'Facts with honest evidence', tone: '#c084fc' },
  { icon: FileCheck2, label: 'Review suggestions', note: 'Approve · edit · reject', tone: '#34d399' },
  { icon: Target, label: 'Generate strategy', note: 'From approved truth only', tone: '#fbbf24' },
  { icon: Workflow, label: 'Execute & iterate', note: 'Content, campaigns, playbooks', tone: '#fb923c' },
];

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: Globe2, title: 'Audit any public site', description: 'Crawl hundreds of pages, extract honest facts with cited, verified evidence — never guessed AI output.' },
  { icon: FileCheck2, title: 'Human-in-the-loop review', description: 'Every brand-intelligence suggestion lands in a review inbox. Approve, edit, reject, or ask the AI to regenerate each field.' },
  { icon: LockKeyhole, title: 'Strategies from approved truth', description: 'The strategy engine is gated: it only consumes facts you approved, so nothing made-up ever ships to a client.' },
  { icon: Users, title: 'Multi-client workspace', description: 'One command center for every brand across your agency — with roles, brand switchers and cross-brand visibility.' },
  { icon: BarChart3, title: 'Live run dashboard', description: 'Watch research jobs, approval pipelines and strategy versions stream in real time as your AI works.' },
  { icon: Layers, title: 'One system, forever', description: 'Research, brand intelligence, strategy, content and campaigns — a single OS your whole team runs on.' },
];

const METRICS: { value: string; label: string }[] = [
  { value: '26', label: 'Intelligence fields per brand' },
  { value: '4+', label: 'Approvals before a strategy can generate' },
  { value: '100%', label: 'Evidence-cited facts' },
  { value: '10×', label: 'Faster from brief to campaign' },
];

const PIPELINE: { step: string; label: string }[] = [
  { step: 'A', label: 'Research' },
  { step: 'B', label: 'Review' },
  { step: 'C', label: 'Strategy' },
  { step: 'D', label: 'Execute' },
];

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`landing-reveal${visible ? ' in' : ''}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function WorkflowDemo() {
  const [stepIndex, setStepIndex] = useState<StepState[]>(new Array(WORKFLOW.length).fill('pending'));
  const [liveLog, setLiveLog] = useState<string>('Idle — start a research run');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const timer = window.setTimeout(() => setStepIndex((prev) => prev.map(() => 'pending')), 500);
    const sequence: { index: number; log: string; wait: number; done?: boolean }[] = [
      { index: 0, log: 'Crawling sitemap… 3,240 URLs queued', wait: 400 },
      { index: 1, log: 'Page 21/43 — extracting product claims', wait: 900, done: true },
      { index: 2, log: '26 suggestions drafted · 4 strong, 9 partial', wait: 1100, done: true },
      { index: 3, log: '12 approved → strategy unlocked', wait: 900, done: true },
      { index: 4, log: 'Roadmap drafted · waiting on client', wait: 600, done: true },
    ];
    const timeouts: number[] = [];
    sequence.forEach((entry, i) => {
      const id = window.setTimeout(() => {
        setStepIndex((prev) => prev.map((s, idx) => (idx === entry.index ? 'running' : s)));
        setLiveLog(entry.log);
        if (entry.done) {
          const doneId = window.setTimeout(() => {
            setStepIndex((prev) => prev.map((s, idx) => (idx === entry.index ? 'done' : s)));
          }, 500);
          timeouts.push(doneId);
        }
      }, timer + i * entry.wait);
      timeouts.push(id);
    });
    return () => {
      window.clearTimeout(timer);
      timeouts.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return (
    <div className="landing-terminal" role="img" aria-label="Research pipeline progressing through crawl, extraction, review, strategy and execution">
      <div className="landing-terminal-bar">
        <span />
        <span />
        <span />
        <span className="landing-terminal-title">uptrendify://brand/acme-scout/research</span>
      </div>
      <div className="landing-terminal-body">
        <div className="landing-steps">
          {WORKFLOW.map((entry, i) => {
            const Icon = entry.icon;
            const state = stepIndex[i] ?? 'pending';
            return (
              <div className={`landing-step step-${state}`} key={entry.label}>
                <span className="landing-step-icon" style={{ ['--step-tone' as string]: entry.tone }}>
                  <Icon size={15} />
                </span>
                <div>
                  <div className="landing-step-label">{entry.label}</div>
                  <div className="landing-step-note">{entry.note}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="landing-log">▸ <span className="landing-log-live">{liveLog}</span></div>
      </div>
    </div>
  );
}

export function Landing() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [swarmActive, setSwarmActive] = useState(false);
  const heroRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setSwarmActive(!entry.isIntersecting);
      },
      { threshold: 0 },
    );

    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  async function handleStart() {
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      window.location.href = user ? '/' : '/register';
    } catch {
      // Auth/network failure must not break the public landing CTA.
      window.location.href = '/register';
    }
  }

  return (
    <div className="landing">
      <SwarmCursor
        color="#ffffff"
        accentColor="#ffffff"
        count={8}
        size={5}
        merge={0.77}
        glow={0.75}
        opacity={0.6}
        spread={100}
        separation={0.15}
        speed={1.25}
        wander={0.25}
        trail={0.75}
        scatterOnClick
        enabled={swarmActive}
      />
      <header className="landing-nav">
        <a href="/" className="landing-logo" aria-label="UpTrendifyOS home">
          <span className="logo" style={{ width: 22, height: 22 }} /> UpTrendifyOS
        </a>
        <nav className="landing-links" aria-label="Primary">
          <a href="#platform" onClick={() => setMobileOpen(false)}>Platform</a>
          <a href="#how-it-works" onClick={() => setMobileOpen(false)}>How it works</a>
          <a href="#workflow" onClick={() => setMobileOpen(false)}>Workflow</a>
        </nav>
        <div className="landing-actions">
          <a className="landing-ghost" href="/login">Sign in</a>
          <a className="landing-cta" href="/register">Get started <ArrowRight size={14} /></a>
        </div>
        <button
          type="button"
          className="landing-menu"
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        {mobileOpen ? (
          <div className="landing-mobile">
            <a href="#platform" onClick={() => setMobileOpen(false)}>Platform</a>
            <a href="#how-it-works" onClick={() => setMobileOpen(false)}>How it works</a>
            <a href="#workflow" onClick={() => setMobileOpen(false)}>Workflow</a>
            <a href="/login" onClick={() => setMobileOpen(false)}>Sign in</a>
            <a href="/register" className="landing-cta" style={{ justifyContent: 'center' }} onClick={() => setMobileOpen(false)}>Get started</a>
          </div>
        ) : null}
      </header>

      <section ref={heroRef} className="landing-hero">
        <GridScan
          enableWebcam={false}
          showPreview={false}
          sensitivity={0.55}
          lineThickness={1}
          linesColor="#2F293A"
          gridScale={0.1}
          scanColor="#FF9FFC"
          scanOpacity={0.4}
          lineStyle="solid"
          lineJitter={0.1}
          scanDirection="pingpong"
          enablePost={true}
          bloomIntensity={0.6}
          bloomThreshold={0}
          bloomSmoothing={0}
          chromaticAberration={0.002}
          noiseIntensity={0.01}
          scanGlow={0.5}
          scanSoftness={2}
          scanPhaseTaper={0.9}
          scanDuration={2.0}
          scanDelay={2.0}
          enableGyro={false}
          scanOnClick={false}
          snapBackDelay={250}
          lightMode={false}
          className=""
          style={{}}
        />
        <Reveal>
          <div className="landing-eyebrow"><Sparkles size={13} /> AI Marketing Agency OS</div>
        </Reveal>
        <Reveal delay={80}>
          <WarpText
            text="Every client brand. One operating system."
            color="#f8f5ff"
            fontSize="clamp(2.5rem, 6vw, 5rem)"
            fontWeight={800}
            warpStrength={0.05}
            speed={0.4}
            pointerStrength={0.3}
          />
        </Reveal>
        <Reveal delay={160}>
          <p className="landing-hero-sub">
            UpTrendifyOS researches public websites with AI, then makes every claim checkable — so
            you approve the truth, the AI drafts the strategy, and your agency ships faster.
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="landing-hero-actions">
            <button type="button" className="landing-cta" onClick={handleStart} disabled={loading} style={{ fontSize: 15, padding: '14px 22px', cursor: 'pointer' }}>
              {loading ? 'Working…' : <>Start your workspace <ArrowRight size={15} /></>}
            </button>
            <a className="landing-ghost" href="#how-it-works">See the workflow</a>
          </div>
        </Reveal>
        <Reveal delay={320}>
          <div className="landing-pipeline" aria-hidden="true">
            {PIPELINE.map((item) => (
              <BorderGlow
                key={item.step}
                className="landing-pipeline-glow"
                backgroundColor="#120F17"
                borderRadius={999}
                glowRadius={18}
                glowIntensity={0.6}
                colors={['#A855F7', '#D946EF', '#8B5CF6']}
              >
                <div className="landing-pipeline-step">
                  <span className="landing-pipeline-badge">{item.step}</span>
                  <span className="landing-pipeline-label">{item.label}</span>
                </div>
              </BorderGlow>
            ))}
          </div>
        </Reveal>
        <Reveal delay={400}>
          <WorkflowDemo />
        </Reveal>
      </section>

      <section className="landing-metrics" aria-label="Platform at a glance">
        {METRICS.map((metric, i) => (
          <Reveal delay={i * 70} key={metric.label}>
            <div className="landing-metric">
              <div className="landing-metric-value">{metric.value}</div>
              <div className="landing-metric-label">{metric.label}</div>
            </div>
          </Reveal>
        ))}
      </section>

      <section className="landing-section" id="platform">
        <Reveal>
          <div className="landing-section-head">
            <div className="landing-eyebrow"><Blocks size={13} /> The platform</div>
            <h2>Built like mission control for growth, not a chat wrapper.</h2>
            <p>Every AI claim has a source. Every strategy has a review. Every client has a workspace.</p>
          </div>
        </Reveal>
        <div className="landing-features">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <Reveal delay={(i % 3) * 80} key={feature.title}>
                <div className="landing-feature-card hover-lift">
                  <span className="landing-feature-icon"><Icon size={19} /></span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      <section className="landing-section landing-alt" id="how-it-works">
        <Reveal>
          <div className="landing-section-head">
            <div className="landing-eyebrow"><Bot size={13} /> How it works</div>
            <h2>From noisy website to client-approved strategy.</h2>
            <p>A workflow your whole team can trust, because nobody clicks “approve” on a guess.</p>
          </div>
        </Reveal>
        <div className="landing-how">
          {[
            { icon: Search, title: '1 · Research', description: 'Give us a URL. The crawler maps your client\u2019s public site and extracts raw brand intelligence with sources.' },
            { icon: ShieldCheck, title: '2 · Review', description: '26 suggestion cards land in your review inbox — each with strong, partial or weak evidence and a cited excerpt to check.' },
            { icon: FileCheck2, title: '3 · Approve', description: 'Approve what\u2019s true, edit what\u2019s close, reject what\u2019s not. Nothing becomes authoritative without you.' },
            { icon: Target, title: '4 · Strategy', description: 'Only approved facts feed the strategy engine, so the positioning, messaging and roadmap are grounded in reality.' },
          ].map((step, i) => {
            const Icon = step.icon;
            return (
              <Reveal delay={i * 90} key={step.title}>
                <div className="landing-how-card">
                  <span className="landing-how-icon"><Icon size={18} /></span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      <section className="landing-section" id="workflow">
        <Reveal>
          <div className="landing-section-head">
            <div className="landing-eyebrow"><Globe2 size={13} /> Try it live</div>
            <h2>Give it a URL. Watch it work.</h2>
            <p>UpTrendifyOS is free to start — your first brand audit takes minutes, not days.</p>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="landing-cta-wrap">
            <button type="button" className="landing-cta" onClick={handleStart} disabled={loading} style={{ fontSize: 15, padding: '15px 26px', cursor: 'pointer' }}>
              {loading ? 'Working…' : <>Create your workspace <ArrowRight size={15} /></>}
            </button>
            <a className="landing-ghost" href="/login">I already have an account</a>
          </div>
        </Reveal>
      </section>

      <footer className="landing-footer">
        <div className="landing-logo">
          <span className="logo" style={{ width: 18, height: 18 }} /> UpTrendifyOS
        </div>
        <div className="landing-footer-links">
          <a href="#platform">Platform</a>
          <a href="#how-it-works">How it works</a>
          <a href="/login">Sign in</a>
        </div>
        <div className="landing-footer-note">© {new Date().getFullYear()} UpTrendifyOS · Research → Review → Strategy</div>
      </footer>
    </div>
  );
}