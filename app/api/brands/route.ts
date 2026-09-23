import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_CREATE_BRANDS, requireOrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';

const inputSchema = z.object({
  clientName: z.string().trim().min(2).max(120).optional(),
  brandName: z.string().trim().min(2).max(120),
  websiteUrl: z.string().url(),
  description: z.string().trim().max(4000).optional(),
  industry: z.string().trim().max(120).optional(),
  marketCountry: z.string().trim().max(120).optional(),
  targetAudience: z.string().trim().max(1000).optional(),
});

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 70) || 'brand';
}

export async function POST(request: Request) {
  try {
    const body = inputSchema.parse(await request.json());

    const auth = await requireOrgRole(CAN_CREATE_BRANDS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const organizationId = auth.context.organizationId;
    const { data: organization, error: organizationError } = await supabase
      .from('organizations')
      .select('workspace_type,name')
      .eq('id', organizationId)
      .single();
    if (organizationError) throw organizationError;

    if (organization.workspace_type === 'BUSINESS') {
      const activeBrand = await supabase
        .from('brands')
        .select('id,name')
        .eq('organization_id', organizationId)
        .eq('status', 'ACTIVE')
        .limit(1)
        .maybeSingle();
      if (activeBrand.error) throw activeBrand.error;
      if (activeBrand.data) {
        return NextResponse.json(
          { error: 'This Business workspace already has an active brand. Edit that brand, archive it, or switch the workspace to Agency to manage multiple brands.' },
          { status: 409 },
        );
      }
    }

    const organizationOrBrandName = body.clientName?.trim() || body.brandName.trim();
    const clientSlug = slugify(organizationOrBrandName);
    const brandSlug = slugify(body.brandName);

    let client = await supabase.from('clients').select('id').eq('organization_id', organizationId).eq('slug', clientSlug).maybeSingle();
    if (client.error) throw client.error;
    if (!client.data) {
      const createdClient = await supabase.from('clients').insert({ organization_id: organizationId, name: organizationOrBrandName, slug: clientSlug }).select('id').single();
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
      website_url: body.websiteUrl,
      description: body.description || null,
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
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid input', details: error.flatten() }, { status: 400 });
    obs.error('Brand creation failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 });
  }
}