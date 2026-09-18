-- 0020: Allow a completed crawl to be downgraded to PARTIAL when downstream Brand Brain analysis fails.
-- The research pipeline evaluates crawl + intelligence as one workflow. The crawler may finish
-- the crawl as COMPLETED before the analysis stage runs, so analysis failure must be able to
-- accurately change the overall research run to PARTIAL instead of getting stuck in COMPLETED.

create or replace function private.enforce_research_status_transition()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if old.status = new.status then return new; end if;

  if old.status = 'QUEUED' and new.status not in ('RUNNING','CANCELLED','FAILED') then
    raise exception 'INVALID_RESEARCH_STATUS_TRANSITION';
  elsif old.status = 'RUNNING' and new.status not in ('COMPLETED','PARTIAL','FAILED','CANCELLED') then
    raise exception 'INVALID_RESEARCH_STATUS_TRANSITION';
  elsif old.status = 'COMPLETED' and new.status <> 'PARTIAL' then
    raise exception 'INVALID_RESEARCH_STATUS_TRANSITION';
  elsif old.status in ('PARTIAL','FAILED','CANCELLED') then
    raise exception 'INVALID_RESEARCH_STATUS_TRANSITION';
  end if;

  return new;
end;
$$;

alter function private.enforce_research_status_transition() set search_path = public, private;
revoke all on function private.enforce_research_status_transition() from public, anon, authenticated;