import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const schema = z.object({ confirmation: z.literal('DELETE') }).strict();

export async function DELETE(request: Request) {
  try {
    const body = schema.parse(await request.json().catch(() => ({})));

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();

    const { data: memberships, error: membershipError } = await admin
      .from('organization_members')
      .select('organization_id,role')
      .eq('user_id', user.id);
    if (membershipError) throw membershipError;

    const ownerOrgIds = (memberships ?? [])
      .filter((membership) => membership.role === 'OWNER')
      .map((membership) => membership.organization_id);

    if (ownerOrgIds.length > 0) {
      const { data: ownerRows, error: ownerError } = await admin
        .from('organization_members')
        .select('organization_id,user_id,role')
        .in('organization_id', ownerOrgIds)
        .eq('role', 'OWNER');
      if (ownerError) throw ownerError;

      const soleOwnerOrg = ownerOrgIds.find((orgId) =>
        (ownerRows ?? []).filter((row) => row.organization_id === orgId).length <= 1,
      );

      if (soleOwnerOrg) {
        return NextResponse.json(
          {
            error: 'You are the only owner of a workspace. Delete the workspace first, then you can delete your account.',
            requiresWorkspaceDeletion: true,
          },
          { status: 409 },
        );
      }
    }

    // Preserve business data and audit history. Only detach the account identity
    // from historical rows before removing its auth record.
    const cleanup = await Promise.all([
      admin.from('audit_logs').update({ actor_user_id: null }).eq('actor_user_id', user.id),
      admin.from('content_reviews').update({ reviewer_id: null }).eq('reviewer_id', user.id),
      admin.from('content_versions').update({ author_user_id: null }).eq('author_user_id', user.id),
      admin.from('user_profiles').delete().eq('user_id', user.id),
      admin.from('organization_members').delete().eq('user_id', user.id),
    ]);

    const cleanupError = cleanup.find((result) => result.error)?.error;
    if (cleanupError) throw cleanupError;

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    const response = NextResponse.json({ ok: true });
    response.cookies.delete('uptrendify_org');
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Type DELETE exactly to confirm account deletion.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Could not delete your account.' }, { status: 500 });
  }
}
