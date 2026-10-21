import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { CAN_GENERATE_CONTENT, CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ContentEditorWorkspace } from '@/components/content/content-editor-workspace';
import { EDITABLE_BODY_STATUSES } from '@/lib/content/edit-policy';

export const dynamic = 'force-dynamic';

export default async function BrandContentEditorPage({ params }: { params: Promise<{ brandId: string; contentId: string }> }) {
  const auth = await requireOrgRole(CAN_VIEW_BRAND);
  if (auth.error) redirect('/login');

  const { brandId, contentId } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id,name')
    .eq('id', brandId)
    .eq('organization_id', auth.context.organizationId)
    .maybeSingle();
  if (!brand) redirect('/brands');

  const { data: item } = await supabase
    .from('content_items')
    .select('id,title,type,status,current_version_id')
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
    .select('id,version,body')
    .eq('content_item_id', contentId)
    .eq('organization_id', auth.context.organizationId)
    .order('version', { ascending: false })
    .limit(40);
  if (versionsResult.error) throw versionsResult.error;
  const versions = (versionsResult.data ?? []) as Array<{ id: string; version: number; body: string }>;
  const version = versions.find((entry) => entry.id === item.current_version_id) ?? versions[0] ?? null;

  return (
    <main className="main">
      <div style={{ marginBottom: 12 }}>
        <a href={`/brands/${brandId}/content/${contentId}`} className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <ArrowLeft size={15} /> Back to content detail
        </a>
      </div>
      <ContentEditorWorkspace
        brandId={brandId}
        contentId={contentId}
        documentTitle={item.title}
        contentType={item.type}
        versionNumber={version?.version ?? 0}
        body={version?.body ?? ''}
        canEdit={Boolean(canEdit && version)}
        versions={versions}
        currentVersionId={item.current_version_id}
      />
    </main>
  );
}
