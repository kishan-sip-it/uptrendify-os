import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const schema = z.object({ confirmation: z.literal('DELETE') }).strict();

export async function DELETE(request: Request) {
  try {
    schema.parse(await request.json().catch(() => ({})));

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('delete_current_account');

    if (error) {
      if (/WORKSPACES_MUST_BE_DELETED_FIRST/i.test(error.message)) {
        return NextResponse.json({
          error: 'Delete your workspace first. Your account can be deleted after all workspace memberships are removed.',
          requiresWorkspaceDeletion: true,
        }, { status: 409 });
      }
      if (/AUTHENTICATION_REQUIRED/i.test(error.message)) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
      }
      throw error;
    }

    return NextResponse.json({
      ok: Boolean(data?.ok),
      message: 'Your account was deleted successfully.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Type DELETE exactly to confirm account deletion.' }, { status: 400 });
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Could not delete your account.',
    }, { status: 500 });
  }
}
