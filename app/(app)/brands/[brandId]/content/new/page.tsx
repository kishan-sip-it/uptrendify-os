import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CreateContentPage } from '@/components/content/content-create-page';

export const dynamic = 'force-dynamic';

export default async function NewBrandContentPage({ params }: { params: Promise<{ brandId: string }> }) {
  const auth = await requireOrgRole(CAN_VIEW_BRAND);
  if (auth.error) redirect('/login');

  const { brandId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id,name')
    .eq('id', brandId)
    .eq('organization_id', auth.context.organizationId)
    .maybeSingle();

  if (!brand) redirect('/brands');

  return (
    <main className="main">
      <div className="topbar" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <a href={`/brands/${brandId}/content`} className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <ArrowLeft size={15} /> Back to Content Studio
          </a>
          <h1 style={{ fontSize: 'clamp(24px, 3vw, 34px)', marginTop: 8 }}>New content</h1>
          <p className="subtitle">Create one deliberate brief at a time. The list view stays focused on work you have already created.</p>
        </div>
      </div>
      <CreateContentPage brandId={brandId} brandName={brand.name} />
    </main>
  );
}
