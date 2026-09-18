-- 0022: avoid per-row auth initialization in the content review insert policy.
-- Supabase's RLS advisor flags auth.uid() directly inside a policy predicate
-- because the expression can be re-evaluated for every row.
drop policy if exists content_reviews_insert_workflow on public.content_reviews;

create policy content_reviews_insert_workflow on public.content_reviews
  for insert
  with check (
    reviewer_id = (select auth.uid())
    and (
      (
        decision in ('approve','reject','changes_requested')
        and private.has_org_role(
          organization_id,
          ARRAY['OWNER','ADMIN','STRATEGIST','APPROVER']::public.org_role[]
        )
      )
      or
      (
        decision in ('submit','return_to_draft','archive')
        and private.has_org_role(
          organization_id,
          ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]
        )
      )
    )
  );
