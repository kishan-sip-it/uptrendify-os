import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_PUBLISH_CONTENT, CAN_VIEW_CONTENT, requireOrgRole } from '@/lib/auth/roles';
import { publishRequestSchema } from '@/lib/publish/schema';
import { publishContent, PublishError } from '@/lib/publish/service';
import { obs } from '@/lib/obs/logger';

const paramsSchema = z.object({ brandId: z.string().uuid(), contentId: z.string().uuid() });

async function loadItem(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  args: { brandId: string; contentId: string; organizationId: string },
) {
  const result = await supabase
    .from('content_items')
    .select('id,title,status,channel,brand_id,client_id,campaign_id,current_version_id,updated_at')
    .eq('id', args.contentId)
    .eq('brand_id', args.brandId)
    .eq('organization_id', args.organizationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as Record<string, unknown> | null;
}

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string; contentId: string }> }) {
  try {
    const { brandId, contentId } = paramsSchema.parse(await params);
    const body = publishRequestSchema.parse(await request.json().catch(() => ({})));

    const auth = await requireOrgRole(CAN_PUBLISH_CONTENT);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();

    const result = await publishContent(supabase, {
      organizationId: auth.context.organizationId,
      brandId,
      contentId,
      versionId: body.contentVersionId ?? null,
      channel: body.channel ?? null,
      idempotencyKey: body.idempotencyKey ?? null,
      republish: Boolean(body.republish),
      initiatedBy: auth.context.userId,
    });

    switch (result.kind) {
      case 'published':
        return NextResponse.json({
          published: true,
          status: 'PUBLISHED',
          publicationId: result.publicationId,
          channel: result.channel,
          externalReference: result.externalReference ?? null,
          republished: result.republished,
        });
      case 'not_connected':
        return NextResponse.json({
          published: false,
          status: 'NOT_CONNECTED',
          publicationId: result.publicationId,
          channel: result.channel,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        });
      case 'failed':
        return NextResponse.json(
          {
            published: false,
            status: 'FAILED',
            publicationId: result.publicationId,
            channel: result.channel,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          },
          { status: 502 },
        );
      case 'duplicate':
        return NextResponse.json({
          published: result.status === 'SUCCEEDED',
          status: result.status,
          publicationId: result.publicationId,
          channel: result.channel,
          deduplicated: true,
          errorCode: result.errorCode ?? null,
          errorMessage: result.errorMessage ?? null,
        });
    }
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid publish request' }, { status: 400 });
    if (error instanceof PublishError) {
      if (error.code === 'ALREADY_PUBLISHED') {
        obs.info('Duplicate publish blocked', { errorCode: error.code, message: error.message });
        return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
      }
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    obs.error('Content publish failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not publish content' }, { status: 500 });
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ brandId: string; contentId: string }> }) {
  try {
    const { brandId, contentId } = paramsSchema.parse(await params);

    const auth = await requireOrgRole(CAN_VIEW_CONTENT);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const item = await loadItem(supabase, { brandId, contentId, organizationId: auth.context.organizationId });
    if (!item) return NextResponse.json({ error: 'Content not found' }, { status: 404 });

    const brandIdCol = brandId as string;
    const orgId = auth.context.organizationId as string;

    const configsResult = await supabase
      .from('channel_configurations')
      .select('id,channel,status,last_tested_at')
      .eq('organization_id', orgId)
      .eq('brand_id', brandIdCol)
      .order('channel', { ascending: true });
    if (configsResult.error) throw configsResult.error;

    const attemptsResult = await supabase
      .from('content_publications')
      .select('id,content_version_id,channel,status,error_code,error_message,external_reference,published_at,initiated_by,created_at')
      .eq('content_item_id', contentId)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (attemptsResult.error) throw attemptsResult.error;

    const attempts = (attemptsResult.data ?? []).map((attempt) => ({
      id: attempt.id,
      contentVersionId: attempt.content_version_id,
      channel: attempt.channel,
      status: attempt.status,
      errorCode: attempt.error_code ?? null,
      errorMessage: attempt.error_message ?? null,
      externalReference: attempt.external_reference ?? null,
      publishedAt: attempt.published_at ?? null,
      initiatedBy: attempt.initiated_by ?? null,
      createdAt: attempt.created_at,
    }));

    return NextResponse.json(
      {
        ok: true,
        item: {
          id: item.id,
          title: item.title,
          status: item.status,
          channel: item.channel ?? null,
          currentVersionId: item.current_version_id ?? null,
        },
        canPublish: CAN_PUBLISH_CONTENT.includes(auth.context.role),
        channels: (configsResult.data ?? []).map((config) => ({
          channel: config.channel,
          connectionStatus: config.status,
          lastTestedAt: config.last_tested_at ?? null,
        })),
        attempts,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid content id' }, { status: 400 });
    obs.error('Publish history failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load publish history' }, { status: 500 });
  }
}