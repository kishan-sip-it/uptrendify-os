-- 0021: tighten content review provenance and current-version lineage at the DB boundary.

-- Ensure content_items.current_version_id always points to a version belonging to the same item/org.
create or replace function private.assert_tenant_integrity()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  parent_org uuid;
  parent_brand uuid;
  parent_content uuid;
  version_content uuid;
  version_org uuid;
begin
  if tg_table_name = 'content_items' then
    select organization_id, client_id into parent_org, parent_brand from public.brands where id = new.brand_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_BRAND_REFERENCE';
    end if;
    if new.client_id is not null then
      select organization_id into parent_org from public.clients where id = new.client_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_CLIENT_REFERENCE';
      end if;
      if parent_brand <> new.client_id then
        raise exception 'CONTENT_CLIENT_DOES_NOT_MATCH_BRAND';
      end if;
    end if;
    if new.campaign_id is not null then
      select organization_id, brand_id into parent_org, parent_brand from public.campaigns where id = new.campaign_id;
      if parent_org is null or parent_org <> new.organization_id then raise exception 'CROSS_TENANT_CAMPAIGN_REFERENCE'; end if;
      if parent_brand <> new.brand_id then raise exception 'CAMPAIGN_BRAND_MISMATCH'; end if;
    end if;
    if new.strategy_id is not null then
      select organization_id, brand_id into parent_org, parent_brand from public.strategies where id = new.strategy_id;
      if parent_org is null or parent_org <> new.organization_id then raise exception 'CROSS_TENANT_STRATEGY_REFERENCE'; end if;
      if parent_brand <> new.brand_id then raise exception 'STRATEGY_BRAND_MISMATCH'; end if;
    end if;
    if new.current_version_id is not null then
      select organization_id, content_item_id into version_org, version_content from public.content_versions where id = new.current_version_id;
      if version_org is null or version_org <> new.organization_id then raise exception 'CROSS_TENANT_VERSION_REFERENCE'; end if;
      if version_content <> new.id then raise exception 'CURRENT_VERSION_CONTENT_MISMATCH'; end if;
    end if;

  elsif tg_table_name = 'brand_facts' then
    select organization_id into parent_org from public.brands where id = new.brand_id;
    if parent_org is null or parent_org <> new.organization_id then raise exception 'CROSS_TENANT_BRAND_REFERENCE'; end if;
    if coalesce(array_length(new.evidence_source_ids, 1), 0) > 0 then
      if exists (
        select 1
        from unnest(new.evidence_source_ids) sid
        left join public.brand_sources bs on bs.id = sid
        where bs.id is null or bs.organization_id <> new.organization_id or bs.brand_id <> new.brand_id
      ) then
        raise exception 'BRAND_FACT_SOURCE_MISMATCH';
      end if;
    end if;

  elsif tg_table_name = 'content_reviews' then
    select organization_id into parent_org from public.content_items where id = new.content_item_id;
    if parent_org is null or parent_org <> new.organization_id then raise exception 'CROSS_TENANT_CONTENT_REFERENCE'; end if;
    if new.content_version_id is not null then
      select organization_id, content_item_id into parent_org, parent_content
      from public.content_versions where id = new.content_version_id;
      if parent_org is null or parent_org <> new.organization_id then raise exception 'CROSS_TENANT_VERSION_REFERENCE'; end if;
      if parent_content <> new.content_item_id then raise exception 'VERSION_CONTENT_MISMATCH'; end if;
    end if;
  end if;
  return new;
end;
$$;
alter function private.assert_tenant_integrity() set search_path = public, private;
revoke all on function private.assert_tenant_integrity() from public, anon, authenticated;

-- Replace permissive content-review insertion with reviewer identity + action role enforcement.
drop policy if exists content_reviews_insert_workflow on public.content_reviews;
create policy content_reviews_insert_workflow on public.content_reviews
  for insert
  with check (
    reviewer_id = auth.uid()
    and (
      (decision in ('approve','reject','changes_requested')
        and private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','APPROVER']::public.org_role[]))
      or
      (decision in ('submit','return_to_draft','archive')
        and private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
    )
  );