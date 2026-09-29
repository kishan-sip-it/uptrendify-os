import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ContentStudio } from '@/components/content/content-studio';
import { BrandWorkspaceNav } from '@/components/brand/brand-workspace-nav';

export const dynamic = 'force-dynamic';

export default async function BrandContentPage({ params }: { params: Promise<{ brandId: string }> }) {
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
      <div className="topbar" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <a href={`/brands/${brandId}`} className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <ArrowLeft size={15} /> {brand.name}
          </a>
          <h1 style={{ fontSize: 'clamp(24px, 3vw, 34px)', marginTop: 8 }}>Content Studio</h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>Draft and generate content grounded in approved strategy and Brand Brain.</p>
        </div>
      </div>
      <BrandWorkspaceNav brandId={brandId} current="content" />
      <ContentStudio brandId={brandId} brandName={brand.name} />
    </main>
  );
}
