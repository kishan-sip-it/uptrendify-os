import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CreateContentPage } from '@/components/content/content-create-page';

export const dynamic = 'force-dynamic';

export default async function NewBrandContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams?: Promise<{ campaignId?: string | string[] }>;
}) {
  const auth = await requireOrgRole(CAN_VIEW_BRAND);
  if (auth.error) redirect('/login');

  const { brandId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const rawCampaignId = resolvedSearchParams.campaignId;
  const initialCampaignId = Array.isArray(rawCampaignId) ? rawCampaignId[0] : rawCampaignId;
  const supabase = await createSupabaseServerClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id,name')
    .eq('id', brandId)
    .eq('organization_id', auth.context.organizationId)
    .maybeSingle();

  if (!brand) redirect('/brands');

  let campaign: { id: string; name: string } | null = null;
  if (initialCampaignId) {
    const campaignResult = await supabase
      .from('campaigns')
      .select('id,name')
      .eq('id', initialCampaignId)
      .eq('brand_id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .maybeSingle();
    if (campaignResult.error) throw campaignResult.error;
    campaign = campaignResult.data as { id: string; name: string } | null;
  }

  return (
    <main className="main">
      <div className="topbar" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <a
            href={campaign ? `/brands/${brandId}/campaigns/${campaign.id}` : `/brands/${brandId}/content`}
            className="metric-label"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
          >
            <ArrowLeft size={15} /> {campaign ? `Back to ${campaign.name}` : 'Back to Content Studio'}
          </a>
          <h1 style={{ fontSize: 'clamp(24px, 3vw, 34px)', marginTop: 8 }}>New content</h1>
          <p className="subtitle">Create one deliberate brief at a time. The list view stays focused on work you have already created.</p>
        </div>
      </div>
      <CreateContentPage
        brandId={brandId}
        brandName={brand.name}
        initialCampaignId={campaign?.id ?? null}
      />
    </main>
  );
}
