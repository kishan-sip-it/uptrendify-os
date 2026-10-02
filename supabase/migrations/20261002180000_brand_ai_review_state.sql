-- Persist optional AI review recommendations separately from the authoritative suggestion status.
-- AI decisions are advisory state only. Human review remains authoritative.
alter table public.brand_suggestions
  add column if not exists ai_decision text,
  add column if not exists ai_confidence numeric(5,4),
  add column if not exists ai_reason text,
  add column if not exists ai_decided_at timestamptz;

alter table public.brand_suggestions
  drop constraint if exists brand_suggestions_ai_decision_check;

alter table public.brand_suggestions
  add constraint brand_suggestions_ai_decision_check
  check (ai_decision is null or ai_decision in ('APPROVE','REJECT','REVIEW'));

create index if not exists brand_suggestions_brand_ai_decision_idx
  on public.brand_suggestions(brand_id, ai_decision)
  where status = 'PENDING';
