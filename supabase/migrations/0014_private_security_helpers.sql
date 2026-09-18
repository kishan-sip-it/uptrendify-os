-- 0014: Finalize private security helpers and optimize auth-dependent RLS policies.

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.is_org_member(uuid) from anon;
grant execute on function private.is_org_member(uuid) to authenticated;

revoke all on function private.org_role(uuid) from public;
revoke all on function private.org_role(uuid) from anon;
grant execute on function private.org_role(uuid) to authenticated;

revoke all on function private.has_org_role(uuid, public.org_role[]) from public;
revoke all on function private.has_org_role(uuid, public.org_role[]) from anon;
grant execute on function private.has_org_role(uuid, public.org_role[]) to authenticated;

-- Triggers execute with the function owner's rights; the trigger helper does
-- not need direct API execution privileges.
alter function public.sync_brand_fact_on_suggestion_change() set schema private;
revoke all on function private.sync_brand_fact_on_suggestion_change() from public;
revoke all on function private.sync_brand_fact_on_suggestion_change() from anon;
revoke all on function private.sync_brand_fact_on_suggestion_change() from authenticated;

-- Replace per-row auth.uid() evaluation with an init-plan-friendly expression.
drop policy if exists user_profiles_insert_self on public.user_profiles;
drop policy if exists user_profiles_update_self on public.user_profiles;
drop policy if exists user_profiles_select_member on public.user_profiles;

create policy user_profiles_insert_self on public.user_profiles
  for insert
  with check (
    user_id = (select auth.uid())
    and (
      organization_id is null
      or (
        private.is_org_member(organization_id)
        and role is not distinct from private.org_role(organization_id)
      )
    )
  );

create policy user_profiles_select_member on public.user_profiles
  for select
  using (
    user_id = (select auth.uid())
    or private.is_org_member(organization_id)
  );

create policy user_profiles_update_self on public.user_profiles
  for update
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      organization_id is null
      or (
        private.is_org_member(organization_id)
        and role is not distinct from private.org_role(organization_id)
      )
    )
  );
