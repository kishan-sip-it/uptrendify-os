import type { Metadata } from 'next';
import { ArrowRight, Mail, MessageSquare, ShieldCheck } from 'lucide-react';
import { ContactPanel, InfoCard, PublicShell } from '@/components/public/public-site';

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact UpTrendifyOS about the product, feedback and issues.",
  alternates: { canonical: "/contact" },
  openGraph: { type: 'website', siteName: 'UpTrendifyOS', title: "UpTrendifyOS · Contact", description: "Contact UpTrendifyOS about the product, feedback and issues.", url: "/contact", images: ['/opengraph-image'] },
  twitter: { card: 'summary_large_image', title: "UpTrendifyOS · Contact", description: "Contact UpTrendifyOS about the product, feedback and issues.", images: ['/opengraph-image'] },
};

export default function ContactPage() {
  return (
    <PublicShell
      active="/contact"
      eyebrow="Contact UpTrendifyOS"
      title="A direct route for questions, ideas and problems."
      intro="The public contact area keeps the useful channels close: general questions, product feedback and issue reports each have a clear destination."
    >
      <ContactPanel />
      <div className="public-info-grid">
        <InfoCard icon={<MessageSquare size={18} />} title="Product feedback">Tell us where the experience is useful, confusing or missing something important.</InfoCard>
        <InfoCard icon={<ShieldCheck size={18} />} title="Issue reporting">Report broken flows, errors or unexpected behavior with reproduction details.</InfoCard>
        <InfoCard icon={<Mail size={18} />} title="Contact delivery">A configured contact email can open a structured message directly in the visitor's mail client. Until configured, the product does not pretend a message was delivered.</InfoCard>
      </div>
      <section className="public-about-cta">
        <div><div className="public-eyebrow">Already know the destination?</div><h2>Go straight to the channel.</h2></div>
        <div className="public-contact-actions">
          <a className="public-button" href="/feedback">Feedback <ArrowRight size={14} /></a>
          <a className="public-button secondary" href="/report-issue">Report issue <ArrowRight size={14} /></a>
        </div>
      </section>
    </PublicShell>
  );
}
