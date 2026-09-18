-- 0013: Make Brand Brain review status the source of truth for authoritative facts.

create or replace function public.sync_brand_fact_on_suggestion_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  evidence_ids uuid[];
begin
  if new.status in ('APPROVED','EDITED') then
    if new.proposed_value is null then
      raise exception 'APPROVED_SUGGESTION_REQUIRES_VALUE';
    end if;

    select coalesce(
      array_agg((entry->>'sourceId')::uuid) filter (
        where entry->>'sourceId' is not null
          and (entry->>'sourceId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ),
      '{}'::uuid[]
    )
    into evidence_ids
    from jsonb_array_elements(coalesce(new.evidence, '[]'::jsonb)) entry;

    insert into public.brand_facts (
      organization_id,
      brand_id,
      key,
      value,
      source_type,
      confidence,
      evidence_source_ids,
      approved,
      source_suggestion_id,
      updated_at
    )
    values (
      new.organization_id,
      new.brand_id,
      new.field,
      new.proposed_value,
      'USER_CONFIRMED',
      new.confidence,
      evidence_ids,
      true,
      new.id,
      now()
    )
    on conflict (brand_id, key) do update
      set value = excluded.value,
          source_type = excluded.source_type,
          confidence = excluded.confidence,
          evidence_source_ids = excluded.evidence_source_ids,
          approved = true,
          source_suggestion_id = excluded.source_suggestion_id,
          updated_at = now();

  elsif new.status in ('PENDING','REJECTED','NOT_FOUND') then
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

revoke all on function public.sync_brand_fact_on_suggestion_change() from public;
revoke all on function public.sync_brand_fact_on_suggestion_change() from anon;

-- Backfill provenance for facts previously created by the review pipeline.
update public.brand_facts bf
set source_suggestion_id = bs.id
from public.brand_suggestions bs
where bf.source_suggestion_id is null
  and bf.organization_id = bs.organization_id
  and bf.brand_id = bs.brand_id
  and bf.key = bs.field
  and bs.status in ('APPROVED','EDITED');

