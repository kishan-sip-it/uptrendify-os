-- 0036: prevent anonymous callers from executing the internal membership helper.
begin;

revoke all on function public.is_org_member(uuid) from public, anon, authenticated;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;

commit;
