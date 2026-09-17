import { redirect } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BrandOverview } from '@/components/brand/brand-overview';
import { BrandStrategy } from '@/components/brand/brand-strategy';

export const dynamic = 'force-dynamic';

export default async function BrandPage({ params }: { params: Promise<{ brandId: string }> }) {
  const auth = await requireOrgRole(CAN_VIEW_BRAND);
  if (auth.error) redirect('/login');

  const { brandId } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id,name,website_url,industry,created_at')
    .eq('id', brandId)
    .eq('organization_id', auth.context.organizationId)
    .maybeSingle();

  if (!brand) redirect('/brands');

  return (
    <main className="main">
      <div className="topbar" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <a href="/" className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <ArrowLeft size={15} /> Back to command center
          </a>
          <h1 style={{ fontSize: 'clamp(24px, 3vw, 34px)', marginTop: 8 }}>{brand.name}</h1>
          <p className="subtitle">
            {brand.website_url ? (
              <a href={brand.website_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                {brand.website_url}
              </a>
            ) : null}
            {brand.industry ? ` · ${brand.industry}` : ''}
          </p>
        </div>
        <a className="badge" href="/brands/new"><Plus size={14} /> Add brand</a>
      </div>

      <BrandOverview brandId={brandId} brandName={brand.name} />

      <BrandStrategy brandId={brandId} brandName={brand.name} />
    </main>
  );
}