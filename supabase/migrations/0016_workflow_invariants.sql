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

  if old.status = new.status then
    return new;
  end if;

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

revoke all on function private.enforce_content_status_transition() from public;
revoke all on function private.enforce_content_status_transition() from anon;
revoke all on function private.enforce_content_status_transition() from authenticated;

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

revoke all on function private.enforce_research_status_transition() from public;
revoke all on function private.enforce_research_status_transition() from anon;
revoke all on function private.enforce_research_status_transition() from authenticated;
revoke all on function private.enforce_strategy_status_transition() from public;
revoke all on function private.enforce_strategy_status_transition() from anon;
revoke all on function private.enforce_strategy_status_transition() from authenticated;

-- Critical parent-child tenant integrity. These are NOT VALID so existing data
-- is not blocked; all future inserts/updates are still enforced immediately.
do $$
begin
  if not exists (select 1 from pg_constraint where conname='brands_org_client_fk') then
    alter table public.brands
      add constraint brands_org_client_fk
      foreign key (organization_id, client_id)
      references public.clients (organization_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='sources_org_brand_fk') then
    alter table public.brand_sources
      add constraint sources_org_brand_fk
      foreign key (organization_id, brand_id)
      references public.brands (organization_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='chunks_org_brand_fk') then
    alter table public.brand_source_chunks
      add constraint chunks_org_brand_fk
      foreign key (organization_id, brand_id)
      references public.brands (organization_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='chunks_org_source_fk') then
    alter table public.brand_source_chunks
      add constraint chunks_org_source_fk
      foreign key (organization_id, source_id)
      references public.brand_sources (organization_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='runs_org_brand_fk') then
    alter table public.research_runs
      add constraint runs_org_brand_fk
      foreign key (organization_id, brand_id)
      references public.brands (organization_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='research_sources_org_run_fk') then
    alter table public.research_sources
      add constraint research_sources_org_run_fk
      foreign key (organization_id, research_run_id)
      references public.research_runs (organization_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='research_sources_org_source_fk') then
    alter table public.research_sources
      add constraint research_sources_org_source_fk
      foreign key (organization_id, source_id)
      references public.brand_sources (organization_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='suggestions_org_brand_fk') then
    alter table public.brand_suggestions
      add constraint suggestions_org_brand_fk
      foreign key (organization_id, brand_id)
      references public.brands (organization_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='suggestions_org_run_fk') then
    alter table public.brand_suggestions
      add constraint suggestions_org_run_fk
      foreign key (organization_id, research_run_id)
      references public.research_runs (organization_id, id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='facts_org_brand_fk') then
    alter table public.brand_facts
      add constraint facts_org_brand_fk
      foreign key (organization_id, brand_id)
      references public.brands (organization_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='insights_org_brand_fk') then
    alter table public.brand_insights
      add constraint insights_org_brand_fk
      foreign key (organization_id, brand_id)
      references public.brands (organization_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='strategies_org_brand_fk') then
    alter table public.strategies
      add constraint strategies_org_brand_fk
      foreign key (organization_id, brand_id)
      references public.brands (organization_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='campaigns_org_brand_fk') then
    alter table public.campaigns
      add constraint campaigns_org_brand_fk
      foreign key (organization_id, brand_id)
      references public.brands (organization_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='campaigns_org_strategy_fk') then
    alter table public.campaigns
      add constraint campaigns_org_strategy_fk
      foreign key (organization_id, strategy_id)
      references public.strategies (organization_id, id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='content_org_brand_fk') then
    alter table public.content_items
      add constraint content_org_brand_fk
      foreign key (organization_id, brand_id)
      references public.brands (organization_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='content_org_client_fk') then
    alter table public.content_items
      add constraint content_org_client_fk
      foreign key (organization_id, client_id)
      references public.clients (organization_id, id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='content_org_campaign_fk') then
    alter table public.content_items
      add constraint content_org_campaign_fk
      foreign key (organization_id, campaign_id)
      references public.campaigns (organization_id, id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='content_org_strategy_fk') then
    alter table public.content_items
      add constraint content_org_strategy_fk
      foreign key (organization_id, strategy_id)
      references public.strategies (organization_id, id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='versions_org_content_fk') then
    alter table public.content_versions
      add constraint versions_org_content_fk
      foreign key (organization_id, content_item_id)
      references public.content_items (organization_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='versions_org_strategy_fk') then
    alter table public.content_versions
      add constraint versions_org_strategy_fk
      foreign key (organization_id, strategy_id)
      references public.strategies (organization_id, id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='reviews_org_content_fk') then
    alter table public.content_reviews
      add constraint reviews_org_content_fk
      foreign key (organization_id, content_item_id)
      references public.content_items (organization_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='reviews_org_version_fk') then
    alter table public.content_reviews
      add constraint reviews_org_version_fk
      foreign key (organization_id, content_version_id)
      references public.content_versions (organization_id, id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname='approvals_org_content_fk') then
    alter table public.approvals
      add constraint approvals_org_content_fk
      foreign key (organization_id, content_item_id)
      references public.content_items (organization_id, id)
      on delete cascade not valid;
  end if;
end
$$;