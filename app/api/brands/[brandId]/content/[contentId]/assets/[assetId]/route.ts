import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_GENERATE_CONTENT, CAN_VIEW_CONTENT, requireOrgRole } from '@/lib/auth/roles';
import { EDITABLE_BODY_STATUSES } from '@/lib/content/edit-policy';
import {
  STUDIO_ASSET_ALLOWED_TYPES,
  STUDIO_ASSET_BUCKET,
  STUDIO_ASSET_MAX_BYTES,
  extensionFor,
  signatureMatches,
  studioAssetStoragePath,
  studioAssetUrl,
} from '@/lib/content/studio-asset-image';
import { obs } from '@/lib/obs/logger';

export const runtime = 'nodejs';

const paramsSchema = z.object({ brandId: z.string().uuid(), contentId: z.string().uuid(), assetId: z.string().uuid() });

async function loadContent(brandId: string, contentId: string, organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.from('content_items').select('id,status')
    .eq('id', contentId).eq('brand_id', brandId).eq('organization_id', organizationId).maybeSingle();
  if (result.error) throw result.error;
  return result.data as { id: string; status: string } | null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ brandId: string; contentId: string; assetId: string }> }) {
  try {
    const { brandId, contentId, assetId } = paramsSchema.parse(await params);
    const auth = await requireOrgRole(CAN_VIEW_CONTENT);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const item = await loadContent(brandId, contentId, auth.context.organizationId);
    if (!item) return NextResponse.json({ error: 'Content not found' }, { status: 404 });

    const admin = createSupabaseAdminClient();
    for (const extension of ['png', 'jpg', 'webp']) {
      const signed = await admin.storage.from(STUDIO_ASSET_BUCKET).createSignedUrl(studioAssetStoragePath(auth.context.organizationId, brandId, contentId, assetId, extension), 300);
      if (!signed.error && signed.data?.signedUrl) {
        const response = NextResponse.redirect(signed.data.signedUrl, 302);
        response.headers.set('Cache-Control', 'private, no-store, max-age=0');
        return response;
      }
    }
    return NextResponse.json({ error: 'Studio image asset not found' }, { status: 404 });
  } catch (error) {
    obs.error('Studio image asset read failed', { error: error instanceof Error ? error.message : String(error) });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid Studio asset path' }, { status: 400 });
    return NextResponse.json({ error: 'Could not load the Studio image' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string; contentId: string; assetId: string }> }) {
  try {
    const { brandId, contentId, assetId } = paramsSchema.parse(await params);
    const auth = await requireOrgRole(CAN_GENERATE_CONTENT);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const item = await loadContent(brandId, contentId, auth.context.organizationId);
    if (!item) return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    if (!EDITABLE_BODY_STATUSES.includes(item.status)) return NextResponse.json({ error: 'This content is not in an editable status. No image was uploaded.' }, { status: 409 });

    let form: FormData;
    try { form = await request.formData(); }
    catch { return NextResponse.json({ error: 'Choose a valid image file.' }, { status: 400 }); }
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image file.' }, { status: 400 });
    if (!STUDIO_ASSET_ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Image must be PNG, JPG, or WEBP.' }, { status: 400 });
    if (file.size <= 0 || file.size > STUDIO_ASSET_MAX_BYTES) return NextResponse.json({ error: 'Image must be 2 MB or smaller.' }, { status: 400 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!signatureMatches(file.type, bytes)) return NextResponse.json({ error: 'The uploaded file does not match its declared image type.' }, { status: 400 });
    const admin = createSupabaseAdminClient();
    const uploaded = await admin.storage.from(STUDIO_ASSET_BUCKET).upload(studioAssetStoragePath(auth.context.organizationId, brandId, contentId, assetId, extensionFor(file.type)), Buffer.from(bytes), {
      contentType: file.type, cacheControl: '3600', upsert: false,
    });
    if (uploaded.error) throw uploaded.error;
    return NextResponse.json({ ok: true, src: studioAssetUrl(brandId, contentId, assetId) });
  } catch (error) {
    obs.error('Studio image asset upload failed', { error: error instanceof Error ? error.message : String(error) });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid Studio asset path' }, { status: 400 });
    return NextResponse.json({ error: 'Could not upload the Studio image' }, { status: 500 });
  }
}
