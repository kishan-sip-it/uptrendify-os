import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireOrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';
import { normalizeTimezone } from '@/lib/timezone';

const schema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  workspaceType: z.enum(['AGENCY','BUSINESS']).optional(),
  timezone: z.string().trim().max(80).optional(),
});

export async function GET() {
  const auth = await requireOrgRole(['OWNER','ADMIN','STRATEGIST','EDITOR','APPROVER','CLIENT']);
  if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('id,name,workspace_type,timezone')
    .eq('id', auth.context.organizationId)
    .single();

  if (error) {
    obs.error('Workspace lookup failed', {
      organizationId: auth.context.organizationId,
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json(
      {
        error: error.code === 'PGRST116'
          ? 'Workspace could not be resolved for this account.'
          : 'Could not load workspace',
        code: error.code === 'PGRST116' ? 'WORKSPACE_NOT_FOUND' : 'WORKSPACE_LOOKUP_FAILED',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, workspace: { ...data, timezone: normalizeTimezone(data.timezone) } });
}

export async function PATCH(request: Request) {
  try {
    const body=schema.parse(await request.json());
    const auth=await requireOrgRole(['OWNER','ADMIN']);
    if(auth.error) return NextResponse.json(auth.error.body,{status:auth.error.status});
    const supabase=await createSupabaseServerClient();
    const patch: Record<string,unknown>={};
    if(body.name!==undefined) patch.name=body.name;
    if(body.workspaceType!==undefined) patch.workspace_type=body.workspaceType;
    if(body.timezone!==undefined) patch.timezone=body.timezone;
    patch.updated_at=new Date().toISOString();
    const {data,error}=await supabase.from('organizations').update(patch).eq('id',auth.context.organizationId).select('id,name,workspace_type,timezone').single();
    if(error) throw error;
    return NextResponse.json({ok:true,workspace:data});
  }catch(error){
    if(error instanceof z.ZodError) return NextResponse.json({error:'Invalid workspace settings'}, {status:400});
    const supabaseError = error && typeof error === 'object'
      ? error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
      : null;
    obs.error('Workspace update failed',{
      error: typeof supabaseError?.message === 'string'
        ? supabaseError.message
        : error instanceof Error ? error.message : String(error),
      code: typeof supabaseError?.code === 'string' ? supabaseError.code : undefined,
      details: typeof supabaseError?.details === 'string' ? supabaseError.details : undefined,
      hint: typeof supabaseError?.hint === 'string' ? supabaseError.hint : undefined,
    });
    return NextResponse.json({error:'Could not update workspace'},{status:500});
  }
}
