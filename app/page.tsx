import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Landing } from '@/components/landing/landing';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "AI Marketing Agency OS",
  description: "Research client brands, review evidence-backed brand intelligence, build strategies and create connected marketing work.",
  alternates: { canonical: "/" },
  openGraph: {
    type: 'website',
    siteName: 'UpTrendifyOS',
    title: "UpTrendifyOS — AI Marketing Agency OS",
    description: "Research client brands, review evidence-backed brand intelligence, build strategies and create connected marketing work.",
    url: "/",
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: "UpTrendifyOS — AI Marketing Agency OS",
    description: "Research client brands, review evidence-backed brand intelligence, build strategies and create connected marketing work.",
    images: ['/opengraph-image'],
  },
};

export default async function Home() {
  let userId: string | null = null;
  let onboardingCompleted: boolean | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    userId = claimsData?.claims?.sub ?? null;

    if (userId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('onboarding_completed')
        .eq('user_id', userId)
        .maybeSingle();
      onboardingCompleted = profile?.onboarding_completed ?? null;
    }
  } catch {
    // Public landing must still render when auth/DB is temporarily unavailable.
  }

  // Keep redirects outside the try/catch because Next.js implements redirect()
  // by throwing a framework control-flow signal.
  if (userId) {
    if (onboardingCompleted !== true) redirect('/onboarding');
    redirect('/dashboard');
  }

  return <Landing />;
}
