import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { CAN_REVIEW_SUGGESTIONS, CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BrandOverview } from '@/components/brand/brand-overview';
import { BrandBrainReview } from '@/components/brand/brand-brain-review';
import { BrandBrainAiDecision } from '@/components/brand/brand-brain-ai-decision';
import { BrandStrategy } from '@/components/brand/brand-strategy';
import { BrandEditor } from '@/components/brand/brand-editor';
import { BrandWorkspaceActions } from '@/components/brand/brand-workspace-actions';
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

  const canManageBrain = CAN_REVIEW_SUGGESTIONS.includes(auth.context.role);

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
      {view === 'overview' ? <><BrandOverview brandId={brandId} brandName={brand.name} /><BrandWorkspaceActions brandId={brandId} brandName={brand.name} /></> : null}
      {view === 'brain' ? <><BrandBrainAiDecision brandId={brandId} canManage={canManageBrain} /><BrandBrainReview brandId={brandId} brandName={brand.name} /></> : null}
      {view === 'strategy' ? <BrandStrategy brandId={brandId} brandName={brand.name} /> : null}
    </main>
  );
}
