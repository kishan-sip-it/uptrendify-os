import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_CREATE_BRANDS, requireOrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';

const BUCKET = 'brand-assets';
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

function extensionFor(type: string): string {
  switch (type) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/webp': return 'webp';
    case 'image/svg+xml': return 'svg';
    default: return 'bin';
  }
}

async function ensureBucket(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const existing = await admin.storage.getBucket(BUCKET);
  if (!existing.error) return;
  const created = await admin.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: [...ALLOWED_TYPES],
    fileSizeLimit: MAX_BYTES,
  });
  if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
}

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    const auth = await requireOrgRole(CAN_CREATE_BRANDS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a logo file.' }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Logo must be PNG, JPG, WEBP, or SVG.' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Logo must be 2 MB or smaller.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const brand = await supabase
      .from('brands')
      .select('id,name,website_url,visual_identity')
      .eq('id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .maybeSingle();
    if (brand.error) throw brand.error;
    if (!brand.data) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const admin = createSupabaseAdminClient();
    await ensureBucket(admin);

    const extension = extensionFor(file.type);
    const storagePath = `${auth.context.organizationId}/${brandId}/logo.${extension}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const uploaded = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: true,
    });
    if (uploaded.error) throw uploaded.error;

    const publicUrl = admin.storage.from(BUCKET).getPublicUrl(uploaded.data.path).data.publicUrl;
    const currentVisual = brand.data.visual_identity && typeof brand.data.visual_identity === 'object'
      ? brand.data.visual_identity as Record<string, unknown>
      : {};

    const updated = await supabase
      .from('brands')
      .update({
        visual_identity: { ...currentVisual, logoUrl: publicUrl },
        updated_at: new Date().toISOString(),
      })
      .eq('id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .select('id,name,slug,website_url,description,industry,market_country,target_audience,primary_color,secondary_colors,brand_rules,audience_details,offer_details,positioning,messaging,visual_identity,status')
      .single();

    if (updated.error) throw updated.error;

    return NextResponse.json({ ok: true, logoUrl: publicUrl, brand: updated.data });
  } catch (error) {
    obs.error('Brand logo upload failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not upload the brand logo' }, { status: 500 });
  }
}
