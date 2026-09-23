import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_CREATE_BRANDS, requireOrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';

const inputSchema = z.object({
  clientName: z.string().trim().min(2).max(120).optional(),
  brandName: z.string().trim().min(2).max(120),
  websiteUrl: z.string().url(),
  industry: z.string().trim().max(120).optional(),
  marketCountry: z.string().trim().max(120).optional(),
  targetAudience: z.string().trim().max(1000).optional(),
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

export async function POST(request: Request) {
  try {
    const body = inputSchema.parse(await request.json());
    const websiteUrl = normalizeBrandWebsite(body.websiteUrl);

    const auth = await requireOrgRole(CAN_CREATE_BRANDS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const organizationId = auth.context.organizationId;
    const organization = await supabase.from('organizations').select('name,workspace_type').eq('id', organizationId).single();
    if (organization.error) throw organization.error;
    if (organization.data.workspace_type === 'BUSINESS') {
      const activeBrands = await supabase.from('brands').select('id,status').eq('organization_id', organizationId).eq('status', 'ACTIVE');
      if (activeBrands.error) throw activeBrands.error;
      if ((activeBrands.data ?? []).length >= 1) {
        return NextResponse.json({ error: 'Business workspaces manage one primary brand. Switch the workspace to Agency before adding another brand.' }, { status: 409 });
      }
    }
    const clientName = body.clientName?.trim() || organization.data.name;
    const clientSlug = slugify(clientName);
    const brandSlug = slugify(body.brandName);

    let client = await supabase.from('clients').select('id').eq('organization_id', organizationId).eq('slug', clientSlug).maybeSingle();
    if (client.error) throw client.error;
    if (!client.data) {
      const createdClient = await supabase.from('clients').insert({ organization_id: organizationId, name: clientName, slug: clientSlug }).select('id').single();
      if (createdClient.error) {
        if (createdClient.error.code === '23505') {
          const racedClient = await supabase
            .from('clients')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('slug', clientSlug)
            .maybeSingle();
          if (racedClient.error || !racedClient.data) throw createdClient.error;
          client = { data: racedClient.data, error: null } as typeof client;
        } else {
          throw createdClient.error;
        }
      } else {
        client = { data: createdClient.data, error: null } as typeof client;
      }
    }

    const existingBrand = await supabase
      .from('brands')
      .select('id,name,website_url')
      .eq('organization_id', organizationId)
      .eq('client_id', client.data!.id)
      .eq('slug', brandSlug)
      .maybeSingle();
    if (existingBrand.error) throw existingBrand.error;
    if (existingBrand.data) {
      return NextResponse.json({ ok: true, brand: existingBrand.data, existing: true }, { status: 200 });
    }

    const createdBrand = await supabase.from('brands').insert({
      organization_id: organizationId,
      client_id: client.data!.id,
      name: body.brandName,
      slug: brandSlug,
      website_url: websiteUrl,
      industry: body.industry || null,
      market_country: body.marketCountry || null,
      target_audience: body.targetAudience || null,
    }).select('id,name,website_url').single();

    if (createdBrand.error) {
      if (createdBrand.error.code === '23505') {
        const racedBrand = await supabase
          .from('brands')
          .select('id,name,website_url')
          .eq('organization_id', organizationId)
          .eq('client_id', client.data!.id)
          .eq('slug', brandSlug)
          .maybeSingle();
        if (racedBrand.error || !racedBrand.data) throw createdBrand.error;
        return NextResponse.json({ ok: true, brand: racedBrand.data, existing: true }, { status: 200 });
      }
      throw createdBrand.error;
    }

    obs.info('Brand created', { organizationId, brandId: createdBrand.data.id, actorRole: auth.context.role });
    return NextResponse.json({ ok: true, brand: createdBrand.data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Some brand details are invalid. Check the fields and try again.', details: error.flatten() }, { status: 400 });
    if (error instanceof Error && /Website/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    obs.error('Brand creation failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 });
  }
}