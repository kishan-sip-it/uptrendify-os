begin;

-- The original 0027 migration owns the private implementation. A stale local
-- migration history can have 0027 marked applied while that function is absent.
-- Do not make the migration chain fail just because the implementation is
-- missing; the schema-recovery section in 0030 recreates it idempotently.
do $$
begin
  if to_regprocedure('private.accept_team_invitation(text)') is not null then
    execute $sql$
      create or replace function public.accept_team_invitation(p_token_hash text)
      returns jsonb
      language sql
      security definer
      set search_path = public, private
      as $fn$
        select private.accept_team_invitation(p_token_hash);
      $fn$;

      revoke all on function public.accept_team_invitation(text) from public, anon, authenticated;
      grant execute on function public.accept_team_invitation(text) to authenticated;
    $sql$;
  end if;
end
$$;

commit;
