-- 0017: Keep the exposed bootstrap RPC SECURITY INVOKER while delegating
-- privileged writes to a private SECURITY DEFINER implementation.

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

create or replace function public.bootstrap_organization(organization_name text)
returns table (
  id uuid,
  role public.org_role,
  name text
)
language sql
security invoker
set search_path = public
as $$
  select * from private.bootstrap_organization_impl(organization_name);
$$;

revoke all on function private.bootstrap_organization_impl(text) from public;
revoke all on function private.bootstrap_organization_impl(text) from anon;
revoke all on function private.bootstrap_organization_impl(text) from authenticated;
revoke all on function public.bootstrap_organization(text) from public;
revoke all on function public.bootstrap_organization(text) from anon;
grant execute on function public.bootstrap_organization(text) to authenticated;

drop policy if exists user_profiles_insert_self on public.user_profiles;
drop policy if exists user_profiles_update_self on public.user_profiles;

create policy user_profiles_insert_self on public.user_profiles
  for insert
  with check (
    user_id = (select auth.uid())
    and (
      (organization_id is null and role is null)
      or (
        organization_id is not null
        and private.is_org_member(organization_id)
        and role is not distinct from private.org_role(organization_id)
      )
    )
  );

create policy user_profiles_update_self on public.user_profiles
  for update
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      (organization_id is null and role is null)
      or (
        organization_id is not null
        and private.is_org_member(organization_id)
        and role is not distinct from private.org_role(organization_id)
      )
    )
  );
