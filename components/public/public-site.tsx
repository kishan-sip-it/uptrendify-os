'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, CircleAlert, FileText, Globe2,
  HeartHandshake, Mail, MessageSquare, ShieldCheck, Sparkles, TriangleAlert,
} from 'lucide-react';

type PublicNavProps = { active?: string };

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/feedback', label: 'Feedback' },
  { href: '/report-issue', label: 'Report issue' },
];

export function PublicHeader({ active }: PublicNavProps) {
  return (
    <header className="public-header">
      <a href="/" className="public-brand" aria-label="UpTrendifyOS home">
        <span className="logo" />
        <span>UpTrendifyOS</span>
      </a>
      <nav className="public-nav" aria-label="Public navigation">
        {NAV.map((item) => (
          <a key={item.href} href={item.href} className={active === item.href ? 'active' : ''}>
            {item.label}
          </a>
        ))}
      </nav>
      <a href="/register" className="public-header-cta">Get started <ArrowRight size={14} /></a>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div>
        <a href="/" className="public-brand"><span className="logo" /> <span>UpTrendifyOS</span></a>
        <p>Research → Review → Strategy → Content → Approval → Publishing.</p>
      </div>
      <div className="public-footer-links">
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
        <a href="/feedback">Feedback</a>
        <a href="/report-issue">Report issue</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
      </div>
      <div className="public-footer-note">© {new Date().getFullYear()} UpTrendifyOS</div>
    </footer>
  );
}

export function PublicShell({ active, eyebrow, title, intro, children }: PublicNavProps & {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <main className="public-site">
      <div className="public-aurora public-aurora-one" aria-hidden="true" />
      <div className="public-aurora public-aurora-two" aria-hidden="true" />
      <PublicHeader active={active} />
      <section className="public-hero">
        <div className="public-eyebrow"><Sparkles size={13} /> {eyebrow}</div>
        <h1>{title}</h1>
        <p>{intro}</p>
      </section>
      <section className="public-content">{children}</section>
      <PublicFooter />
    </main>
  );
}

function openMailDraft(subject: string, body: string): boolean {
  const recipient = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  if (!recipient) return false;
  const href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = href;
  return true;
}

export function AudienceForm({ mode }: { mode: 'feedback' | 'issue' }) {
  const isIssue = mode === 'issue';
  const [submitted, setSubmitted] = useState(false);
  const [deliveryReady, setDeliveryReady] = useState(true);
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [severity, setSeverity] = useState('Normal');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subject = isIssue ? `[UpTrendifyOS issue] ${message}` : `[UpTrendifyOS feedback] ${message}`;
    const body = [
      `Type: ${isIssue ? 'Issue report' : 'Feedback'}`,
      isIssue ? `Severity: ${severity}` : '',
      `Reply email: ${email || 'Not provided'}`,
      '',
      details,
    ].filter(Boolean).join('\n');
    const opened = openMailDraft(subject, body);
    setDeliveryReady(opened);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="public-form-success">
        <CheckCircle2 size={22} />
        <div>
          <h3>{deliveryReady ? 'Your message is ready to send.' : 'Your message is prepared.'}</h3>
          <p>
            {deliveryReady
              ? 'Your email composer should now contain the structured message. Review it and send it when ready.'
              : 'A delivery email is not configured in this deployment, so no fake “sent” state is shown. Copy the details below and send them through your preferred contact channel.'}
          </p>
          {!deliveryReady ? <pre className="public-message-preview">{details}</pre> : null}
          <button type="button" className="public-button secondary" onClick={() => setSubmitted(false)}>Edit response</button>
        </div>
      </div>
    );
  }

  return (
    <form className="public-form" onSubmit={handleSubmit}>
      <div className="public-form-grid">
        <label>
          <span>{isIssue ? 'What went wrong?' : 'What would you like us to know?'}</span>
          <input value={message} onChange={(event) => setMessage(event.target.value)} required maxLength={160} placeholder={isIssue ? 'Short issue summary' : 'A quick summary'} />
        </label>
        <label>
          <span>Email for a reply <small>(optional)</small></span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
        </label>
      </div>
      {isIssue ? (
        <label>
          <span>Severity</span>
          <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
            <option>Normal</option>
            <option>Blocking</option>
            <option>Data or security concern</option>
          </select>
        </label>
      ) : null}
      <label>
        <span>{isIssue ? 'Describe the issue' : 'Your feedback'}</span>
        <textarea value={details} onChange={(event) => setDetails(event.target.value)} required rows={7} maxLength={5000} placeholder={isIssue ? 'Include the page, action, what you expected, and what happened.' : 'Tell us what worked, what was confusing, or what would make the product more useful.'} />
      </label>
      <div className="public-form-actions">
        <button className="public-button" type="submit">
          {isIssue ? <TriangleAlert size={15} /> : <HeartHandshake size={15} />}
          Prepare {isIssue ? 'issue report' : 'feedback'}
        </button>
        <span className="public-form-hint"><Mail size={13} /> Delivery only occurs through a configured contact channel.</span>
      </div>
    </form>
  );
}

export function InfoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <article className="public-info-card"><div className="public-info-icon">{icon}</div><h3>{title}</h3><p>{children}</p></article>;
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="public-legal-section"><h2>{title}</h2>{children}</section>;
}

export function ContactPanel() {
  const recipientConfigured = useMemo(() => Boolean(process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim()), []);
  return (
    <div className="public-contact-panel">
      <div className="public-contact-icon"><Mail size={22} /></div>
      <div>
        <h2>Start with the right channel</h2>
        <p>For product feedback, use Feedback. For something broken, use Report issue. For general questions, prepare a contact message below.</p>
        <div className="public-contact-actions">
          <a className="public-button" href="/feedback"><MessageSquare size={15} /> Give feedback</a>
          <a className="public-button secondary" href="/report-issue"><CircleAlert size={15} /> Report an issue</a>
        </div>
        <div className="public-contact-status"><ShieldCheck size={14} /> {recipientConfigured ? 'Contact delivery is configured.' : 'Contact delivery is not configured in this deployment yet.'}</div>
      </div>
    </div>
  );
}

export function LegalNotice() {
  return <p className="public-legal-note"><FileText size={14} /> These pages describe the product's current intended use. They are not legal advice and should be reviewed for your actual business, jurisdiction, and data-processing requirements.</p>;
}

export function BackHome() {
  return <a href="/" className="public-back"><ArrowLeft size={14} /> Back to UpTrendifyOS</a>;
}

export function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  return <details className="public-accordion"><summary>{title}<ChevronDown size={16} /></summary><div>{children}</div></details>;
}
