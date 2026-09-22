-- 0027_product_modernization.sql
begin;

do $$ begin
  create type public.workspace_type as enum ('AGENCY','BUSINESS');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.theme_preference as enum ('light','dark','system');
exception when duplicate_object then null;
end $$;

alter table public.organizations
  add column if not exists workspace_type public.workspace_type not null default 'AGENCY',
  add column if not exists timezone text;

update public.organizations o
set timezone = coalesce(
  (select up.timezone from public.user_profiles up where up.organization_id = o.id and up.timezone is not null order by up.created_at limit 1),
  'UTC'
)
where o.timezone is null;

alter table public.brands
  add column if not exists description text,
  add column if not exists primary_color text,
  add column if not exists secondary_colors text[] not null default '{}',
  add column if not exists brand_rules jsonb not null default '{}'::jsonb,
  add column if not exists audience_details jsonb not null default '{}'::jsonb,
  add column if not exists offer_details jsonb not null default '{}'::jsonb,
  add column if not exists positioning jsonb not null default '{}'::jsonb,
  add column if not exists messaging jsonb not null default '{}'::jsonb,
  add column if not exists visual_identity jsonb not null default '{}'::jsonb;

alter table public.user_profiles
  add column if not exists theme_preference public.theme_preference not null default 'light';

create table if not exists public.onboarding_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  current_step integer not null default 0 check (current_step between 0 and 5),
  completed_steps integer[] not null default '{}',
  draft_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists onboarding_progress_org_idx on public.onboarding_progress(organization_id);
alter table public.onboarding_progress enable row level security;

drop policy if exists onboarding_progress_select_self on public.onboarding_progress;
create policy onboarding_progress_select_self on public.onboarding_progress for select to public using (user_id = auth.uid());
drop policy if exists onboarding_progress_insert_self on public.onboarding_progress;
create policy onboarding_progress_insert_self on public.onboarding_progress for insert to public with check (user_id = auth.uid() and private.is_org_member(organization_id));
drop policy if exists onboarding_progress_update_self on public.onboarding_progress;
create policy onboarding_progress_update_self on public.onboarding_progress for update to public using (user_id = auth.uid()) with check (user_id = auth.uid() and private.is_org_member(organization_id));

create table if not exists public.user_tour_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  stage_key text not null,
  tour_version integer not null default 1,
  status text not null check (status in ('COMPLETED','SKIPPED')),
  updated_at timestamptz not null default now(),
  primary key (user_id, stage_key)
);
alter table public.user_tour_state enable row level security;
drop policy if exists user_tour_state_self_select on public.user_tour_state;
create policy user_tour_state_self_select on public.user_tour_state for select to public using (user_id = auth.uid());
drop policy if exists user_tour_state_self_insert on public.user_tour_state;
create policy user_tour_state_self_insert on public.user_tour_state for insert to public with check (user_id = auth.uid());
drop policy if exists user_tour_state_self_update on public.user_tour_state;
create policy user_tour_state_self_update on public.user_tour_state for update to public using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin on public.organizations for update to public
using (private.has_org_role(id, ARRAY['OWNER','ADMIN']::public.org_role[]))
with check (private.has_org_role(id, ARRAY['OWNER','ADMIN']::public.org_role[]));

drop policy if exists organization_members_manage_admin on public.organization_members;
create policy organization_members_manage_admin on public.organization_members for update to public
using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN']::public.org_role[]))
with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN']::public.org_role[]));

drop policy if exists organization_members_delete_admin on public.organization_members;
create policy organization_members_delete_admin on public.organization_members for delete to public
using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN']::public.org_role[]));

create or replace function private.guard_last_owner_member()
returns trigger language plpgsql
set search_path = public, private
as $$
declare remaining integer;
begin
  if tg_op = 'DELETE' then
    if old.role = 'OWNER' then
      select count(*) into remaining from public.organization_members
      where organization_id = old.organization_id and role = 'OWNER' and id <> old.id;
      if remaining < 1 then raise exception 'LAST_OWNER_PROTECTED'; end if;
    end if;
    return old;
  end if;
  if old.organization_id <> new.organization_id then raise exception 'ORGANIZATION_CHANGE_NOT_ALLOWED'; end if;
  if old.user_id <> new.user_id then raise exception 'MEMBER_IDENTITY_CHANGE_NOT_ALLOWED'; end if;
  if old.role = 'OWNER' and new.role <> 'OWNER' then
    select count(*) into remaining from public.organization_members
    where organization_id = new.organization_id and role = 'OWNER' and id <> new.id;
    if remaining < 1 then raise exception 'LAST_OWNER_PROTECTED'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists organization_members_last_owner_guard on public.organization_members;
create trigger organization_members_last_owner_guard
before update of organization_id,user_id,role or delete on public.organization_members
for each row execute function private.guard_last_owner_member();

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.org_role not null,
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint team_invitations_valid_window check (expires_at > created_at)
);
create index if not exists team_invitations_org_idx on public.team_invitations(organization_id, created_at desc);
create index if not exists team_invitations_email_idx on public.team_invitations(lower(email), created_at desc);
alter table public.team_invitations enable row level security;

drop policy if exists team_invitations_manage_admin on public.team_invitations;
create policy team_invitations_manage_admin on public.team_invitations for all to public
using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN']::public.org_role[]))
with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN']::public.org_role[]) and invited_by = auth.uid());

drop policy if exists team_invitations_select_invitee on public.team_invitations;
create policy team_invitations_select_invitee on public.team_invitations for select to public
using (lower(email) = lower(coalesce((select auth.jwt()->>'email'), '')) and accepted_at is null and revoked_at is null);

create unique index if not exists team_invitation_active_email_org_idx
on public.team_invitations(organization_id, lower(email))
where accepted_at is null and revoked_at is null;

create or replace function private.accept_team_invitation(p_token_hash text)
returns jsonb language plpgsql security definer
set search_path = public, private
as $$
declare
  actor uuid := auth.uid();
  actor_email text := lower(coalesce(auth.jwt()->>'email',''));
  invitation public.team_invitations;
  member public.organization_members;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into invitation from public.team_invitations
  where token_hash = p_token_hash and accepted_at is null and revoked_at is null
  for update;
  if not found then raise exception 'INVITATION_INVALID'; end if;
  if invitation.expires_at <= now() then raise exception 'INVITATION_EXPIRED'; end if;
  if actor_email = '' or lower(invitation.email) <> actor_email then raise exception 'INVITATION_EMAIL_MISMATCH'; end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (invitation.organization_id, actor, invitation.role)
  on conflict (organization_id, user_id) do update set role = excluded.role
  returning * into member;

  update public.team_invitations set accepted_at = now() where id = invitation.id;

  insert into public.user_profiles (user_id, organization_id, role, onboarding_completed, updated_at)
  values (actor, invitation.organization_id, member.role, true, now())
  on conflict (user_id) do update set organization_id = excluded.organization_id, role = excluded.role, updated_at = now();

  return jsonb_build_object('organization_id', member.organization_id, 'role', member.role, 'invitation_id', invitation.id);
end;
$$;

revoke all on function private.guard_last_owner_member() from public, anon, authenticated;
revoke all on function private.accept_team_invitation(text) from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
grant execute on function private.guard_last_owner_member() to authenticated, service_role;
grant execute on function private.accept_team_invitation(text) to authenticated, service_role;

commit;
