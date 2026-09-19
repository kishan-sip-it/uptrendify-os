import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireOrgRole, ROLES } from '@/lib/auth/roles';

const schema = z.object({ confirmation: z.literal('DELETE WORKSPACE') }).strict();

export async function DELETE(request: Request) {
  try {
    schema.parse(await request.json().catch(() => ({})));

    const auth = await requireOrgRole([ROLES.OWNER]);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const { data: organization, error: organizationError } = await supabase
      .from('organizations')
      .select('id,name')
      .eq('id', auth.context.organizationId)
      .maybeSingle();

    if (organizationError) throw organizationError;
    if (!organization) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }

    const admin = createSupabaseAdminClient();
    const { data: owners, error: ownersError } = await admin
      .from('organization_members')
      .select('user_id,role')
      .eq('organization_id', organization.id)
      .eq('role', ROLES.OWNER);
    if (ownersError) throw ownersError;

    if (!owners?.some((owner) => owner.user_id === auth.context.userId)) {
      return NextResponse.json({ error: 'Only a workspace owner can delete this workspace.' }, { status: 403 });
    }

    const { error: deleteError } = await admin
      .from('organizations')
      .delete()
      .eq('id', organization.id);

    if (deleteError) throw deleteError;

    const response = NextResponse.json({
      ok: true,
      message: `Workspace "${organization.name}" was deleted. Your account remains active until you delete it separately.`,
    });
    response.cookies.delete('uptrendify_org');
    return response;
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
