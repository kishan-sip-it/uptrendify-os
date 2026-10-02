import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_REVIEW_SUGGESTIONS, requireOrgRole } from '@/lib/auth/roles';
import { approveSuggestion, editSuggestion, rejectSuggestion, regenerateSuggestion } from '@/lib/brain/review';
import { isReplayOrganization, regenerateReplaySuggestion } from '@/lib/replay';
import { obs } from '@/lib/obs/logger';

const paramsSchema = z.object({ brandId: z.string().uuid(), suggestionId: z.string().uuid() });
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject') }),
  z.object({ action: z.literal('regenerate') }),
  z.object({ action: z.literal('ai_decision'), decision: z.enum(['APPROVE', 'REJECT', 'REVIEW']) }),
  z.object({ action: z.literal('edit'), value: z.union([z.string().min(1).max(4000), z.array(z.string().min(1).max(600)).max(200)]) }),
]);

async function clearAiDecision(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, brandId: string, suggestionId: string, organizationId: string) {
  const { error } = await supabase
    .from('brand_suggestions')
    .update({ ai_decision: null, ai_confidence: null, ai_reason: null, ai_decided_at: null, updated_at: new Date().toISOString() })
    .eq('id', suggestionId)
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId);
  if (error) throw error;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ brandId: string; suggestionId: string }> }) {
  try {
    const { brandId, suggestionId } = paramsSchema.parse(await params);
    const body = actionSchema.parse(await request.json());
    const auth = await requireOrgRole(CAN_REVIEW_SUGGESTIONS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const { data: brand } = await supabase.from('brands').select('id').eq('id', brandId).eq('organization_id', auth.context.organizationId).maybeSingle();
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const base = { supabase, organizationId: auth.context.organizationId, brandId };

    switch (body.action) {
      case 'ai_decision': {
        const { data, error } = await supabase
          .from('brand_suggestions')
          .update({ ai_decision: body.decision, ai_decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', suggestionId)
          .eq('brand_id', brandId)
          .eq('organization_id', auth.context.organizationId)
          .eq('status', 'PENDING')
          .select('id,ai_decision,ai_confidence,ai_reason,ai_decided_at')
          .maybeSingle();
        if (error) throw error;
        if (!data) return NextResponse.json({ error: 'Suggestion is no longer pending.' }, { status: 409 });
        return NextResponse.json({ ok: true, suggestion: data });
      }
      case 'approve': {
        const updated = await approveSuggestion(supabase, { ...base, suggestionId, userId: auth.context.userId });
        await clearAiDecision(supabase, brandId, suggestionId, auth.context.organizationId);
        return NextResponse.json({ ok: true, suggestion: updated });
      }
      case 'edit': {
        const updated = await editSuggestion(supabase, { ...base, suggestionId, userId: auth.context.userId, editedValue: body.value });
        await clearAiDecision(supabase, brandId, suggestionId, auth.context.organizationId);
        return NextResponse.json({ ok: true, suggestion: updated });
      }
      case 'reject': {
        const updated = await rejectSuggestion(supabase, { ...base, suggestionId, userId: auth.context.userId });
        await clearAiDecision(supabase, brandId, suggestionId, auth.context.organizationId);
        return NextResponse.json({ ok: true, suggestion: updated });
      }
      case 'regenerate': {
        const draft = await (await isReplayOrganization(supabase, auth.context.organizationId)
          ? regenerateReplaySuggestion(supabase, { ...base, suggestionId })
          : regenerateSuggestion(supabase, { ...base, suggestionId }));
        await clearAiDecision(supabase, brandId, suggestionId, auth.context.organizationId);
        return NextResponse.json({ ok: true, suggestion: draft });
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'SUGGESTION_NOT_FOUND') return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    if (message === 'SUGGESTION_HAS_NO_APPROVABLE_VALUE') return NextResponse.json({ error: 'This suggestion has no value that can be approved. Edit it with a verified value first.' }, { status: 409 });
    if (message === 'SUGGESTION_CHANGED_CONCURRENTLY') return NextResponse.json({ error: 'This suggestion changed while you were reviewing it. Reload and try again.' }, { status: 409 });
    if (message === 'NO_RESEARCH_DATA' || message === 'UNKNOWN_FIELD' || message === 'NO_AI_PROVIDER') return NextResponse.json({ error: 'Could not regenerate this suggestion' }, { status: 400 });
    obs.error('Suggestion review action failed', { error: message });
    return NextResponse.json({ error: 'Could not update suggestion' }, { status: 500 });
  }
}
