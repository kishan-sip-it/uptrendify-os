-- 0009: Auth/workspace hardening.
-- Workspace bootstrap must not depend on a service-role key in the application runtime.
-- Use a narrow SECURITY DEFINER RPC, callable only by authenticated users.

create or replace function public.bootstrap_organization(organization_name text)
returns table (
  id uuid,
  role public.org_role,
  name text
)
language plpgsql
security definer
set search_path = public
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

  -- Serialize bootstrap requests for the same user so double-clicks or
  -- concurrent browser requests cannot create multiple workspaces.
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
  if base_slug = '' then
    base_slug := 'organization';
  end if;
  base_slug := left(base_slug, 48);

  candidate_slug := base_slug;
  if exists (select 1 from public.organizations where slug = candidate_slug) then
    suffix := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    candidate_slug := left(base_slug, 51) || '-' || suffix;
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

revoke all on function public.bootstrap_organization(text) from public;
revoke all on function public.bootstrap_organization(text) from anon;
grant execute on function public.bootstrap_organization(text) to authenticated;
