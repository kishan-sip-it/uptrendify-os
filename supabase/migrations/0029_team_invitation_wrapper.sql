begin;

create or replace function public.accept_team_invitation(p_token_hash text)
returns jsonb
language sql
security definer
set search_path = public, private
as $$
  select private.accept_team_invitation(p_token_hash);
$$;

revoke all on function public.accept_team_invitation(text) from public, anon, authenticated;
grant execute on function public.accept_team_invitation(text) to authenticated;

commit;