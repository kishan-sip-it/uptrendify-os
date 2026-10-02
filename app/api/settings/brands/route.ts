import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';

export async function GET() {
  try {
    const auth = await requireOrgRole(CAN_VIEW_BRAND);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('brands')
      .select('id,name,status')
      .eq('organization_id', auth.context.organizationId)
      .order('name', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ ok: true, brands: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not load brands' }, { status: 500 });
  }
}
