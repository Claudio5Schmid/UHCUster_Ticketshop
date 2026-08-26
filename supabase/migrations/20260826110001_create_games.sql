-- Home games schedule (Phase 3 needs this for the individual-games list and the
-- landing page's savings calculation; Phase 1's table list didn't include it - the
-- brief only introduces schedule management in Phase 5.4, but the public shop needs
-- somewhere to read it from now).
create table public.games (
  id uuid primary key default gen_random_uuid(),
  season text not null check (season ~ '^[0-9]{4}$'),
  opponent text not null,
  played_at timestamptz not null,
  eventfrog_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.games enable row level security;

create index games_season_played_at_idx on public.games (season, played_at);

create trigger set_games_updated_at
  before update on public.games
  for each row
  execute function public.set_updated_at();

-- Public schedule information - readable by anyone, same spirit as active products.
create policy "Anyone can view games"
  on public.games for select
  to anon, authenticated
  using (true);

create policy "Admins can insert games"
  on public.games for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update games"
  on public.games for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.games is
  'UHC Uster home games for a season - date, opponent, and the Eventfrog link for single tickets. Publicly readable; only admins can add or edit rows. No away games (this shop only ever links out for UHC Uster''s own home games).';
