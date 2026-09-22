import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireOrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';

const schema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  workspaceType: z.enum(['AGENCY','BUSINESS']).optional(),
  timezone: z.string().trim().max(80).optional(),
});

export async function GET() {
  const auth = await requireOrgRole(['OWNER','ADMIN','STRATEGIST','EDITOR','APPROVER','CLIENT']);
  if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('organizations').select('id,name,workspace_type,timezone').eq('id',auth.context.organizationId).single();
  if (error) return NextResponse.json({ error:'Could not load workspace' },{status:500});
  return NextResponse.json({ok:true,workspace:data});
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
    obs.error('Workspace update failed',{error:error instanceof Error?error.message:String(error)});
    return NextResponse.json({error:'Could not update workspace'},{status:500});
  }
}
