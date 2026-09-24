-- 0031: workspace lifecycle hardening and explicit multi-workspace creation.
begin;

create or replace function private.guard_last_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  remaining integer;
begin
  if current_setting('uptrendify.allow_workspace_cascade', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'OWNER' then
      select count(*) into remaining
      from public.organization_members
      where organization_id = old.organization_id and role = 'OWNER' and id <> old.id;
      if remaining < 1 then raise exception 'LAST_OWNER_PROTECTED'; end if;
    end if;
    return old;
  end if;

  if old.organization_id <> new.organization_id then
    raise exception 'ORGANIZATION_CHANGE_NOT_ALLOWED';
  end if;
  if old.user_id <> new.user_id then
    raise exception 'MEMBER_IDENTITY_CHANGE_NOT_ALLOWED';
  end if;

  if old.role = 'OWNER' and new.role <> 'OWNER' then
    select count(*) into remaining
    from public.organization_members
    where organization_id = new.organization_id and role = 'OWNER' and id <> new.id;
    if remaining < 1 then raise exception 'LAST_OWNER_PROTECTED'; end if;
  end if;

  return new;
end;
$$;

create or replace function private.delete_current_workspace(target_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  current_user_id uuid := auth.uid();
  membership_role public.org_role;
  workspace_name text;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select om.role, o.name
    into membership_role, workspace_name
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  where om.organization_id = target_organization_id
    and om.user_id = current_user_id
  limit 1;

  if membership_role is null then
    raise exception 'WORKSPACE_NOT_FOUND_OR_FORBIDDEN';
  end if;

  if membership_role <> 'OWNER' then
    raise exception 'WORKSPACE_OWNER_REQUIRED';
  end if;

  perform set_config('uptrendify.allow_workspace_cascade', 'on', true);
  delete from public.organizations where id = target_organization_id;

  return jsonb_build_object('ok', true, 'organization_name', workspace_name);
end;
$$;

create or replace function private.create_workspace_for_current_user(
  workspace_name text,
  requested_type public.workspace_type default 'AGENCY',
  requested_timezone text default 'UTC'
)
returns table(
  id uuid,
  role public.org_role,
  name text,
  workspace_type public.workspace_type,
  timezone text
)
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  uid uuid := auth.uid();
  base_slug text;
  candidate_slug text;
  suffix text;
  created_org uuid;
begin
  if uid is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if length(trim(workspace_name)) < 2 or length(trim(workspace_name)) > 120 then
    raise exception 'INVALID_WORKSPACE_NAME';
  end if;

  base_slug := regexp_replace(lower(trim(workspace_name)), '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '(^-+|-+$)', '', 'g');
  if base_slug = '' then base_slug := 'workspace'; end if;
  base_slug := left(base_slug, 48);

  candidate_slug := base_slug;
  while exists (select 1 from public.organizations where slug = candidate_slug) loop
    suffix := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    candidate_slug := left(base_slug, 48) || '-' || suffix;
  end loop;

  insert into public.organizations(name, slug, workspace_type, timezone)
  values (trim(workspace_name), candidate_slug, requested_type, nullif(trim(requested_timezone), ''))
  returning organizations.id into created_org;

  insert into public.organization_members(organization_id, user_id, role)
  values (created_org, uid, 'OWNER');

  return query
  select o.id, 'OWNER'::public.org_role, o.name, o.workspace_type, o.timezone
  from public.organizations o
  where o.id = created_org;
end;
$$;

create or replace function public.create_workspace_for_current_user(
  workspace_name text,
  requested_type public.workspace_type default 'AGENCY',
  requested_timezone text default 'UTC'
)
returns table(
  id uuid,
  role public.org_role,
  name text,
  workspace_type public.workspace_type,
  timezone text
)
language sql
security definer
set search_path = public, private, auth
as $$
  select * from private.create_workspace_for_current_user(workspace_name, requested_type, requested_timezone);
$$;

revoke all on function private.create_workspace_for_current_user(text, public.workspace_type, text) from public, anon, authenticated;
revoke all on function public.create_workspace_for_current_user(text, public.workspace_type, text) from public, anon;
grant execute on function private.create_workspace_for_current_user(text, public.workspace_type, text) to authenticated, service_role;
grant execute on function public.create_workspace_for_current_user(text, public.workspace_type, text) to authenticated;

commit;
