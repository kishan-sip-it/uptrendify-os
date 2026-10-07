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
import { BrandProfileWorkspace } from '@/components/brand/brand-profile-workspace';
import { StrategyGenerationLimitBanner } from '@/components/brand/strategy-generation-limit-banner';
import styles from './strategy-workspace.module.css';
import { readIdentity } from '@/lib/brand/identity-mapping';

export const dynamic = 'force-dynamic';

type BrandView = 'profile' | 'overview' | 'brain' | 'strategy';

export default async function BrandPage({ params, searchParams }: { params: Promise<{ brandId: string }>; searchParams: Promise<{ view?: string }> }) {
  const auth = await requireOrgRole(CAN_VIEW_BRAND);
  if (auth.error) redirect('/login');

  const { brandId } = await params;
  const query = await searchParams;
  const view: BrandView = query.view === 'brain' || query.view === 'strategy' ? query.view : query.view === 'profile' ? 'profile' : 'overview';

  const supabase = await createSupabaseServerClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id,name,website_url,industry,created_at,description,primary_color,secondary_colors,visual_identity,positioning,messaging,audience_details')
    .eq('id', brandId)
    .eq('organization_id', auth.context.organizationId)
    .maybeSingle();

  if (!brand) redirect('/brands');

  return (
    <main className="main">
      <BrandHashRouteBridge />
      <div className="topbar" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <a href="/dashboard" className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><ArrowLeft size={15} /> Back to command center</a>
          <h1 style={{ fontSize: 'clamp(24px, 3vw, 34px)', marginTop: 8 }}>{brand.name}</h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>
            {brand.website_url ? <a href={brand.website_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{brand.website_url}</a> : null}
            {brand.industry ? ` · ${brand.industry}` : ''}
          </p>
        </div>
        <BrandEditor brandId={brandId} />
      </div>

      <BrandWorkspaceNav brandId={brandId} current={view} />
      {view === 'profile' ? <BrandProfileWorkspace brandId={brandId} websiteUrl={brand.website_url} identity={readIdentity({
        name: brand.name,
        description: brand.description,
        industry: brand.industry,
        primary_color: brand.primary_color,
        secondary_colors: brand.secondary_colors,
        visual_identity: brand.visual_identity,
        positioning: brand.positioning,
        messaging: brand.messaging,
        audience_details: brand.audience_details,
      })} /> : null}
      {view === 'overview' ? <BrandOverview brandId={brandId} brandName={brand.name} /> : null}
      {view === 'brain' ? <BrandBrainReview brandId={brandId} brandName={brand.name} /> : null}
      {view === 'strategy' ? (
        <div className={styles.strategyShell}>
          <StrategyGenerationLimitBanner brandId={brandId} />
          <BrandStrategy brandId={brandId} brandName={brand.name} />
        </div>
      ) : null}
    </main>
  );
}
