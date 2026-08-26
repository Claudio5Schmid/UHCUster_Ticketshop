-- Phase 8.1: rate limiting on the order endpoint (brief's explicit security-pass
-- ask). Every call to submitOrder() records an attempt here first, regardless of
-- whether Turnstile or create_order() later succeed - the point is to fail fast,
-- before doing the more expensive Turnstile round-trip, if an IP is already over
-- the threshold. Small volume by this shop's nature (a few hundred orders across
-- a season, not per minute), so no cleanup job for old rows yet - noted in
-- docs/BACKLOG.md if it ever needs one.
create table public.order_rate_limits (
  id bigint generated always as identity primary key,
  ip_address text not null,
  created_at timestamptz not null default now()
);

alter table public.order_rate_limits enable row level security;

create index order_rate_limits_ip_created_idx on public.order_rate_limits (ip_address, created_at);

comment on table public.order_rate_limits is
  'One row per checkout attempt (Server Action call), keyed by client IP - read/written only by check_order_rate_limit(), never exposed to anon/authenticated directly.';

-- Atomic check-and-record: counts recent attempts from this IP, then always
-- records this attempt too (even if it's the one that trips the limit), so a
-- sustained attacker doesn't get a free re-count window.
create or replace function public.check_order_rate_limit(p_ip text, p_max_attempts integer, p_window_minutes integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.order_rate_limits
  where ip_address = p_ip and created_at > now() - (p_window_minutes || ' minutes')::interval;

  insert into public.order_rate_limits (ip_address) values (p_ip);

  return v_count < p_max_attempts;
end;
$$;

revoke execute on function public.check_order_rate_limit(text, integer, integer) from public, anon, authenticated;
