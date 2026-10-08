import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_CREATE_BRANDS, requireOrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';

const BUCKET = 'brand-assets';
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAGIC: Record<string, Uint8Array> = {
  'image/png': Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
  'image/jpeg': Uint8Array.from([0xff,0xd8,0xff]),
  'image/webp': Uint8Array.from([0x52,0x49,0x46,0x46]),
};

function extensionFor(type: string): string {
  if (type === 'image/png') return 'png';
  if (type === 'image/jpeg') return 'jpg';
  return 'webp';
}

function signatureMatches(type: string, bytes: Uint8Array): boolean {
  const magic = MAGIC[type];
  if (!magic || bytes.length < magic.length) return false;
  if (!magic.every((value, index) => bytes[index] === value)) return false;
  if (type === 'image/webp') {
    return bytes.length >= 12 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  return true;
}

function normaliseVisual(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function loadBrand(brandId: string, organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const brand = await supabase
    .from('brands')
    .select('id,name,website_url,visual_identity')
    .eq('id', brandId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (brand.error) throw brand.error;
  return { supabase, brand: brand.data };
}

export async function GET(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    const auth = await requireOrgRole(['OWNER','ADMIN','STRATEGIST','EDITOR','APPROVER','CLIENT']);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const { brand } = await loadBrand(brandId, auth.context.organizationId);
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const visual = normaliseVisual(brand.visual_identity);
    const logoUrl = typeof visual.logoUrl === 'string' ? visual.logoUrl : null;
    if (!logoUrl || !logoUrl.startsWith('/api/brands/')) return NextResponse.json({ error: 'No custom logo is uploaded.' }, { status: 404 });

    const admin = createSupabaseAdminClient();
    const prefix = auth.context.organizationId + '/' + brandId + '/logo.';
    for (const extension of ['png', 'jpg', 'webp']) {
      const path = prefix + extension;
      const signed = await admin.storage.from(BUCKET).createSignedUrl(path, 300);
      if (!signed.error && signed.data?.signedUrl) {
        const response = NextResponse.redirect(signed.data.signedUrl, 302);
        response.headers.set('Cache-Control', 'private, no-store, max-age=0');
        return response;
      }
    }
    return NextResponse.json({ error: 'Custom logo file is unavailable.' }, { status: 404 });
  } catch (error) {
    obs.error('Brand logo load failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load the brand logo' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    const auth = await requireOrgRole(CAN_CREATE_BRANDS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a logo file.' }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Logo must be PNG, JPG, or WEBP.' }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: 'Logo must be 2 MB or smaller.' }, { status: 400 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!signatureMatches(file.type, bytes)) return NextResponse.json({ error: 'The uploaded file does not match its declared image type.' }, { status: 400 });

    const { supabase, brand } = await loadBrand(brandId, auth.context.organizationId);
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const admin = createSupabaseAdminClient();
    const storagePath = `${auth.context.organizationId}/${brandId}/logo.${extensionFor(file.type)}`;
    const oldPaths = ['png', 'jpg', 'webp'].map((extension) => `${auth.context.organizationId}/${brandId}/logo.${extension}`);
    const removedOld = await admin.storage.from(BUCKET).remove(oldPaths);
    if (removedOld.error) throw removedOld.error;

    const uploaded = await admin.storage.from(BUCKET).upload(storagePath, Buffer.from(bytes), {
      contentType: file.type,
      cacheControl: '3600',
      upsert: true,
    });
    if (uploaded.error) throw uploaded.error;

    const currentVisual = normaliseVisual(brand.visual_identity);
    const visualIdentity = { ...currentVisual, logoUrl: `/api/brands/${brandId}/logo` };

    const updated = await supabase
      .from('brands')
      .update({ visual_identity: visualIdentity, updated_at: new Date().toISOString() })
      .eq('id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .select('id,name,slug,website_url,description,industry,market_country,target_audience,primary_color,secondary_colors,brand_rules,audience_details,offer_details,positioning,messaging,visual_identity,status')
      .single();
    if (updated.error) throw updated.error;

    return NextResponse.json({ ok: true, logoUrl: visualIdentity.logoUrl, brand: updated.data });
  } catch (error) {
    obs.error('Brand logo upload failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not upload the brand logo' }, { status: 500 });
  }
}


export async function DELETE(_request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    const auth = await requireOrgRole(CAN_CREATE_BRANDS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const { supabase, brand } = await loadBrand(brandId, auth.context.organizationId);
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const visual = normaliseVisual(brand.visual_identity);
    const logoUrl = typeof visual.logoUrl === 'string' ? visual.logoUrl : null;
    if (logoUrl?.startsWith(`/api/brands/${brandId}/logo`)) {
      const admin = createSupabaseAdminClient();
      const paths = ['png', 'jpg', 'webp'].map((extension) => `${auth.context.organizationId}/${brandId}/logo.${extension}`);
      const removed = await admin.storage.from(BUCKET).remove(paths);
      if (removed.error) throw removed.error;
    }

    const nextVisual = { ...visual };
    delete nextVisual.logoUrl;
    const updated = await supabase
      .from('brands')
      .update({ visual_identity: nextVisual, updated_at: new Date().toISOString() })
      .eq('id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .select('id,name,slug,website_url,description,industry,market_country,target_audience,primary_color,secondary_colors,brand_rules,audience_details,offer_details,positioning,messaging,visual_identity,status')
      .single();
    if (updated.error) throw updated.error;

    return NextResponse.json({ ok: true, brand: updated.data });
  } catch (error) {
    obs.error('Brand logo removal failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not remove the brand logo' }, { status: 500 });
  }
}
