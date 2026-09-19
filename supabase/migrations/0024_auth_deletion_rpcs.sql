-- 0024: move workspace/account deletion into authenticated SECURITY DEFINER RPCs.
-- This removes the production dependency on a browser-visible/admin HTTP key.
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

  delete from public.organizations where id = target_organization_id;

  return jsonb_build_object('ok', true, 'organization_name', workspace_name);
end;
$$;

create or replace function public.delete_current_workspace(target_organization_id uuid)
returns jsonb
language sql
security definer
set search_path = public, private, auth
as $$
  select private.delete_current_workspace(target_organization_id);
$$;

revoke all on function public.delete_current_workspace(uuid) from public;
revoke all on function public.delete_current_workspace(uuid) from anon;
grant execute on function public.delete_current_workspace(uuid) to authenticated;

create or replace function private.delete_current_account()
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  current_user_id uuid := auth.uid();
  remaining_memberships integer;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select count(*) into remaining_memberships
  from public.organization_members
  where user_id = current_user_id;

  if remaining_memberships > 0 then
    raise exception 'WORKSPACES_MUST_BE_DELETED_FIRST';
  end if;

  update public.audit_logs set actor_user_id = null where actor_user_id = current_user_id;
  update public.content_reviews set reviewer_id = null where reviewer_id = current_user_id;
  update public.content_versions set author_user_id = null where author_user_id = current_user_id;
  delete from public.user_profiles where user_id = current_user_id;

  delete from auth.users where id = current_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.delete_current_account()
returns jsonb
language sql
security definer
set search_path = public, private, auth
as $$
  select private.delete_current_account();
$$;

revoke all on function public.delete_current_account() from public;
revoke all on function public.delete_current_account() from anon;
grant execute on function public.delete_current_account() to authenticated;
