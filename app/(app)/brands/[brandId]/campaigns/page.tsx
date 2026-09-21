import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { CAN_VIEW_CAMPAIGNS, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CampaignStudio } from '@/components/campaign/campaign-studio';

export const dynamic = 'force-dynamic';

export default async function BrandCampaignsPage({ params }: { params: Promise<{ brandId: string }> }) {
  const auth = await requireOrgRole(CAN_VIEW_CAMPAIGNS);
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
          <a href={`/brands/${brandId}`} className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <ArrowLeft size={15} /> {brand.name}
          </a>
          <h1 style={{ fontSize: 'clamp(24px, 3vw, 34px)', marginTop: 8 }}>Campaigns</h1>
          <p className="subtitle">
            Plan and run campaigns grounded in the approved strategy — objectives, budget, dates and channels.
          </p>
        </div>
      </div>

      <CampaignStudio brandId={brandId} brandName={brand.name} />
    </main>
  );
}