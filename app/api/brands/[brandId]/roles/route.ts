import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CAN_REVIEW_STRATEGIES, CAN_REVIEW_SUGGESTIONS, CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const paramsSchema = z.object({ brandId: z.string().uuid() });

export async function GET(_request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = paramsSchema.parse(await params);
  const auth = await requireOrgRole(CAN_VIEW_BRAND);
  if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

  const supabase = await createSupabaseServerClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id')
    .eq('id', brandId)
    .eq('organization_id', auth.context.organizationId)
    .maybeSingle();
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    role: auth.context.role,
    canView: CAN_VIEW_BRAND.includes(auth.context.role),
    canReviewSuggestions: CAN_REVIEW_SUGGESTIONS.includes(auth.context.role),
    canGenerateStrategy: CAN_REVIEW_STRATEGIES.includes(auth.context.role),
  });
}