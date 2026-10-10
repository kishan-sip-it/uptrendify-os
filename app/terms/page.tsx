import type { Metadata } from 'next';
import { LegalNotice, LegalSection, PublicShell } from '@/components/public/public-site';

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing use of the UpTrendifyOS service.",
  alternates: { canonical: "/terms" },
  openGraph: { type: 'website', siteName: 'UpTrendifyOS', title: "UpTrendifyOS · Terms of Service", description: "Terms governing use of the UpTrendifyOS service.", url: "/terms", images: ['/opengraph-image'] },
  twitter: { card: 'summary_large_image', title: "UpTrendifyOS · Terms of Service", description: "Terms governing use of the UpTrendifyOS service.", images: ['/opengraph-image'] },
};

export default function TermsPage() {
  return (
    <PublicShell
      active="/terms"
      eyebrow="Legal"
      title="Terms of Service"
      intro="These terms describe the basic rules for using UpTrendifyOS. They are written for the current product and should be reviewed with qualified legal counsel before being adopted as a final contractual policy."
    >
      <LegalNotice />
      <div className="public-legal-card">
        <LegalSection title="1. Using UpTrendifyOS">
          <p>UpTrendifyOS provides a marketing workflow for research, brand intelligence, strategy, content, campaigns, approvals and publishing preparation. You are responsible for using the service lawfully and for maintaining the accuracy and appropriateness of information you provide.</p>
        </LegalSection>
        <LegalSection title="2. Accounts and access">
          <p>You are responsible for keeping your account credentials secure and for ensuring that people you authorize have appropriate access. Workspace roles and server-side authorization controls are part of the service's access model and must not be bypassed.</p>
        </LegalSection>
        <LegalSection title="3. AI-generated output">
          <p>AI output can be incomplete or incorrect. Research results, suggestions and generated content should be reviewed before they are treated as authoritative or used externally. UpTrendifyOS does not represent generated output as guaranteed to be accurate, complete or suitable for a particular purpose.</p>
        </LegalSection>
        <LegalSection title="4. Human approval and publishing">
          <p>Where the product requires human review or approval, you are responsible for the decisions made by your authorized users. A publishing integration may require separate credentials, permissions or provider terms. A provider being available in the interface does not create a guarantee that a third-party channel will accept or publish content.</p>
        </LegalSection>
        <LegalSection title="5. Your content and data">
          <p>You retain responsibility for the content, brand information, URLs, files and other material you submit. You represent that you have the rights and permissions needed to provide that material for processing by the service.</p>
        </LegalSection>
        <LegalSection title="6. Prohibited use">
          <p>Do not use the service to violate applicable law, infringe another person's rights, distribute malicious code, attempt unauthorized access, interfere with another workspace, or misuse integrations and credentials.</p>
        </LegalSection>
        <LegalSection title="7. Availability and changes">
          <p>The service may change as features, integrations and security controls evolve. We may suspend or limit access where reasonably necessary for security, maintenance, abuse prevention or legal compliance.</p>
        </LegalSection>
        <LegalSection title="8. Third-party services">
          <p>Supabase, AI providers, Vercel and other third-party services may process requests or data as required by the integrations enabled for your workspace. Their own terms and privacy policies can apply independently.</p>
        </LegalSection>
        <LegalSection title="9. Disclaimer and limitation">
          <p>To the extent permitted by applicable law, the service is provided on an as-available basis without guarantees that every workflow, integration or AI result will be uninterrupted or error-free. Any limitation of liability should be finalized for the jurisdiction and business entity operating the service.</p>
        </LegalSection>
        <LegalSection title="10. Contact and updates">
          <p>Questions about these terms can be raised through the public Contact or Feedback pages. These terms may be updated as the product and its legal requirements change. The effective date should be updated when a finalized legal policy is adopted.</p>
        </LegalSection>
      </div>
    </PublicShell>
  );
}
