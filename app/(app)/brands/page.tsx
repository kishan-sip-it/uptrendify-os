import { redirect } from 'next/navigation';
import { ArrowRight, Globe2 } from 'lucide-react';
import { CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function analyzedPalette(brand: { primary_color?: unknown; secondary_colors?: unknown; visual_identity?: unknown }) {
  const visualIdentity = brand.visual_identity && typeof brand.visual_identity === 'object'
    ? brand.visual_identity as Record<string, unknown>
    : null;
  const primary = isHexColor(brand.primary_color)
    ? brand.primary_color
    : isHexColor(visualIdentity?.primaryColor)
      ? visualIdentity.primaryColor
      : null;
  const secondary = Array.isArray(brand.secondary_colors)
    ? brand.secondary_colors.filter(isHexColor)
    : [];
  return Array.from(new Set([primary, ...secondary].filter(isHexColor))).slice(0, 6);
}

export default async function BrandsListPage() {
  const auth = await requireOrgRole(CAN_VIEW_BRAND);
  if (auth.error) redirect('/login');

  const supabase = await createSupabaseServerClient();
  const { data: brands } = await supabase
    .from('brands')
    .select('id,name,website_url,industry,status,created_at,primary_color,secondary_colors,visual_identity')
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
          {(brands ?? []).map((brand, i) => {
            const palette = analyzedPalette(brand);
            return (
              <a className="card brand-card hover-lift animate-fade-up" href={`/brands/${brand.id}`} key={brand.id} style={{ animationDelay: `${i * 50}ms`, display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0 }}>{brand.name}</h3>
                    <div className="metric-label">{brand.industry || brand.website_url?.replace(/^https?:\/\//, '') || 'Brand'}</div>
                  </div>
                  <span className="badge tone-muted">{brand.status ?? 'ACTIVE'}</span>
                </div>
                {palette.length > 0 ? (
                  <div
                    aria-label="Analyzed brand colors"
                    title="Analyzed brand colors"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 12, height: 22 }}
                  >
                    {palette.map((color) => (
                      <span
                        key={color}
                        aria-label={color}
                        style={{ width: 18, height: 18, borderRadius: 6, background: color, border: '1px solid color-mix(in srgb, var(--text) 12%, transparent)', boxShadow: '0 1px 3px color-mix(in srgb, var(--text) 10%, transparent)', display: 'inline-block' }}
                      />
                    ))}
                    <span className="metric-label" style={{ marginLeft: 4 }}>Analyzed palette</span>
                  </div>
                ) : null}
                <div style={{ marginTop: palette.length > 0 ? 10 : 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--muted)', fontSize: 13, gap: 12 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}><Globe2 size={14} /> <span className="safe-url">{brand.website_url ?? 'No website'}</span></span>
                  <ArrowRight size={16} />
                </div>
              </a>
            );
          })}
        </div>
      )}
    </main>
  );
}
