import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_REVIEW_SUGGESTIONS, requireOrgRole } from '@/lib/auth/roles';
import { approveSuggestion, rejectSuggestion } from '@/lib/brain/review';
import { obs } from '@/lib/obs/logger';

const paramsSchema = z.object({ brandId: z.string().uuid() });
const bodySchema = z.object({
  approveIds: z.array(z.string().uuid()).default([]),
  rejectIds: z.array(z.string().uuid()).default([]),
});

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = paramsSchema.parse(await params);
    const body = bodySchema.parse(await request.json());
    const approveIds = [...new Set(body.approveIds)];
    const rejectIds = [...new Set(body.rejectIds)].filter((id) => !approveIds.includes(id));
    const ids = [...new Set([...approveIds, ...rejectIds])];

    const auth = await requireOrgRole(CAN_REVIEW_SUGGESTIONS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const { data: brand } = await supabase
      .from('brands')
      .select('id')
      .eq('id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .maybeSingle();
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    if (ids.length === 0) return NextResponse.json({ ok: true, approved: 0, rejected: 0, total: 0 });

    const { data: pending, error: pendingError } = await supabase
      .from('brand_suggestions')
      .select('id')
      .eq('brand_id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .eq('status', 'PENDING')
      .in('id', ids);
    if (pendingError) throw pendingError;

    const pendingIds = new Set((pending ?? []).map((row) => row.id));
    let approved = 0;
    let rejected = 0;

    for (const suggestionId of approveIds) {
      if (!pendingIds.has(suggestionId)) continue;
      await approveSuggestion(supabase, { organizationId: auth.context.organizationId, brandId, suggestionId, userId: auth.context.userId });
      approved += 1;
    }
    for (const suggestionId of rejectIds) {
      if (!pendingIds.has(suggestionId)) continue;
      await rejectSuggestion(supabase, { organizationId: auth.context.organizationId, brandId, suggestionId, userId: auth.context.userId });
      rejected += 1;
    }

    return NextResponse.json({ ok: true, approved, rejected, total: approved + rejected });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid AI confirmation request' }, { status: 400 });
    obs.error('Brand Brain AI confirmation failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not confirm the AI batch' }, { status: 500 });
  }
}
