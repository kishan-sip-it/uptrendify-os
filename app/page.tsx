import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Landing } from '@/components/landing/landing';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'UpTrendifyOS — AI Marketing Agency OS',
  description: 'One operating system for research, brand intelligence, strategy, content and campaign execution across every client brand.',
};

export default async function Home() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;

    if (userId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('onboarding_completed')
        .eq('user_id', userId)
        .maybeSingle();

      if (profile && !profile.onboarding_completed) redirect('/onboarding');
      redirect('/dashboard');
    }
  } catch {
    // Keep the public landing page available during temporary Supabase/Auth failures.
  }

  return <Landing />;
};