import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(320),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(72, 'Password must be 72 characters or fewer.'),
  organizationName: z.string().trim().min(2, 'Agency name must be at least 2 characters.').max(120, 'Agency name is too long.'),
}).strict();

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        { error: issue?.message || 'Invalid registration details', field: issue?.path?.[0] ?? null },
        { status: 400 },
      );
    }

    let admin;
    try {
      admin = createSupabaseAdminClient();
    } catch {
      return NextResponse.json(
        { error: 'Registration service is not configured on the server.' },
        { status: 503 },
      );
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        organizationName: parsed.data.organizationName,
      },
    });

    if (error) {
      if (/already registered|already exists/i.test(error.message)) {
        return NextResponse.json({ error: 'An account with this email already exists. Sign in instead.' }, { status: 409 });
      }

      if (/rate limit|too many requests/i.test(error.message)) {
        return NextResponse.json(
          { error: 'Registration is temporarily rate-limited. Please wait a moment and try again.' },
          { status: 429 },
        );
      }

      return NextResponse.json({ error: 'Could not create your account' }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      userId: data.user?.id ?? null,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid registration request.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Could not process registration.' }, { status: 500 });
  }
}
