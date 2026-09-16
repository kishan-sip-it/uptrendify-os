-- UpTrendifyOS hardening migration
-- 1) brand_sources: canonical_url must be non-null so the (brand_id, canonical_url)
--    unique constraint (used for source deduplication on upsert) actually applies.
update public.brand_sources set canonical_url = url where canonical_url is null;

alter table public.brand_sources alter column canonical_url set not null;

-- 2) Cover the query shapes used by the research pipeline and dashboards.
create index if not exists research_sources_run_idx on public.research_sources(research_run_id);
create index if not exists research_sources_org_idx on public.research_sources(organization_id);
create index if not exists brand_source_chunks_source_idx on public.brand_source_chunks(source_id);
create index if not exists brand_source_chunks_brand_idx on public.brand_source_chunks(brand_id);
create index if not exists content_versions_item_idx on public.content_versions(content_item_id);
create index if not exists brand_competitors_brand_idx on public.brand_competitors(brand_id);
create index if not exists brand_insights_brand_idx on public.brand_insights(brand_id);
create index if not exists ai_tasks_brand_idx on public.ai_tasks(brand_id);
create index if not exists research_runs_status_idx on public.research_runs(status, created_at desc);