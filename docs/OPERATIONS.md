# Operations — UHC Uster Ticket Shop

Started in Phase 7 (the scanner's residual double-scan risk), completed in Phase 8
with the rest of the brief's operations checklist: scanner failure procedures, order
cancellation, ticket reissue, and who holds which credentials.

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

## When a scanner fails on match day

1. **Camera won't start / permission denied:** the scanner page shows "Kamerazugriff
   nicht möglich" and falls back to a manual entry field automatically - the token
   printed under the QR code on each ticket PDF can be typed in directly, so the door
   doesn't have to stop. No separate fallback device is required.
2. **Device won't load `/scanner` at all (fully offline before the initial ticket
   download):** there is nothing to validate against locally yet - move that helper to
   a door with working connectivity, or wait for signal before starting that device's
   session. Once the initial download succeeds, the device is fine even if the network
   drops afterward (see the residual-risk section above).
3. **Device crashes or is restarted mid-game:** just log back in at `/scanner` with the
   same game and code. The ticket download always reflects current redemption state
   (already-scanned tickets come back marked as such), so nothing is lost or
   double-countable from a restart alone.
4. **Suspected double-scan / discrepancy after the game:** `scan_events` is the
   authoritative, append-only record of every attempt, with device and timestamp - an
   admin can review it directly in Supabase (no admin UI view of raw scan_events exists
   yet; noted in `docs/BACKLOG.md`).

## Cancelling an order

Set the order's status to "Storniert" on its detail page (`/admin/orders/[nummer]`).
This is a manual, deliberate action for a manual, deliberate reason (e.g. a customer
asked to cancel, a duplicate order) - there is no automatic refund, since this system
never processes payment (D-none: it only ever recorded whether a bank transfer arrived
manually). If a refund is actually owed, also toggle "Rückerstattung offen" on -
that flag exists purely so the office has a checklist of who still needs a manual bank
transfer back. Cancelling an order does **not** retroactively void any tickets already
issued for it - if tickets were already handed out for a now-cancelled order, void them
individually via `reissue_ticket`'s sibling concept (see below) or, if simpler for a
single stray ticket, contact whoever can run a one-off SQL update (no admin UI action
exists yet for "just void this one ticket without replacing it" - noted in
`docs/BACKLOG.md`).

## Reissuing a lost ticket

There is a `reissue_ticket(old_ticket_id, new_token, new_holder_name?)` database
function (Phase 1, tested in `supabase/tests/rls_test.sql`) that voids the old ticket
(status `ersetzt`, never deleted) and creates a linked replacement with a fresh token.
**No admin UI page calls this yet** - reissuing today means running it directly against
the database (Supabase SQL editor, as an admin session so `auth.uid()` attributes it
correctly) with a freshly generated token from `src/lib/tickets/token.ts`'s scheme, and
manually re-rendering/re-sending that ticket's PDF. Building a proper "Ticket verloren"
button on the order detail page is tracked in `docs/BACKLOG.md` - not needed for launch
since lost-ticket reports are expected to be rare and low-volume early on.

## Who holds which credentials

- **Supabase project** (`oojixascgoxdxzlwomrt`, org "UHC Uster"): Claudio's Supabase
  account. `SUPABASE_SERVICE_ROLE_KEY` lives only in `.env.local` and in Vercel's
  environment variables - never in the repo, never seen by Claude.
- **Vercel project** (`uhc-uster-ticketshop`, org "UHC Uster"): Claudio's Vercel
  account, connected to the GitHub repo for auto-deploy on push to `main`.
- **GitHub repo** (`Claudio5Schmid/UHCUster_Ticketshop`): Claudio's GitHub account.
- **Admin accounts** (`admin_users` / Supabase Auth): created via the one-time
  `/admin/setup` form (D26) - each admin sets their own password directly in the app,
  never told to Claude. Adding a *second* admin has no dedicated UI yet (`/admin/setup`
  disables itself after the first account exists) - today that means inserting a row
  into `admin_users` directly via SQL after the person has their own Supabase Auth
  user, which isn't self-service yet either. Tracked in `docs/BACKLOG.md`.
- **Scanner codes** (`game_scanner_codes`): not really a "credential" in the security
  sense - a shared per-game string, set by any admin, given verbally/by message to
  match-day helpers.
- **Cloudflare Turnstile site**: Claudio's Cloudflare account.
- **`TICKET_TOKEN_SECRET` / `SCANNER_SESSION_SECRET`**: locally-generated random
  strings (not tied to any external account), living only in `.env.local` and Vercel's
  environment variables.

## Supabase spend cap

Supabase Pro projects can set a spend cap so usage beyond the plan's included quota is
throttled rather than silently billed. **Recommendation: keep the spend cap enabled**
(Supabase project settings → Billing → Spend Cap), since this shop's traffic pattern is
predictable and spiky in a way that's easy to reason about - steady low background
traffic, with two sharp spikes: pass sales opening (5 September) and match days
(scanner + live view, "1,500 scans" per the brief's own scale target). Neither spike
should come close to Pro-tier included quotas for a club of this size, so the spend cap
is a safety net against a runaway bug (e.g. an infinite retry loop), not something
expected to actually trigger. Check it's still enabled after any plan/org changes -
Supabase does not always carry it forward automatically.

## Auth hardening

Supabase's security advisor flags "leaked password protection" as disabled by default
- it checks new admin passwords against HaveIBeenPwned's breach corpus at signup/
password-change time. **Recommended: enable it** (Supabase dashboard → Authentication →
Policies → Password security) - free, no code change, and the only accounts it
protects (admins) are exactly the ones worth protecting most. Not enabled automatically
here since it's an auth-service setting, not something reachable via a SQL migration.
