import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

function loadEnvLocal() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
      if (match?.length === 3) process.env[match[1]] ??= match[2].replace(/\s*$/, '');
    }
  } catch {
    // .env.local is optional; rely on existing process env.
  }
}

loadEnvLocal();

const RUN_DB_TESTS = process.env.RUN_DB_TESTS === '1';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const PASSWORD = 'UpTrendify-Test-123!';
const PENDING = 'INVITATION_PENDING_ACCEPTANCE';

describe.skipIf(!RUN_DB_TESTS || !URL || !ANON)('team membership RPC integration (local Supabase)', () => {
  const createdUserIds: string[] = [];

  async function createMember(prefix: string): Promise<{ id: string; email: string; client: SupabaseClient }> {
    const email = `${prefix}+${Date.now()}@agency.test`;
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser failed: ${error?.message ?? 'no user'}`);
    createdUserIds.push(data.user.id);

    const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (signInError) throw new Error(`signIn failed: ${signInError.message}`);

    return { id: data.user.id, email, client };
  }

  let owner: Awaited<ReturnType<typeof createMember>>;
  let member: Awaited<ReturnType<typeof createMember>>;
  let admin1: Awaited<ReturnType<typeof createMember>>;
  let pendingMember: Awaited<ReturnType<typeof createMember>>;
  let orgId: string;

  beforeAll(async () => {
    owner = await createMember('rpc-owner');
    const boot = await owner.client.rpc('bootstrap_organization', { organization_name: 'RPC Integration Agency' });
    expect(boot.error).toBeNull();
    expect(Array.isArray(boot.data)).toBe(true);
    expect(boot.data).toHaveLength(1);
    expect(boot.data[0]).toMatchObject({ role: 'OWNER' });
    orgId = boot.data[0].id;
  });

  afterAll(async () => {
    const admin = createSupabaseAdminClient();
    await Promise.all(
      createdUserIds.map((id) => admin.auth.admin.deleteUser(id).then(({ error }) => error && console.error('cleanup failed', error))),
    );
  });

  it('invites, defends pending-invitation bootstrap, accepts, and lists members', async () => {
    member = await createMember('rpc-member');

    const invite = await owner.client.rpc('invite_organization_member', { p_organization_id: orgId, p_email: member.email, p_role: 'EDITOR' });
    expect(invite.error).toBeNull();
    expect(invite.data).toHaveLength(1);
    const invitationId = invite.data[0].id;

    const duplicate = await owner.client.rpc('invite_organization_member', { p_organization_id: orgId, p_email: member.email, p_role: 'EDITOR' });
    expect(String(duplicate.error?.message)).toContain('PENDING_INVITE_EXISTS');

    const pendingBootstrap = await member.client.rpc('bootstrap_organization', { organization_name: 'RPC Spare Agency' });
    expect(pendingBootstrap.error).not.toBeNull();
    expect(String(pendingBootstrap.error?.message)).toContain(PENDING);

    const tokenResult = await owner.client.rpc('get_invitation_token', { p_organization_id: orgId, p_invitation_id: invitationId });
    expect(tokenResult.error).toBeNull();
    expect(tokenResult.data).toMatch(/^[a-f0-9]{48}$/);
    const token = tokenResult.data;

    const preview = await createClient(URL!, ANON!).rpc('preview_organization_invitation', { p_token: token });
    expect(preview.error).toBeNull();
    expect(preview.data).toMatchObject([{ invited_email: member.email, role: 'EDITOR', organization_name: 'RPC Integration Agency' }]);

    await member.client.rpc('accept_organization_invitation', { p_token: token }).then((r) => {
      expect(r.error).toBeNull();
      expect(r.data).toMatchObject([{ organization_id: orgId, role: 'EDITOR', organization_name: 'RPC Integration Agency' }]);
    });

    const members = await owner.client.rpc('list_organization_members_with_email', { p_organization_id: orgId });
    expect(members.error).toBeNull();
    expect(members.data).toHaveLength(2);
    const row = members.data.find((m: { user_id: string }) => m.user_id === member.id);
    expect(row).toMatchObject({ email: member.email, role: 'EDITOR' });

    const acceptAgain = await member.client.rpc('accept_organization_invitation', { p_token: token });
    expect(String(acceptAgain.error?.message)).toContain('INVITATION_ALREADY_ACCEPTED');
  });

  it('hides invitation tokens from the table layer', async () => {
    const { error } = await owner.client.from('organization_invitations').select('token');
    expect(error).not.toBeNull();
  });

  it('applies role-change rules and owner safety', async () => {
    expect((await owner.client.rpc('update_organization_member_role', { p_organization_id: orgId, p_target_user_id: member.id, p_new_role: 'APPROVER' })).error).toBeNull();

    const roles = await owner.client.rpc('list_organization_members_with_email', { p_organization_id: orgId });
    expect(roles.data.find((m: { user_id: string }) => m.user_id === member.id).role).toBe('APPROVER');

    const selfChange = await owner.client.rpc('update_organization_member_role', { p_organization_id: orgId, p_target_user_id: owner.id, p_new_role: 'EDITOR' });
    expect(String(selfChange.error?.message)).toContain('CANNOT_CHANGE_OWN_ROLE');

    const selfRemove = await owner.client.rpc('remove_organization_member', { p_organization_id: orgId, p_target_user_id: owner.id });
    expect(String(selfRemove.error?.message)).toContain('CANNOT_REMOVE_SELF');

    const backstop = createSupabaseAdminClient();
    const removeLast = await backstop.from('organization_members').delete().eq('organization_id', orgId).eq('user_id', owner.id);
    expect(String(removeLast.error?.message)).toContain('LAST_OWNER_PROTECTED');

    const demoteLast = await backstop.from('organization_members').update({ role: 'CLIENT' }).eq('organization_id', orgId).eq('user_id', owner.id);
    expect(String(demoteLast.error?.message)).toContain('LAST_OWNER_PROTECTED');
  });

  it('checks manager permissions and role legality for admins', async () => {
    admin1 = await createMember('rpc-admin');
    const adminInvite = await owner.client.rpc('invite_organization_member', { p_organization_id: orgId, p_email: admin1.email, p_role: 'ADMIN' });
    expect(adminInvite.error).toBeNull();
    const adminToken = (await owner.client.rpc('get_invitation_token', { p_organization_id: orgId, p_invitation_id: adminInvite.data[0].id })).data;
    const adminAccept = await admin1.client.rpc('accept_organization_invitation', { p_token: adminToken });
    expect(adminAccept.error).toBeNull();
    expect(adminAccept.data?.[0]).toMatchObject({ organization_id: orgId, role: 'ADMIN' });

    const nonManagerInvite = await member.client.rpc('invite_organization_member', { p_organization_id: orgId, p_email: 'nobody@agency.test', p_role: 'EDITOR' });
    expect(String(nonManagerInvite.error?.message)).toContain('INSUFFICIENT_PERMISSIONS');

    const cannotInviteOwner = await owner.client.rpc('invite_organization_member', { p_organization_id: orgId, p_email: admin1.email, p_role: 'OWNER' });
    expect(String(cannotInviteOwner.error?.message)).toContain('CANNOT_INVITE_OWNER');

    const adminAssignOwner = await admin1.client.rpc('update_organization_member_role', { p_organization_id: orgId, p_target_user_id: owner.id, p_new_role: 'OWNER' });
    expect(String(adminAssignOwner.error?.message)).toContain('CANNOT_MODIFY_OWNER');

    const adminAssignsOwner = await admin1.client.rpc('update_organization_member_role', { p_organization_id: orgId, p_target_user_id: member.id, p_new_role: 'OWNER' });
    expect(String(adminAssignsOwner.error?.message)).toContain('CANNOT_ASSIGN_OWNER');

    const adminAssignsRole = await admin1.client.rpc('update_organization_member_role', { p_organization_id: orgId, p_target_user_id: member.id, p_new_role: 'STRATEGIST' });
    expect(adminAssignsRole.error).toBeNull();
  });

  it('revokes pending invitations and removes members', async () => {
    pendingMember = await createMember('rpc-pending');
    const invite = await owner.client.rpc('invite_organization_member', { p_organization_id: orgId, p_email: pendingMember.email, p_role: 'EDITOR' });
    expect(invite.error).toBeNull();
    expect(invite.data).toHaveLength(1);
    const token = (await owner.client.rpc('get_invitation_token', { p_organization_id: orgId, p_invitation_id: invite.data[0].id })).data;

    const revoke = await owner.client.rpc('revoke_organization_invitation', { p_organization_id: orgId, p_invitation_id: invite.data[0].id });
    expect(revoke.error).toBeNull();

    const revokedAccept = await pendingMember.client.rpc('accept_organization_invitation', { p_token: token });
    expect(String(revokedAccept.error?.message)).toContain('INVITATION_REVOKED');

    const remove = await owner.client.rpc('remove_organization_member', { p_organization_id: orgId, p_target_user_id: admin1.id });
    expect(remove.error).toBeNull();

    const members = await owner.client.rpc('list_organization_members_with_email', { p_organization_id: orgId });
    expect(members.data).toHaveLength(2);
    expect(members.data.some((m: { email: string }) => m.email === admin1.email)).toBe(false);
  });
});