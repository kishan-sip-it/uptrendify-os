-- UpTrendifyOS strategy engine migration
-- 1) Give strategies a generation lifecycle so the UI can show live status
--    (QUEUED/RUNNING/SUCCEEDED/FAILED), store failure details, and support
--    idempotent generation plus versioned regeneration with full history.
alter table public.strategies
  add column if not exists status public.job_status not null default 'QUEUED',
  add column if not exists error_code text,
  add column if not exists error_message text,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists idempotency_key text;

-- 2) Tie strategy generation to its governing AI task (mirrors research_run_id
--    on ai_tasks so Brand Brain output stays traceable).
alter table public.ai_tasks
  add column if not exists strategy_id uuid references public.strategies(id) on delete set null;

-- 3) Enforce one strategy version per brand so regeneration always bumps version
--    and history is never silently overwritten.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'strategies_brand_version_key' and conrelid = 'public.strategies'::regclass
  ) then
    alter table public.strategies
      add constraint strategies_brand_version_key unique (brand_id, version);
  end if;
end $$;

-- 4) Idempotent generations: at most one strategy per (organization, idempotency_key).
create unique index if not exists strategies_org_idem_idx
  on public.strategies(organization_id, idempotency_key)
  where idempotency_key is not null;

-- 5) Cover the read shapes used by the strategy API and dashboard.
create index if not exists strategies_org_status_idx on public.strategies(organization_id, status);
create index if not exists strategies_brand_created_idx on public.strategies(brand_id, created_at desc);
create index if not exists ai_tasks_strategy_idx on public.ai_tasks(strategy_id);