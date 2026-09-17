-- 0006: Brand Intelligence Review workspace + user profiles for onboarding.
-- AI-extracted brand intelligence becomes a *reviewed* suggestion inbox instead of
-- silently authoritative facts. Human-approved/edited values become authoritative.

create type public.suggestion_status as enum ('PENDING','APPROVED','REJECTED','EDITED','NOT_FOUND');

create table public.brand_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  research_run_id uuid references public.research_runs(id) on delete set null,
  field text not null,
  label text not null,
  kind text not null default 'text',
  proposed_value jsonb,
  status public.suggestion_status not null default 'PENDING',
  evidence jsonb not null default '[]',
  evidence_strength text,
  sources_examined integer not null default 0,
  confidence numeric(5,4),
  history jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  constraint brand_suggestions_brand_field_key unique (brand_id, field)
);

create index brand_suggestions_org_status_idx on public.brand_suggestions(organization_id, status);
create index brand_suggestions_brand_idx on public.brand_suggestions(brand_id);
create index brand_suggestions_field_idx on public.brand_suggestions(field);

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  first_name text,
  last_name text,
  role public.org_role,
  team_size text,
  timezone text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create policy suggestions_all_member on public.brand_suggestions
  for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy user_profiles_select_member on public.user_profiles
  for select using (user_id = auth.uid() or public.is_org_member(organization_id));
create policy user_profiles_insert_self on public.user_profiles
  for insert with check (user_id = auth.uid());
create policy user_profiles_update_self on public.user_profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());