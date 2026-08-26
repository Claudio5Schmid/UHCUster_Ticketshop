-- Phase 7: scanner PWA support.
--
-- Redemption is tracked per game, not per ticket for life: a season pass or Red
-- Castle Club membership is valid at every home game all season (that is the
-- entire point of a season pass), so "already redeemed" must mean "already
-- redeemed for THIS game", not "used up forever". tickets.status stays gueltig
-- for the whole season; scan_events.game_id is what "already redeemed" is scoped
-- against. tickets.status only ever moves to storniert/ersetzt (voided/replaced) -
-- 'eingeloest' stays in the CHECK constraint for forward compatibility but is not
-- used by anything built in this phase.
-- Table is empty in production (verified before writing this migration), so this
-- can go straight to NOT NULL rather than needing a backfill step.
alter table public.scan_events add column game_id uuid references public.games (id) not null;

create index scan_events_game_id_idx on public.scan_events (game_id);

comment on column public.scan_events.game_id is
  'Which game this scan happened at - redemption ("already_redeemed") is scoped per game, since a season pass is valid at every home game, not single-use.';

-- Scanner device access: a per-game code, kept in its own table (not a column on
-- games) so the public "Anyone can view games" policy on public.games can never
-- accidentally expose it - only admins (via their own session) and the
-- code-verification Route Handler (via the service-role client) ever read this.
create table public.game_scanner_codes (
  game_id uuid primary key references public.games (id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.game_scanner_codes enable row level security;

create trigger set_game_scanner_codes_updated_at
  before update on public.game_scanner_codes
  for each row
  execute function public.set_updated_at();

create policy "Admins can view scanner codes"
  on public.game_scanner_codes for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert scanner codes"
  on public.game_scanner_codes for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update scanner codes"
  on public.game_scanner_codes for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.game_scanner_codes is
  'One access code per game, set by an admin and given to match-day helpers. Verified by a Route Handler using the service-role client (helpers never get a real Supabase Auth session - see docs/ARCHITECTURE.md Phase 7 section), then exchanged for a short-lived signed session token scoped to that game only.';
