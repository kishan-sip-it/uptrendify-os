-- 0033: onboarding progress persistence.
begin;

create table if not exists public.onboarding_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  current_step integer not null default 0 check (current_step between 0 and 5),
  completed_steps integer[] not null default '{}',
  draft_data jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists onboarding_progress_organization_idx
  on public.onboarding_progress(organization_id);

alter table public.onboarding_progress enable row level security;

drop policy if exists onboarding_progress_select_self on public.onboarding_progress;
drop policy if exists onboarding_progress_insert_self on public.onboarding_progress;
drop policy if exists onboarding_progress_update_self on public.onboarding_progress;
drop policy if exists onboarding_progress_delete_self on public.onboarding_progress;

create policy onboarding_progress_select_self on public.onboarding_progress
for select using (
  user_id = auth.uid()
  and exists (
    select 1 from public.organization_members m
    where m.organization_id = onboarding_progress.organization_id
      and m.user_id = auth.uid()
  )
);

create policy onboarding_progress_insert_self on public.onboarding_progress
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.organization_members m
    where m.organization_id = onboarding_progress.organization_id
      and m.user_id = auth.uid()
  )
);

create policy onboarding_progress_update_self on public.onboarding_progress
for update
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.organization_members m
    where m.organization_id = onboarding_progress.organization_id
      and m.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.organization_members m
    where m.organization_id = onboarding_progress.organization_id
      and m.user_id = auth.uid()
  )
);

create policy onboarding_progress_delete_self on public.onboarding_progress
for delete using (
  user_id = auth.uid()
  and exists (
    select 1 from public.organization_members m
    where m.organization_id = onboarding_progress.organization_id
      and m.user_id = auth.uid()
  )
);

commit;
