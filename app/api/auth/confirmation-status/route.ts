import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { obs } from '@/lib/obs/logger';

const schema = z.object({
  userId: z.string().uuid(),
  nonce: z.string().min(24).max(128),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(parsed.userId);

    if (error || !data.user) {
      return NextResponse.json({ confirmed: false }, { status: 200 });
    }

    const metadata = data.user.user_metadata ?? {};
    const nonce = typeof metadata.signupNonce === 'string' ? metadata.signupNonce : '';
    const createdAt = typeof metadata.signupIntentCreatedAt === 'number' ? metadata.signupIntentCreatedAt : 0;

    const nonceMatches = nonce.length > 0 && nonce === parsed.nonce;
    const intentFresh = createdAt > 0 && Date.now() - createdAt <= 30 * 60 * 1000;

    return NextResponse.json({
      confirmed: Boolean(nonceMatches && intentFresh && data.user.email_confirmed_at),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid confirmation check' }, { status: 400 });
    }

    obs.error('Confirmation status check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Confirmation check is temporarily unavailable. Please try again in a moment.' },
      { status: 503 },
    );
  }
}
