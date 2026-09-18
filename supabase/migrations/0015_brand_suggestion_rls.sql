-- 0015: Close the remaining broad Brand Brain suggestion policy.

drop policy if exists suggestions_all_member on public.brand_suggestions;

create policy suggestions_select_member on public.brand_suggestions
  for select using (private.is_org_member(organization_id));

create policy suggestions_insert_reviewer on public.brand_suggestions
  for insert with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy suggestions_update_reviewer on public.brand_suggestions
  for update
  using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]))
  with check (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));

create policy suggestions_delete_reviewer on public.brand_suggestions
  for delete using (private.has_org_role(organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]));
