import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_REVIEW_SUGGESTIONS, CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { approveSuggestion, rejectSuggestion } from '@/lib/brain/review';
import { obs } from '@/lib/obs/logger';

const paramsSchema = z.object({ brandId: z.string().uuid() });
const batchSchema = z.union([
  z.object({ action: z.enum(['approve_all', 'dismiss_all', 'unapprove_all']), fields: z.array(z.string()).optional() }),
  z.object({ action: z.literal('ai_confirm'), approveIds: z.array(z.string().uuid()).default([]), rejectIds: z.array(z.string().uuid()).default([]) }),
]);

export async function GET(_request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = paramsSchema.parse(await params);
    const auth = await requireOrgRole(CAN_VIEW_BRAND);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const supabase = await createSupabaseServerClient();
    const { data: brand } = await supabase.from('brands').select('id').eq('id', brandId).eq('organization_id', auth.context.organizationId).maybeSingle();
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    const { data, error } = await supabase.from('brand_suggestions').select('id,field,label,kind,proposed_value,status,evidence,evidence_strength,sources_examined,confidence,history,created_at,updated_at,reviewed_at').eq('brand_id', brandId).eq('organization_id', auth.context.organizationId).order('field', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ ok: true, suggestions: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
    obs.error('Suggestions load failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load suggestions' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = paramsSchema.parse(await params);
    const parsed = batchSchema.parse(await request.json());
    const auth = await requireOrgRole(CAN_REVIEW_SUGGESTIONS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const supabase = await createSupabaseServerClient();
    const { data: brand } = await supabase.from('brands').select('id').eq('id', brandId).eq('organization_id', auth.context.organizationId).maybeSingle();
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    if (parsed.action === 'ai_confirm') {
      const approveIds = [...new Set(parsed.approveIds)];
      const rejectIds = [...new Set(parsed.rejectIds)];
      const ids = [...new Set([...approveIds, ...rejectIds])];
      if (ids.length === 0) return NextResponse.json({ ok: true, approved: 0, rejected: 0, total: 0 });
      const { data: pending, error: pendingError } = await supabase.from('brand_suggestions').select('id').eq('brand_id', brandId).eq('organization_id', auth.context.organizationId).eq('status', 'PENDING').in('id', ids);
      if (pendingError) throw pendingError;
      const pendingIds = new Set((pending ?? []).map((row) => row.id));
      let approved = 0;
      let rejected = 0;
      for (const suggestionId of approveIds) {
        if (!pendingIds.has(suggestionId)) continue;
        try {
          await approveSuggestion(supabase, { organizationId: auth.context.organizationId, brandId, suggestionId, userId: auth.context.userId });
          approved += 1;
        } catch (actionError) {
          obs.warn('AI batch approval failed', { suggestionId, error: actionError instanceof Error ? actionError.message : String(actionError) });
        }
      }
      for (const suggestionId of rejectIds) {
        if (!pendingIds.has(suggestionId)) continue;
        try {
          await rejectSuggestion(supabase, { organizationId: auth.context.organizationId, brandId, suggestionId, userId: auth.context.userId });
          rejected += 1;
        } catch (actionError) {
          obs.warn('AI batch rejection failed', { suggestionId, error: actionError instanceof Error ? actionError.message : String(actionError) });
        }
      }
      return NextResponse.json({ ok: true, approved, rejected, total: approved + rejected });
    }

    const targetStatuses = parsed.action === 'unapprove_all' ? ['APPROVED', 'EDITED'] : ['PENDING'];
    let query = supabase.from('brand_suggestions').select('id,status').eq('brand_id', brandId).eq('organization_id', auth.context.organizationId).in('status', targetStatuses);
    if (parsed.fields && parsed.fields.length > 0) query = query.in('field', parsed.fields);
    const { data: rows, error: listError } = await query;
    if (listError) throw listError;

    let changed = 0;
    for (const row of rows ?? []) {
      try {
        if (parsed.action === 'approve_all') {
          await approveSuggestion(supabase, { organizationId: auth.context.organizationId, brandId, suggestionId: row.id, userId: auth.context.userId });
        } else if (parsed.action === 'dismiss_all') {
          await rejectSuggestion(supabase, { organizationId: auth.context.organizationId, brandId, suggestionId: row.id, userId: auth.context.userId });
        } else {
          const { data: updated, error: updateError } = await supabase.from('brand_suggestions').update({ status: 'PENDING', reviewed_at: null, reviewed_by: null, updated_at: new Date().toISOString() }).eq('id', row.id).eq('brand_id', brandId).eq('organization_id', auth.context.organizationId).eq('status', row.status).select('id').maybeSingle();
          if (updateError) throw updateError;
          if (!updated) continue;
        }
        changed += 1;
      } catch (actionError) {
        obs.warn('Batch suggestion action failed', { suggestionId: row.id, action: parsed.action, error: actionError instanceof Error ? actionError.message : String(actionError) });
      }
    }
    return NextResponse.json({ ok: true, processed: changed, total: rows?.length ?? 0 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    obs.error('Batch suggestion action failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not process suggestions' }, { status: 500 });
  }
}
