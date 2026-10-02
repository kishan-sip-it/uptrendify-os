-- Reset a single brand workspace while preserving the brand itself.
-- This migration mirrors the function applied to the connected Supabase project.

create or replace function public.reset_brand_workspace(target_brand_id uuid)
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
    raise exception 'BRAND_RESET_FORBIDDEN';
  end if;

  perform set_config('uptrendify.allow_brand_cascade', 'on', true);

  delete from public.audit_logs where organization_id = brand_org and entity_id = target_brand_id;
  delete from public.ai_tasks where organization_id = brand_org and brand_id = target_brand_id;
  delete from public.analytics_snapshots where organization_id = brand_org and brand_id = target_brand_id;
  delete from public.agent_runs where organization_id = brand_org and brand_id = target_brand_id;
  delete from public.content_publications where organization_id = brand_org and brand_id = target_brand_id;
  delete from public.content_items where organization_id = brand_org and brand_id = target_brand_id;
  delete from public.campaigns where organization_id = brand_org and brand_id = target_brand_id;
  delete from public.strategies where organization_id = brand_org and brand_id = target_brand_id;
  delete from public.channel_configurations where organization_id = brand_org and brand_id = target_brand_id;
  delete from public.research_runs where organization_id = brand_org and brand_id = target_brand_id;
  delete from public.brand_suggestions where organization_id = brand_org and brand_id = target_brand_id;
  delete from public.brand_facts where organization_id = brand_org and brand_id = target_brand_id;
  delete from public.brand_insights where organization_id = brand_org and brand_id = target_brand_id;
  delete from public.brand_competitors where organization_id = brand_org and brand_id = target_brand_id;
  delete from public.brand_sources where organization_id = brand_org and brand_id = target_brand_id;

  update public.brands
     set analysis_version = 1,
         updated_at = now()
   where id = target_brand_id
     and organization_id = brand_org;

  return jsonb_build_object(
    'ok', true,
    'brand', jsonb_build_object('id', target_brand_id, 'name', brand_name),
    'message', 'Brand workspace reset. Brand identity and integration configuration were preserved.'
  );
end;
$$;

revoke all on function public.reset_brand_workspace(uuid) from public;
grant execute on function public.reset_brand_workspace(uuid) to authenticated;
