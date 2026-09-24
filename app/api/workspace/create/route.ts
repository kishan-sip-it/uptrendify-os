import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireOrgRole } from '@/lib/auth/roles';
import { ORG_SWITCH_COOKIE } from '@/lib/auth/roles';

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  workspaceType: z.enum(['AGENCY', 'BUSINESS']).default('AGENCY'),
  timezone: z.string().trim().max(80).default('UTC'),
}).strict();

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const auth = await requireOrgRole(['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR', 'APPROVER', 'CLIENT']);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('create_workspace_for_current_user', {
      workspace_name: body.name,
      requested_type: body.workspaceType,
      requested_timezone: body.timezone,
    });

    if (error) throw error;

    const workspace = Array.isArray(data) ? data[0] : data;
    if (!workspace?.id) {
      return NextResponse.json({ error: 'Workspace could not be created.' }, { status: 500 });
    }

    const response = NextResponse.json({ ok: true, workspace }, { status: 201 });
    response.cookies.set(ORG_SWITCH_COOKIE, workspace.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 90,
    });
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Enter a valid workspace name, type and timezone.' }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/AUTHENTICATION_REQUIRED/i.test(message)) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    if (/INVALID_WORKSPACE_NAME/i.test(message)) return NextResponse.json({ error: 'Workspace name must be between 2 and 120 characters.' }, { status: 400 });
    return NextResponse.json({ error: 'Could not create the workspace.' }, { status: 500 });
  }
}
