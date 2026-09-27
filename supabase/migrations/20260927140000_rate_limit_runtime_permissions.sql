-- 20260927140000: Keep durable rate-limit runtime permissions synchronized.

-- The limiter function uses the private schema under the server-only
-- service_role. Keep this explicit so a fresh environment cannot fail with
-- "permission denied for schema private".
grant usage on schema private to service_role;

grant select, insert, update, delete
  on table private.rate_limit_buckets
  to service_role;

revoke all
  on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;

grant execute
  on function public.consume_rate_limit(text, integer, integer)
  to service_role;
