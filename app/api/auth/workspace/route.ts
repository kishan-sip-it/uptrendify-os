import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireOrgRole, ROLES } from '@/lib/auth/roles';

const schema = z.object({ confirmation: z.literal('DELETE WORKSPACE') }).strict();

export async function DELETE(request: Request) {
  try {
    schema.parse(await request.json().catch(() => ({})));

    const auth = await requireOrgRole([ROLES.OWNER]);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('delete_current_workspace', {
      target_organization_id: auth.context.organizationId,
    });

    if (error) {
      if (/WORKSPACE_OWNER_REQUIRED/i.test(error.message)) {
        return NextResponse.json({ error: 'Only a workspace owner can delete this workspace.' }, { status: 403 });
      }
      if (/WORKSPACE_NOT_FOUND_OR_FORBIDDEN/i.test(error.message)) {
        return NextResponse.json({ error: 'Workspace not found or access denied.' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({
      ok: true,
      message: `Workspace "${data?.organization_name ?? 'workspace'}" was deleted. Your account remains active until you delete it separately.`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Type DELETE WORKSPACE exactly to confirm workspace deletion.' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not delete the workspace.' },
      { status: 500 },
    );
  }
}
