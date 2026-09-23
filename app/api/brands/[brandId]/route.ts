import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_VIEW_BRAND, CAN_CREATE_BRANDS, requireOrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  websiteUrl: z.string().url().nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  marketCountry: z.string().trim().max(120).nullable().optional(),
  targetAudience: z.string().trim().max(1000).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  secondaryColors: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).max(8).optional(),
  brandRules: z.record(z.string(), z.unknown()).optional(),
  audienceDetails: z.record(z.string(), z.unknown()).optional(),
  offerDetails: z.record(z.string(), z.unknown()).optional(),
  positioning: z.record(z.string(), z.unknown()).optional(),
  messaging: z.record(z.string(), z.unknown()).optional(),
  visualIdentity: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});

function normalizeBrandWebsite(raw: string): string {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Website must use http or https.');
  if (url.username || url.password) throw new Error('Website URL cannot contain credentials.');
  const blocked = ['/dashboard', '/admin', '/login', '/signin', '/signup', '/auth', '/account', '/console', '/app'];
  const path = url.pathname.replace(/\\/+$/, '').toLowerCase();
  if (blocked.some((prefix) => path === prefix || path.startsWith(prefix + '/'))) {
    throw new Error('Use the public brand website, not an internal dashboard, login or account URL.');
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 70) || 'brand';
}

export async function GET(_request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    const auth = await requireOrgRole(CAN_VIEW_BRAND);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from('brands')
      .select('id,name,slug,website_url,description,industry,market_country,target_audience,primary_color,secondary_colors,brand_rules,audience_details,offer_details,positioning,messaging,visual_identity,status,client_id')
      .eq('id', brandId).eq('organization_id', auth.context.organizationId).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    return NextResponse.json({ ok: true, brand: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    obs.error('Brand load failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load brand' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const body = updateSchema.parse(await request.json());
    const { brandId } = await params;
    const auth = await requireOrgRole(CAN_CREATE_BRANDS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const supabase = await createSupabaseServerClient();

    const existing = await supabase.from('brands').select('id,name,slug,client_id').eq('id', brandId).eq('organization_id', auth.context.organizationId).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) {
      update.name = body.name;
      update.slug = slugify(body.name);
    }
    if (body.websiteUrl !== undefined) update.website_url = body.websiteUrl === null ? null : normalizeBrandWebsite(body.websiteUrl);
    if (body.description !== undefined) update.description = body.description;
    if (body.industry !== undefined) update.industry = body.industry;
    if (body.marketCountry !== undefined) update.market_country = body.marketCountry;
    if (body.targetAudience !== undefined) update.target_audience = body.targetAudience;
    if (body.primaryColor !== undefined) update.primary_color = body.primaryColor;
    if (body.secondaryColors !== undefined) update.secondary_colors = body.secondaryColors;
    if (body.brandRules !== undefined) update.brand_rules = body.brandRules;
    if (body.audienceDetails !== undefined) update.audience_details = body.audienceDetails;
    if (body.offerDetails !== undefined) update.offer_details = body.offerDetails;
    if (body.positioning !== undefined) update.positioning = body.positioning;
    if (body.messaging !== undefined) update.messaging = body.messaging;
    if (body.visualIdentity !== undefined) update.visual_identity = body.visualIdentity;
    if (body.status !== undefined) update.status = body.status;
    update.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from('brands').update(update).eq('id', brandId).eq('organization_id', auth.context.organizationId)
      .select('id,name,slug,website_url,description,industry,market_country,target_audience,primary_color,secondary_colors,brand_rules,audience_details,offer_details,positioning,messaging,visual_identity,status')
      .single();
    if (error) throw error;

    if (body.name !== undefined && existing.data.client_id) {
      await supabase.from('clients').update({ name: body.name, slug: slugify(body.name), updated_at: new Date().toISOString() })
        .eq('id', existing.data.client_id).eq('organization_id', auth.context.organizationId);
    }

    return NextResponse.json({ ok: true, brand: data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Some brand details are invalid. Check the fields and try again.', details: error.flatten() }, { status: 400 });
    if (error instanceof Error && /Website/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.message.includes('duplicate key')) return NextResponse.json({ error: 'Another brand already uses that name.' }, { status: 409 });
    obs.error('Brand update failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not update brand' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    const auth = await requireOrgRole(CAN_CREATE_BRANDS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from('brands').update({ status: 'ARCHIVED', updated_at: new Date().toISOString() })
      .eq('id', brandId).eq('organization_id', auth.context.organizationId).select('id,status').single();
    if (error) throw error;
    return NextResponse.json({ ok: true, brand: data });
  } catch (error) {
    obs.error('Brand archive failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not archive brand' }, { status: 500 });
  }
}
