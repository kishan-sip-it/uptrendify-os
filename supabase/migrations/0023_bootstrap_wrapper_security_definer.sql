-- 0023: make the authenticated bootstrap wrapper SECURITY DEFINER.
-- The public wrapper is still executable only by authenticated users. Running as
-- the function owner lets it safely call the private SECURITY DEFINER
-- implementation, whose direct EXECUTE privilege remains revoked.
create or replace function public.bootstrap_organization(organization_name text)
returns table (
  id uuid,
  role public.org_role,
  name text
)
language sql
security definer
set search_path = public, private
as $$
  select * from private.bootstrap_organization_impl(organization_name);
$$;

revoke all on function public.bootstrap_organization(text) from public;
revoke all on function public.bootstrap_organization(text) from anon;
grant execute on function public.bootstrap_organization(text) to authenticated;
