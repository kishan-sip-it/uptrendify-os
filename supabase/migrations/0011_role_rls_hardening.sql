-- 0011: Role-aware RLS hardening.
-- The application already enforces roles in Next.js routes. These policies add
-- database-side defense so authenticated users cannot bypass those guards via
-- direct PostgREST calls using the public Supabase key.

create or replace function private.org_role(target_org uuid)
returns public.org_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = target_org
    and m.user_id = auth.uid()
  limit 1;
$$;

create or replace function private.has_org_role(target_org uuid, allowed public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(private.org_role(target_org) = any(allowed), false);
$$;

revoke all on function private.org_role(uuid) from public;
revoke all on function private.org_role(uuid) from anon;
grant execute on function private.org_role(uuid) to authenticated;

revoke all on function private.has_org_role(uuid, public.org_role[]) from public;
revoke all on function private.has_org_role(uuid, public.org_role[]) from anon;
grant execute on function private.has_org_role(uuid, public.org_role[]) to authenticated;

-- Remove the broad "all org members can mutate everything" policies.
drop policy if exists clients_all_member on public.clients;
drop policy if exists brands_all_member on public.brands;
drop policy if exists brand_sources_all_member on public.brand_sources;
drop policy if exists brand_source_chunks_all_member on public.brand_source_chunks;
drop policy if exists brand_facts_all_member on public.brand_facts;
drop policy if exists brand_competitors_all_member on public.brand_competitors;
drop policy if exists brand_insights_all_member on public.brand_insights;
drop policy if exists research_runs_all_member on public.research_runs;
drop policy if exists research_sources_all_member on public.research_sources;
drop policy if exists strategies_all_member on public.strategies;
drop policy if exists campaigns_all_member on public.campaigns;
drop policy if exists content_items_all_member on public.content_items;
drop policy if exists content_versions_all_member on public.content_versions;
drop policy if exists content_reviews_all_member on public.content_reviews;
drop policy if exists approvals_all_member on public.approvals;
drop policy if exists agent_runs_all_member on public.agent_runs;
drop policy if exists agent_events_all_member on public.agent_events;
drop policy if exists integration_accounts_all_member on public.integration_accounts;
drop policy if exists analytics_snapshots_all_member on public.analytics_snapshots;
drop policy if exists ai_tasks_all_member on public.ai_tasks;
drop policy if exists audit_logs_insert_member on public.audit_logs;

create policy clients_select_member on public.clients
  for select using (private.is_org_member(organization_id));
create policy clients_insert_operator on public.clients
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy clients_update_operator on public.clients
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy clients_delete_operator on public.clients
  for delete using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy brands_select_member on public.brands
  for select using (private.is_org_member(organization_id));
create policy brands_insert_operator on public.brands
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy brands_update_operator on public.brands
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy brands_delete_operator on public.brands
  for delete using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy sources_select_member on public.brand_sources
  for select using (private.is_org_member(organization_id));
create policy sources_insert_operator on public.brand_sources
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy sources_update_operator on public.brand_sources
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy sources_delete_operator on public.brand_sources
  for delete using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy source_chunks_select_member on public.brand_source_chunks
  for select using (private.is_org_member(organization_id));
create policy source_chunks_insert_operator on public.brand_source_chunks
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy source_chunks_update_operator on public.brand_source_chunks
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy source_chunks_delete_operator on public.brand_source_chunks
  for delete using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy facts_select_member on public.brand_facts
  for select using (private.is_org_member(organization_id));
create policy facts_insert_reviewer on public.brand_facts
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy facts_update_reviewer on public.brand_facts
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy facts_delete_reviewer on public.brand_facts
  for delete using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy competitors_select_member on public.brand_competitors
  for select using (private.is_org_member(organization_id));
create policy competitors_insert_operator on public.brand_competitors
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy competitors_update_operator on public.brand_competitors
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy competitors_delete_operator on public.brand_competitors
  for delete using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy insights_select_member on public.brand_insights
  for select using (private.is_org_member(organization_id));
create policy insights_insert_operator on public.brand_insights
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy insights_update_operator on public.brand_insights
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy insights_delete_operator on public.brand_insights
  for delete using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy research_runs_select_member on public.research_runs
  for select using (private.is_org_member(organization_id));
create policy research_runs_insert_operator on public.research_runs
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy research_runs_update_operator on public.research_runs
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy research_sources_select_member on public.research_sources
  for select using (private.is_org_member(organization_id));
create policy research_sources_insert_operator on public.research_sources
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy research_sources_update_operator on public.research_sources
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy strategies_select_member on public.strategies
  for select using (private.is_org_member(organization_id));
create policy strategies_insert_operator on public.strategies
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy strategies_update_operator on public.strategies
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy strategies_delete_operator on public.strategies
  for delete using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy campaigns_select_member on public.campaigns
  for select using (private.is_org_member(organization_id));
create policy campaigns_insert_operator on public.campaigns
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy campaigns_update_operator on public.campaigns
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy campaigns_delete_operator on public.campaigns
  for delete using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy content_items_select_member on public.content_items
  for select using (private.is_org_member(organization_id));
create policy content_items_insert_generator on public.content_items
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy content_items_update_editor_reviewer on public.content_items
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR','APPROVER']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR','APPROVER']::public.org_role[]));
create policy content_items_delete_generator on public.content_items
  for delete using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy content_versions_select_member on public.content_versions
  for select using (private.is_org_member(organization_id));
create policy content_versions_insert_generator on public.content_versions
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy content_versions_update_generator on public.content_versions
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy content_reviews_select_member on public.content_reviews
  for select using (private.is_org_member(organization_id));
create policy content_reviews_insert_workflow on public.content_reviews
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR','APPROVER']::public.org_role[]));

create policy approvals_select_member on public.approvals
  for select using (private.is_org_member(organization_id));
create policy approvals_insert_reviewer on public.approvals
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','APPROVER']::public.org_role[]));
create policy approvals_update_reviewer on public.approvals
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','APPROVER']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','APPROVER']::public.org_role[]));

create policy agent_runs_select_member on public.agent_runs
  for select using (private.is_org_member(organization_id));
create policy agent_runs_insert_operator on public.agent_runs
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy agent_runs_update_operator on public.agent_runs
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy agent_events_select_member on public.agent_events
  for select using (private.is_org_member(organization_id));
create policy agent_events_insert_operator on public.agent_events
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy integration_accounts_select_member on public.integration_accounts
  for select using (private.is_org_member(organization_id));
create policy integration_accounts_insert_admin on public.integration_accounts
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN']::public.org_role[]));
create policy integration_accounts_update_admin on public.integration_accounts
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN']::public.org_role[]));
create policy integration_accounts_delete_admin on public.integration_accounts
  for delete using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN']::public.org_role[]));

create policy analytics_snapshots_select_member on public.analytics_snapshots
  for select using (private.is_org_member(organization_id));
create policy analytics_snapshots_insert_operator on public.analytics_snapshots
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy analytics_snapshots_update_operator on public.analytics_snapshots
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy ai_tasks_select_member on public.ai_tasks
  for select using (private.is_org_member(organization_id));
create policy ai_tasks_insert_operator on public.ai_tasks
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
create policy ai_tasks_update_operator on public.ai_tasks
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy audit_logs_insert_authorized on public.audit_logs
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR','APPROVER']::public.org_role[]));

-- user_profiles: self-service profile data may never set a role that differs
-- from the membership authority.
drop policy if exists user_profiles_insert_self on public.user_profiles;
drop policy if exists user_profiles_update_self on public.user_profiles;
create policy user_profiles_insert_self on public.user_profiles
  for insert
  with check (
    user_id = auth.uid()
    and (
      organization_id is null
      or (
        private.is_org_member(organization_id)
        and role is not distinct from private.org_role(organization_id)
      )
    )
  );
create policy user_profiles_update_self on public.user_profiles
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      organization_id is null
      or (
        private.is_org_member(organization_id)
        and role is not distinct from private.org_role(organization_id)
      )
    )
  );
