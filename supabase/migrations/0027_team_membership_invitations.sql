-- 0027: Team membership & invitations.
-- Real agency team onboarding on top of the existing single-workspace bootstrap:
--   - organization_invitations is the pending-invite ledger (tokens are never
--     exposed through PostgREST column privileges; only managers may recover a
--     token for copy-link sharing).
--   - SECURITY DEFINER RPCs are the ONLY write path for members/invitations:
--     organization_members RLS permits SELECT for members only, so direct
--     mutation is impossible with the anon/publishable key.
--   - A last-owner safety trigger keeps the invariant even for admin/future
--     RPC mistakes: you can never remove or demote the final OWNER.
--   - bootstrap_organization_impl refuses to create a second workspace while a
--     valid pending invitation exists for the caller's email: an invited user
--     joins the team instead of creating a fresh workspace.

-- 1) Invitation ledger.
create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invited_email text not null,
  role public.org_role not null default 'EDITOR',
  invited_by uuid not null references auth.users(id) on delete set null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_invitations_email_format check (invited_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint organization_invitations_role_cannot_be_owner check (role <> 'OWNER'),
  constraint organization_invitations_acceptance_consistency check (
    (accepted_at is null and accepted_by is null) or (accepted_at is not null and accepted_by is not null)
  )
);

create unique index if not exists organization_invitations_pending_uidx
  on public.organization_invitations(organization_id, lower(invited_email))
  where accepted_at is null and revoked_at is null;
create index if not exists organization_invitations_org_idx
  on public.organization_invitations(organization_id, created_at desc);
create index if not exists organization_invitations_token_idx
  on public.organization_invitations(token);

drop trigger if exists organization_invitations_touch on public.organization_invitations;
create trigger organization_invitations_touch
before update on public.organization_invitations
for each row execute function private.touch_updated_at();

-- 2) Least-privilege exposure: nobody may read invitation rows through the
--    table grant the way they were created, and the raw token is never a
--    column privilege for any API role.
revoke select on public.organization_invitations from anon, authenticated;
grant select (
  id, organization_id, invited_email, role, invited_by,
  accepted_at, accepted_by, revoked_at, expires_at, created_at, updated_at
) on public.organization_invitations to authenticated;

-- 3) RLS: managers may see all rows for their org; the invited member may see
--    only their own pending row.
alter table public.organization_invitations enable row level security;

-- 3a) Invited-member email lookup helper. RLS policies run as the calling
--     role, which cannot read auth.users directly; SECURITY DEFINER surfaces
--     only the caller's own email for the self-view policy below.
create or replace function private.auth_user_email()
returns text
language sql
security definer
set search_path = public, private
as $$
  select email from auth.users where id = auth.uid()
$$;

revoke all on function private.auth_user_email() from public, anon;
grant execute on function private.auth_user_email() to authenticated;

drop policy if exists organization_invitations_select_managers on public.organization_invitations;
create policy organization_invitations_select_managers on public.organization_invitations
  for select
  using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN']::public.org_role[]));

drop policy if exists organization_invitations_select_invitee on public.organization_invitations;
create policy organization_invitations_select_invitee on public.organization_invitations
  for select
  using (lower(invited_email) = lower(private.auth_user_email()));

-- 4) Last-owner safety backstop. Fires as a SECURITY DEFINER guard so even
--    service-role or future RPC mistakes cannot destroy the final OWNER.
create or replace function private.prevent_last_owner_loss()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  affected_org uuid;
  owner_count bigint;
begin
  if tg_op = 'UPDATE' then
    if old.role = new.role and old.organization_id is not distinct from new.organization_id then
      return new;
    end if;

    if old.organization_id is distinct from new.organization_id then
      raise exception 'MEMBER_ORG_CHANGE_FORBIDDEN' using errcode = 'P0001';
    end if;

    affected_org := new.organization_id;

    if old.role = 'OWNER' and new.role <> 'OWNER' then
      select count(*) into owner_count
      from public.organization_members
      where organization_id = affected_org and role = 'OWNER';
      if owner_count <= 1 then
        raise exception 'LAST_OWNER_PROTECTED' using errcode = 'P0001';
      end if;
    end if;

    return new;
  end if;

  if old.role = 'OWNER' then
    select count(*) into owner_count
    from public.organization_members
    where organization_id = old.organization_id and role = 'OWNER';
    if owner_count <= 1 then
      raise exception 'LAST_OWNER_PROTECTED' using errcode = 'P0001';
    end if;
  end if;

  return old;
end;
$$;

revoke all on function private.prevent_last_owner_loss() from public, anon, authenticated;
grant execute on function private.prevent_last_owner_loss() to authenticated, service_role;

drop trigger if exists organization_members_last_owner_safety on public.organization_members;
create trigger organization_members_last_owner_safety
before update or delete on public.organization_members
for each row execute function private.prevent_last_owner_loss();

-- 5) Member list with emails. authenticated cannot read auth.users beyond its
--    own row, so this SECURITY DEFINER lookup is the sanctioned way a team
--    page can render member emails.
create or replace function public.list_organization_members_with_email(p_organization_id uuid)
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  role public.org_role,
  joined_at timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'NOT_A_MEMBER' using errcode = 'P0001';
  end if;

  return query
  select m.user_id,
         u.email::text,
         p.first_name,
         p.last_name,
         m.role,
         m.created_at
  from public.organization_members m
  left join auth.users u on u.id = m.user_id
  left join public.user_profiles p on p.user_id = m.user_id
  where m.organization_id = p_organization_id
  order by m.created_at asc, u.email asc nulls last;
end;
$$;

-- 6) Invite a member. OWNER/ADMIN only; OWNER is never an invitable role.
create or replace function public.invite_organization_member(p_organization_id uuid, p_email text, p_role public.org_role)
returns table (
  id uuid,
  invited_email text,
  role public.org_role,
  invited_by uuid,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor uuid := auth.uid();
  actor_role public.org_role;
  normalized_email text;
  invite_id uuid;
  invite_expires_at timestamptz;
  invite_created_at timestamptz;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;

  select m.role into actor_role
  from public.organization_members m
  where m.organization_id = p_organization_id and m.user_id = actor;

  if actor_role is null then
    raise exception 'NOT_A_MEMBER' using errcode = 'P0001';
  end if;
  if actor_role not in ('OWNER','ADMIN') then
    raise exception 'INSUFFICIENT_PERMISSIONS' using errcode = 'P0001';
  end if;

  normalized_email := lower(btrim(p_email));
  if normalized_email is null or length(normalized_email) = 0
     or not (normalized_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'INVALID_EMAIL' using errcode = 'P0001';
  end if;

  if p_role = 'OWNER' then
    raise exception 'CANNOT_INVITE_OWNER' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.organization_members m
    join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id
      and lower(u.email) = normalized_email
  ) then
    raise exception 'ALREADY_A_MEMBER' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.organization_invitations i
    where i.organization_id = p_organization_id
      and lower(i.invited_email) = normalized_email
      and i.accepted_at is null
      and i.revoked_at is null
  ) then
    raise exception 'PENDING_INVITE_EXISTS' using errcode = 'P0001';
  end if;

  insert into public.organization_invitations (organization_id, invited_email, role, invited_by)
  values (p_organization_id, normalized_email, p_role, actor)
  returning organization_invitations.id, organization_invitations.expires_at, organization_invitations.created_at
  into invite_id, invite_expires_at, invite_created_at;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_organization_id, actor, 'member.invited', 'organization_invitation', invite_id,
          jsonb_build_object('email', normalized_email, 'role', p_role));

  return query
  select invite_id, normalized_email, p_role, actor, invite_expires_at, invite_created_at;
end;
$$;

-- 7) Role change. OWNER/ADMIN actors; OWNER rows are OWNER-only territory and
--    nobody may change their own role. Promotion to OWNER requires an OWNER.
create or replace function public.update_organization_member_role(p_organization_id uuid, p_target_user_id uuid, p_new_role public.org_role)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor uuid := auth.uid();
  actor_role public.org_role;
  target_role public.org_role;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;

  select m.role into actor_role
  from public.organization_members m
  where m.organization_id = p_organization_id and m.user_id = actor;

  if actor_role is null then
    raise exception 'NOT_A_MEMBER' using errcode = 'P0001';
  end if;
  if actor_role not in ('OWNER','ADMIN') then
    raise exception 'INSUFFICIENT_PERMISSIONS' using errcode = 'P0001';
  end if;

  select m.role into target_role
  from public.organization_members m
  where m.organization_id = p_organization_id and m.user_id = p_target_user_id;

  if target_role is null then
    raise exception 'TARGET_NOT_A_MEMBER' using errcode = 'P0001';
  end if;

  if actor = p_target_user_id then
    raise exception 'CANNOT_CHANGE_OWN_ROLE' using errcode = 'P0001';
  end if;

  if target_role = 'OWNER' and actor_role <> 'OWNER' then
    raise exception 'CANNOT_MODIFY_OWNER' using errcode = 'P0001';
  end if;

  if p_new_role = 'OWNER' and actor_role <> 'OWNER' then
    raise exception 'CANNOT_ASSIGN_OWNER' using errcode = 'P0001';
  end if;

  if target_role <> p_new_role then
    update public.organization_members
    set role = p_new_role
    where organization_id = p_organization_id and user_id = p_target_user_id;

    update public.user_profiles
    set role = p_new_role, updated_at = now()
    where user_id = p_target_user_id and organization_id = p_organization_id;

    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (p_organization_id, actor, 'member.role_changed', 'organization_member', p_target_user_id,
            jsonb_build_object('role_before', target_role, 'role_after', p_new_role));
  end if;
end;
$$;

-- 8) Remove a member. Last-owner protection applies.
create or replace function public.remove_organization_member(p_organization_id uuid, p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor uuid := auth.uid();
  actor_role public.org_role;
  target_role public.org_role;
  owner_count bigint;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;

  select m.role into actor_role
  from public.organization_members m
  where m.organization_id = p_organization_id and m.user_id = actor;

  if actor_role is null then
    raise exception 'NOT_A_MEMBER' using errcode = 'P0001';
  end if;
  if actor_role not in ('OWNER','ADMIN') then
    raise exception 'INSUFFICIENT_PERMISSIONS' using errcode = 'P0001';
  end if;

  select m.role into target_role
  from public.organization_members m
  where m.organization_id = p_organization_id and m.user_id = p_target_user_id;

  if target_role is null then
    raise exception 'TARGET_NOT_A_MEMBER' using errcode = 'P0001';
  end if;

  if actor = p_target_user_id then
    raise exception 'CANNOT_REMOVE_SELF' using errcode = 'P0001';
  end if;

  if target_role = 'OWNER' and actor_role <> 'OWNER' then
    raise exception 'CANNOT_MODIFY_OWNER' using errcode = 'P0001';
  end if;

  if target_role = 'OWNER' then
    select count(*) into owner_count
    from public.organization_members
    where organization_id = p_organization_id and role = 'OWNER';
    if owner_count <= 1 then
      raise exception 'LAST_OWNER_PROTECTED' using errcode = 'P0001';
    end if;
  end if;

  delete from public.organization_members
  where organization_id = p_organization_id and user_id = p_target_user_id;

  update public.organization_invitations
  set revoked_at = now()
  where organization_id = p_organization_id
    and accepted_at is null
    and revoked_at is null
    and lower(invited_email) = (select lower(email) from auth.users where id = p_target_user_id);

  update public.user_profiles
  set organization_id = null, role = null, updated_at = now()
  where user_id = p_target_user_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_organization_id, actor, 'member.removed', 'organization_member', p_target_user_id,
          jsonb_build_object('role', target_role));
end;
$$;

-- 9) Revoke a pending invitation (managers only). Allows re-inviting an
--    expired address because the pending unique index releases the slot.
create or replace function public.revoke_organization_invitation(p_invitation_id uuid, p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor uuid := auth.uid();
  actor_role public.org_role;
  invite_acceptance timestamptz;
  invite_revocation timestamptz;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;

  select m.role into actor_role
  from public.organization_members m
  where m.organization_id = p_organization_id and m.user_id = actor;

  if actor_role is null then
    raise exception 'NOT_A_MEMBER' using errcode = 'P0001';
  end if;
  if actor_role not in ('OWNER','ADMIN') then
    raise exception 'INSUFFICIENT_PERMISSIONS' using errcode = 'P0001';
  end if;

  select accepted_at, revoked_at into invite_acceptance, invite_revocation
  from public.organization_invitations
  where id = p_invitation_id and organization_id = p_organization_id;

  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if invite_acceptance is not null then
    raise exception 'INVITATION_ALREADY_ACCEPTED' using errcode = 'P0001';
  end if;
  if invite_revocation is not null then
    return;
  end if;

  update public.organization_invitations
  set revoked_at = now()
  where id = p_invitation_id and organization_id = p_organization_id and accepted_at is null;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_organization_id, actor, 'invitation.revoked', 'organization_invitation', p_invitation_id, '{}'::jsonb);
end;
$$;

-- 10) Token recovery for copy-link sharing (managers only). The token never
--     leaves the database through table grants, so a privileged RPC is the
--     only channel that can surface it.
create or replace function public.get_invitation_token(p_invitation_id uuid, p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor uuid := auth.uid();
  actor_role public.org_role;
  invite_token text;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;

  select m.role into actor_role
  from public.organization_members m
  where m.organization_id = p_organization_id and m.user_id = actor;

  if actor_role is null then
    raise exception 'NOT_A_MEMBER' using errcode = 'P0001';
  end if;
  if actor_role not in ('OWNER','ADMIN') then
    raise exception 'INSUFFICIENT_PERMISSIONS' using errcode = 'P0001';
  end if;

  select token into invite_token
  from public.organization_invitations
  where id = p_invitation_id and organization_id = p_organization_id;

  if invite_token is null then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  return invite_token;
end;
$$;

-- 11) Anonymous preview for a token holder (used by /invite and /register
--     before the user is signed in). Only reveals the invitation's own data.
create or replace function public.preview_organization_invitation(p_token text)
returns table (
  invited_email text,
  role public.org_role,
  organization_name text,
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  return query
  select i.invited_email, i.role, o.name, i.accepted_at, i.revoked_at, i.expires_at
  from public.organization_invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token = p_token;
end;
$$;

-- 12) Accept flow. The UPDATE ... RETURNING predicate is the atomic claim
--     on the invitation: revoked, expired and mismatched tokens cannot be
--     consumed. Joining adds exactly one membership and never an OWNER.
create or replace function public.accept_organization_invitation(p_token text)
returns table (
  organization_id uuid,
  role public.org_role,
  organization_name text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  invite record;
  org_name text;
  reject_reason text;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;

  select email into actor_email from auth.users where id = actor;
  if actor_email is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;

  update public.organization_invitations i
  set accepted_at = now(), accepted_by = actor
  where i.token = p_token
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
    and lower(i.invited_email) = lower(actor_email)
  returning i.id, i.organization_id, i.role into invite;

  if invite is null or invite.id is null then
    select
      case
        when not exists (select 1 from public.organization_invitations where token = p_token) then 'INVITATION_NOT_FOUND'
        when exists (select 1 from public.organization_invitations where token = p_token and revoked_at is not null) then 'INVITATION_REVOKED'
        when exists (select 1 from public.organization_invitations where token = p_token and accepted_at is not null) then 'INVITATION_ALREADY_ACCEPTED'
        when exists (select 1 from public.organization_invitations where token = p_token and expires_at <= now()) then 'INVITATION_EXPIRED'
        else 'INVITATION_EMAIL_MISMATCH'
      end
    into reject_reason;
    raise exception using message = reject_reason, errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.organization_members om
    where om.organization_id = invite.organization_id and om.user_id = actor
  ) then
    raise exception 'ALREADY_A_MEMBER' using errcode = 'P0001';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (invite.organization_id, actor, invite.role);

  insert into public.user_profiles (user_id, organization_id, role, onboarding_completed)
  values (actor, invite.organization_id, invite.role, true)
  on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        role = excluded.role,
        onboarding_completed = true,
        updated_at = now();

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (invite.organization_id, actor, 'member.joined', 'organization_invitation', invite.id,
          jsonb_build_object('role', invite.role));

  select o.name into org_name from public.organizations o where o.id = invite.organization_id;

  return query select invite.organization_id, invite.role, org_name;
end;
$$;

-- 13) Invitation guard for bootstrap: an invited user joins the team instead
--     of silently creating a second workspace.
create or replace function private.bootstrap_organization_impl(organization_name text)
returns table (
  id uuid,
  role public.org_role,
  name text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  uid uuid := auth.uid();
  existing public.organization_members%ROWTYPE;
  base_slug text;
  candidate_slug text;
  suffix text;
  created_org uuid;
begin
  if uid is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if length(trim(organization_name)) < 2 or length(trim(organization_name)) > 120 then
    raise exception 'INVALID_ORGANIZATION_NAME';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('uptrendify-bootstrap:' || uid::text, 0));

  select * into existing
  from public.organization_members
  where user_id = uid
  order by created_at asc
  limit 1;

  if existing.organization_id is not null then
    return query
    select o.id, existing.role, o.name
    from public.organizations o
    where o.id = existing.organization_id;
    return;
  end if;

  if exists (
    select 1
    from public.organization_invitations i
    where i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > now()
      and lower(i.invited_email) = lower((select email from auth.users u where u.id = uid))
  ) then
    raise exception 'INVITATION_PENDING_ACCEPTANCE' using
      errcode = 'P0001',
      hint = 'Accept your pending team invitation before creating a new workspace.';
  end if;

  base_slug := regexp_replace(lower(trim(organization_name)), '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '(^-+|-+$)', '', 'g');
  if base_slug = '' then base_slug := 'organization'; end if;
  base_slug := left(base_slug, 48);

  candidate_slug := base_slug;
  if exists (select 1 from public.organizations where slug = candidate_slug) then
    suffix := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    candidate_slug := left(base_slug, 48) || '-' || suffix;
  end if;

  insert into public.organizations(name, slug)
  values (trim(organization_name), candidate_slug)
  returning organizations.id into created_org;

  insert into public.organization_members(organization_id, user_id, role)
  values (created_org, uid, 'OWNER');

  return query
  select o.id, 'OWNER'::public.org_role, o.name
  from public.organizations o
  where o.id = created_org;
end;
$$;

-- 14) Execute grants. Individual RPC grants keep anon strictly limited to the
--     token preview; everything else is authenticated-only.
revoke all on function public.list_organization_members_with_email(uuid) from public, anon;
revoke all on function public.invite_organization_member(uuid, text, public.org_role) from public, anon;
revoke all on function public.update_organization_member_role(uuid, uuid, public.org_role) from public, anon;
revoke all on function public.remove_organization_member(uuid, uuid) from public, anon;
revoke all on function public.revoke_organization_invitation(uuid, uuid) from public, anon;
revoke all on function public.get_invitation_token(uuid, uuid) from public, anon;
revoke all on function public.accept_organization_invitation(text) from public, anon;
revoke all on function public.preview_organization_invitation(text) from public;

grant execute on function public.list_organization_members_with_email(uuid) to authenticated;
grant execute on function public.invite_organization_member(uuid, text, public.org_role) to authenticated;
grant execute on function public.update_organization_member_role(uuid, uuid, public.org_role) to authenticated;
grant execute on function public.remove_organization_member(uuid, uuid) to authenticated;
grant execute on function public.revoke_organization_invitation(uuid, uuid) to authenticated;
grant execute on function public.get_invitation_token(uuid, uuid) to authenticated;
grant execute on function public.accept_organization_invitation(text) to authenticated;
grant execute on function public.preview_organization_invitation(text) to anon, authenticated;