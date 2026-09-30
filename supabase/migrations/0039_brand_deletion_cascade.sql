-- 0039: allow brand-scoped cascade deletion to clear campaign strategy links safely.
-- The campaign_strategies primary-link guard must remain strict during normal
-- operations, but a deliberate brand deletion is a single transactional
-- cascade and must be allowed to remove those dependent rows.
begin;

create or replace function private.guard_campaign_strategy_primary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_primary uuid;
begin
  if current_setting('uptrendify.allow_brand_cascade', true) = 'on'
     or current_setting('uptrendify.allow_workspace_cascade', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select c.strategy_id
    into campaign_primary
  from public.campaigns c
  where c.id = coalesce(new.campaign_id, old.campaign_id);

  if tg_op = 'DELETE' then
    if old.is_primary and campaign_primary = old.strategy_id then
      raise exception 'PRIMARY_CAMPAIGN_STRATEGY_REQUIRED';
    end if;
    return old;
  end if;

  if new.is_primary is false and campaign_primary = new.strategy_id then
    raise exception 'PRIMARY_CAMPAIGN_STRATEGY_REQUIRED';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_campaign_strategy_primary() from public, anon, authenticated;

drop function if exists public.delete_brand(uuid);

create or replace function public.delete_brand(target_brand_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  current_user_id uuid := auth.uid();
  brand_org uuid;
  brand_name text;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select b.organization_id, b.name
    into brand_org, brand_name
  from public.brands b
  where b.id = target_brand_id;

  if brand_org is null then
    raise exception 'BRAND_NOT_FOUND';
  end if;

  if not private.has_org_role(
    brand_org,
    ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]
  ) then
    raise exception 'BRAND_DELETE_FORBIDDEN';
  end if;

  perform set_config('uptrendify.allow_brand_cascade', 'on', true);

  delete from public.brands
  where id = target_brand_id
    and organization_id = brand_org;

  if not found then
    raise exception 'BRAND_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'ok', true,
    'deleted_brand', jsonb_build_object('id', target_brand_id, 'name', brand_name),
    'message', 'Brand and its related research, content, campaigns and strategy data were deleted.'
  );
end;
$$;

revoke all on function public.delete_brand(uuid) from public, anon;
grant execute on function public.delete_brand(uuid) to authenticated;

commit;
