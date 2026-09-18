import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ContentDetail } from '@/components/content/content-detail';

export const dynamic = 'force-dynamic';

export default async function BrandContentDetailPage({ params }: { params: Promise<{ brandId: string; contentId: string }> }) {
  const auth = await requireOrgRole(CAN_VIEW_BRAND);
  if (auth.error) redirect('/login');

  const { brandId, contentId } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id,name,website_url')
    .eq('id', brandId)
    .eq('organization_id', auth.context.organizationId)
    .maybeSingle();

  if (!brand) redirect('/brands');

  const { data: item } = await supabase
    .from('content_items')
    .select('id,title')
    .eq('id', contentId)
    .eq('brand_id', brandId)
    .eq('organization_id', auth.context.organizationId)
    .maybeSingle();

  if (!item) redirect(`/brands/${brandId}/content`);

  return (
    <main className="main">
      <div className="topbar" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <a href={`/brands/${brandId}/content`} className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <ArrowLeft size={15} /> Back to {brand.name} content
          </a>
          <h1 style={{ fontSize: 'clamp(24px, 3vw, 34px)', marginTop: 8 }}>{item.title}</h1>
          <p className="subtitle">
            Generate versions, edit the brief, and move this piece through the review workflow.
          </p>
        </div>
      </div>

      <ContentDetail brandId={brandId} />
    </main>
  );
}