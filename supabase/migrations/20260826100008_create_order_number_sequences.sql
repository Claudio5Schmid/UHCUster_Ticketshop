create table public.order_number_sequences (
  season text primary key check (season ~ '^[0-9]{4}$'),
  last_seq integer not null default 0
);

alter table public.order_number_sequences enable row level security;
-- No policies: purely internal, touched only by next_order_number() below.

create or replace function public.next_order_number(p_season text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq integer;
begin
  insert into public.order_number_sequences (season, last_seq)
  values (p_season, 1)
  on conflict (season) do update
    set last_seq = public.order_number_sequences.last_seq + 1
  returning last_seq into v_seq;

  return 'UHCU-' || p_season || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

grant execute on function public.next_order_number(text) to authenticated;

comment on table public.order_number_sequences is
  'One row per season, holding the last-used order sequence number so order numbers like UHCU-2627-0001 can be generated atomically under concurrent checkouts.';
