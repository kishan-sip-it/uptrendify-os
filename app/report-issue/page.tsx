import type { Metadata } from 'next';
import { Bug, CircleAlert, ShieldAlert, TriangleAlert } from 'lucide-react';
import { AudienceForm, InfoCard, PublicShell } from '@/components/public/public-site';

export const metadata: Metadata = {
  title: 'Report an Issue — UpTrendifyOS',
  description: 'Report a product problem or unexpected behavior in UpTrendifyOS.',
};

export default function ReportIssuePage() {
  return (
    <PublicShell
      active="/report-issue"
      eyebrow="Something broke?"
      title="Give the problem a clear trail."
      intro="Report unexpected behavior with enough context for the team to reproduce it. Do not include passwords, API keys, service-role keys or other secrets."
    >
      <div className="public-form-layout">
        <div>
          <div className="public-form-heading"><Bug size={19} /><div><h2>Issue report</h2><p>Include the page, action, expected result and actual result. If it is intermittent, describe when it happens.</p></div></div>
          <AudienceForm mode="issue" />
        </div>
        <div className="public-info-stack">
          <InfoCard icon={<CircleAlert size={18} />} title="Useful evidence">Mention the route or feature, the steps that led to the problem, and any visible error message.</InfoCard>
          <InfoCard icon={<ShieldAlert size={18} />} title="Security concerns">Do not paste credentials or private tokens here. Describe the security concern without exposing secrets.</InfoCard>
          <InfoCard icon={<TriangleAlert size={18} />} title="Blocking problems">Use the severity field when the issue prevents you from completing a meaningful workflow.</InfoCard>
        </div>
      </div>
    </PublicShell>
  );
}
