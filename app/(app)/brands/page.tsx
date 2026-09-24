import { redirect } from 'next/navigation';
import { ArrowRight, Globe2 } from 'lucide-react';
import { CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function BrandsListPage() {
  const auth = await requireOrgRole(CAN_VIEW_BRAND);
  if (auth.error) redirect('/login');

  const supabase = await createSupabaseServerClient();
  const { data: brands } = await supabase
    .from('brands')
    .select('id,name,website_url,industry,status,created_at')
    .eq('organization_id', auth.context.organizationId)
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <main className="main" style={{ maxWidth: 1100 }}>
      <div className="topbar">
        <div>
          <a href="/" className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>Back to command center</a>
          <h1>Brands</h1>
          <p className="subtitle">Every client brand with its own research run history and Brand Brain.</p>
        </div>
      </div>

      {(brands ?? []).length === 0 ? (
        <div className="card">
          <div className="section-title">
            <div>
              <div className="eyebrow">Portfolio</div>
              <h2 style={{ margin: '5px 0' }}>No brands yet</h2>
            </div>
          </div>
          <p className="subtitle">Use <strong>Add brand</strong> in the left sidebar to add your first brand and start analyzing its public website.</p>
        </div>
      ) : (
        <div className="grid">
          {(brands ?? []).map((brand, i) => (
            <a className="card brand-card hover-lift animate-fade-up" href={`/brands/${brand.id}`} key={brand.id} style={{ animationDelay: `${i * 50}ms`, display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
                <div>
                  <h3 style={{ margin: 0 }}>{brand.name}</h3>
                  <div className="metric-label">{brand.industry || brand.website_url?.replace(/^https?:\/\//, '') || 'Brand'}</div>
                </div>
                <span className="badge tone-muted">{brand.status ?? 'ACTIVE'}</span>
              </div>
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--muted)', fontSize: 13 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Globe2 size={14} /> {brand.website_url ?? 'No website'}</span>
                <ArrowRight size={16} />
              </div>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}