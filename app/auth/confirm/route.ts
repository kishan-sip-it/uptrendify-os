import { type EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { obs } from '@/lib/obs/logger';

function failureRedirect(request: NextRequest, reason = 'failed') {
  const url = new URL('/login', request.url);
  url.searchParams.set('confirmation', reason);
  return NextResponse.redirect(url);
}

function successRedirect(request: NextRequest) {
  const url = new URL('/auth/confirmed', request.url);
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

    // Email confirmation is account-level state, but the authenticated app
    // session should continue on the device that started signup. The email
    // device receives only the confirmation acknowledgement. Local scope is
    // critical: global signOut would terminate sessions on other devices.
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });

    if (signOutError) {
      obs.error('Email confirmation local session cleanup failed', {
        error: signOutError.message,
        userId: user.id,
      });
    }

    return successRedirect(request);
  } catch (error) {
    obs.error('Email confirmation route failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return failureRedirect(request);
  }
}
