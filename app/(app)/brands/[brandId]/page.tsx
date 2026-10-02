import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BrandOverview } from '@/components/brand/brand-overview';
import { BrandBrainReview } from '@/components/brand/brand-brain-review';
import { BrandStrategy } from '@/components/brand/brand-strategy';
import { BrandEditor } from '@/components/brand/brand-editor';
import { BrandWorkspaceNav } from '@/components/brand/brand-workspace-nav';
import { BrandHashRouteBridge } from '@/components/brand/brand-hash-route-bridge';

export const dynamic = 'force-dynamic';

type BrandView = 'overview' | 'brain' | 'strategy';

export default async function BrandPage({ params, searchParams }: { params: Promise<{ brandId: string }>; searchParams: Promise<{ view?: string }> }) {
  const auth = await requireOrgRole(CAN_VIEW_BRAND);
  if (auth.error) redirect('/login');

  const { brandId } = await params;
  const query = await searchParams;
  const view: BrandView = query.view === 'brain' || query.view === 'strategy' ? query.view : 'overview';

  const supabase = await createSupabaseServerClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id,name,website_url,industry,created_at')
    .eq('id', brandId)
    .eq('organization_id', auth.context.organizationId)
    .maybeSingle();

  if (!brand) redirect('/brands');

  const { data: approvedSuggestions } = await supabase
    .from('brand_suggestions')
    .select('status,field')
    .eq('brand_id', brandId)
    .eq('organization_id', auth.context.organizationId)
    .in('status', ['APPROVED', 'EDITED']);

  const strategyGateApprovedCount = approvedSuggestions?.length ?? 0;
  const strategyGateBrandNameApproved = (approvedSuggestions ?? []).some((suggestion) => suggestion.field === 'brand_name');
  const showFourApprovalStrategyGate = strategyGateApprovedCount >= 4 && !strategyGateBrandNameApproved;

  return (
    <main className="main">
      <BrandHashRouteBridge />
      <div className="topbar" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <a href="/dashboard" className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <ArrowLeft size={15} /> Back to command center
          </a>
          <h1 style={{ fontSize: 'clamp(24px, 3vw, 34px)', marginTop: 8 }}>{brand.name}</h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>
            {brand.website_url ? <a href={brand.website_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{brand.website_url}</a> : null}
            {brand.industry ? ` · ${brand.industry}` : ''}
          </p>
        </div>
        <BrandEditor brandId={brandId} />
      </div>

      <BrandWorkspaceNav brandId={brandId} current={view} />
      {view === 'overview' ? <BrandOverview brandId={brandId} brandName={brand.name} /> : null}
      {view === 'brain' ? (
        <>
          <BrandBrainReview brandId={brandId} brandName={brand.name} />
          {showFourApprovalStrategyGate ? (
            <div className="card" style={{ marginTop: 16, borderColor: 'color-mix(in srgb, var(--accent) 45%, var(--line))' }}>
              <div className="section-title" style={{ flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div className="eyebrow">Brand Brain approved</div>
                  <h3 style={{ margin: '4px 0 6px' }}>Four approved findings are enough to continue.</h3>
                  <p className="subtitle" style={{ margin: 0 }}>
                    {strategyGateApprovedCount} approved or edited findings are ready. Continue directly to the Strategy workspace.
                  </p>
                </div>
                <a className="badge auth-submit" href="#strategy" style={{ textDecoration: 'none' }}>
                  Continue to Strategy →
                </a>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {view === 'strategy' ? <BrandStrategy brandId={brandId} brandName={brand.name} /> : null}
    </main>
  );
}
