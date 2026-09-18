-- 0021: Content provenance and version-lineage hardening.

-- 0019: Strengthen same-organization entity integrity to also require
-- the expected brand lineage. This prevents same-org cross-brand contamination.

create or replace function private.assert_tenant_integrity()
returns trigger
language plpgsql
as $$
declare
  parent_org uuid;
  parent_brand uuid;
  parent_content uuid;
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
    select organization_id, brand_id into parent_org, parent_brand from public.brand_sources where id = new.source_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_SOURCE_REFERENCE';
    end if;
    if parent_brand <> new.brand_id then
      raise exception 'SOURCE_BRAND_MISMATCH';
    end if;

  elsif tg_table_name = 'brand_facts' then
    select organization_id into parent_org from public.brands where id = new.brand_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_BRAND_REFERENCE';
    end if;
    if coalesce(array_length(new.evidence_source_ids, 1), 0) > 0 then
      if exists (
        select 1
        from unnest(new.evidence_source_ids) sid
        left join public.brand_sources bs on bs.id = sid
        where bs.id is null
           or bs.organization_id <> new.organization_id
           or bs.brand_id <> new.brand_id
      ) then
        raise exception 'BRAND_FACT_SOURCE_MISMATCH';
      end if;
    end if;

  elsif tg_table_name in ('brand_insights','brand_competitors') then
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
    select organization_id, brand_id into parent_org, parent_brand from public.research_runs where id = new.research_run_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_RESEARCH_RUN_REFERENCE';
    end if;
    select organization_id into parent_org from public.brand_sources where id = new.source_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_SOURCE_REFERENCE';
    end if;
    if parent_brand <> (select brand_id from public.brand_sources where id = new.source_id) then
      raise exception 'SOURCE_BRAND_MISMATCH';
    end if;

    if parent_brand is distinct from (select brand_id from public.brand_sources where id = new.source_id) then
      raise exception 'RESEARCH_SOURCE_BRAND_MISMATCH';
    end if;

  elsif tg_table_name = 'brand_suggestions' then
    select organization_id into parent_org from public.brands where id = new.brand_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_BRAND_REFERENCE';
    end if;
    if new.research_run_id is not null then
      select organization_id, brand_id into parent_org, parent_brand from public.research_runs where id = new.research_run_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_RESEARCH_RUN_REFERENCE';
      end if;
      if parent_brand <> new.brand_id then
        raise exception 'RESEARCH_RUN_BRAND_MISMATCH';
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
      select organization_id, brand_id into parent_org, parent_brand from public.strategies where id = new.strategy_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_STRATEGY_REFERENCE';
      end if;
      if parent_brand <> new.brand_id then
        raise exception 'STRATEGY_BRAND_MISMATCH';
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
      if exists (select 1 from public.brands b where b.id = new.brand_id and b.client_id <> new.client_id) then
        raise exception 'CONTENT_CLIENT_DOES_NOT_MATCH_BRAND';
      end if;
    end if;

    if new.current_version_id is not null then
      select organization_id, content_item_id into parent_org, parent_content
      from public.content_versions where id = new.current_version_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_VERSION_REFERENCE';
      end if;
      if parent_content <> new.id then
        raise exception 'CURRENT_VERSION_CONTENT_MISMATCH';
      end if;
    end if;

    if new.campaign_id is not null then
      select organization_id, brand_id into parent_org, parent_brand from public.campaigns where id = new.campaign_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_CAMPAIGN_REFERENCE';
      end if;
      if parent_brand <> new.brand_id then
        raise exception 'CAMPAIGN_BRAND_MISMATCH';
      end if;
    end if;

    if new.strategy_id is not null then
      select organization_id, brand_id into parent_org, parent_brand from public.strategies where id = new.strategy_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_STRATEGY_REFERENCE';
      end if;
      if parent_brand <> new.brand_id then
        raise exception 'STRATEGY_BRAND_MISMATCH';
      end if;
    end if;

  elsif tg_table_name = 'content_versions' then
    select organization_id, brand_id into parent_org, parent_brand
    from public.content_items where id = new.content_item_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_CONTENT_REFERENCE';
    end if;

    if new.strategy_id is not null then
      select organization_id, brand_id into parent_org, parent_brand from public.strategies where id = new.strategy_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_STRATEGY_REFERENCE';
      end if;
      if parent_brand <> (select brand_id from public.content_items where id = new.content_item_id) then
        raise exception 'STRATEGY_BRAND_MISMATCH';
      end if;
    end if;

  elsif tg_table_name = 'content_reviews' then
    select organization_id into parent_org from public.content_items where id = new.content_item_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_CONTENT_REFERENCE';
    end if;
    if new.content_version_id is not null then
      select organization_id, content_item_id into parent_org, parent_content
      from public.content_versions where id = new.content_version_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_VERSION_REFERENCE';
      end if;
      if parent_content <> new.content_item_id then
        raise exception 'VERSION_CONTENT_MISMATCH';
      end if;
    end if;

  elsif tg_table_name = 'approvals' then
    select organization_id into parent_org from public.content_items where id = new.content_item_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_CONTENT_REFERENCE';
    end if;

  elsif tg_table_name = 'ai_tasks' then
    if new.brand_id is not null then
      select organization_id into parent_org from public.brands where id = new.brand_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_BRAND_REFERENCE';
      end if;
    end if;

    if new.research_run_id is not null then
      select organization_id, brand_id into parent_org, parent_brand from public.research_runs where id = new.research_run_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_RESEARCH_RUN_REFERENCE';
      end if;
      if new.brand_id is not null and parent_brand <> new.brand_id then
        raise exception 'RESEARCH_RUN_BRAND_MISMATCH';
      end if;
    end if;

    if new.strategy_id is not null then
      select organization_id, brand_id into parent_org, parent_brand from public.strategies where id = new.strategy_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_STRATEGY_REFERENCE';
      end if;
      if new.brand_id is not null and parent_brand <> new.brand_id then
        raise exception 'STRATEGY_BRAND_MISMATCH';
      end if;
    end if;

    if new.content_item_id is not null then
      select organization_id, brand_id into parent_org, parent_brand from public.content_items where id = new.content_item_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_CONTENT_REFERENCE';
      end if;
      if new.brand_id is not null and parent_brand <> new.brand_id then
        raise exception 'CONTENT_BRAND_MISMATCH';
      end if;
    end if;
  end if;

  return new;
end;
$$;

alter function private.assert_tenant_integrity() set search_path = public, private;
revoke all on function private.assert_tenant_integrity() from public, anon, authenticated;

drop trigger if exists ai_tasks_tenant_integrity on public.ai_tasks;
create trigger ai_tasks_tenant_integrity
before insert or update of organization_id,brand_id,research_run_id,strategy_id,content_item_id
on public.ai_tasks
for each row execute function private.assert_tenant_integrity();


-- Content review rows must be authored by the authenticated user and use a role
-- appropriate to the action, even when accessed directly through PostgREST.
drop policy if exists content_reviews_insert_workflow on public.content_reviews;
create policy content_reviews_insert_workflow on public.content_reviews
  for insert
  with check (
    reviewer_id = auth.uid()
    and (
      (
        decision in ('approve','reject','changes_requested')
        and private.has_org_role(
          organization_id,
          ARRAY['OWNER','ADMIN','STRATEGIST','APPROVER']::public.org_role[]
        )
      )
      or
      (
        decision in ('submit','return_to_draft','archive')
        and private.has_org_role(
          organization_id,
          ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]
        )
      )
    )
  );

-- The DB state machine also enforces the actor role for sensitive content
-- transitions. The service role is allowed for maintenance/replay operations.
create or replace function private.enforce_content_status_transition()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  actor uuid := auth.uid();
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

  if actor is not null then
    if new.status in ('APPROVED','REJECTED')
       and not private.has_org_role(
         new.organization_id,
         ARRAY['OWNER','ADMIN','STRATEGIST','APPROVER']::public.org_role[]
       ) then
      raise exception 'CONTENT_REVIEW_ROLE_REQUIRED';
    end if;

    if new.status = 'CHANGES_REQUESTED'
       and not private.has_org_role(
         new.organization_id,
         ARRAY['OWNER','ADMIN','STRATEGIST','APPROVER']::public.org_role[]
       ) then
      raise exception 'CONTENT_REVIEW_ROLE_REQUIRED';
    end if;

    if new.status in ('IN_REVIEW','DRAFT')
       and not private.has_org_role(
         new.organization_id,
         ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]
       ) then
      raise exception 'CONTENT_GENERATOR_ROLE_REQUIRED';
    end if;
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

alter function private.enforce_content_status_transition() set search_path = public, private;
revoke all on function private.enforce_content_status_transition() from public, anon, authenticated;
