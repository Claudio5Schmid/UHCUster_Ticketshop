-- Two scanner devices can both see a ticket as "not yet redeemed" locally an
-- instant before either one's Realtime broadcast arrives (the brief's own
-- acknowledged residual risk of offline-first, multi-device scanning). A partial
-- unique index makes the database the final arbiter: only one 'accepted' scan can
-- ever exist per (ticket, game), so a concurrent second acceptance attempt fails
-- the constraint instead of racing - the API route catches that and reports
-- already_redeemed instead of silently double-accepting.
create unique index scan_events_one_accept_per_ticket_per_game
  on public.scan_events (ticket_id, game_id)
  where result = 'accepted' and ticket_id is not null;
