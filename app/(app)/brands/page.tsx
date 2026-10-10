import { redirect } from 'next/navigation';
import { ArrowRight, Globe2 } from 'lucide-react';
import { CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/feedback';

export const dynamic = 'force-dynamic';

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

/**
 * Read the analysed palette for a brand.
 *
 * Prefers the full detected palette stored in visual_identity (which carries
 * role + occurrence counts), then falls back to the dedicated colour columns so
 * brands created before the palette scan still render something real. Nothing
 * here invents a colour: an unscanned brand yields an empty list.
 */
function analyzedPalette(brand: {
  primary_color?: unknown;
  secondary_colors?: unknown;
  visual_identity?: unknown;
}): string[] {
  const visualIdentity =
    brand.visual_identity && typeof brand.visual_identity === 'object' && !Array.isArray(brand.visual_identity)
      ? (brand.visual_identity as Record<string, unknown>)
      : null;

  const detected = Array.isArray(visualIdentity?.palette)
    ? (visualIdentity?.palette as unknown[])
        .map((entry) => (entry && typeof entry === 'object' ? (entry as { hex?: unknown }).hex : null))
        .filter(isHexColor)
    : [];

  const primary = isHexColor(brand.primary_color) ? brand.primary_color : null;
  const secondary = Array.isArray(brand.secondary_colors) ? brand.secondary_colors.filter(isHexColor) : [];

  return Array.from(new Set([...detected, primary, ...secondary].filter(isHexColor))).slice(0, 6);
}

function brandLogo(brand: { visual_identity?: unknown }): string | null {
  const visualIdentity =
    brand.visual_identity && typeof brand.visual_identity === 'object' && !Array.isArray(brand.visual_identity)
      ? (brand.visual_identity as Record<string, unknown>)
      : null;
  const logo = visualIdentity?.logoUrl;
  return typeof logo === 'string' && logo.length > 0 ? logo : null;
}

function brandInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
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
      <a href="/" className="metric-label ui-backlink" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>Back to command center</a>
      <PageHeader eyebrow="Portfolio" title="Brands" description="Every client brand with its own research run history and Brand Brain." />

      {(brands ?? []).length === 0 ? (
        <EmptyState
          title="No brands yet"
          description="Add your first brand to analyze its public website and start building its evidence-backed Brand Brain."
          action={<a className="badge auth-submit" href="/brands/new" style={{ display: 'inline-flex', textDecoration: 'none' }}>Add your first brand <ArrowRight size={14} /></a>}
        />
      ) : (
        <div className="grid">
          {(brands ?? []).map((brand, i) => {
            const palette = analyzedPalette(brand);
            const logo = brandLogo(brand);
            // Brand colours are injected as scoped custom properties and only
            // ever consumed through color-mix() with a semantic token, so an
            // arbitrary brand colour tints the card instead of overriding the
            // theme or harming text contrast.
            const brandVars = {
              '--brand-primary': palette[0] ?? 'var(--accent)',
              '--brand-secondary': palette[1] ?? 'var(--accent-2)',
            } as React.CSSProperties;
            return (
              <a
                className="card brand-card hover-lift animate-fade-up"
                href={`/brands/${brand.id}`}
                key={brand.id}
                style={{ animationDelay: `${i * 50}ms`, display: 'block', ...brandVars }}
              >
                <div className="brand-strip" aria-hidden="true" />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                    <span className="brand-identity-logo" style={{ width: 42, height: 42 }} aria-hidden="true">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" style={{ padding: 5 }} />
                      ) : (
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{brandInitials(brand.name)}</span>
                      )}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ margin: 0, overflowWrap: 'anywhere' }}>{brand.name}</h3>
                      <div className="metric-label">{brand.industry || brand.website_url?.replace(/^https?:\/\//, '') || 'Brand'}</div>
                    </div>
                  </div>
                  <StatusBadge status={brand.status ?? 'ACTIVE'} />
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
