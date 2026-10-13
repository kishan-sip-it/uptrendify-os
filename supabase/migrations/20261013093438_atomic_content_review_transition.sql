-- 0040: Atomically apply content workflow transitions, review records and audit history.
create or replace function public.apply_content_review_transition(
  p_organization_id uuid, p_brand_id uuid, p_content_id uuid,
  p_expected_status text, p_expected_version_id uuid, p_action text, p_comment text default null
)
returns table(status text, review_id uuid)
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_item public.content_items%rowtype;
  v_target public.content_status;
  v_review_id uuid;
  v_comment text := nullif(btrim(p_comment), '');
begin
  if v_actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
  if length(coalesce(v_comment, '')) > 2000 then raise exception 'CONTENT_REVIEW_COMMENT_TOO_LONG' using errcode = '22023'; end if;

  select * into v_item from public.content_items
   where id = p_content_id and brand_id = p_brand_id and organization_id = p_organization_id for update;
  if not found then raise exception 'CONTENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_item.status::text <> p_expected_status or v_item.current_version_id is distinct from p_expected_version_id then
    raise exception 'CONTENT_STATUS_CHANGED_CONCURRENTLY' using errcode = '40001';
  end if;

  case p_action
    when 'submit' then
      if v_item.status::text not in ('DRAFT','CHANGES_REQUESTED','REJECTED') then raise exception 'CONTENT_TRANSITION_NOT_ALLOWED' using errcode = '40001'; end if;
      if v_item.current_version_id is null then raise exception 'CONTENT_VERSION_REQUIRED' using errcode = '22023'; end if;
      v_target := 'IN_REVIEW';
      if not private.has_org_role(p_organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]) then raise exception 'CONTENT_GENERATOR_ROLE_REQUIRED' using errcode = '42501'; end if;
    when 'approve' then
      if v_item.status::text not in ('IN_REVIEW','CLIENT_REVIEW','CHANGES_REQUESTED') then raise exception 'CONTENT_TRANSITION_NOT_ALLOWED' using errcode = '40001'; end if;
      v_target := 'APPROVED';
      if not private.has_org_role(p_organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','APPROVER']::public.org_role[]) then raise exception 'CONTENT_REVIEW_ROLE_REQUIRED' using errcode = '42501'; end if;
    when 'reject' then
      if v_item.status::text not in ('IN_REVIEW','CLIENT_REVIEW','CHANGES_REQUESTED') then raise exception 'CONTENT_TRANSITION_NOT_ALLOWED' using errcode = '40001'; end if;
      v_target := 'REJECTED';
      if not private.has_org_role(p_organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','APPROVER']::public.org_role[]) then raise exception 'CONTENT_REVIEW_ROLE_REQUIRED' using errcode = '42501'; end if;
    when 'changes_requested' then
      if v_item.status::text not in ('IN_REVIEW','CLIENT_REVIEW') then raise exception 'CONTENT_TRANSITION_NOT_ALLOWED' using errcode = '40001'; end if;
      v_target := 'CHANGES_REQUESTED';
      if not private.has_org_role(p_organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','APPROVER']::public.org_role[]) then raise exception 'CONTENT_REVIEW_ROLE_REQUIRED' using errcode = '42501'; end if;
    when 'return_to_draft' then
      if v_item.status::text not in ('IN_REVIEW','CLIENT_REVIEW','CHANGES_REQUESTED','REJECTED','APPROVED','READY_TO_PUBLISH') then raise exception 'CONTENT_TRANSITION_NOT_ALLOWED' using errcode = '40001'; end if;
      v_target := 'DRAFT';
      if not private.has_org_role(p_organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]) then raise exception 'CONTENT_GENERATOR_ROLE_REQUIRED' using errcode = '42501'; end if;
    when 'archive' then
      if v_item.status::text not in ('DRAFT','IN_REVIEW','CLIENT_REVIEW','CHANGES_REQUESTED','APPROVED','REJECTED','READY_TO_PUBLISH') then raise exception 'CONTENT_TRANSITION_NOT_ALLOWED' using errcode = '40001'; end if;
      v_target := 'ARCHIVED';
      if not private.has_org_role(p_organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','EDITOR']::public.org_role[]) then raise exception 'CONTENT_GENERATOR_ROLE_REQUIRED' using errcode = '42501'; end if;
    when 'queue_for_publish' then
      if v_item.status::text <> 'APPROVED' then raise exception 'CONTENT_TRANSITION_NOT_ALLOWED' using errcode = '40001'; end if;
      if v_item.current_version_id is null then raise exception 'CONTENT_VERSION_REQUIRED' using errcode = '22023'; end if;
      v_target := 'READY_TO_PUBLISH';
      if not private.has_org_role(p_organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','APPROVER']::public.org_role[]) then raise exception 'CONTENT_REVIEW_ROLE_REQUIRED' using errcode = '42501'; end if;
    when 'back_to_approved' then
      if v_item.status::text <> 'READY_TO_PUBLISH' then raise exception 'CONTENT_TRANSITION_NOT_ALLOWED' using errcode = '40001'; end if;
      v_target := 'APPROVED';
      if not private.has_org_role(p_organization_id, ARRAY['OWNER','ADMIN','STRATEGIST','APPROVER']::public.org_role[]) then raise exception 'CONTENT_REVIEW_ROLE_REQUIRED' using errcode = '42501'; end if;
    else
      raise exception 'CONTENT_ACTION_INVALID' using errcode = '22023';
  end case;

  update public.content_items set status = v_target, updated_at = now()
   where id = p_content_id and brand_id = p_brand_id and organization_id = p_organization_id
     and status = v_item.status and current_version_id is not distinct from p_expected_version_id
   returning * into v_item;
  if not found then raise exception 'CONTENT_STATUS_CHANGED_CONCURRENTLY' using errcode = '40001'; end if;

  insert into public.content_reviews (organization_id,content_item_id,reviewer_id,content_version_id,decision,comment)
  values (p_organization_id,p_content_id,v_actor,p_expected_version_id,p_action,v_comment)
  returning id into v_review_id;

  insert into public.audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,metadata)
  values (p_organization_id,v_actor,'content.' || p_action,'content',p_content_id,
    jsonb_build_object('from',p_expected_status,'to',v_target::text,'comment',v_comment,'contentVersionId',p_expected_version_id));

  return query select v_item.status::text, v_review_id;
end;
$$;

revoke all on function public.apply_content_review_transition(uuid,uuid,uuid,text,uuid,text,text) from public, anon;
grant execute on function public.apply_content_review_transition(uuid,uuid,uuid,text,uuid,text,text) to authenticated;
comment on function public.apply_content_review_transition(uuid,uuid,uuid,text,uuid,text,text) is
  'Atomically applies a content transition and writes its version-pinned review and audit records.';
