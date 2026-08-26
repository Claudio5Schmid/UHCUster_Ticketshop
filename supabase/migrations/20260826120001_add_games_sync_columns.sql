-- Games now sync automatically from the Swiss Unihockey public API (date, time,
-- venue, opponent) instead of being entered by hand - see src/lib/swissunihockey.ts.
-- external_id lets the sync upsert idempotently (re-running it updates an existing
-- game's date/time/venue in place, e.g. when a game is postponed, rather than
-- creating a duplicate row); venue is new because the sync also carries the gym
-- name, which Phase 3's original games table didn't have a column for.

alter table public.games
  add column venue text,
  add column external_id text unique;

comment on column public.games.external_id is
  'Swiss Unihockey game id (api.swissunihockey.ch), used to upsert idempotently on sync. Null for any game entered by hand instead.';
comment on column public.games.venue is
  'Gym/venue name, synced from Swiss Unihockey (the "gym" element on a game).';
