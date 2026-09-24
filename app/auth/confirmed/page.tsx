import Link from 'next/link';
import { CheckCircle2, Laptop, MailCheck } from 'lucide-react';
import { AuthLayout } from '@/components/auth/auth-layout';

export default function EmailConfirmedPage() {
  return (
    <AuthLayout
      eyebrow="Email confirmed"
      title="Your email is confirmed."
      subtitle="Return to the device where you created the account. That device will continue the signup flow automatically."
      footer={
        <div className="auth-footer-links">
          <Link href="/login">Go to sign in</Link>
          <Link href="/">Back to home</Link>
        </div>
      }
    >
      <div className="card auth-card-form" style={{ display: 'grid', gap: 14 }}>
        <div className="badge" style={{ justifyContent: 'flex-start' }}>
          <CheckCircle2 size={15} /> Confirmation complete
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="field-note" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Laptop size={15} /> Original device stays responsible for the app session.
          </div>
          <div className="field-note" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MailCheck size={15} /> This email device is not signed into the application.
          </div>
        </div>
        <p className="field-note" style={{ margin: 0 }}>
          You can safely close this page. Your original device will detect the confirmation and continue to onboarding.
        </p>
      </div>
    </AuthLayout>
  );
}
