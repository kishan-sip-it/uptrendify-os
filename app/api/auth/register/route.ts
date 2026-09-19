import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(320),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(72, 'Password must be 72 characters or fewer.'),
  organizationName: z.string().trim().min(2, 'Agency name must be at least 2 characters.').max(120, 'Agency name is too long.'),
}).strict();

function mapAuthRegistrationError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('already registered') ||
    normalized.includes('already been registered') ||
    normalized.includes('already exists') ||
    normalized.includes('user already') ||
    normalized.includes('email address already')
  ) {
    return {
      status: 409,
      error: 'An account with this email already exists. Sign in instead.',
    };
  }

  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return {
      status: 429,
      error: 'Registration is temporarily rate-limited. Please wait a moment and try again.',
    };
  }

  if (normalized.includes('password')) {
    return {
      status: 400,
      error: message.length <= 180 ? message : 'The password does not meet the current security requirements.',
    };
  }

  if (normalized.includes('email')) {
    return {
      status: 400,
      error: message.length <= 180 ? message : 'The email address was rejected by the authentication service.',
    };
  }

  return {
    status: 400,
    error: message.length <= 240 ? `Registration failed: ${message}` : 'Registration failed. Please review your account details and try again.',
  };
}

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
      const mapped = mapAuthRegistrationError(error.message);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
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
