-- 0038: Campaign strategy sets.
-- A campaign keeps its existing strategy_id as the primary strategy for backward
-- compatibility, while this relation allows a campaign to be grounded in
-- multiple approved strategy versions.

create table if not exists public.campaign_strategies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  is_primary boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (campaign_id, strategy_id)
);

create unique index if not exists campaign_strategies_one_primary_idx
  on public.campaign_strategies(campaign_id)
  where is_primary;

create index if not exists campaign_strategies_campaign_idx
  on public.campaign_strategies(campaign_id, sort_order, created_at);

create index if not exists campaign_strategies_strategy_idx
  on public.campaign_strategies(strategy_id);

alter table public.campaign_strategies enable row level security;

drop policy if exists campaign_strategies_select_member on public.campaign_strategies;
create policy campaign_strategies_select_member on public.campaign_strategies
  for select using (private.is_org_member(organization_id));

drop policy if exists campaign_strategies_insert_operator on public.campaign_strategies;
create policy campaign_strategies_insert_operator on public.campaign_strategies
  for insert with check (
    private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[])
  );

drop policy if exists campaign_strategies_update_operator on public.campaign_strategies;
create policy campaign_strategies_update_operator on public.campaign_strategies
  for update using (
    private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[])
  ) with check (
    private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[])
  );

drop policy if exists campaign_strategies_delete_operator on public.campaign_strategies;
create policy campaign_strategies_delete_operator on public.campaign_strategies
  for delete using (
    private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[])
  );

-- Do not rely on the API alone for tenant/brand/workflow integrity. A caller
-- must not be able to link a campaign to a strategy from another org/brand or
-- to a strategy that has not succeeded.
create or replace function private.assert_campaign_strategy_link()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  campaign_org uuid;
  campaign_brand uuid;
  strategy_org uuid;
  strategy_brand uuid;
  strategy_status text;
begin
  select organization_id, brand_id
    into campaign_org, campaign_brand
    from public.campaigns
   where id = new.campaign_id;

  if campaign_org is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;

  select organization_id, brand_id, status
    into strategy_org, strategy_brand, strategy_status
    from public.strategies
   where id = new.strategy_id;

  if strategy_org is null then
    raise exception 'STRATEGY_NOT_FOUND';
  end if;

  if new.organization_id <> campaign_org or new.organization_id <> strategy_org then
    raise exception 'CAMPAIGN_STRATEGY_ORGANIZATION_MISMATCH';
  end if;

  if campaign_brand <> strategy_brand then
    raise exception 'CAMPAIGN_STRATEGY_BRAND_MISMATCH';
  end if;

  if strategy_status <> 'SUCCEEDED' then
    raise exception 'CAMPAIGN_STRATEGY_NOT_SUCCEEDED';
  end if;

  return new;
end;
$$;

alter function private.assert_campaign_strategy_link() set search_path = public, private;
revoke all on function private.assert_campaign_strategy_link() from public, anon, authenticated;

drop trigger if exists campaign_strategy_link_guard on public.campaign_strategies;
create trigger campaign_strategy_link_guard
before insert or update of organization_id,campaign_id,strategy_id
on public.campaign_strategies
for each row execute function private.assert_campaign_strategy_link();

-- Existing campaigns already have one approved strategy in campaigns.strategy_id.
-- Seed those links so the new relation is immediately consistent without
-- changing any existing campaign behavior.
insert into public.campaign_strategies (organization_id, campaign_id, strategy_id, is_primary, sort_order, created_by)
select c.organization_id, c.id, c.strategy_id, true, 0, c.created_by
  from public.campaigns c
 where c.strategy_id is not null
   and not exists (
     select 1
       from public.campaign_strategies cs
      where cs.campaign_id = c.id
        and cs.strategy_id = c.strategy_id
   );

-- The legacy strategy_id remains the authoritative primary pointer. Keep the
-- relation aligned when an older API path changes that pointer directly.
create or replace function private.sync_primary_campaign_strategy()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.strategy_id is null then
    delete from public.campaign_strategies
     where campaign_id = new.id and is_primary;
    return new;
  end if;

  insert into public.campaign_strategies (
    organization_id, campaign_id, strategy_id, is_primary, sort_order, created_by
  ) values (
    new.organization_id, new.id, new.strategy_id, true, 0, new.created_by
  )
  on conflict (campaign_id, strategy_id)
  do update set is_primary = true, sort_order = 0;

  update public.campaign_strategies
     set is_primary = false
   where campaign_id = new.id
     and strategy_id <> new.strategy_id
     and is_primary;

  return new;
end;
$$;

alter function private.sync_primary_campaign_strategy() set search_path = public, private;
revoke all on function private.sync_primary_campaign_strategy() from public, anon, authenticated;

drop trigger if exists campaigns_primary_strategy_sync on public.campaigns;
create trigger campaigns_primary_strategy_sync
after insert or update of strategy_id
on public.campaigns
for each row execute function private.sync_primary_campaign_strategy();
