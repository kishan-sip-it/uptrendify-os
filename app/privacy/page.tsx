import type { Metadata } from 'next';
import { LegalNotice, LegalSection, PublicShell } from '@/components/public/public-site';

export const metadata: Metadata = {
  title: 'Privacy Policy — UpTrendifyOS',
  description: 'How UpTrendifyOS describes collection and use of account, workspace and product data.',
};

export default function PrivacyPage() {
  return (
    <PublicShell
      active="/privacy"
      eyebrow="Legal"
      title="Privacy Policy"
      intro="This page describes the categories of information the current UpTrendifyOS product may handle and the purposes for which that information is used. It should be reviewed and finalized for the actual operating entity and jurisdiction."
    >
      <LegalNotice />
      <div className="public-legal-card">
        <LegalSection title="1. Information we may handle">
          <p>Depending on how you use the service, this can include account and authentication information, workspace and membership information, brand details, research inputs and results, strategies, campaigns, content, approvals, audit records, support messages and technical information needed to operate and secure the service.</p>
        </LegalSection>
        <LegalSection title="2. How information is used">
          <p>Information may be used to authenticate users, operate tenant-isolated workspaces, run research and AI-assisted workflows, preserve approval and audit history, provide requested features, troubleshoot problems, prevent abuse and maintain service security.</p>
        </LegalSection>
        <LegalSection title="3. AI and research processing">
          <p>When AI or research features are used, relevant input may be processed by the configured providers and infrastructure required to perform that operation. Public website research is intended to use publicly accessible information. Users should avoid submitting information they are not authorized to process.</p>
        </LegalSection>
        <LegalSection title="4. Authentication and security">
          <p>Authentication and authorization are handled through the application's configured identity and access controls. Workspace isolation, role checks, database policies and server-side authorization are designed to prevent users from accessing data outside their permitted scope.</p>
        </LegalSection>
        <LegalSection title="5. Third-party services">
          <p>The application may rely on providers such as Supabase, Vercel and configured AI or publishing services. Those providers may process information according to the integrations enabled and their own privacy terms. The exact provider set can change as the product evolves.</p>
        </LegalSection>
        <LegalSection title="6. Retention and deletion">
          <p>Information is retained as needed to provide the service, maintain workflow history, satisfy legitimate operational or legal requirements, and support account or workspace deletion flows. Actual retention periods should be finalized according to the service's operating entity and applicable law.</p>
        </LegalSection>
        <LegalSection title="7. Your choices">
          <p>Depending on your role and the data involved, you may be able to update account or workspace information, delete an account or workspace through supported product flows, or contact the service about a privacy request. Access controls and legal obligations may limit some requests.</p>
        </LegalSection>
        <LegalSection title="8. Cookies and local storage">
          <p>The application may use browser storage and cookies needed for authentication, preferences, session continuity and product functionality. The exact categories should be reviewed alongside the final production analytics and cookie configuration.</p>
        </LegalSection>
        <LegalSection title="9. Changes to this policy">
          <p>This policy may be updated when the product, integrations or legal requirements change. The effective date should be updated whenever a finalized policy is adopted.</p>
        </LegalSection>
        <LegalSection title="10. Contact">
          <p>Privacy questions can be raised through the public Contact page. Do not submit passwords, service-role keys, API keys or other secrets through feedback or support forms.</p>
        </LegalSection>
      </div>
    </PublicShell>
  );
}
