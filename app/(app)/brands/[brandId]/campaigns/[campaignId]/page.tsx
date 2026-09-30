import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { CAN_VIEW_CAMPAIGNS, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CampaignDetail } from '@/components/campaign/campaign-detail';
import { BrandWorkspaceNav } from '@/components/brand/brand-workspace-nav';
import { FlashMessage } from '@/components/ui/flash-message';

export const dynamic = 'force-dynamic';

export default async function BrandCampaignDetailPage({ params, searchParams }: { params: Promise<{ brandId: string; campaignId: string }>; searchParams?: Promise<{ created?: string | string[] }> }) {
  const auth = await requireOrgRole(CAN_VIEW_CAMPAIGNS);
  if (auth.error) redirect('/login');

  const { brandId, campaignId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const rawCreated = resolvedSearchParams.created;
  const created = Array.isArray(rawCreated) ? rawCreated[0] === '1' : rawCreated === '1';
  const supabase = await createSupabaseServerClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id,name')
    .eq('id', brandId)
    .eq('organization_id', auth.context.organizationId)
    .maybeSingle();
  if (!brand) redirect('/brands');

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id,name')
    .eq('id', campaignId)
    .eq('brand_id', brandId)
    .eq('organization_id', auth.context.organizationId)
    .maybeSingle();
  if (!campaign) redirect(`/brands/${brandId}/campaigns`);

  return (
    <main className="main">
      <div className="topbar" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <a href={`/brands/${brandId}/campaigns`} className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><ArrowLeft size={15} /> Back to {brand.name} campaigns</a>
          <h1 style={{ fontSize: 'clamp(24px, 3vw, 34px)', marginTop: 8 }}>{campaign.name}</h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>Campaign plan grounded in the approved strategy.</p>
        </div>
      </div>
      <BrandWorkspaceNav brandId={brandId} current="campaigns" />
      {created ? (
        <div style={{ marginBottom: 16 }}>
          <FlashMessage
            message="Campaign created as Draft."
            detail="First move the campaign to Planned when its details are ready. Then use the button below to create content for this campaign."
            href={`/brands/${brandId}/content/new?campaignId=${campaignId}`}
            actionLabel="Click here: Create campaign content"
          />
        </div>
      ) : null}
      <CampaignDetail brandId={brandId} brandName={brand.name} campaignId={campaignId} />
    </main>
  );
}
