-- 0012: Preserve provenance between reviewed Brand Brain suggestions and authoritative facts.

alter table public.brand_facts
  add column if not exists source_suggestion_id uuid
    references public.brand_suggestions(id) on delete set null;

create index if not exists brand_facts_source_suggestion_idx
  on public.brand_facts(source_suggestion_id)
  where source_suggestion_id is not null;

-- When an AI suggestion that previously became authoritative is rejected,
-- regenerated, or no longer found, automatically disable only the fact that
-- came from that exact suggestion.
create or replace function public.sync_brand_fact_on_suggestion_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('PENDING','REJECTED','NOT_FOUND') then
    update public.brand_facts
      set approved = false,
          updated_at = now()
    where source_suggestion_id = new.id
      and brand_id = new.brand_id
      and organization_id = new.organization_id;
  end if;
  return new;
end;
$$;

drop trigger if exists brand_suggestion_fact_sync on public.brand_suggestions;
create trigger brand_suggestion_fact_sync
after update of status on public.brand_suggestions
for each row execute function public.sync_brand_fact_on_suggestion_change();

revoke all on function public.sync_brand_fact_on_suggestion_change() from public;
revoke all on function public.sync_brand_fact_on_suggestion_change() from anon;
