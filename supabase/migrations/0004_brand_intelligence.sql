-- UpTrendifyOS brand intelligence migration
-- 1) Tie AI analysis tasks to the research run that produced their evidence so
--    Brand Brain output is traceable to a specific crawl.
alter table public.ai_tasks
  add column research_run_id uuid references public.research_runs(id) on delete cascade;

-- 2) Cover the read shapes used by the brand overview page.
create index if not exists ai_tasks_run_idx on public.ai_tasks(research_run_id);
create index if not exists research_runs_brand_created_idx on public.research_runs(brand_id, created_at desc);
create index if not exists research_sources_run_source_idx on public.research_sources(research_run_id, source_id);