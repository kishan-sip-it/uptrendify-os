-- UpTrendifyOS initial schema
-- Requires PostgreSQL + pgcrypto. Designed for Supabase.

create extension if not exists pgcrypto;
create extension if not exists vector;

create type public.org_role as enum ('OWNER','ADMIN','STRATEGIST','EDITOR','APPROVER','CLIENT');
create type public.research_status as enum ('QUEUED','RUNNING','COMPLETED','PARTIAL','FAILED','CANCELLED');
create type public.fact_source_type as enum ('USER_CONFIRMED','SOURCE_DERIVED','AI_INFERRED');
create type public.content_status as enum ('DRAFT','IN_REVIEW','CLIENT_REVIEW','CHANGES_REQUESTED','APPROVED','SCHEDULED','PUBLISHED','ARCHIVED');
create type public.job_status as enum ('QUEUED','RUNNING','SUCCEEDED','PARTIAL','FAILED','CANCELLED');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'EDITOR',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  slug text not null,
  website_url text not null,
  industry text,
  market_country text,
  target_audience text,
  status text not null default 'ACTIVE',
  analysis_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, slug)
);

create table public.brand_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  url text not null,
  canonical_url text,
  title text,
  content_type text,
  status text not null default 'ACTIVE',
  http_status integer,
  retrieved_at timestamptz,
  content_hash text,
  extracted_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (brand_id, canonical_url)
);

create table public.brand_source_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  source_id uuid not null references public.brand_sources(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, chunk_index)
);

create table public.brand_facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  key text not null,
  value jsonb not null,
  source_type public.fact_source_type not null,
  confidence numeric(5,4),
  evidence_source_ids uuid[] not null default '{}',
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, key)
);

create table public.brand_competitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  website_url text,
  source text not null default 'USER',
  notes text,
  created_at timestamptz not null default now()
);

create table public.brand_insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  category text not null,
  title text not null,
  description text,
  priority integer not null default 3,
  evidence_source_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  status public.research_status not null default 'QUEUED',
  idempotency_key text not null,
  pages_discovered integer not null default 0,
  pages_processed integer not null default 0,
  provider text,
  model text,
  error_code text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  source_id uuid not null references public.brand_sources(id) on delete cascade,
  status text not null default 'PROCESSED',
  error_message text,
  created_at timestamptz not null default now(),
  unique (research_run_id, source_id)
);

create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  title text not null,
  period_start date,
  period_end date,
  goal text,
  input_snapshot jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  provider text,
  model text,
  version integer not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  strategy_id uuid references public.strategies(id) on delete set null,
  name text not null,
  objective text,
  status text not null default 'PLANNING',
  start_date date,
  end_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  type text not null,
  title text not null,
  objective text,
  status public.content_status not null default 'DRAFT',
  current_version_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  version integer not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  provider text,
  model text,
  author_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (content_item_id, version)
);

alter table public.content_items
  add constraint content_items_current_version_fk
  foreign key (current_version_id) references public.content_versions(id) on delete set null;

create table public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  reviewer_id uuid references auth.users(id),
  decision text not null,
  comment text,
  created_at timestamptz not null default now()
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  required_role public.org_role not null default 'APPROVER',
  approved_by uuid references auth.users(id),
  status text not null default 'PENDING',
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  agent_type text not null,
  status public.job_status not null default 'QUEUED',
  provider text,
  model text,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.agent_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  event_type text not null,
  tool_name text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  display_name text,
  status text not null default 'CONNECTED',
  secret_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, display_name)
);

create table public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  metric_date date not null,
  source text not null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (brand_id, metric_date, source)
);

create table public.ai_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  task_type text not null,
  status public.job_status not null default 'QUEUED',
  idempotency_key text,
  provider text,
  model text,
  input_metadata jsonb not null default '{}'::jsonb,
  output_metadata jsonb not null default '{}'::jsonb,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  error_code text,
  error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (organization_id, idempotency_key)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index organizations_slug_idx on public.organizations(slug);
create index clients_org_idx on public.clients(organization_id);
create index brands_org_idx on public.brands(organization_id);
create index brands_client_idx on public.brands(client_id);
create index brand_sources_brand_idx on public.brand_sources(brand_id);
create index brand_facts_brand_idx on public.brand_facts(brand_id);
create index research_runs_brand_idx on public.research_runs(brand_id);
create index strategies_brand_idx on public.strategies(brand_id);
create index campaigns_brand_idx on public.campaigns(brand_id);
create index content_items_brand_idx on public.content_items(brand_id);
create index agent_runs_brand_idx on public.agent_runs(brand_id);
create index audit_logs_org_created_idx on public.audit_logs(organization_id, created_at desc);

-- Basic helper used by RLS policies in later migrations.
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org and m.user_id = auth.uid()
  );
$$;
