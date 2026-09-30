import type { Metadata } from 'next';
import { HeartHandshake, MessageSquare, Sparkles } from 'lucide-react';
import { AudienceForm, InfoCard, PublicShell } from '@/components/public/public-site';

export const metadata: Metadata = {
  title: 'Feedback — UpTrendifyOS',
  description: 'Share product feedback with the UpTrendifyOS team.',
};

export default function FeedbackPage() {
  return (
    <PublicShell
      active="/feedback"
      eyebrow="Talk to the product"
      title="Tell us what should feel better."
      intro="Good feedback exposes friction that screenshots and logs cannot. Use this page to tell us what is useful, confusing, missing or worth improving."
    >
      <div className="public-form-layout">
        <div>
          <div className="public-form-heading"><MessageSquare size={19} /><div><h2>Product feedback</h2><p>Keep it concrete. A specific workflow, page or moment is much more useful than “make it better.” Humanity has suffered enough vague requirements.</p></div></div>
          <AudienceForm mode="feedback" />
        </div>
        <div className="public-info-stack">
          <InfoCard icon={<HeartHandshake size={18} />} title="What helps most">Tell us what you were trying to accomplish, what happened, and what you expected instead.</InfoCard>
          <InfoCard icon={<Sparkles size={18} />} title="Ideas are welcome">Suggest improvements to workflow, clarity, content creation, approvals, publishing or the public experience.</InfoCard>
        </div>
      </div>
    </PublicShell>
  );
}
