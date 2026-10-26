import { redirect } from 'next/navigation';
import { CAN_GENERATE_CONTENT, CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ContentEditorWorkspace } from '@/components/content/content-editor-workspace';
import { EDITABLE_BODY_STATUSES } from '@/lib/content/edit-policy';
import { parseVisualIdentity } from '@/lib/brand/identity-mapping';

export const dynamic = 'force-dynamic';

export default async function BrandContentEditorPage({ params }: { params: Promise<{ brandId: string; contentId: string }> }) {
  const auth = await requireOrgRole(CAN_VIEW_BRAND);
  if (auth.error) redirect('/login');

  const { brandId, contentId } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id,name,primary_color,secondary_colors,visual_identity')
    .eq('id', brandId)
    .eq('organization_id', auth.context.organizationId)
    .maybeSingle();
  if (!brand) redirect('/brands');

  const { data: item } = await supabase
    .from('content_items')
    .select('id,title,type,channel,cta,status,current_version_id')
    .eq('id', contentId)
    .eq('brand_id', brandId)
    .eq('organization_id', auth.context.organizationId)
    .maybeSingle();
  if (!item) redirect(`/brands/${brandId}/content`);

  const canEdit = CAN_GENERATE_CONTENT.includes(auth.context.role)
    && EDITABLE_BODY_STATUSES.includes(item.status)
    && Boolean(item.current_version_id);

  // All saved versions (newest first) feed the editor's version picker; the
  // canvas opens the current version.
  const versionsResult = await supabase
    .from('content_versions')
    .select('id,version,body,cta')
    .eq('content_item_id', contentId)
    .eq('organization_id', auth.context.organizationId)
    .order('version', { ascending: false })
    .limit(40);
  if (versionsResult.error) throw versionsResult.error;
  const versions = (versionsResult.data ?? []) as Array<{ id: string; version: number; body: string; cta?: string | null }>;
  const version = versions.find((entry) => entry.id === item.current_version_id) ?? versions[0] ?? null;

  // Brand kit for the editor: palette + font families from the saved brand.
  const brandColors = [brand.primary_color, ...(Array.isArray(brand.secondary_colors) ? brand.secondary_colors : [])]
    .filter((value): value is string => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value));
  const brandFonts = Array.isArray((brand.visual_identity as { fonts?: Array<{ family?: string }> } | null)?.fonts)
    ? ((brand.visual_identity as { fonts: Array<{ family: string }> }).fonts.map((font) => font.family).filter(Boolean))
    : [];

  // Parsed scan identity powering "Apply Brand Essentials" (logo, palette
  // roles, heading/body font roles, font asset metadata). Falls back to an
  // empty identity when the scan is missing or malformed.
  const visualIdentity = parseVisualIdentity(brand.visual_identity);
  const brandVisual = {
    logoUrl: visualIdentity.logoUrl,
    palette: visualIdentity.palette.slice(0, 8).map((entry) => ({ hex: entry.hex, role: entry.role })),
    headingFont: visualIdentity.headingFont,
    bodyFont: visualIdentity.bodyFont,
    fonts: visualIdentity.fonts.slice(0, 6).map((font) => ({
      family: font.family,
      fontAssetUrl: font.fontAssetUrl,
      fontAssetFormat: font.fontAssetFormat,
    })),
  };

  return (
    <>
      <ContentEditorWorkspace
        brandId={brandId}
        organizationId={auth.context.organizationId}
        contentId={contentId}
        documentTitle={item.title}
        contentType={item.type}
        channel={item.channel}
        itemCta={version?.cta ?? item.cta ?? null}
        brand={{ colors: brandColors, fonts: brandFonts }}
        brandVisual={brandVisual}
        versionNumber={version?.version ?? 0}
        body={version?.body ?? ''}
        canEdit={Boolean(canEdit && version)}
        versions={versions}
        currentVersionId={item.current_version_id}
        contentStatus={item.status}
      />
    </>
  );
}
