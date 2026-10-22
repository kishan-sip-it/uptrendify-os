import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_GENERATE_CONTENT, CAN_VIEW_CONTENT, requireOrgRole } from '@/lib/auth/roles';
import { EDITABLE_BODY_STATUSES } from '@/lib/content/edit-policy';
import { obs } from '@/lib/obs/logger';

export const runtime = 'nodejs';

const BUCKET = 'brand-assets';
// Lossless cleaned-image uploads may grow beyond the source file; request size remains below Vercel's default payload ceiling.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAGIC: Record<string, Uint8Array> = {
  'image/png': Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': Uint8Array.from([0xff, 0xd8, 0xff]),
  'image/webp': Uint8Array.from([0x52, 0x49, 0x46, 0x46]),
};
const paramsSchema = z.object({ brandId: z.string().uuid(), contentId: z.string().uuid(), assetId: z.string().uuid() });

function extensionFor(type: string): string {
  return type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp';
}
function signatureMatches(type: string, bytes: Uint8Array): boolean {
  const magic = MAGIC[type];
  if (!magic || bytes.length < magic.length || !magic.every((value, index) => bytes[index] === value)) return false;
  if (type === 'image/webp') return bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return true;
}
async function loadContent(brandId: string, contentId: string, organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.from('content_items').select('id,status')
    .eq('id', contentId).eq('brand_id', brandId).eq('organization_id', organizationId).maybeSingle();
  if (result.error) throw result.error;
  return result.data as { id: string; status: string } | null;
}
function storagePath(organizationId: string, brandId: string, contentId: string, assetId: string, extension: string) {
  return `${organizationId}/${brandId}/${contentId}/studio-assets/${assetId}.${extension}`;
}
function assetUrl(brandId: string, contentId: string, assetId: string) {
  return `/api/brands/${brandId}/content/${contentId}/assets/${assetId}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ brandId: string; contentId: string; assetId: string }> }) {
  try {
    const { brandId, contentId, assetId } = paramsSchema.parse(await params);
    const auth = await requireOrgRole(CAN_VIEW_CONTENT);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const item = await loadContent(brandId, contentId, auth.context.organizationId);
    if (!item) return NextResponse.json({ error: 'Content not found' }, { status: 404 });

    const admin = createSupabaseAdminClient();
    const returnRawImage = new URL(request.url).searchParams.get('raw') === '1';
    for (const extension of ['png', 'jpg', 'webp']) {
      const path = storagePath(auth.context.organizationId, brandId, contentId, assetId, extension);
      if (returnRawImage) {
        // Same-origin pixel reads are needed for accurate canvas colour sampling.
        // Keep this path behind the same role and tenant checks as the normal redirect.
        const downloaded = await admin.storage.from(BUCKET).download(path);
        if (!downloaded.error && downloaded.data) {
          const bytes = Buffer.from(await downloaded.data.arrayBuffer());
          const contentType = extension === 'png' ? 'image/png' : extension === 'jpg' ? 'image/jpeg' : 'image/webp';
          return new NextResponse(bytes, {
            headers: {
              'Content-Type': contentType,
              'Content-Length': String(bytes.byteLength),
              'Cache-Control': 'private, no-store, max-age=0',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        }
        continue;
      }
      const signed = await admin.storage.from(BUCKET).createSignedUrl(path, 300);
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
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Image must be PNG, JPG, or WEBP.' }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be 2 MB or smaller.' }, { status: 400 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!signatureMatches(file.type, bytes)) return NextResponse.json({ error: 'The uploaded file does not match its declared image type.' }, { status: 400 });
    const admin = createSupabaseAdminClient();
    const uploaded = await admin.storage.from(BUCKET).upload(storagePath(auth.context.organizationId, brandId, contentId, assetId, extensionFor(file.type)), Buffer.from(bytes), {
      contentType: file.type, cacheControl: '3600', upsert: false,
    });
    if (uploaded.error) throw uploaded.error;
    return NextResponse.json({ ok: true, src: assetUrl(brandId, contentId, assetId) });
  } catch (error) {
    obs.error('Studio image asset upload failed', { error: error instanceof Error ? error.message : String(error) });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid Studio asset path' }, { status: 400 });
    return NextResponse.json({ error: 'Could not upload the Studio image' }, { status: 500 });
  }
}
