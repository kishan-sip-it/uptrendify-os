import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_GENERATE_CONTENT, CAN_REVIEW_CONTENT, requireOrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';

const paramsSchema = z.object({ brandId: z.string().uuid(), contentId: z.string().uuid() });

const REVIEW_ACTIONS = [
  'submit',
  'approve',
  'reject',
  'changes_requested',
  'return_to_draft',
  'archive',
] as const;
type ReviewAction = (typeof REVIEW_ACTIONS)[number];

const bodySchema = z
  .object({
    action: z.enum(REVIEW_ACTIONS),
    comment: z.string().trim().max(2000).nullish(),
  })
  .strict();

const TRANSITIONS: Record<ReviewAction, { from: string[]; to: string }> = {
  submit: { from: ['DRAFT', 'CHANGES_REQUESTED', 'REJECTED'], to: 'IN_REVIEW' },
  approve: { from: ['IN_REVIEW', 'CLIENT_REVIEW', 'CHANGES_REQUESTED'], to: 'APPROVED' },
  reject: { from: ['IN_REVIEW', 'CLIENT_REVIEW', 'CHANGES_REQUESTED', 'APPROVED'], to: 'REJECTED' },
  changes_requested: { from: ['IN_REVIEW', 'CLIENT_REVIEW', 'APPROVED'], to: 'CHANGES_REQUESTED' },
  return_to_draft: { from: ['IN_REVIEW', 'CLIENT_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED'], to: 'DRAFT' },
  archive: { from: ['DRAFT', 'IN_REVIEW', 'CLIENT_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHED'], to: 'ARCHIVED' },
};

const REVIEWER_ACTIONS: ReviewAction[] = ['approve', 'reject', 'changes_requested'];
const GENERATOR_ACTIONS: ReviewAction[] = ['submit', 'return_to_draft', 'archive'];

async function loadItem(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  args: { brandId: string; contentId: string; organizationId: string },
) {
  const result = await supabase
    .from('content_items')
    .select('id,title,status,current_version_id')
    .eq('id', args.contentId)
    .eq('brand_id', args.brandId)
    .eq('organization_id', args.organizationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as { id: string; title: string; status: string; current_version_id: string | null } | null;
}

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string; contentId: string }> }) {
  try {
    const { brandId, contentId } = paramsSchema.parse(await params);
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const reviewerRole = REVIEWER_ACTIONS.includes(body.action);
    const generatorRole = GENERATOR_ACTIONS.includes(body.action);
    const auth = await requireOrgRole(reviewerRole ? CAN_REVIEW_CONTENT : CAN_GENERATE_CONTENT);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const item = await loadItem(supabase, { brandId, contentId, organizationId: auth.context.organizationId });
    if (!item) return NextResponse.json({ error: 'Content not found' }, { status: 404 });

    if (body.action === 'submit' && !item.current_version_id) {
      return NextResponse.json(
        { error: 'Generate at least one content version before submitting for review' },
        { status: 409 },
      );
    }

    const transition = TRANSITIONS[body.action];
    if (!transition.from.includes(item.status)) {
      return NextResponse.json(
        { error: `Cannot ${body.action} content in state ${item.status}` },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const itemUpdate = await supabase
      .from('content_items')
      .update({ status: transition.to, updated_at: now })
      .eq('id', contentId)
      .eq('organization_id', auth.context.organizationId)
      .eq('status', item.status)
      .select('id,status')
      .maybeSingle();
    if (itemUpdate.error) throw itemUpdate.error;
    if (!itemUpdate.data) {
      return NextResponse.json(
        { error: 'Content status changed concurrently. Reload and try again.' },
        { status: 409 },
      );
    }

    const reviewInsert = await supabase
      .from('content_reviews')
      .insert({
        organization_id: auth.context.organizationId,
        content_item_id: contentId,
        reviewer_id: auth.context.userId,
        content_version_id: item.current_version_id ?? null,
        decision: body.action,
        comment: body.comment ?? null,
      })
      .select('id')
      .single();
    if (reviewInsert.error) throw reviewInsert.error;

    await supabase.from('audit_logs').insert({
      organization_id: auth.context.organizationId,
      actor_user_id: auth.context.userId,
      action: `content.${body.action}`,
      entity_type: 'content',
      entity_id: contentId,
      metadata: {
        from: item.status,
        to: transition.to,
        comment: body.comment ?? null,
        contentVersionId: item.current_version_id ?? null,
      },
    });

    obs.info('Content status changed', {
      contentId,
      brandId,
      organizationId: auth.context.organizationId,
      from: item.status,
      to: transition.to,
      action: body.action,
      actorId: auth.context.userId,
    });

    return NextResponse.json({ ok: true, status: transition.to, reviewId: reviewInsert.data.id });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid review request' }, { status: 400 });
    obs.error('Content review failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not update content status' }, { status: 500 });
  }
}