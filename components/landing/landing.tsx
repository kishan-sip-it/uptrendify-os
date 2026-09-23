'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BarChart3, Blocks, Bot, Boxes, CheckCircle2, FileCheck2, Globe2, Layers,
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
  { icon: Search, label: 'Research', note: 'Understand the business from its website', tone: '#278b69' },
  { icon: Bot, label: 'Brand Intelligence', note: 'Turn evidence into structured suggestions', tone: '#3b8f7a' },
  { icon: FileCheck2, label: 'Brand review', note: 'Approve the facts you trust', tone: '#4f9f89' },
  { icon: Target, label: 'Strategy', note: 'Build the marketing plan', tone: '#5cae96' },
  { icon: Sparkles, label: 'Content Studio', note: 'Create the assets to publish', tone: '#69bfa5' },
  { icon: Boxes, label: 'Campaigns', note: 'Organize assets around initiatives', tone: '#4da98d' },
  { icon: CheckCircle2, label: 'Approval → Publishing', note: 'Approve the exact version, then connect a channel', tone: '#278b69' },
];

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: Globe2, title: 'Audit any public site', description: 'Read relevant public pages, extract evidence and keep the result reviewable instead of pretending a guess is a fact.' },
  { icon: FileCheck2, title: 'Human-in-the-loop review', description: 'Every brand-intelligence suggestion lands in a review inbox. Approve, edit, reject, or ask the AI to regenerate each field.' },
  { icon: LockKeyhole, title: 'Strategies from approved truth', description: 'The strategy engine is gated: it only consumes facts you approved, so nothing made-up ever ships to a client.' },
  { icon: Users, title: 'Agency + business workspaces', description: 'Agencies can manage multiple brands while a business can focus on its own brand — with roles, brand switchers and tenant isolation.' },
  { icon: BarChart3, title: 'Live run dashboard', description: 'Watch research jobs, approval pipelines and strategy versions stream in real time as your AI works.' },
  { icon: Layers, title: 'One system, forever', description: 'Research, brand intelligence, strategy, content and campaigns — a single OS your whole team runs on.' },
];

const METRICS: { value: string; label: string }[] = [
  { value: '7', label: 'Connected workflow stages' },
  { value: '1', label: 'Shared brand context' },
  { value: 'Human', label: 'Approval stays in the loop' },
  { value: '1', label: 'Workspace for the workflow' },
];

const PIPELINE: { step: string; label: string }[] = WORKFLOW.map((item, index) => ({
  step: String(index + 1).padStart(2, '0'),
  label: item.label,
}));

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
      { index: 0, log: 'Discovering public pages…', wait: 400 },
      { index: 1, log: 'Extracting product claims from the available pages', wait: 900, done: true },
      { index: 2, log: 'Brand intelligence drafted · waiting for human review', wait: 1100, done: true },
      { index: 3, log: 'Approved intelligence → strategy unlocked', wait: 900, done: true },
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
  const heroRef = useRef<HTMLElement | null>(null);

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
        color="#8fb5a1"
        accentColor="#a7c3b4"
        count={4}
        size={3}
        merge={0.77}
        glow={0.2}
        opacity={0.22}
        spread={100}
        separation={0.15}
        speed={0.65}
        wander={0.25}
        trail={0.75}
        scatterOnClick
        enabled
        repelRef={heroRef}
        excludeSelector=".landing-nav, .landing-links, .landing-actions, .landing-mobile, .landing-hero, a, button, input, textarea, select, [role='button'], [data-swarm-exclude], .landing-metric, .landing-feature-card, .landing-how-card, .border-glow-card"
      />
      <header className="landing-nav">
        <a href="/" className="landing-logo" aria-label="UpTrendifyOS home">
          <span className="logo" style={{ width: 22, height: 22 }} /> UpTrendifyOS
        </a>
        <nav className="landing-links" aria-label="Primary">
          <a href="#platform" onClick={() => setMobileOpen(false)}>Platform</a>
          <a href="#why" onClick={() => setMobileOpen(false)}>Why it exists</a>
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
            <a href="#why" onClick={() => setMobileOpen(false)}>Why it exists</a>
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
          linesColor="#FFFFFF"
          gridScale={0.1}
          scanColor="#A8E6C5"
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
          lightMode={true}
          className=""
          style={{}}
        />
        <Reveal>
          <div className="landing-eyebrow"><Sparkles size={13} /> AI Marketing Agency OS</div>
        </Reveal>
        <Reveal delay={80}>
          <WarpText
            text="From a brand website to a complete marketing workflow."
            color="#173126"
            fontSize="clamp(2.5rem, 6vw, 5rem)"
            fontWeight={800}
            warpStrength={0.05}
            speed={0.4}
            pointerStrength={0.3}
          />
        </Reveal>
        <Reveal delay={160}>
          <p className="landing-hero-sub">
            Research the business. Review what AI discovered. Build the strategy. Create content, organize campaigns, approve the exact version, and prepare it for publishing.
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
                backgroundColor="#f3faf6"
                borderRadius={999}
                glowRadius={18}
                glowIntensity={0.6}
                colors={['#67C79F', '#278B69', '#9AD9BE']}
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
            <BorderGlow
              className="landing-card-glow landing-metric-glow"
              borderRadius={16}
              edgeSensitivity={16}
              glowColor="280 85 85"
              backgroundColor="#fffdf8"
              glowRadius={48}
              glowIntensity={0.65}
              coneSpread={28}
              animated={false}
              colors={['#67C79F', '#278B69', '#9AD9BE']}
              fillOpacity={0.28}
            >
              <div className="landing-metric">
                <div className="landing-metric-value">{metric.value}</div>
                <div className="landing-metric-label">{metric.label}</div>
              </div>
            </BorderGlow>
          </Reveal>
        ))}
      </section>

      <section className="landing-section" id="platform">
        <Reveal>
          <div className="landing-section-head">
            <div className="landing-eyebrow"><Blocks size={13} /> The platform</div>
            <h2>Built like mission control for growth, not a chat wrapper.</h2>
            <p>Every AI claim has a source. Every strategy has a review. Every brand has a clear workspace and next action.</p>
          </div>
        </Reveal>
        <div className="landing-features">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <Reveal delay={(i % 3) * 80} key={feature.title}>
                <BorderGlow
                  className="landing-card-glow landing-feature-glow hover-lift"
                  borderRadius={16}
                  edgeSensitivity={16}
                  glowColor="280 85 85"
                  backgroundColor="#fffdf8"
                  glowRadius={48}
                  glowIntensity={0.65}
                  coneSpread={28}
                  animated={false}
                  colors={['#9FC7B4', '#4F8B72', '#C6DCCF']}
                  fillOpacity={0.28}
                >
                  <div className="landing-feature-card">
                    <span className="landing-feature-icon"><Icon size={19} /></span>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                  </div>
                </BorderGlow>
              </Reveal>
            );
          })}
        </div>
      </section>

      <section className="landing-section landing-alt" id="why">
        <Reveal>
          <div className="landing-section-head">
            <div className="landing-eyebrow"><Workflow size={13} /> Why it exists</div>
            <h2>Marketing gets noisy when every stage starts from zero.</h2>
            <p>UpTrendifyOS keeps the context moving forward so the next stage can use the work that already happened.</p>
          </div>
        </Reveal>
        <div className="landing-features">
          {[
            { icon: Search, title: 'Context gets lost', description: 'Research, strategy and content often live in separate tools, so the same brand story gets retyped again and again.' },
            { icon: Bot, title: 'AI needs guardrails', description: 'AI can produce plausible output. UpTrendifyOS separates discovery from human-approved brand truth.' },
            { icon: FileCheck2, title: 'Approval belongs in the workflow', description: 'Review is a real stage, so the user knows what is trusted and what can happen next.' },
          ].map((feature, i) => {
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
            { icon: Search, title: '1 · Research', description: 'Give UpTrendifyOS a public brand website. The system crawls it, extracts evidence and reports what it could actually verify.' },
            { icon: Bot, title: '2 · Brand Intelligence', description: 'AI organizes the evidence into identity, audience, offer, positioning, messaging, SEO and competition topics.' },
            { icon: FileCheck2, title: '3 · Brand review', description: 'Approve, edit or reject the suggestions. Nothing becomes an authoritative brand fact without a human decision.' },
            { icon: Target, title: '4 · Strategy', description: 'Once the Brand Brain gate is satisfied, generate a marketing plan grounded in the approved intelligence.' },
            { icon: Sparkles, title: '5 · Content Studio', description: 'Turn the strategy into actual content assets with versioning and the existing content workflow.' },
            { icon: Boxes, title: '6 · Campaigns', description: 'Group content around an objective, audience, channels, dates and budget.' },
            { icon: CheckCircle2, title: '7 · Approval & Publishing', description: 'Approve the exact content version. Publishing remains honest: unconnected channels stay READY TO PUBLISH.' },
          ].map((step, i) => {
            const Icon = step.icon;
            return (
              <Reveal delay={i * 90} key={step.title}>
                <BorderGlow
                  className="landing-card-glow landing-how-glow"
                  borderRadius={16}
                  edgeSensitivity={16}
                  glowColor="280 85 85"
                  backgroundColor="#fffdf8"
                  glowRadius={48}
                  glowIntensity={0.65}
                  coneSpread={28}
                  animated={false}
                  colors={['#9FC7B4', '#4F8B72', '#C6DCCF']}
                  fillOpacity={0.28}
                >
                  <div className="landing-how-card">
                    <span className="landing-how-icon"><Icon size={18} /></span>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </BorderGlow>
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
            <p>Understand your brand first. Then move forward with evidence, strategy and clear next actions.</p>
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