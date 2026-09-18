-- 0008: Content Studio — structured content intent, versionable AI output, review state.
-- Extends the existing content foundation (content_items / content_versions / content_reviews)
-- without weakening the org-scoped RLS already enabled in 0002.

-- 1) The content lifecycle needs REJECTED alongside the existing content_status values.
alter type public.content_status add value if not exists 'REJECTED';

-- 2) Content items carry the creative intent: channel, audience, tone, CTA direction,
--    campaign context and extra instructions. client_id denormalizes the
--    organization → client → brand → content attribution chain for direct scoping.
alter table public.content_items
  add column if not exists client_id uuid references public.clients(id) on delete cascade,
  add column if not exists channel text,
  add column if not exists audience text,
  add column if not exists tone text,
  add column if not exists cta text,
  add column if not exists context jsonb not null default '{}'::jsonb,
  add column if not exists instructions text;

-- 3) Content versions store the validated, structured AI output: headline/CTA fields at
--    the top level plus traceability back to the approved strategy and approved Brand
--    Brain facts (brand_fact_references / strategy_references).
alter table public.content_versions
  add column if not exists strategy_id uuid references public.strategies(id) on delete set null,
  add column if not exists headline text,
  add column if not exists cta text,
  add column if not exists rationale text,
  add column if not exists brand_fact_references jsonb not null default '[]'::jsonb,
  add column if not exists strategy_references jsonb not null default '[]'::jsonb;

-- 4) Review decisions point at the exact version that was reviewed.
alter table public.content_reviews
  add column if not exists content_version_id uuid references public.content_versions(id) on delete set null;

-- 5) Trace generation to its governing AI task, mirroring research_run_id/strategy_id.
alter table public.ai_tasks
  add column if not exists content_item_id uuid references public.content_items(id) on delete set null;

-- 6) Cover the read shapes used by the Content Studio list/detail APIs.
create index if not exists content_items_org_status_idx on public.content_items(organization_id, status);
create index if not exists content_items_brand_created_idx on public.content_items(brand_id, created_at desc);
create index if not exists content_items_brand_status_idx on public.content_items(brand_id, status);
create index if not exists content_versions_org_idx on public.content_versions(organization_id);
create index if not exists content_reviews_item_idx on public.content_reviews(content_item_id);
create index if not exists ai_tasks_content_idx on public.ai_tasks(content_item_id);