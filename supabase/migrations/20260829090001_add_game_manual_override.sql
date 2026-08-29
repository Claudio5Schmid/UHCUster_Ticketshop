-- Lets an admin correct a game's date/time, opponent, or venue by hand when Swiss
-- Unihockey is wrong, late, or a game is moved at short notice.
--
-- The problem this solves: the sync (both the Vercel cron and the admin's "Jetzt
-- synchronisieren" button) upserts on external_id, so any hand edit would be silently
-- reverted the next time it ran. Rather than dropping the sync, each game now carries a
-- flag: once an admin edits it by hand, the sync leaves that row's schedule fields alone
-- and keeps managing every other game as before.

alter table public.games
  add column manual_override boolean not null default false;

comment on column public.games.manual_override is
  'True once an admin has hand-corrected this game''s date/opponent/venue. The Swiss Unihockey sync skips schedule fields on such rows so the correction survives the next sync - clear it to hand the game back to automatic syncing.';
