import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireOrgRole } from '@/lib/auth/roles';

const actionSchema = z.object({
  action: z.enum(['restore']),
  itemType: z.enum(['content', 'campaign']),
  itemId: z.string().uuid(),
}).strict();

export async function GET() {
  const auth = await requireOrgRole(['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR', 'APPROVER', 'CLIENT']);
  if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

  const supabase = await createSupabaseServerClient();
  const [contentResult, campaignResult] = await Promise.all([
    supabase
      .from('content_items')
      .select('id,brand_id,title,status,updated_at,brands(name)')
      .eq('organization_id', auth.context.organizationId)
      .eq('status', 'ARCHIVED')
      .order('updated_at', { ascending: false })
      .limit(100),
    supabase
      .from('campaigns')
      .select('id,brand_id,name,status,updated_at,brands(name)')
      .eq('organization_id', auth.context.organizationId)
      .eq('status', 'ARCHIVED')
      .order('updated_at', { ascending: false })
      .limit(100),
  ]);

  if (contentResult.error || campaignResult.error) {
    return NextResponse.json({ error: 'Could not load archived items.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    content: contentResult.data ?? [],
    campaigns: campaignResult.data ?? [],
  });
}

export async function POST(request: Request) {
  try {
    const body = actionSchema.parse(await request.json());
    const auth = await requireOrgRole(['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR']);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();

    const table = body.itemType === 'content' ? 'content_items' : 'campaigns';
    const result = await supabase
      .from(table)
      .update({ status: 'DRAFT', updated_at: new Date().toISOString() })
      .eq('id', body.itemId)
      .eq('organization_id', auth.context.organizationId)
      .eq('status', 'ARCHIVED')
      .select('id,status')
      .maybeSingle();

    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({ error: 'Archived item not found.' }, { status: 404 });

    return NextResponse.json({ ok: true, item: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid trash action.' }, { status: 400 });
    return NextResponse.json({ error: 'Could not restore the archived item.' }, { status: 500 });
  }
}
