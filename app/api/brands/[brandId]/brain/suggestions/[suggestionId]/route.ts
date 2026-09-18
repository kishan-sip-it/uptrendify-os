import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_REVIEW_SUGGESTIONS, requireOrgRole } from '@/lib/auth/roles';
import { approveSuggestion, editSuggestion, rejectSuggestion, regenerateSuggestion } from '@/lib/brain/review';
import { isReplayOrganization, regenerateReplaySuggestion } from '@/lib/replay';
import { obs } from '@/lib/obs/logger';

const paramsSchema = z.object({ brandId: z.string().uuid(), suggestionId: z.string().uuid() });
const actionSchema = z
  .discriminatedUnion('action', [
    z.object({ action: z.literal('approve') }),
    z.object({ action: z.literal('reject') }),
    z.object({ action: z.literal('regenerate') }),
    z.object({
      action: z.literal('edit'),
      value: z.union([z.string().min(1).max(4000), z.array(z.string().min(1).max(600)).max(200)]),
    }),
  ]);

export async function PATCH(request: Request, { params }: { params: Promise<{ brandId: string; suggestionId: string }> }) {
  try {
    const { brandId, suggestionId } = paramsSchema.parse(await params);
    const body = actionSchema.parse(await request.json());

    const auth = await requireOrgRole(CAN_REVIEW_SUGGESTIONS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const { data: brand } = await supabase
      .from('brands')
      .select('id')
      .eq('id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .maybeSingle();
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const base = {
      supabase,
      organizationId: auth.context.organizationId,
      brandId,
    };

    switch (body.action) {
      case 'approve': {
        const updated = await approveSuggestion(supabase, { ...base, suggestionId, userId: auth.context.userId });
        return NextResponse.json({ ok: true, suggestion: updated });
      }
      case 'edit': {
        const value = Array.isArray(body.value) ? body.value : body.value;
        const updated = await editSuggestion(supabase, { ...base, suggestionId, userId: auth.context.userId, editedValue: value });
        return NextResponse.json({ ok: true, suggestion: updated });
      }
      case 'reject': {
        const updated = await rejectSuggestion(supabase, { ...base, suggestionId, userId: auth.context.userId });
        return NextResponse.json({ ok: true, suggestion: updated });
      }
      case 'regenerate': {
        if (await isReplayOrganization(supabase, auth.context.organizationId)) {
          const draft = await regenerateReplaySuggestion(supabase, { ...base, suggestionId });
          return NextResponse.json({ ok: true, suggestion: draft });
        }
        const draft = await regenerateSuggestion(supabase, { ...base, suggestionId });
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
    if (message === 'NO_RESEARCH_DATA' || message === 'UNKNOWN_FIELD' || message === 'NO_AI_PROVIDER') {
      return NextResponse.json({ error: 'Could not regenerate this suggestion' }, { status: 400 });
    }
    obs.error('Suggestion review action failed', { error: message });
    return NextResponse.json({ error: 'Could not update suggestion' }, { status: 500 });
  }
}