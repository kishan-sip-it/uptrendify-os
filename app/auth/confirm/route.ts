import { type EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { obs } from '@/lib/obs/logger';

function failureRedirect(request: NextRequest, reason = 'failed') {
  const url = new URL('/login', request.url);
  url.searchParams.set('confirmation', reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null;

  if (!tokenHash || type !== 'email') {
    return failureRedirect(request);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (verifyError) {
      obs.error('Email confirmation verification failed', { error: verifyError.message });
      return failureRedirect(request);
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      obs.error('Email confirmation produced no session', {
        error: userError?.message ?? 'missing user after confirmation',
      });
      return failureRedirect(request);
    }

    let { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      obs.error('Email confirmation workspace lookup failed', { error: membershipError.message });
      return failureRedirect(request);
    }

    if (!membership) {
      const metadataName = user.user_metadata?.organizationName;
      const organizationName =
        typeof metadataName === 'string' ? metadataName.trim() : '';

      if (organizationName) {
        const { error: bootstrapError } = await supabase.rpc('bootstrap_organization', {
          organization_name: organizationName,
        });

        if (bootstrapError) {
          obs.error('Email confirmation workspace bootstrap failed', {
            error: bootstrapError.message,
          });
        } else {
          const refreshed = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          membership = refreshed.data;
          membershipError = refreshed.error;
        }
      }
    }

    if (membershipError) {
      obs.error('Email confirmation workspace lookup failed after bootstrap', {
        error: membershipError.message,
      });
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('onboarding_completed')
      .eq('user_id', user.id)
      .maybeSingle();

    const destination = profile?.onboarding_completed ? '/dashboard' : '/onboarding';
    const url = new URL(destination, request.url);
    url.searchParams.set('confirmed', '1');
    return NextResponse.redirect(url);
  } catch (error) {
    obs.error('Email confirmation route failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return failureRedirect(request);
  }
}
