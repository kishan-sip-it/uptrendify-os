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
  'queue_for_publish',
  'back_to_approved',
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
  reject: { from: ['IN_REVIEW', 'CLIENT_REVIEW', 'CHANGES_REQUESTED'], to: 'REJECTED' },
  changes_requested: { from: ['IN_REVIEW', 'CLIENT_REVIEW'], to: 'CHANGES_REQUESTED' },
  return_to_draft: { from: ['IN_REVIEW', 'CLIENT_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED', 'READY_TO_PUBLISH'], to: 'DRAFT' },
  archive: {
    from: ['DRAFT', 'IN_REVIEW', 'CLIENT_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'READY_TO_PUBLISH'],
    to: 'ARCHIVED',
  },
  queue_for_publish: { from: ['APPROVED'], to: 'READY_TO_PUBLISH' },
  back_to_approved: { from: ['READY_TO_PUBLISH'], to: 'APPROVED' },
};

const REVIEWER_ACTIONS: ReviewAction[] = ['approve', 'reject', 'changes_requested', 'queue_for_publish', 'back_to_approved'];

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
    const auth = await requireOrgRole(reviewerRole ? CAN_REVIEW_CONTENT : CAN_GENERATE_CONTENT);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const item = await loadItem(supabase, { brandId, contentId, organizationId: auth.context.organizationId });
    if (!item) return NextResponse.json({ error: 'Content not found' }, { status: 404 });

    if ((body.action === 'submit' || body.action === 'queue_for_publish') && !item.current_version_id) {
      const label = body.action === 'submit' ? 'submitting for review' : 'queuing for publishing';
      return NextResponse.json(
        { error: `Generate at least one content version before ${label}` },
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

    // Postgres commits the state change, review ledger and audit event atomically.
    const transitionResult = await supabase.rpc('apply_content_review_transition', {
      p_organization_id: auth.context.organizationId,
      p_brand_id: brandId,
      p_content_id: contentId,
      p_expected_status: item.status,
      p_expected_version_id: item.current_version_id,
      p_action: body.action,
      p_comment: body.comment ?? null,
    });
    if (transitionResult.error) {
      const message = transitionResult.error.message ?? '';
      if (transitionResult.error.code === '40001' || /CONTENT_STATUS_CHANGED_CONCURRENTLY|CONTENT_TRANSITION_NOT_ALLOWED/i.test(message)) {
        return NextResponse.json({ error: 'Content status or version changed concurrently. Reload and try again.' }, { status: 409 });
      }
      if (/CONTENT_REVIEW_ROLE_REQUIRED|CONTENT_GENERATOR_ROLE_REQUIRED/i.test(message)) {
        return NextResponse.json({ error: 'Insufficient permissions for this content action.' }, { status: 403 });
      }
      throw transitionResult.error;
    }
    const transitionRow = Array.isArray(transitionResult.data) ? transitionResult.data[0] : transitionResult.data;
    if (!transitionRow || transitionRow.status !== transition.to || !transitionRow.review_id) {
      throw new Error('The atomic content review transition returned an unexpected result.');
    }

    obs.info('Content status changed', {
      contentId,
      brandId,
      organizationId: auth.context.organizationId,
      from: item.status,
      to: transition.to,
      action: body.action,
      actorId: auth.context.userId,
    });

    return NextResponse.json({ ok: true, status: transitionRow.status, reviewId: transitionRow.review_id });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid review request' }, { status: 400 });
    obs.error('Content review failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not update content status' }, { status: 500 });
  }
}
