-- 0032: Durable server-side rate-limit state.

create schema if not exists private;

create table if not exists private.rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint rate_limit_buckets_count_check check (request_count >= 0)
);

create index if not exists rate_limit_buckets_updated_at_idx
  on private.rate_limit_buckets (updated_at);

revoke all on table private.rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table private.rate_limit_buckets to service_role;

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_count integer;
  v_window_started_at timestamptz;
  v_reset_at timestamptz;
begin
  if p_bucket_key is null or length(trim(p_bucket_key)) = 0 then
    raise exception 'Rate limit bucket key is required';
  end if;
  if p_limit < 1 then
    raise exception 'Rate limit must be positive';
  end if;
  if p_window_seconds < 1 then
    raise exception 'Rate limit window must be positive';
  end if;

  insert into private.rate_limit_buckets as buckets (
    bucket_key,
    window_started_at,
    request_count,
    updated_at
  )
  values (p_bucket_key, now(), 1, now())
  on conflict (bucket_key) do update
  set
    window_started_at = case
      when now() >= buckets.window_started_at + make_interval(secs => p_window_seconds)
        then now()
      else buckets.window_started_at
    end,
    request_count = case
      when now() >= buckets.window_started_at + make_interval(secs => p_window_seconds)
        then 1
      else buckets.request_count + 1
    end,
    updated_at = now()
  returning request_count, window_started_at
  into v_count, v_window_started_at;

  v_reset_at := v_window_started_at + make_interval(secs => p_window_seconds);

  return query
    select v_count <= p_limit, greatest(p_limit - v_count, 0), v_reset_at;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

comment on table private.rate_limit_buckets is 'Server-side application rate-limit state. Not exposed through the Supabase Data API.';
comment on function public.consume_rate_limit(text, integer, integer) is 'Atomic server-side rate-limit bucket consumption. Execute only with the server service role.';
