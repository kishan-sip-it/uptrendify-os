-- 0037: make authenticated account deletion complete across all current user foreign keys.
begin;

create or replace function private.delete_current_account()
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  current_user_id uuid := auth.uid();
  membership record;
  other_members integer;
  other_owners integer;
  deleted_workspaces integer := 0;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  for membership in
    select om.organization_id, om.role, o.name as organization_name
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    where om.user_id = current_user_id
    order by om.organization_id
  loop
    perform 1
      from public.organization_members
      where organization_id = membership.organization_id
      for update;

    select
      count(*) filter (where user_id <> current_user_id),
      count(*) filter (where user_id <> current_user_id and role = 'OWNER')
      into other_members, other_owners
    from public.organization_members
    where organization_id = membership.organization_id;

    if membership.role = 'OWNER' then
      if other_members = 0 then
        perform set_config('uptrendify.allow_workspace_cascade', 'on', true);
        delete from public.organizations where id = membership.organization_id;
        deleted_workspaces := deleted_workspaces + 1;
      elsif other_owners = 0 then
        raise exception 'WORKSPACE_OWNERSHIP_TRANSFER_REQUIRED';
      else
        delete from public.organization_members
        where organization_id = membership.organization_id
          and user_id = current_user_id;
      end if;
    else
      if other_members = 0 then
        raise exception 'WORKSPACE_OWNERSHIP_TRANSFER_REQUIRED';
      end if;

      delete from public.organization_members
      where organization_id = membership.organization_id
        and user_id = current_user_id;
    end if;
  end loop;

  update public.audit_logs set actor_user_id = null where actor_user_id = current_user_id;
  update public.content_reviews set reviewer_id = null where reviewer_id = current_user_id;
  update public.content_versions set author_user_id = null where author_user_id = current_user_id;
  update public.strategies set created_by = null where created_by = current_user_id;
  update public.campaigns set created_by = null where created_by = current_user_id;
  update public.content_items set created_by = null where created_by = current_user_id;
  update public.agent_runs set created_by = null where created_by = current_user_id;
  update public.ai_tasks set created_by = null where created_by = current_user_id;
  update public.approvals set approved_by = null where approved_by = current_user_id;
  update public.brand_suggestions set reviewed_by = null where reviewed_by = current_user_id;
  delete from public.team_invitations where invited_by = current_user_id;

  delete from public.user_profiles where user_id = current_user_id;
  delete from auth.users where id = current_user_id;

  return jsonb_build_object('ok', true, 'deleted_workspaces', deleted_workspaces);
end;
$$;

commit;
