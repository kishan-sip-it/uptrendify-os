import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const schema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(72),
  organizationName: z.string().trim().min(2).max(120),
}).strict();

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json());

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: parsed.email,
      password: parsed.password,
      email_confirm: true,
      user_metadata: {
        organizationName: parsed.organizationName,
      },
    });

    if (error) {
      if (/already registered|already exists/i.test(error.message)) {
        return NextResponse.json({ error: 'An account with this email already exists. Sign in instead.' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Could not create your account' }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      userId: data.user?.id ?? null,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid registration details' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Registration service is not configured' }, { status: 500 });
  }
}
