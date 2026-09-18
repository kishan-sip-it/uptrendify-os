-- 0016: Database-level workflow invariants and audit-log integrity.

-- Prevent direct PostgREST clients from impersonating another actor in audit history.
drop policy if exists audit_logs_insert_authorized on public.audit_logs;
create policy audit_logs_insert_authorized on public.audit_logs
  for insert
  with check (
    actor_user_id = (select auth.uid())
    and private.has_org_role(
      organization_id,
      ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR','APPROVER']::public.org_role[]
    )
  );

-- Content workflow state machine: publishing is intentionally unavailable until
-- Phase 12. This prevents a direct database request from bypassing the API.
create or replace function private.enforce_content_status_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' then
      raise exception 'CONTENT_STATUS_NOT_ALLOWED_ON_CREATE';
    end if;
    return new;
  end if;

  if old.status = new.status then return new; end if;

  if new.status in ('SCHEDULED','PUBLISHED') then
    raise exception 'PUBLISHING_NOT_ENABLED';
  end if;

  if old.status = 'DRAFT' and new.status not in ('IN_REVIEW','ARCHIVED') then
    raise exception 'INVALID_CONTENT_STATUS_TRANSITION';
  elsif old.status = 'IN_REVIEW' and new.status not in ('CLIENT_REVIEW','APPROVED','REJECTED','CHANGES_REQUESTED','DRAFT','ARCHIVED') then
    raise exception 'INVALID_CONTENT_STATUS_TRANSITION';
  elsif old.status = 'CLIENT_REVIEW' and new.status not in ('APPROVED','REJECTED','CHANGES_REQUESTED','DRAFT','ARCHIVED') then
    raise exception 'INVALID_CONTENT_STATUS_TRANSITION';
  elsif old.status = 'CHANGES_REQUESTED' and new.status not in ('IN_REVIEW','APPROVED','REJECTED','DRAFT','ARCHIVED') then
    raise exception 'INVALID_CONTENT_STATUS_TRANSITION';
  elsif old.status = 'APPROVED' and new.status not in ('ARCHIVED') then
    raise exception 'INVALID_CONTENT_STATUS_TRANSITION';
  elsif old.status = 'REJECTED' and new.status not in ('IN_REVIEW','DRAFT','ARCHIVED') then
    raise exception 'INVALID_CONTENT_STATUS_TRANSITION';
  elsif old.status = 'ARCHIVED' then
    raise exception 'INVALID_CONTENT_STATUS_TRANSITION';
  end if;

  return new;
end;
$$;

drop trigger if exists content_status_transition_guard on public.content_items;
create trigger content_status_transition_guard
before insert or update of status on public.content_items
for each row execute function private.enforce_content_status_transition();

-- Research lifecycle guard.
create or replace function private.enforce_research_status_transition()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then return new; end if;
  if old.status = 'QUEUED' and new.status not in ('RUNNING','CANCELLED','FAILED') then
    raise exception 'INVALID_RESEARCH_STATUS_TRANSITION';
  elsif old.status = 'RUNNING' and new.status not in ('COMPLETED','PARTIAL','FAILED','CANCELLED') then
    raise exception 'INVALID_RESEARCH_STATUS_TRANSITION';
  elsif old.status in ('COMPLETED','PARTIAL','FAILED','CANCELLED') then
    raise exception 'INVALID_RESEARCH_STATUS_TRANSITION';
  end if;
  return new;
end;
$$;

drop trigger if exists research_status_transition_guard on public.research_runs;
create trigger research_status_transition_guard
before update of status on public.research_runs
for each row execute function private.enforce_research_status_transition();

-- Strategy lifecycle guard.
create or replace function private.enforce_strategy_status_transition()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then return new; end if;
  if old.status = 'QUEUED' and new.status not in ('RUNNING','FAILED','CANCELLED') then
    raise exception 'INVALID_STRATEGY_STATUS_TRANSITION';
  elsif old.status = 'RUNNING' and new.status not in ('SUCCEEDED','PARTIAL','FAILED','CANCELLED') then
    raise exception 'INVALID_STRATEGY_STATUS_TRANSITION';
  elsif old.status in ('SUCCEEDED','PARTIAL','FAILED','CANCELLED') then
    raise exception 'INVALID_STRATEGY_STATUS_TRANSITION';
  end if;
  return new;
end;
$$;

drop trigger if exists strategy_status_transition_guard on public.strategies;
create trigger strategy_status_transition_guard
before update of status on public.strategies
for each row execute function private.enforce_strategy_status_transition();

-- Tenant integrity guards.
create or replace function private.assert_tenant_integrity()
returns trigger
language plpgsql
as $$
declare
  parent_org uuid;
begin
  if tg_table_name = 'brands' then
    select organization_id into parent_org from public.clients where id = new.client_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_CLIENT_REFERENCE';
    end if;

  elsif tg_table_name = 'brand_sources' then
    select organization_id into parent_org from public.brands where id = new.brand_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_BRAND_REFERENCE';
    end if;

  elsif tg_table_name = 'brand_source_chunks' then
    select organization_id into parent_org from public.brands where id = new.brand_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_BRAND_REFERENCE';
    end if;
    select organization_id into parent_org from public.brand_sources where id = new.source_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_SOURCE_REFERENCE';
    end if;

  elsif tg_table_name = 'brand_facts' or tg_table_name = 'brand_insights' or tg_table_name = 'brand_competitors' then
    select organization_id into parent_org from public.brands where id = new.brand_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_BRAND_REFERENCE';
    end if;

  elsif tg_table_name = 'research_runs' then
    select organization_id into parent_org from public.brands where id = new.brand_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_BRAND_REFERENCE';
    end if;

  elsif tg_table_name = 'research_sources' then
    select organization_id into parent_org from public.research_runs where id = new.research_run_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_RESEARCH_RUN_REFERENCE';
    end if;
    select organization_id into parent_org from public.brand_sources where id = new.source_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_SOURCE_REFERENCE';
    end if;

  elsif tg_table_name = 'brand_suggestions' then
    select organization_id into parent_org from public.brands where id = new.brand_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_BRAND_REFERENCE';
    end if;
    if new.research_run_id is not null then
      select organization_id into parent_org from public.research_runs where id = new.research_run_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_RESEARCH_RUN_REFERENCE';
      end if;
    end if;

  elsif tg_table_name = 'strategies' then
    select organization_id into parent_org from public.brands where id = new.brand_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_BRAND_REFERENCE';
    end if;

  elsif tg_table_name = 'campaigns' then
    select organization_id into parent_org from public.brands where id = new.brand_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_BRAND_REFERENCE';
    end if;
    if new.strategy_id is not null then
      select organization_id into parent_org from public.strategies where id = new.strategy_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_STRATEGY_REFERENCE';
      end if;
    end if;

  elsif tg_table_name = 'content_items' then
    select organization_id into parent_org from public.brands where id = new.brand_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_BRAND_REFERENCE';
    end if;

    if new.client_id is not null then
      select organization_id into parent_org from public.clients where id = new.client_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_CLIENT_REFERENCE';
      end if;

      if exists (
        select 1 from public.brands b
        where b.id = new.brand_id and b.client_id <> new.client_id
      ) then
        raise exception 'CONTENT_CLIENT_DOES_NOT_MATCH_BRAND';
      end if;
    end if;

    if new.campaign_id is not null then
      select organization_id into parent_org from public.campaigns where id = new.campaign_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_CAMPAIGN_REFERENCE';
      end if;
    end if;

    if new.strategy_id is not null then
      select organization_id into parent_org from public.strategies where id = new.strategy_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_STRATEGY_REFERENCE';
      end if;
    end if;

  elsif tg_table_name = 'content_versions' then
    select organization_id into parent_org from public.content_items where id = new.content_item_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_CONTENT_REFERENCE';
    end if;
    if new.strategy_id is not null then
      select organization_id into parent_org from public.strategies where id = new.strategy_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_STRATEGY_REFERENCE';
      end if;
    end if;

  elsif tg_table_name = 'content_reviews' then
    select organization_id into parent_org from public.content_items where id = new.content_item_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_CONTENT_REFERENCE';
    end if;
    if new.content_version_id is not null then
      select organization_id into parent_org from public.content_versions where id = new.content_version_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_VERSION_REFERENCE';
      end if;
    end if;

  elsif tg_table_name = 'approvals' then
    select organization_id into parent_org from public.content_items where id = new.content_item_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_CONTENT_REFERENCE';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists brands_tenant_integrity on public.brands;
create trigger brands_tenant_integrity before insert or update of organization_id,client_id on public.brands for each row execute function private.assert_tenant_integrity();

drop trigger if exists brand_sources_tenant_integrity on public.brand_sources;
create trigger brand_sources_tenant_integrity before insert or update of organization_id,brand_id on public.brand_sources for each row execute function private.assert_tenant_integrity();

drop trigger if exists brand_source_chunks_tenant_integrity on public.brand_source_chunks;
create trigger brand_source_chunks_tenant_integrity before insert or update of organization_id,brand_id,source_id on public.brand_source_chunks for each row execute function private.assert_tenant_integrity();

drop trigger if exists brand_facts_tenant_integrity on public.brand_facts;
create trigger brand_facts_tenant_integrity before insert or update of organization_id,brand_id on public.brand_facts for each row execute function private.assert_tenant_integrity();

drop trigger if exists brand_insights_tenant_integrity on public.brand_insights;
create trigger brand_insights_tenant_integrity before insert or update of organization_id,brand_id on public.brand_insights for each row execute function private.assert_tenant_integrity();

drop trigger if exists brand_competitors_tenant_integrity on public.brand_competitors;
create trigger brand_competitors_tenant_integrity before insert or update of organization_id,brand_id on public.brand_competitors for each row execute function private.assert_tenant_integrity();

drop trigger if exists research_runs_tenant_integrity on public.research_runs;
create trigger research_runs_tenant_integrity before insert or update of organization_id,brand_id on public.research_runs for each row execute function private.assert_tenant_integrity();

drop trigger if exists research_sources_tenant_integrity on public.research_sources;
create trigger research_sources_tenant_integrity before insert or update of organization_id,research_run_id,source_id on public.research_sources for each row execute function private.assert_tenant_integrity();

drop trigger if exists brand_suggestions_tenant_integrity on public.brand_suggestions;
create trigger brand_suggestions_tenant_integrity before insert or update of organization_id,brand_id,research_run_id on public.brand_suggestions for each row execute function private.assert_tenant_integrity();

drop trigger if exists strategies_tenant_integrity on public.strategies;
create trigger strategies_tenant_integrity before insert or update of organization_id,brand_id on public.strategies for each row execute function private.assert_tenant_integrity();

drop trigger if exists campaigns_tenant_integrity on public.campaigns;
create trigger campaigns_tenant_integrity before insert or update of organization_id,brand_id,strategy_id on public.campaigns for each row execute function private.assert_tenant_integrity();

drop trigger if exists content_items_tenant_integrity on public.content_items;
create trigger content_items_tenant_integrity before insert or update of organization_id,brand_id,client_id,campaign_id,strategy_id on public.content_items for each row execute function private.assert_tenant_integrity();

drop trigger if exists content_versions_tenant_integrity on public.content_versions;
create trigger content_versions_tenant_integrity before insert or update of organization_id,content_item_id,strategy_id on public.content_versions for each row execute function private.assert_tenant_integrity();

drop trigger if exists content_reviews_tenant_integrity on public.content_reviews;
create trigger content_reviews_tenant_integrity before insert or update of organization_id,content_item_id,content_version_id on public.content_reviews for each row execute function private.assert_tenant_integrity();

drop trigger if exists approvals_tenant_integrity on public.approvals;
create trigger approvals_tenant_integrity before insert or update of organization_id,content_item_id on public.approvals for each row execute function private.assert_tenant_integrity();

revoke all on function private.enforce_content_status_transition() from public, anon, authenticated;
revoke all on function private.enforce_research_status_transition() from public, anon, authenticated;
revoke all on function private.enforce_strategy_status_transition() from public, anon, authenticated;
revoke all on function private.assert_tenant_integrity() from public, anon, authenticated;
