# Operations — UHC Uster Ticket Shop

Started in Phase 7, per the brief's explicit instruction to document the scanner's
residual double-scan risk here. The fuller operations manual (scanner failure
procedures, order cancellation, ticket reissue, who holds which credentials) is a
Phase 8 deliverable - this file will grow then.

## Residual risk: double-scanning during a network partition

The scanner is offline-first by design (`src/lib/scanner/useScannerEngine.ts`): every
device downloads the full ticket set once, before doors open, and decides
accept/reject locally and instantly from then on. The server call after each scan is
what makes that decision authoritative across devices - it's what actually enforces
"only once" via a database constraint (a unique index on `scan_events (ticket_id,
game_id) where result = 'accepted'`), and what lets other devices find out about a
redemption a moment later (broadcast over a Supabase Realtime channel scoped to that
game).

**If a device's network drops (or degrades badly) mid-game**, it keeps scanning on
its own local copy of the ticket set, exactly as designed - that's the point of the
offline-first architecture, and it's what lets the door keep moving during a
connectivity blip instead of stopping. But it means:

- That device's local "already redeemed" state stops updating from other devices'
  scans. If the same ticket is shown at that device and at another (working) device
  within the outage window, **both could show "Zutritt gewährt"** - the unique
  database constraint still prevents a second `accepted` row once connectivity
  returns, but the door staff have already, physically, let both people through.
- This is a known, accepted tradeoff (the brief calls for exactly this behavior:
  "if the network drops, each device keeps scanning independently and syncs later"),
  not a bug to be fixed - the alternative (refusing every scan without a live network
  round-trip) would make the whole scanner unusable during exactly the kind of patchy
  stadium connectivity it's meant to survive.
- **Mitigation in practice:** keep the number of simultaneous scanner devices per
  entrance small (one device per physical door is enough to make this scenario rare
  in the first place - it only bites when the *same* ticket is shown at *two*
  different doors within the same short outage), and treat the `scan_events` table as
  the source of truth for reconciliation after the game if a discrepancy is ever
  suspected (every scan attempt is logged there, append-only, including which device
  and when).
- There is no automatic reconciliation step beyond what the unique constraint and
  Realtime broadcast already do. Building an active "detect and flag double-lets" job
  is out of scope for the MVP - noted here for Phase 8 / `docs/BACKLOG.md` if it turns
  out to matter in practice after the first few games.

## Scanner access codes

Each game has its own scanner access code, set by an admin on `/admin/schedule`
(`game_scanner_codes`, one row per game). Helpers get the code for that specific game
and enter it once at `/scanner`, along with a label for their device (e.g. "Haupteingang
1") - this is not a personal login, just a shared per-game secret, since helpers are
match-day volunteers, not accounts that need individual audit attribution (unlike
admin actions, which do - see `docs/ARCHITECTURE.md`). Rotate the code between games
by simply typing a new one in; there is nothing to "revoke" beyond that.
