-- 0026: Approval & Publishing.
-- Enables the Phase 12 approval-to-ready and controlled publish workflow.
--   - content_status gains READY_TO_PUBLISH between APPROVED and PUBLISHED.
--   - content_publications is an append-only attempt/audit ledger scoped to the exact
--     approved (content_version_id, channel). SUCCEEDED evidence is required before the
--     item may move to PUBLISHED, so direct PostgREST writes cannot fake a publish.
--   - channel_configurations declares per-brand channel connectivity. No real connector
--     is registered yet, so publish resolves to NOT_CONNECTED until one exists.
--   - A version change on approved/queued/published content invalidates the approval and
--     returns the item to DRAFT: approval is version-exact and is never inherited by a
--     newer version.

-- 1) New state vocabulary.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'publication_status') then
    create type public.publication_status as enum ('QUEUED','PUBLISHING','SUCCEEDED','FAILED','NOT_CONNECTED');
  end if;
  if not exists (select 1 from pg_type where typname = 'channel_connection_status') then
    create type public.channel_connection_status as enum ('NOT_CONFIGURED','CONNECTED','ERROR');
  end if;
end;
$$;

alter type public.content_status add value if not exists 'READY_TO_PUBLISH';

-- 2) Per-brand channel connectivity declaration (no credentials are stored here).
create table if not exists public.channel_configurations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  channel text not null,
  status public.channel_connection_status not null default 'NOT_CONFIGURED',
  external_reference text,
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_configurations_channel_nonblank check (length(btrim(channel)) > 0)
);

create unique index if not exists channel_configurations_brand_channel_uidx
  on public.channel_configurations(organization_id, brand_id, channel);
create index if not exists channel_configurations_org_idx on public.channel_configurations(organization_id);
create index if not exists channel_configurations_brand_idx on public.channel_configurations(brand_id);

-- 3) Publish attempt ledger. One or more rows per (version, channel): the first
--    SUCCEEDED row is the authoritative evidence; FAILED / NOT_CONNECTED attempts
--    never change the item status and are retained for audit and retry.
create table if not exists public.content_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  content_version_id uuid not null references public.content_versions(id) on delete set null,
  channel text not null,
  status public.publication_status not null default 'QUEUED',
  error_code text,
  error_message text,
  idempotency_key text,
  external_reference text,
  published_at timestamptz,
  initiated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_publications_channel_nonblank check (length(btrim(channel)) > 0)
);

create index if not exists content_publications_org_status_idx on public.content_publications(organization_id, status, created_at desc);
create index if not exists content_publications_item_created_idx on public.content_publications(content_item_id, created_at desc);
create index if not exists content_publications_version_channel_idx on public.content_publications(content_version_id, channel);
create unique index if not exists content_publications_idempotency_uidx
  on public.content_publications(organization_id, idempotency_key) where idempotency_key is not null;

-- 4) updated_at maintenance.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists channel_configurations_touch on public.channel_configurations;
create trigger channel_configurations_touch
before update on public.channel_configurations
for each row execute function private.touch_updated_at();

drop trigger if exists content_publications_touch on public.content_publications;
create trigger content_publications_touch
before update on public.content_publications
for each row execute function private.touch_updated_at();

-- 5) RLS: org members read; publishers mutate. Publishers are OWNER/ADMIN/STRATEGIST.
alter table public.channel_configurations enable row level security;
alter table public.content_publications enable row level security;

create policy channel_configurations_select_member on public.channel_configurations
  for select using (private.is_org_member(organization_id));
create policy channel_configurations_insert_operator on public.channel_configurations
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST']::public.org_role[]));
create policy channel_configurations_update_operator on public.channel_configurations
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST']::public.org_role[]));

create policy content_publications_select_member on public.content_publications
  for select using (private.is_org_member(organization_id));
create policy content_publications_insert_publisher on public.content_publications
  for insert with check (
    initiated_by = auth.uid()
    and private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST']::public.org_role[])
  );
create policy content_publications_update_publisher on public.content_publications
  for update using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST']::public.org_role[]));

-- 6) Publication-ledger state machine: created with a terminal outcome or queued, then
--    terminal states are final (a NOT_CONNECTED attempt may retry once configured).
create or replace function private.enforce_publication_status_transition()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'QUEUED' and new.error_code is not null then
      raise exception 'PUBLICATION_QUEUED_WITH_ERROR';
    end if;
    if new.status = 'SUCCEEDED' and new.published_at is null then
      new.published_at := now();
    end if;
    return new;
  end if;

  if old.status = new.status then
    if new.status = 'SUCCEEDED' and new.published_at is null then
      new.published_at := now();
    end if;
    return new;
  end if;

  if old.status = 'QUEUED' and new.status not in ('PUBLISHING','SUCCEEDED','FAILED','NOT_CONNECTED') then
    raise exception 'INVALID_PUBLICATION_STATUS_TRANSITION';
  elsif old.status = 'PUBLISHING' and new.status not in ('SUCCEEDED','FAILED') then
    raise exception 'INVALID_PUBLICATION_STATUS_TRANSITION';
  elsif old.status = 'NOT_CONNECTED' and new.status not in ('PUBLISHING','SUCCEEDED','FAILED') then
    raise exception 'INVALID_PUBLICATION_STATUS_TRANSITION';
  elsif old.status in ('SUCCEEDED','FAILED') then
    raise exception 'PUBLICATION_STATUS_TERMINAL';
  end if;

  if new.status = 'SUCCEEDED' and new.published_at is null then
    new.published_at := now();
  end if;

  return new;
end;
$$;

alter function private.enforce_publication_status_transition() set search_path = public, private;
revoke all on function private.enforce_publication_status_transition() from public, anon, authenticated;

drop trigger if exists publication_status_transition_guard on public.content_publications;
create trigger publication_status_transition_guard
before insert or update of status on public.content_publications
for each row execute function private.enforce_publication_status_transition();

-- 7) Approval is version-exact: bumping the current version of an approved/queued/
--    scheduled/published item invalidates the approval and returns it to DRAFT.
--    (Runs before the status guard thanks to alphabetical trigger ordering.)
create or replace function private.invalidate_approval_on_version_change()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if new.current_version_id is distinct from old.current_version_id
     and old.status in ('APPROVED','READY_TO_PUBLISH','SCHEDULED','PUBLISHED') then
    new.status := 'DRAFT';
    new.updated_at := now();
  end if;
  return new;
end;
$$;

alter function private.invalidate_approval_on_version_change() set search_path = public, private;
revoke all on function private.invalidate_approval_on_version_change() from public, anon, authenticated;

drop trigger if exists content_approval_invalidation on public.content_items;
create trigger content_approval_invalidation
before update of current_version_id on public.content_items
for each row execute function private.invalidate_approval_on_version_change();

-- 8) Extend the content state machine: APPROVED -> READY_TO_PUBLISH -> PUBLISHED,
--    with PUBLISHED backed by publication evidence and a publisher role.
create or replace function private.enforce_content_status_transition()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  actor uuid := auth.uid();
  has_publication boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' then
      raise exception 'CONTENT_STATUS_NOT_ALLOWED_ON_CREATE';
    end if;
    return new;
  end if;

  if old.status = new.status then return new; end if;

  if new.status = 'SCHEDULED' then
    raise exception 'PUBLISHING_NOT_ENABLED';
  end if;

  if actor is not null then
    if new.status in ('APPROVED','REJECTED','CHANGES_REQUESTED','READY_TO_PUBLISH')
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

    if new.status = 'PUBLISHED'
       and not private.has_org_role(
         new.organization_id,
         ARRAY['OWNER','ADMIN','STRATEGIST']::public.org_role[]
       ) then
      raise exception 'CONTENT_PUBLISH_ROLE_REQUIRED';
    end if;
  end if;

  if new.status = 'PUBLISHED' then
    select exists (
      select 1 from public.content_publications cp
      where cp.content_item_id = new.id
        and cp.content_version_id = new.current_version_id
        and cp.status = 'SUCCEEDED'
    ) into has_publication;
    if not coalesce(has_publication, false) then
      raise exception 'PUBLISH_EVIDENCE_REQUIRED';
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
  elsif old.status = 'APPROVED' and new.status not in ('READY_TO_PUBLISH','DRAFT','ARCHIVED') then
    raise exception 'INVALID_CONTENT_STATUS_TRANSITION';
  elsif old.status = 'READY_TO_PUBLISH' and new.status not in ('APPROVED','PUBLISHED','DRAFT','ARCHIVED') then
    raise exception 'INVALID_CONTENT_STATUS_TRANSITION';
  elsif old.status = 'REJECTED' and new.status not in ('IN_REVIEW','DRAFT','ARCHIVED') then
    raise exception 'INVALID_CONTENT_STATUS_TRANSITION';
  elsif old.status = 'PUBLISHED' and new.status not in ('ARCHIVED') then
    raise exception 'INVALID_CONTENT_STATUS_TRANSITION';
  elsif old.status = 'ARCHIVED' then
    raise exception 'INVALID_CONTENT_STATUS_TRANSITION';
  end if;

  return new;
end;
$$;

alter function private.enforce_content_status_transition() set search_path = public, private;
revoke all on function private.enforce_content_status_transition() from public, anon, authenticated;

drop trigger if exists content_status_transition_guard on public.content_items;
create trigger content_status_transition_guard
before insert or update of status on public.content_items
for each row execute function private.enforce_content_status_transition();

-- 9) Review ledger decisions for the new approval actions.
drop policy if exists content_reviews_insert_workflow on public.content_reviews;
create policy content_reviews_insert_workflow on public.content_reviews
  for insert
  with check (
    reviewer_id = auth.uid()
    and (
      (
        decision in ('approve','reject','changes_requested','queue_for_publish','back_to_approved')
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

-- 10) Tenant integrity for the new tables (org, brand and content lineage).
create or replace function private.assert_tenant_integrity()
returns trigger
language plpgsql
set search_path = public, private
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

  elsif tg_table_name = 'channel_configurations' then
    select organization_id into parent_org from public.brands where id = new.brand_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_BRAND_REFERENCE';
    end if;

    if new.channel is null or length(btrim(new.channel)) = 0 then
      raise exception 'CHANNEL_REQUIRED';
    end if;

  elsif tg_table_name = 'content_publications' then
    select organization_id, brand_id into parent_org, parent_brand
    from public.content_items where id = new.content_item_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_CONTENT_REFERENCE';
    end if;
    if parent_brand <> new.brand_id then
      raise exception 'PUBLICATION_BRAND_MISMATCH';
    end if;

    select organization_id, content_item_id into parent_org, parent_content
    from public.content_versions where id = new.content_version_id;
    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'CROSS_TENANT_VERSION_REFERENCE';
    end if;
    if parent_content <> new.content_item_id then
      raise exception 'VERSION_CONTENT_MISMATCH';
    end if;

    if new.campaign_id is not null then
      select organization_id, brand_id into parent_org, parent_brand from public.campaigns where id = new.campaign_id;
      if parent_org is null or parent_org <> new.organization_id then
        raise exception 'CROSS_TENANT_CAMPAIGN_REFERENCE';
      end if;
      if parent_brand <> new.brand_id then
        raise exception 'PUBLICATION_CAMPAIGN_BRAND_MISMATCH';
      end if;
    end if;

    if new.client_id is not null and exists (
      select 1 from public.brands b where b.id = new.brand_id and b.client_id is distinct from new.client_id
    ) then
      raise exception 'PUBLICATION_CLIENT_DOES_NOT_MATCH_BRAND';
    end if;

    if new.channel is null or length(btrim(new.channel)) = 0 then
      raise exception 'CHANNEL_REQUIRED';
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

drop trigger if exists channel_configurations_tenant_integrity on public.channel_configurations;
create trigger channel_configurations_tenant_integrity
before insert or update of organization_id,brand_id,channel
on public.channel_configurations
for each row execute function private.assert_tenant_integrity();

drop trigger if exists content_publications_tenant_integrity on public.content_publications;
create trigger content_publications_tenant_integrity
before insert or update of organization_id,brand_id,client_id,campaign_id,content_item_id,content_version_id,channel
on public.content_publications
for each row execute function private.assert_tenant_integrity();

-- The triggers above fire as the invoking role (SECURITY INVOKER). The API
-- role must be able to resolve and run them, otherwise any status-changing
-- write fails with 42501 (permission denied for schema private).
grant usage on schema private to authenticated, anon, service_role;
grant execute on function private.enforce_publication_status_transition() to authenticated, service_role;
grant execute on function private.invalidate_approval_on_version_change() to authenticated, service_role;
grant execute on function private.enforce_content_status_transition() to authenticated, service_role;
grant execute on function private.assert_tenant_integrity() to authenticated, service_role;