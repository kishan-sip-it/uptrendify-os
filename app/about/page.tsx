import type { Metadata } from 'next';
import { ArrowRight, Bot, CheckCircle2, Fingerprint, ShieldCheck, Workflow } from 'lucide-react';
import { InfoCard, PublicShell } from '@/components/public/public-site';

export const metadata: Metadata = {
  title: 'About UpTrendifyOS',
  description: 'Why UpTrendifyOS exists and how its human-controlled marketing workflow is designed.',
};

export default function AboutPage() {
  return (
    <PublicShell
      active="/about"
      eyebrow="About the product"
      title="Marketing work should move forward, not disappear between tools."
      intro="UpTrendifyOS connects research, approved brand intelligence, strategy, content, campaigns, human approval and publishing into one visible operating flow."
    >
      <div className="public-story-grid">
        <article className="public-story-card public-story-featured">
          <div className="public-eyebrow"><Workflow size={13} /> The idea</div>
          <h2>Context is the product.</h2>
          <p>Most marketing workflows create useful work and then immediately make the next person reconstruct it. UpTrendifyOS is designed around the opposite idea: research should inform Brand Brain, approved Brand Brain should unlock strategy, strategy should guide campaigns and content, and the exact approved content version should reach publishing only through the intended human gate.</p>
          <div className="public-story-line"><span /> Research <span /> Review <span /> Strategy <span /> Execute</div>
        </article>
        <div className="public-story-stack">
          <InfoCard icon={<Bot size={18} />} title="AI with boundaries">AI can research, structure and generate. Human approval remains the authority boundary for brand truth and final content decisions.</InfoCard>
          <InfoCard icon={<Fingerprint size={18} />} title="Built around real work">Brands, strategies, campaigns and content remain connected so the team can understand what happened and what comes next.</InfoCard>
        </div>
      </div>

      <div className="public-section-heading"><div className="public-eyebrow">Principles</div><h2>What the system is built to protect.</h2></div>
      <div className="public-info-grid">
        <InfoCard icon={<ShieldCheck size={18} />} title="Human control">Suggestions can be reviewed, edited or rejected before they become authoritative downstream context.</InfoCard>
        <InfoCard icon={<CheckCircle2 size={18} />} title="Visible gates">Draft, approval and publishing are separate states. A connector that does not exist is never presented as a successful publish.</InfoCard>
        <InfoCard icon={<Workflow size={18} />} title="Continuous context">The next action should be obvious without forcing the user to remember which page contains the next step.</InfoCard>
      </div>

      <section className="public-about-cta">
        <div>
          <div className="public-eyebrow">Help shape it</div>
          <h2>Tell us where the workflow still gets in your way.</h2>
          <p>Feedback and issue reports are part of the product loop, not decorative links at the bottom of a page.</p>
        </div>
        <div className="public-contact-actions">
          <a className="public-button" href="/feedback">Share feedback <ArrowRight size={14} /></a>
          <a className="public-button secondary" href="/report-issue">Report an issue <ArrowRight size={14} /></a>
        </div>
      </section>
    </PublicShell>
  );
}
