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

  elsif tg_table_name in ('brand_facts','brand_insights','brand_competitors') then
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
