# Data Model — UHC Uster Ticket Shop

Target project: Supabase `oojixascgoxdxzlwomrt` ("UHC Uster - Ticketshop"). Schema is defined by the
versioned migrations in `supabase/migrations/`, applied in filename order; this document explains
what each table is for, not how to build it — read the migrations for exact column definitions.

## products

Season-pass variants and Red Castle Club memberships shown in the shop; `tier_level` drives the
price-dependent visual treatment (Phase 2/3), and `benefits` (jsonb) holds the free-text/structured
perks per tier — including an optional `single_ticket_price_rappen` on plain season passes (the
reference figure the landing page uses to calculate, never hand-type, the "you save" amount), and
`included_passes`/`transferable` on Red Castle Club tiers (Phase 4), which `create_order()` reads to
decide how many tickets a purchase produces and whether they share one holder label. Publicly
readable where `active = true`; every other read/write is admin-only, and products are deactivated
rather than deleted so historical orders always resolve to a real row.

## price_history

An append-only ledger of every price a product has ever had, populated automatically by a trigger on
`products` whenever `price_rappen` changes (and seeded on product creation, so history is complete
from day one). Admins can read it; nobody, including admins, can write to it directly or edit/delete
a row — enforced by a database trigger, not just convention.

## order_number_sequences

A tiny internal counter, one row per season, used by `next_order_number()` to generate order numbers
like `UHCU-2627-0001` atomically under concurrent checkouts. No RLS policies at all — it's touched
exclusively by that function.

## orders

One row per customer order, tracking its lifecycle status (`neu → rechnung_versendet → bezahlt →
storniert`) and a separate `refund_owed` flag for the case where an already-paid order needs a manual
bank transfer back (there's no payment provider to detect this automatically — see `docs/DECISIONS.md`
D16). `total_rappen` is maintained automatically from `order_items`, never supplied directly. Admins
can read all orders; there is no insert/update policy for anyone — every creation and status/refund
change goes through a `SECURITY DEFINER` function (see below), never a bare write.

## order_items

The frozen line items of an order: product, quantity, holder name, and the exact unit price at the
moment of purchase — immune to later price changes on `products`. `holder_name` is collected at
checkout, before a ticket row exists; personal (non-transferable) lines are one holder per line
(quantity 1), while a Red Castle Club bundle line carries a shared label (e.g. a company name) across
its quantity of transferable passes. Admin-readable only, and immutable once written — "price frozen
at order time" is a structural guarantee, not a convention.

## customers

Contact and address details for the person or entity an order belongs to, with an optional
membership number for club members who arrive via the (future) CSV import rather than a shop order.
Admin-managed only; no public access, no delete policy.

## tickets

One row per issued season pass or membership pass: its scan token, holder name (a real person for
personal passes, a shared label for transferable Red Castle Club batches), a `transferable` flag,
status (`gueltig | eingeloest | storniert | ersetzt`), and (Phase 6) `pdf_path` - where its generated
PDF lives in the private `tickets` Storage bucket. A lost ticket is never deleted — it's voided
(`ersetzt`) and linked to its replacement via `replaces_ticket_id`, so the reissue chain stays
auditable. Admin-readable only; holder-name changes, reissues, and initial issuance
(`issue_tickets_for_order`, Phase 6) all go through logged functions, never a bare write.

## scan_events

An append-only record of every scan attempt at the door, whether or not it resolved to a real ticket
(`ticket_id` is nullable for exactly that reason), including the device, which game (`game_id`, Phase
7 — not nullable, every scan happens at a specific game), and the accept/reject reason. Admin-readable
via the existing `is_admin()`-gated policy; scanner devices never get a real Supabase Auth session at
all (D32), so their writes go through the service-role client from `/api/scanner/scan` after that
route verifies a signed scanner-session token itself — RLS on this table is unchanged from Phase 1,
since service-role bypasses it entirely and that's fine here (the route's own token check is the real
gate). Never updatable or deletable by anyone, enforced by a trigger — including via the service-role
client, which is exactly the point of a database-level (not just RLS-level) append-only guarantee.

"Already redeemed" is scoped per `(ticket_id, game_id)`, not per ticket for life (D31) — a season pass
is valid at every home game, so `tickets.status` never actually reaches `'eingeloest'` in this phase;
a partial unique index (`scan_events_one_accept_per_ticket_per_game`, on `(ticket_id, game_id) where
result = 'accepted'`) is the real, database-enforced answer to "has this been scanned already", not
application logic — it's also what settles the race between two devices scanning the same ticket
near-simultaneously.

## game_scanner_codes

One access code per game (Phase 7), so match-day helpers can start the `/scanner` PWA without an
admin account (D32). Deliberately its own table rather than a column on `games`, so the existing
public "Anyone can view games" policy can never accidentally expose it — only admins (their own
session) and the `/api/scanner/session` Route Handler (service-role) ever read it.

## admin_users

The flat access list for the club office admin area — no role differentiation yet, by design (see
`docs/DECISIONS.md` D15). Backs the `is_admin()` helper that every other table's RLS policies call.
**The very first row can't be inserted through the app's normal admin session** — no admin exists yet
to satisfy the `is_admin()` check on its own insert policy — so `/admin/setup` (Phase 5) handles it
via a one-time Server Action using the service-role client, disabled the moment this table has any
row at all. See `docs/DECISIONS.md` D26.

## audit_log

A generic, append-only trail covering order status/refund-owed transitions (including the automatic
14-day cancellation of unpaid orders, logged with `actor_type = 'system'`), ticket holder-name
changes and reissues, and non-price product edits (name/description/benefits/tier_level/sort_order/
active). Kept separate from `price_history`, which is scoped strictly to prices per its own name and
the brief's Phase 1 definition — see `docs/DECISIONS.md` D18 for the reasoning. Admin-readable only;
populated exclusively by the `SECURITY DEFINER` mutation functions and the auto-cancel job.

## games

Added in Phase 3, not Phase 1 — the brief's Phase 1 table list didn't include a schedule table, but
the public shop's individual-games list and the landing page's savings calculation both need one.
Home games only (date, time, venue, opponent, optional Eventfrog link) for a season; publicly
readable, same as active products, since a schedule isn't sensitive.

Rows are populated automatically by a daily sync from the public Swiss Unihockey API
(`src/lib/swissunihockey.ts`, `/api/sync/swissunihockey`), not typed in by hand (see
`docs/DECISIONS.md` D21) — `external_id` is the Swiss Unihockey game id, used to upsert idempotently
so a postponed game updates in place instead of duplicating. Admins can still add or edit rows
directly (e.g. to set `eventfrog_url`, which the sync never touches) via `/admin/schedule` (Phase 5),
which also has a manual "sync now" button running the same upsert on demand through the admin's own
session instead of waiting for the daily cron.

## members

Added post-Phase-8 for distributing membership cards to existing club members going forward — not a
migration of any pre-existing QR codes (explicitly deferred, see `docs/BACKLOG.md`). One row per
member: `vorname`/`nachname`/`email`, `kategorie` (free-text label only, no product-tier mapping — see
`docs/DECISIONS.md` D38), `mitgliederkarte` (boolean — personal, non-transferable card), and
`transferable_code_count` (how many additional transferable codes they get; the two are independent
and can combine on the same member). `order_id` links to the `orders` row created for them once cards
are generated (nullable until then); `cards_sent_at` is set once their email actually goes out, and is
the sole marker of "already sent" — re-running an import or re-clicking "add member" never
double-sends. Admin-only RLS (select/insert/update, no delete — matches every other admin-managed
table in this schema).

## Mutation functions (not tables, but part of the data layer)

Every write to `orders`, `tickets`, and non-price fields of `products` goes through one of:
`transition_order_status`, `set_refund_owed`, `rename_ticket_holder`, `reissue_ticket`,
`update_product_details`, `issue_tickets_for_order` (Phase 6), `set_files_handed_over` (Phase 6). Each
checks `is_admin()` internally, performs its change, and writes the matching `audit_log` row
atomically. They're callable only by `authenticated` sessions (not `anon`), and are meant to be called
through the admin's own authenticated session — not a shared service-role connection — so that
`auth.uid()` correctly attributes each change to the admin who made it. A further function,
`next_order_number`, has no client-facing grant either - it's only ever called from inside
`create_order()`.

`issue_tickets_for_order(order_id, tickets)` takes fully-formed ticket rows (id, token, pdf_path -
each generated in Node, since the HMAC secret and the rendered PDF both belong there, not in
Postgres), checks the order is actually `bezahlt`, checks none of its order items already have
tickets (so it can't be called twice for the same order), and inserts them all in one transaction.

`create_order(customer, lines, season)` (Phase 4) is the entire checkout write path: creates the
customer and order rows, generates the order number, and for each line resolves the product's
*current* price and quantity itself - the caller only ever supplies a product id and a holder name,
never a price, so there is nothing for a tampered request to override. System-only, like
`auto_cancel_stale_orders`: no grant to `anon` or `authenticated`, callable only via a service-role
connection from the checkout Server Action, which verifies Cloudflare Turnstile first (Postgres has
no good synchronous way to do that itself).

`auto_cancel_stale_orders()` runs only via a daily `pg_cron` schedule; it has no client-facing grant
at all, since it's a system job, not an admin action.

`create_member_order(customer_name, email, include_personal, transferable_count, season)`
(post-Phase-8) mirrors `create_order()`'s shape but for admin-initiated member card grants rather than
a paid checkout: creates the customer and an already-`bezahlt` order (there's no payment to wait for),
then inserts one `order_item` for the personal card product (`mitglieder-uhc-uster`, qty 1) if
requested and/or one for the transferable product (`mitglieder-uhc-uster-uebertragbar`, qty N) if
`transferable_count > 0` — reusing the existing Phase 6 `issue_tickets_for_order`/PDF pipeline
unchanged, since to that code a member-card order looks exactly like any other paid order (see
`docs/DECISIONS.md` D38). Admin-only (`is_admin()` check, `authenticated`-only grant), same pattern as
every other mutation function above.

## RLS verification

`supabase/tests/rls_test.sql` is a 105-assertion pgTAP suite (run via the Supabase SQL editor or
`execute_sql`, wrapped in a rolled-back transaction) covering: the public/admin product split, full
lockout of `anon` and non-admin `authenticated` sessions across every other table, that bare
writes to `orders`/`tickets` have no effect while the dedicated functions succeed and log correctly,
that the three append-only tables reject direct mutation even at owner level, order-number
generation, the auto-cancel job, `create_order()` (system-only access, and that a tampered price
injected into a line is silently ignored in favour of the real product price), Phase 6's
`issue_tickets_for_order`/`set_files_handed_over`, Phase 7/8's `game_scanner_codes` and
`check_order_rate_limit`, and the post-Phase-8 member-import additions (`create_member_order` access
control and output shape, `members` table RLS). All 105 pass as of this writing.

Phase 7's scanner writes aren't in this suite: they don't go through a `SECURITY DEFINER` Postgres
function at all (see D32) — `/api/scanner/scan` verifies its own signed session token and writes via
the service-role client, so there's no RLS/function boundary here for pgTAP to exercise. That flow was
instead verified by hand against the real dev server and database (session exchange, all five scan
outcomes, the live-stats counts) — see the Phase 7 summary in the session log for what was checked.
