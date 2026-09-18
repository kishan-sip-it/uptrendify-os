-- 0018: Lock private trigger helper search paths for deterministic SECURITY DEFINER/trigger execution.

alter function private.enforce_content_status_transition() set search_path = public, private;
alter function private.enforce_research_status_transition() set search_path = public, private;
alter function private.enforce_strategy_status_transition() set search_path = public, private;
alter function private.assert_tenant_integrity() set search_path = public, private;

revoke all on function private.enforce_content_status_transition() from public, anon, authenticated;
revoke all on function private.enforce_research_status_transition() from public, anon, authenticated;
revoke all on function private.enforce_strategy_status_transition() from public, anon, authenticated;
revoke all on function private.assert_tenant_integrity() from public, anon, authenticated;
