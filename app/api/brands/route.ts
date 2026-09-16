import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const inputSchema = z.object({
  clientName: z.string().trim().min(2).max(120),
  brandName: z.string().trim().min(2).max(120),
  websiteUrl: z.string().url(),
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
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) return NextResponse.json({ error: 'No organization membership found' }, { status: 403 });

    const organizationId = membership.organization_id;
    const clientSlug = slugify(body.clientName);
    const brandSlug = slugify(body.brandName);

    let client = await supabase.from('clients').select('id').eq('organization_id', organizationId).eq('slug', clientSlug).maybeSingle();
    if (client.error) throw client.error;
    if (!client.data) {
      const createdClient = await supabase.from('clients').insert({ organization_id: organizationId, name: body.clientName, slug: clientSlug }).select('id').single();
      if (createdClient.error) throw createdClient.error;
      client = { data: createdClient.data, error: null } as typeof client;
    }

    const createdBrand = await supabase.from('brands').insert({
      organization_id: organizationId,
      client_id: client.data!.id,
      name: body.brandName,
      slug: brandSlug,
      website_url: body.websiteUrl,
      industry: body.industry || null,
      market_country: body.marketCountry || null,
      target_audience: body.targetAudience || null,
    }).select('id,name,website_url').single();

    if (createdBrand.error) throw createdBrand.error;

    return NextResponse.json({ ok: true, brand: createdBrand.data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid input', details: error.flatten() }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create brand' }, { status: 500 });
  }
}
