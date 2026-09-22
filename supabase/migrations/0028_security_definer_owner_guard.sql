begin;

create or replace function private.guard_last_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  remaining integer;
begin
  if tg_op = 'DELETE' then
    if old.role = 'OWNER' then
      select count(*) into remaining
      from public.organization_members
      where organization_id = old.organization_id and role = 'OWNER' and id <> old.id;
      if remaining < 1 then raise exception 'LAST_OWNER_PROTECTED'; end if;
    end if;
    return old;
  end if;

  if old.organization_id <> new.organization_id then raise exception 'ORGANIZATION_CHANGE_NOT_ALLOWED'; end if;
  if old.user_id <> new.user_id then raise exception 'MEMBER_IDENTITY_CHANGE_NOT_ALLOWED'; end if;

  if old.role = 'OWNER' and new.role <> 'OWNER' then
    select count(*) into remaining
    from public.organization_members
    where organization_id = new.organization_id and role = 'OWNER' and id <> new.id;
    if remaining < 1 then raise exception 'LAST_OWNER_PROTECTED'; end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_last_owner_member() from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
grant execute on function private.guard_last_owner_member() to authenticated, service_role;

commit;