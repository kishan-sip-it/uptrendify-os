import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_CREATE_BRANDS, requireOrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';

const paramsSchema = z.object({ brandId: z.string().uuid() });

export async function POST(_request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = paramsSchema.parse(await params);
    const auth = await requireOrgRole(CAN_CREATE_BRANDS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('reset_brand_workspace', { target_brand_id: brandId });

    if (error) {
      if (error.message.includes('BRAND_NOT_FOUND')) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
      if (error.message.includes('BRAND_RESET_FORBIDDEN')) return NextResponse.json({ error: 'You do not have permission to reset this brand.' }, { status: 403 });
      if (error.message.includes('reset_brand_workspace')) return NextResponse.json({ error: 'Brand reset is not available until the workspace reset database migration is applied.' }, { status: 503 });
      throw error;
    }

    return NextResponse.json({ ok: true, brand: data?.brand ?? null });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
    obs.error('Brand workspace reset failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not reset brand workspace' }, { status: 500 });
  }
}
