-- 0010: Security + concurrency hardening for the completed foundation.

-- Brand intelligence and onboarding profiles must actually enforce their policies.
alter table public.brand_suggestions enable row level security;
alter table public.user_profiles enable row level security;

-- The RLS helper is an internal implementation detail. Move it out of the
-- exposed public schema; existing policy expressions keep the function OID.
create schema if not exists private;
alter function public.is_org_member(uuid) set schema private;
revoke all on function private.is_org_member(uuid) from public;
grant execute on function private.is_org_member(uuid) to authenticated;

-- Prevent two research runs for the same brand from being active concurrently.
create unique index if not exists research_runs_one_active_per_brand_idx
  on public.research_runs(brand_id)
  where status in ('QUEUED','RUNNING');

-- Prevent two strategy generations for the same brand from being active concurrently.
create unique index if not exists strategies_one_active_per_brand_idx
  on public.strategies(brand_id)
  where status in ('QUEUED','RUNNING');

-- Prevent concurrent generation jobs for the same content item.
create unique index if not exists ai_tasks_one_active_content_generation_idx
  on public.ai_tasks(content_item_id, task_type)
  where content_item_id is not null and status in ('QUEUED','RUNNING');
