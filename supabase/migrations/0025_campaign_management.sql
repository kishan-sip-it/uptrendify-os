-- 0025: Campaign Management.
-- Elevates campaigns from a placeholder table into a full workflow stage:
--   Client -> Brand -> Approved Strategy (SUCCEEDED) -> Campaign -> Content
-- with a closed lifecycle (DRAFT -> PLANNED -> ACTIVE -> COMPLETED/ARCHIVED),
-- client attribution, budget/currency/date/channel planning, and DB-enforced
-- invariants mirroring the content workflow hardening (0016/0021).

-- 1) Lifecycle as a closed state machine.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'campaign_status') then
    create type public.campaign_status as enum ('DRAFT','PLANNED','ACTIVE','COMPLETED','ARCHIVED');
  end if;
end;
$$;

-- 2) Client attribution plus planning-level shape.
alter table public.campaigns
  add column if not exists client_id uuid references public.clients(id) on delete cascade,
  add column if not exists description text,
  add column if not exists budget numeric(14,2),
  add column if not exists currency text not null default 'USD',
  add column if not exists channels text[] not null default '{}';

-- 3) Move status onto the enum. Legacy 'PLANNING' rows are historical
--    planning-state campaigns and map to DRAFT so nothing is silently dropped.
alter table public.campaigns
  alter column status drop default,
  alter column status type public.campaign_status
    using (case status when 'PLANNING' then 'DRAFT'::public.campaign_status
                       else status::public.campaign_status end),
  alter column status set default 'DRAFT';

-- 4) Client attribution is mandatory and derived from the owning brand.
update public.campaigns c
set client_id = b.client_id
from public.brands b
where b.id = c.brand_id
  and c.client_id is null;

alter table public.campaigns alter column client_id set not null;

-- 5) Invariants.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaigns_name_nonblank') then
    alter table public.campaigns
      add constraint campaigns_name_nonblank check (length(btrim(name)) > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campaigns_budget_nonnegative') then
    alter table public.campaigns
      add constraint campaigns_budget_nonnegative check (budget is null or budget >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campaigns_currency_format') then
    alter table public.campaigns
      add constraint campaigns_currency_format check (currency ~ '^[A-Z]{3}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campaigns_date_range') then
    alter table public.campaigns
      add constraint campaigns_date_range check (start_date is null or end_date is null or start_date <= end_date);
  end if;
end;
$$;

-- 6) Query indexes.
create index if not exists campaigns_org_idx on public.campaigns(organization_id);
create index if not exists campaigns_org_status_idx on public.campaigns(organization_id, status);
create index if not exists campaigns_client_idx on public.campaigns(client_id);
create index if not exists campaigns_brand_created_idx on public.campaigns(brand_id, created_at desc);
create index if not exists campaigns_strategy_idx on public.campaigns(strategy_id) where strategy_id is not null;

-- 7) The state machine is enforced by the database so direct PostgREST writes
--    cannot route campaigns through invalid transitions. RLS (0011
--    campaigns_update_operator) already restricts updates to operator roles,
--    so this trigger only guards transition legality.
create or replace function private.enforce_campaign_status_transition()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' then
      raise exception 'CAMPAIGN_STATUS_NOT_ALLOWED_ON_CREATE';
    end if;
    return new;
  end if;

  if old.status = new.status then return new; end if;

  if old.status = 'DRAFT' and new.status not in ('PLANNED','ARCHIVED') then
    raise exception 'INVALID_CAMPAIGN_STATUS_TRANSITION';
  elsif old.status = 'PLANNED' and new.status not in ('ACTIVE','COMPLETED','DRAFT','ARCHIVED') then
    raise exception 'INVALID_CAMPAIGN_STATUS_TRANSITION';
  elsif old.status = 'ACTIVE' and new.status not in ('COMPLETED','PLANNED','ARCHIVED') then
    raise exception 'INVALID_CAMPAIGN_STATUS_TRANSITION';
  elsif old.status = 'COMPLETED' and new.status not in ('ARCHIVED') then
    raise exception 'INVALID_CAMPAIGN_STATUS_TRANSITION';
  elsif old.status = 'ARCHIVED' then
    raise exception 'INVALID_CAMPAIGN_STATUS_TRANSITION';
  end if;

  return new;
end;
$$;

alter function private.enforce_campaign_status_transition() set search_path = public, private;
revoke all on function private.enforce_campaign_status_transition() from public, anon, authenticated;

drop trigger if exists campaign_status_transition_guard on public.campaigns;
create trigger campaign_status_transition_guard
before insert or update of status on public.campaigns
for each row execute function private.enforce_campaign_status_transition();

-- 8) Campaign lineage: a campaign's client must be the brand's client and its
--    strategy must be an approved (SUCCEEDED) strategy of the same brand.
--    assert_tenant_integrity (0016/0021) separately guarantees org/brand/strategy
--    tenancy; this trigger adds the workflow-level guarantees.
create or replace function private.assert_campaign_lineage()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  brand_client uuid;
  strategy_status text;
  strategy_brand uuid;
begin
  select client_id into brand_client from public.brands where id = new.brand_id;
  if new.client_id is distinct from brand_client then
    raise exception 'CAMPAIGN_CLIENT_DOES_NOT_MATCH_BRAND';
  end if;

  if new.strategy_id is not null then
    select status, brand_id into strategy_status, strategy_brand
    from public.strategies where id = new.strategy_id;
    if strategy_status is null then
      raise exception 'CAMPAIGN_STRATEGY_NOT_FOUND';
    end if;
    if strategy_status <> 'SUCCEEDED' then
      raise exception 'CAMPAIGN_STRATEGY_NOT_SUCCEEDED';
    end if;
    if strategy_brand <> new.brand_id then
      raise exception 'CAMPAIGN_STRATEGY_BRAND_MISMATCH';
    end if;
  end if;

  return new;
end;
$$;

alter function private.assert_campaign_lineage() set search_path = public, private;
revoke all on function private.assert_campaign_lineage() from public, anon, authenticated;

drop trigger if exists campaigns_lineage_guard on public.campaigns;
create trigger campaigns_lineage_guard
before insert or update of client_id,strategy_id on public.campaigns
for each row execute function private.assert_campaign_lineage();

-- 9) Channel planning must never contain null or empty entries (vocabulary
--    enforcement happens at the API layer; this guard keeps the shape clean).
--    PostgreSQL forbids subqueries in check constraints, hence a trigger.
create or replace function private.assert_campaign_channels()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if exists (
    select 1 from unnest(new.channels) as ch
    where ch is null or length(btrim(ch)) = 0
  ) then
    raise exception 'CAMPAIGN_CHANNELS_INVALID';
  end if;

  return new;
end;
$$;

alter function private.assert_campaign_channels() set search_path = public, private;
revoke all on function private.assert_campaign_channels() from public, anon, authenticated;

drop trigger if exists campaigns_channels_guard on public.campaigns;
create trigger campaigns_channels_guard
before insert or update of channels on public.campaigns
for each row execute function private.assert_campaign_channels();