# Decisions Log — Phase 0.5 and onward

Numbered, dated log. This grows over the project as questions get answered — it is not written once
at the end. Each entry states the decision, and whether it's fully resolved or still has open
mechanics.

## 2026-08-26

**D1 — Supabase project.** Resolved. Fourth check (2026-08-26) now shows organization **"UHC Uster"**
(`bnirgraefcptnihcliag`) with a single project **"UHC Uster - Ticketshop"**
(`oojixascgoxdxzlwomrt`, ref `oojixascgoxdxzlwomrt`, region `eu-central-1`, Postgres 17,
`ACTIVE_HEALTHY`, no tables yet — clean slate). The old "Büsnei from CS" org/projects are no longer
visible through this connection at all, confirming it was a connector-authorization issue, not a
Supabase-side one. **This is the project Phase 1 migrations will target.**

Follow-up, not blocking: the org's plan is **Free**, not **Pro** as the brief's hard constraints
assume. Free-tier projects auto-pause after a week of inactivity and have lower resource/backup
limits (no point-in-time recovery). Doesn't block starting Phase 1 (migrations work identically on
Free), but should be upgraded before real customer/payment-adjacent data and before 5 September go-
live, given money and personal data are involved. Flagging for Claudio's awareness; not re-asking as
a blocking question since Phase 1 can proceed regardless.

**D2 — Design baseline.** `docs/uhcusterdesignanalyse.md` is the design source of truth for Phase 2
(colours, type scale, spacing). No conflict with the brief's colour mandate. **Resolved.**

**D3 — Red Castle Club pricing.** The 4-tier structure is authoritative: Gold 5000.-, Silber 2500.-,
Bronze 1000.-, Normal 300.- (benefits as given in the brief's price list, including bundled
transferable VIP season passes for Gold/Silber/Bronze and a personal, non-transferable pass for
Normal). The 2-tier figures seen in the screenshot ('normal' 250.-, 'plus' ab 550.-) do not apply —
per Claudio, the screenshot only ever covered single-entry/season-pass pricing for regular fans, not
Red Castle Club. **Resolved.**

**D4 — Red Castle Club in scope for MVP self-service.** Yes, all four tiers are purchasable through
the shop for the MVP — not deferred to later. **Resolved**, mechanics of assigning bundled passes
still open (see below).

**D5 — Ticket transferability model.** Two classes of ticket:
- **Non-transferable, personal** season pass — the default for any normal shop order, and for the
  CSV-imported club member base (D7).
- **Transferable, multi-holder** season pass — bundled into Red Castle Club Gold/Silber/Bronze
  orders (3/2/2 passes respectively), and additionally granted to specific members (e.g. trainers,
  players) on top of their personal CSV-imported pass.

  **Mechanics resolved:** Option B chosen — a transferable pass can be used by any person holding
  the QR code, no name is collected per pass at checkout. Instead, `holder_name` on a transferable
  ticket stores the **company/sponsor name shared across the whole batch** (Claudio's example:
  "Firma Accum"). The scanner/admin view needs to show redemption progress per batch — e.g.
  "9/10 gescannt — Firma Accum". This falls out of the existing schema for free: all tickets in one
  Red Castle Club order share an `order_item`, so "X/Y redeemed" is just a count of `tickets` with
  status `eingelöst` within that `order_item`, grouped/labelled by the shared `holder_name`. No new
  table needed, just: `holder_name` optional/shared-per-batch instead of always-per-person, and an
  admin/scanner UI element for batch progress. **Resolved.**

**D6 — Ticket loss / reissue.** Confirmed ("ja das passt"): soft-void the old `tickets` row (status
`storniert`/`ersetzt`) rather than a hard delete, when a lost pass is reissued. Keeps an audit trail;
functionally the old QR is dead either way. **Resolved.**

**D7 — Club members (CSV import).** "Mitglieder UHC Uster" do not buy through the shop. They are
imported in bulk via CSV from the club's existing membership system directly into this database, and
receive a season pass (a new, non-transferable ticket) through that import rather than a checkout.
This is scope beyond the brief's original phase list.
- **Cadence: confirmed one-time import for the MVP** — no recurring sync required for launch.
- **"Extra transferable passes for certain members" (e.g. trainers/players):** Claudio doesn't yet
  know the rule for who qualifies or how many ("wie gross spielt das eine rolle? ich weiss es zum
  jetzigen Zeitpunkt nicht"). Since this is genuinely undecided rather than just unstated, Claude is
  not hardcoding a role-based rule. Default/assumption: the CSV import format includes a plain
  numeric column (e.g. `zusatz_pässe_übertragbar`, default 0) that the club office fills in by
  manual judgement per row at import time. This keeps the decision in the club's hands as data entry,
  not code, and can be changed at any time without a schema change. Flagged as `TODO(claudio):`
  assumption in the eventual import code. **Resolved as a default, revisit if a real rule emerges.**

**D8 — "UHC Sponsoren Legi" (free, sponsor apprentices).** Purchasable through the shop like any
other product (self-declared, CHF 0). Eligibility is enforced physically at the door — when the
ticket is shown/scanned, staff also check the physical Legi/ID. No backend eligibility verification
is built. **Resolved.**

**D9 — "Reduzierter Eintritt" and similar ID-gated discount categories.** Same pattern as D8:
purchasable at the shop's discounted price with no backend proof; enforcement is a manual, physical
door check against the required ID, per the brief's own footnote on who qualifies. **Resolved.**

**D10 — Playoff-Zuschlag.** Out of scope for this shop entirely — single tickets are sold via
Eventfrog, which owns any playoff surcharge logic. Nothing built here. **Resolved.**

**D11 — Saisonabo+ (livestream add-on).** Out of scope for the MVP shop. The customer arranges this
directly on unihockey.swiss; not sold or referenced as a checkout item here. **Resolved.**

**D12 — CSV import format for extra transferable passes.** See D7 above — a plain numeric CSV
column, office-judged per row, default 0. **Resolved as a default.**

**D13 — Scanning always requires the database; a signature alone is never sufficient.** Confirmed
with Claudio ("die bereits ausgestellten QR codes müssen einfach gescannt werden können, ich nehme
an dies funktioniert nicht ohne hinterlegte Datenbank" — correct, it doesn't). Any ticket, however it
was created (shop order, Red Castle Club bundle, or CSV import), only becomes scannable by existing
as a row in `tickets`. This resolves the HMAC-vs-offline-verification tension noted in
`docs/ARCHITECTURE.md` §4: the pre-downloaded local valid-ticket set is authoritative; the signature
is a pre-filter/tamper-defence on top of it, not a replacement for database-backed state. **Resolved.**

**D14 — Unpaid orders.** An order left in status `neu` is **automatically cancelled (`storniert`)
after 14 days**. Needs a scheduled job (Vercel Cron or Supabase `pg_cron`, hitting a small server
route/function daily) — the only background/scheduled process in the MVP. The transition must still
be logged like any other status change, with the actor recorded as "System" rather than an admin
user. **Resolved.**

**D15 — Admin access levels.** A single access level for all admins for now — no roles. Explicitly
deferred, not built preemptively: role differentiation ("can change prices" vs. "can only view
orders") will be defined later and added via migration when actually needed. `admin_users` stays a
plain access list for the MVP. Handover process when someone leaves the office is a manual step
(remove their Supabase Auth access), documented in `docs/OPERATIONS.md` (Phase 8), not a schema
concern. **Resolved.**

**D16 — Refunds without a payment provider.** Confirmed: a distinct status/flag is needed so the
office can see which already-`bezahlt` orders still owe a manual bank transfer back. Claudio
explicitly flagged that this **cannot be automatic** (no payment provider to detect the refund) — it
is a manually-maintained marker end to end: the office sets it when a refund is owed, and clears it
by hand once they've actually made the transfer. Nothing about this can be automated in the MVP; the
UI just needs to make the "still owing a refund" list visible so it doesn't get forgotten (same
spirit as the `neu`-orders count in Phase 5). **Resolved.**

**D17 — VAT.** Using Claude's proposed default: prices are treated as gross amounts with no separate
VAT line surfaced anywhere in the shop or its exports; VAT handling is entirely the accounting
software's concern, downstream of this system. **Resolved.**

**D18 — Holder-name changes on already-issued tickets.** Reversing Claude's default assumption:
name changes on any ticket (not just Red Castle Club batches) **are allowed** via the admin tool —
not "non-transferable means no exceptions" as originally assumed. This needs an audit trail (old
name, new name, admin, timestamp) analogous to order status-transition logging and the reissue flow
(D6) — exact mechanism (dedicated small history table vs. a general admin-action log covering this
plus status transitions) to be settled during Phase 1 schema design, not here. **Resolved in
direction, logging mechanism to be finalized in Phase 1.**

**D19 — Mid-season game cancellation.** A season pass is a flat-rate product for the whole season; a
single cancelled home game has no effect on existing orders, refunds, or ticket validity. **Resolved.**

**D20 — Customer data retention.** Claudio asked for this to be "DSGVO-konform" — flagging a
correction before implementing anything: **UHC Uster is a Swiss club, so the directly applicable law
is the Swiss Federal Act on Data Protection (revDSG, in force since September 2023), not the EU
GDPR/DSGVO** — the two overlap heavily in principle (purpose limitation, data minimization, right to
access/deletion) but aren't identical, and GDPR would only apply directly if EU residents' data is
processed in an EU-market-targeting context. Separately, Swiss commercial law (Obligationenrecht Art.
958f) requires **10-year retention of accounting-relevant business records** — likely not this
system's concern directly, since invoices themselves are generated and kept in the club's accounting
software, not here, but worth the club's accountant confirming that boundary.

Given this is a genuine legal question outside what Claude can authoritatively resolve, the MVP
approach: no automatic deletion is built. `docs/OPERATIONS.md` (Phase 8) will document
data-minimization practice (collect only what's listed in the brief, no automatic sharing beyond
what's needed for pass issuance) and a **recommended, not legally-binding** retention window,
pending confirmation from the club's own legal/tax advisor. **Resolved for the MVP as
"document, don't automate, and flag the legal nuance rather than assume."**

## Phase 0.5 status: complete

Every brief-mandated topic has an actual answer or an explicit, owned deferral:

| Deferred item | Owner | Deadline |
|---|---|---|
| Supabase org plan: Free → Pro upgrade (D1) | Claudio | Before 5 September go-live (recommended; does not block Phases 1–4) |
| Audit-log mechanism for holder-name changes / status transitions (D18) | Claude | Resolved during Phase 1 schema design, not deferred to Claudio |
| Final, legally-confirmed retention period (D20) | Claudio, with the club's accountant/legal advisor | No hard deadline; MVP ships with a documented default in the meantime |

Ready for Claudio's go-ahead to start Phase 1.

## Phase-plan impact note

D4/D5/D7 add real scope not present in the brief's original 9 phases: a CSV member-import path with
bulk, zero-price ticket issuance, and a transferability flag threaded through the schema, order flow,
and scanner logic. Flagged to Claudio with a suggestion to sequence CSV import as a "Phase 5b" step
(after 5 September, before the 19 September first game) rather than blocking the public shop launch,
since members aren't part of the paying-customer critical path. Awaiting confirmation.

## 2026-08-26 (Phase 3, continued) — schedule sync

**D21 — Home games sync automatically from Swiss Unihockey, not manual entry.** Claudio asked for
date/time/venue/opponent to update automatically from swissunihockey.ch rather than being typed in by
an admin. Researched rather than assumed: the public REST API at `api.swissunihockey.ch/rest/v1.0`
works for these reads with no registration, despite its own docs mentioning an `apikey` parameter.
Identified UHC Uster's club id (**430**) and, critically, the specific team whose home games this
shop is actually about: id **428535**, "Herren Aktive GF L-UPL" — confirmed by name (it's the exact
team named in the Red Castle Club benefits, "Heimspiele des L-UPL-Teams") and cross-checked against
a real fixture returned by the API: 19 September 2026 vs. Zug United at Buchholz (Uster), matching
the brief's own stated first-home-game date exactly. `games` gained two columns
(`external_id`, `venue`) for idempotent upserts and to carry the venue Claudio asked for. Sync is a
Next.js route (`/api/sync/swissunihockey`) on a daily Vercel Cron (`vercel.json`), using the
service-role key and never touching `eventfrog_url`. Claudio asked why the sync needs the
service-role key at all, given how sensitive it is — answered directly: the `games` table only
allows writes from an authenticated admin session, and this cron job has no session whatsoever, so
it needs RLS bypassed the standard way. Claudio set the key in `.env.local` himself (never shared
with Claude); a live end-to-end run then confirmed 10 real home games synced correctly, including
the CEST/CET timezone conversion across the season (19 Sept 18:00 local → stored as 16:00 UTC; 16 Jan
18:00 local → stored as 17:00 UTC) and the landing page's savings calculation now showing real
figures (e.g. "CHF 200.– wert – du sparst CHF 50.–" for the Erwachsene pass). **Fully resolved and
verified**, except that the cron schedule itself only actually fires once this project is deployed
to Vercel — the sync currently only runs when triggered manually (as it was here) or after that
deployment.

**D22 — Per-game Eventfrog links don't exist yet; only a general search link does.** Claudio gave
`https://eventfrog.ch/de/events/ch/sport-fitness.html?searchTerm=UHC+Uster` as the current stopgap.
Per-game buttons stay disabled until a specific link is configured (never a dead link, per the
brief) — but the schedule page now also shows the general search link as a clearly-labelled
fallback, so customers aren't left with nothing before per-game links exist. **Resolved.**

## 2026-08-26 (Phase 4) — order flow architecture

**D23 — Confirmation page shows data returned directly from checkout, not re-fetched.** There is no
customer login in this system, so there is no safe way to let an anonymous visitor look up an
arbitrary order by number afterwards without either exposing other customers' names/addresses via a
guessable order number, or building a whole auth system the brief doesn't ask for. Resolved by never
creating that lookup path at all: `create_order()` returns the full confirmation payload (order
number, line items, total) in its single response, and the checkout page renders that directly in
place (no route change, no PII in a URL, no public `orders` SELECT policy needed). The tradeoff:
refreshing the confirmation loses it - "print this page" / screenshotting the order number (both
things the brief already asks for) are what's available instead of a durable link. **Resolved.**

**D24 — Cart line shape: one line per pass, shared label for Red Castle Club bundles.** Consistent
with D5 - a normal season pass is one cart line with one holder name; a Red Castle Club purchase is
also one cart line, but its single "holder name" field is labelled as a company/group name and
becomes the shared `holder_name` on however many tickets `included_passes` says it produces. This
needed `included_passes`/`transferable` added to each Red Castle Club product's `benefits` (Normal:
1/false: Bronze & Silber: 2/true; Gold: 3/true) so `create_order()` has a machine-readable source for
ticket count, instead of parsing the free-text benefit bullets. **Resolved.**

**D25 — Cloudflare Turnstile test keys used for now.** Claudio hasn't set up a real Turnstile site
yet, so `.env.local` uses Cloudflare's official public test keys (always-pass site key
`1x00000000000000000000AA` / secret `1x0000...0AA`, documented at
developers.cloudflare.com/turnstile/troubleshooting/testing) - safe for any domain including
localhost, but must be swapped for a real site's keys before launch. Flagged as a `TODO(claudio)` in
`.env.local` and `.env.example`. **Open** until Claudio creates a real Turnstile site.

## 2026-08-26 (Phase 5) — admin area

**D26 — First admin account is self-service, never handled by Claude.** `admin_users` has no seed
row and no public sign-up path, so someone has to create the first account. Rather than Claude
running `auth.admin.createUser()` with a password it chose (or asking Claudio for one in chat),
`/admin/setup` is a one-time form, disabled the moment `admin_users` has any row, where Claudio types
his own email and password directly into the app - the same boundary already agreed on for the
Supabase service-role key: Claude designs the flow but never sees or transmits the secret itself.
**Resolved.**

**D27 — XLSX export columns and layout weren't specified by the brief, so a reasonable default was
built rather than asked about**, since it's an internal admin convenience, not a price/schedule/link
decision the brief says never to invent. Two sheets: "Bestellungen" (one row per order - status,
customer, address, email, total, refund flag, created date) for reconciling against bank transfers,
and "Bestellpositionen" (one row per order line - product, ticket-holder name, quantity, unit price,
line total) for per-ticket detail. No VAT column, consistent with D17. Built with `exceljs` (no xlsx
library existed in the project yet); the `xlsx` skill was invoked first per the brief's mandate, and
its guidance not to hardcode values that should be formulas doesn't apply here since this is a data
export/dump with no recalculation surface, not a financial model. **Resolved, open to revision** if
the club office wants different columns once they actually use it.

## 2026-08-26 (Phase 6) — ticket PDFs and wallet passes

**D28 — Neither wallet is built this phase; both are blocked on the same kind of thing.** Claudio's
call was to skip Apple outright (paid developer program, pass-type-id request, certificate generation
- too slow for the 5/19 September dates) but at least attempt Google. Investigating Google Wallet
turned up the same shape of blocker: issuing passes requires a Google Wallet Business Console issuer
account, which only Claudio can apply for (Claude cannot request, expedite, or fake one), plus a
service account and a pre-created pass class under that issuer. Without any of that to test against,
writing the JWT-signing integration now would be unverifiable code shipped on faith - if the object-ID
format, JWT claim shape, or class-reference assumptions were wrong in some detail, it would look done
and silently fail the first time it's actually used. So: not built either, same as Apple, but flagged
as the fast follow-up once Claudio has an issuer account - the hard part (tokens, PDFs, storage,
admin download flow) is already done, and every ticket already gets a fully functional PDF regardless
of either wallet's status. **Resolved: neither built. Revisit Google once Claudio has credentials to
test against.**

**D29 — Red Castle Club PDF tiers get real metal colors; season passes don't.** Reversing the
website's own rule (D-none, but established in Phase 2: no literal gold/silver/bronze anywhere,
tier gradation is spacing/shadow/border only) - Claudio explicitly asked for the printed pass itself
to use real Bronze/Silber/Gold tones matching each Red Castle Club tier's name. Implemented as a pure
function of `products.type` + `tier_level` (`src/lib/tickets/tier-colors.ts`): tier_level 0-1 (season
passes, and Red Castle Club "Normal") stay on the site's plain red accent; tier_level 2/3/4 (Bronze/
Silber/Gold) get a matching metal accent band and tint. Still data-model-driven, not hardcoded to a
product slug - it just now produces literal metal colors instead of only spacing/shadow changes,
because a PDF pass has different design conventions than a web page. **Resolved.**

**D30 — PDF typeface: pdf-lib's standard Helvetica, not the website's Inter.** Embedding real Inter
weights would need actual static-instance TTF files; Google's current font repo only ships Inter as a
single variable-font file, which pdf-lib/fontkit can only load as one fixed instance - no separate
bold face, and correctness/licensing of pulling font binaries from a third party mid-session felt like
the wrong tradeoff for a typeface swap the brief doesn't actually require. Helvetica is one of PDF's
14 standard fonts (always available, no embedding needed, renders identically everywhere) and reads
as the same family of clean grotesque sans-serif as Inter - the color palette, spacing, and layout
carry the visual identity, not the exact typeface. **Resolved.**

## 2026-08-26 (Phase 7) — scanner PWA

**D31 — Redemption is scoped per game, not per ticket for life.** The Phase 1 schema
gave `tickets` a single `status` field (`gueltig | eingeloest | ...`), which would only
make sense for a single-use ticket - but a season pass is explicitly valid at every
home game all season (that's the entire product). Reversing the implicit "eingeloest
means used up" assumption: `tickets.status` stays `gueltig` for the whole season and
only ever moves to `storniert`/`ersetzt` (voided/replaced); "already redeemed" is
answered per game via `scan_events.game_id` (new column) - has this ticket already
been scanned as `accepted` for *this* game. `eingeloest` stays in the CHECK constraint
for forward compatibility (e.g. a future single-game product) but nothing in this
phase ever sets it. A direct consequence: the `wrong_game` value in
`scan_events.result` is currently unreachable - every product this shop sells is
valid at every home game, so there is no ticket that could be "for the wrong game."
Kept in the schema for the same forward-compatibility reason. **Resolved.**

**D32 — Scanner devices get a per-game access code, not individual accounts.**
`scan_events.device_id` (Phase 1) was already a free-text label, not a user
reference - a signal the original design intended devices to identify themselves by
a label, not a person by login. Match-day helpers are numerous, transient, and
should not be able to see customer PII or manage prices/orders, so reusing
`admin_users` (D15's flat, ungraded access model) would be the wrong trust boundary
for them. Instead: an admin sets one access code per game
(`game_scanner_codes` - its own table, not a column on `public.games`, so the
existing public "Anyone can view games" policy can never accidentally leak it); a
helper exchanges that code for a short-lived signed session token
(`src/lib/scanner/session.ts`, HMAC, its own `SCANNER_SESSION_SECRET` - a different
security domain from `TICKET_TOKEN_SECRET`, so the two can never be confused). Route
Handlers verify that token themselves and act through the service-role client -
there is no real Supabase Auth session for a scanner device, matching the existing
pattern of service-role-plus-custom-verification already used by `create_order`
(Turnstile-verified) and the Swiss Unihockey cron sync (CRON_SECRET-verified).
**Resolved.**

**D33 — The scanner's client-side "signature check" is a format check, not real
cryptography.** D13 (Phase 0) already established that the HMAC secret never reaches
the client, so "verify the signature locally, offline" (the brief's Phase 7.2
wording) cannot mean actual signature verification - there is nothing to verify
with. What the client *can* check without the secret: whether a scanned string has
the right shape at all (26 Base32 characters, `src/lib/scanner/format.ts`) - a cheap
filter against garbage QR codes (a business card, a random poster) before even
touching the local ticket set. A well-formed but unauthorized token still gets
caught by the next check (not in the local valid set), same as D13 already said.
Documented explicitly so a future reader doesn't assume real cryptographic
verification is happening client-side. **Resolved.**

**D34 — The scanner's full-screen feedback uses real green, breaking the site's own
"no green" rule.** `src/styles/tokens.css` documents a deliberate Phase 2 choice: no
color beyond white/red/black/grey anywhere, success states use text weight instead
of green. The Phase 7 brief overrides that for this one surface, explicitly:
"full-screen green or red." A fast door-scanning tool needs an instant, unambiguous,
universally-understood go/no-go signal for volunteers who won't have time to read
text in bright or dark venue lighting - the same reasoning already used for Red
Castle Club's metal PDF colors (D29): a different surface, with a different
explicit instruction, gets a different treatment. Scoped to
`src/app/scanner/scanner.module.css` only; the rest of the site is untouched.
**Resolved.**

**D35 — A device restarting mid-game, or a ticket issued after this device's
download, are both handled by falling back to the network rather than trusting a
possibly-stale local "not found."** The brief's offline-first design optimizes for
speed by deciding locally - but for a token this device has *never seen at all*
(not "seen and rejected", just absent from its map), showing an instant, confident
"not found" risks wrongly turning away a customer who bought a pass minutes before
kickoff, after this device's one-time download. For that specific case only, the
client shows a brief "wird geprüft" state and asks the server first, falling back to
a local "not found" only if the network genuinely doesn't answer. Every other
decision (accepted, already redeemed, voided, malformed) stays instant and fully
local, per the brief. **Resolved.**

## 2026-08-27 (Phase 8) — hardening and accounting groundwork

**D36 — Rate limiting via a plain Postgres table, not Redis/Upstash.** The brief asks
for rate limiting on the order endpoint without naming a mechanism. Serverless
functions can't hold reliable in-memory state (each cold start and each concurrent
instance is independent), and adding a new external service (Upstash Redis or
similar) for this alone would cut against the project's own "no added compute"
scalability philosophy for what is, at this club's scale, a low-volume check.
`order_rate_limits` (one row per attempt, keyed by IP) plus one `SECURITY DEFINER`
function reuses infrastructure the project already has. Extended to
`/api/scanner/session` too, beyond the brief's literal "order endpoint" wording -
scanner codes are short, human-typed strings, not high-entropy secrets, so leaving
that endpoint unlimited would have been a real, easily-exploitable gap discovered
during this same pass, not a hypothetical one. **Resolved.**

**D37 — FIBU export: one row per order, "Konto" left blank, "Datum" is order date
not payment date.** Per the brief's explicit instruction ("do not implement an
interface to any specific accounting system"), only the format and an internal
function are built (`docs/FIBU-INTERFACE.md`). Three sub-choices worth recording:
(1) one row per *paid* order, not per order line - accounting cares about the
transaction total, matching the brief's five named fields (debtor, amount, document
number, date, account) which describe one booking, not a line-item breakdown; (2)
the account/Konto column is left empty rather than guessed, since which GL account
each revenue type posts to depends on a chart of accounts that doesn't exist yet -
inventing one would violate the same "don't invent" rule that applies to prices and
schedules; (3) the date column uses `orders.created_at`, since there is no separate
"paid on" timestamp in the schema (`orders` only has `created_at`/`updated_at`) -
flagged in `docs/BACKLOG.md` as a gap to close if the eventual accounting system
specifically needs the payment date. **Resolved.**

## 2026-08-27 (post-Phase-8) — member card distribution

**D38 — A scoped, explicit reversal of the project's "no email, ever" rule, for exactly one
feature.** From the very start of this project the brief and every subsequent decision assumed no
outbound email anywhere: no order confirmations, no admin notifications, no send button of any kind
- checkout confirmations are shown inline, tickets are handed over as PDFs, nothing is automated.
Claudio then asked for a bulk "send every member their card by email" feature for distributing
membership cards to existing club members going forward. Rather than quietly building around the
original rule or silently ignoring it, this conflict was surfaced directly; Claudio confirmed
**real email sending, reversing the no-email rule, scoped only to this feature** - nothing else in
the system sends email. Provider: **Amazon SES** (`src/lib/email/ses.ts`, via nodemailer's SES
transport on `@aws-sdk/client-sesv2` - the v1 `@aws-sdk/client-ses` SDK doesn't match the request
shape nodemailer's transport actually builds). Sending domain still undecided by Claudio as of this
writing - `SES_FROM_EMAIL` stays unset in `.env.example` until he has one. **Note for whoever adds the
real AWS credentials:** a fresh SES account starts in **sandbox mode** and can only send to
individually-verified recipient addresses until production access is requested from AWS - this will
block even the ~10-board-member test batch if not requested ahead of time. **Resolved** (feature
built; blocked only on Claudio supplying AWS credentials/domain and the real member list).

**D39 — Personal card and transferable codes combine on one member, rather than being mutually
exclusive.** The CSV/import spec has two independent fields (`mitgliederkarte: ja/nein`, "wie viele
übertragbare Codes") that read as if they could be alternatives. Claudio confirmed they combine: a
single member can have both their own non-transferable card *and* N transferable codes on top.
Modeled as two separate `products` (`mitglieder-uhc-uster` / `mitglieder-uhc-uster-uebertragbar`,
the latter's `benefits.transferable = true`) so `create_member_order()` inserts zero, one, or two
`order_items` per member depending on which fields are set - deliberately reusing the existing
per-order-item transferability pattern from D5/D6 rather than adding a new column or code path.
**Resolved.**

**D40 — `kategorie` (Funktionär, Spieler, Gönner, etc.) is a free-text label only for now, no
product-tier mapping.** Claudio marked the category list itself "tbd" and confirmed, when asked,
that it shouldn't yet drive which product/benefits a member receives - every member gets the same two
possible products (personal card, transferable codes) regardless of category. Stored as a plain
nullable `text` column on `members`, displayed in the admin list, otherwise inert. Revisit only if a
real category-to-benefit mapping is ever specified. **Resolved, revisit later.**

**D41 — No migration of pre-existing/legacy QR codes.** Claudio's original question ("what do we do
with existing QR codes from before this system existed?") led to this feature, but the final spec
explicitly excludes those ~300 legacy codes from scope ("also heisst noch keine migration von alten
codes") - this feature only ever generates new codes for members going forward. Legacy code migration
remains a fully open, unscoped problem, tracked in `docs/BACKLOG.md`. **Deferred, not resolved.**

**D42 — Batch send requires an editable message and a typed confirmation phrase, no automatic
send-on-create.** Adding a single member (or a CSV row) immediately generates their order and
ticket PDFs, but never emails them - email only goes out when an admin explicitly reviews the
editable subject/body and types the confirmation phrase (placeholder: `"Versenden"`, Claudio's own
literal instruction) into `/admin/members`'s send button. Prevents an accidental bulk-send to real
members' inboxes from a stray click, and keeps a human review step between "codes generated" and
"emails sent" given this is the one feature in the whole system that talks to the outside world.
**Resolved.**

## 2026-08-28 — admin redesign and attendance dashboard

**D43 — `/admin/live` renamed to `/admin/dashboard`, and its former plain game-list landing page
became a multi-game attendance overview; the single-game Realtime scan monitor moved to
`/admin/dashboard/[gameId]` unchanged.** Claudio asked for the "Live" nav item to become "Dashboard",
described in the same message as an overview where he picks any number of games (all, one, or a
subset) and sees how many of each ticket category attended - i.e. two related but distinct jobs
sharing one nav entry: match-day live monitoring (already built, Phase 7) and after-the-fact
attendance reporting (new). Nesting the unchanged live view under the renamed parent folder was the
lowest-risk option - only two hardcoded `/admin/live` strings existed in the whole codebase (the nav
link and the old page's own internal link), confirmed by search before renaming. **Resolved.**

**D44 — Attendance is counted from accepted scans (`scan_events`), not tickets sold, and grouped by
`products.name` rather than a fixed category list.** "How many Erwachsene/Mitglieder/Studenten
attended this game" only has a sensible answer via actual door scans - a season pass is valid at
every home game (D31), so "tickets sold" says nothing about which specific game someone attended,
only `scan_events.game_id` + `result = 'accepted'` does. Grouping by the product's real name (not a
hardcoded "Erwachsene/Mitglieder/Studenten" enum) was chosen after checking the live product catalog
(`saisonkarte-erwachsener`, `saisonkarte-reduziert`, `mitglieder-uhc-uster(-uebertragbar)`, four Red
Castle Club tiers, `sponsoren-legi`) - a fixed list would either miss real categories or need
updating by hand every time the catalog changes; deriving it from whatever products actually appear
in the selected games' scans stays correct automatically. Rejected/duplicate scan counts are shown
per game too (`scan_events.result != 'accepted'`) - a cheap, genuinely useful operational KPI (spot a
game with unusual forged-ticket or duplicate-scan activity) that falls out of the same query.
**Resolved.**

**D45 — Admin nav restyled to match the shop's own red/logo branding, and the send-cards form moved
from an inline expanding section into a real modal.** Claudio: the admin area's plain dark bar didn't
feel connected to the rest of the site, and the inline "Karten versenden" section was easy to miss
after clicking its toggle button ("so habe ich gar nicht gemerkt, dass es aufgegangen ist"). Fixed by
(1) giving the nav the club logo + a red (`--color-accent` - the one accent color this whole project
uses, no new color introduced) "Admin Bereich" label top-left, a light background instead of dark
(needed anyway since the logo file has a solid white background), and CSS-grid centering for the nav
links so they're centered regardless of the brand/logout blocks' widths either side; (2) reusing the
existing `Modal` component (already built for delete-confirmation, previously unused anywhere else in
admin) for the send-cards form, which can't be scrolled past unnoticed the way an inline expand could.
**Resolved.**

**D46 — Closed all four `docs/BACKLOG.md` admin tooling gaps in one pass, per Claudio's explicit
"admin lücken bitte schliessen".** Each follows an existing, already-tested pattern rather than
inventing a new one:
- `void_ticket(p_ticket_id)` mirrors `rename_ticket_holder()`'s exact shape (same admin check, same
  `for update` row lock, same `audit_log` write) - distinct from `reissue_ticket()`, which always
  creates a replacement; this one just sets `status = 'storniert'` with nothing issued in its place.
  Covered by 6 new pgTAP assertions (Group L, `supabase/tests/rls_test.sql`, 111 total now).
- Ticket holder rename moved from "function exists, nothing calls it" to an inline-editable field on
  the order detail page's ticket rows - same blur-to-save pattern already used for `members.kategorie`.
- The scan log (`getScanLogForGame`, `src/lib/admin/live.ts`) is a plain per-game table below the
  existing aggregate live stats - newest scan first, so a suspected double-scan or a run of rejections
  right after they happen is the common case it's built for.
- `/admin/admins` creates real Supabase Auth users via the service-role client (mirrors
  `bootstrapFirstAdmin`'s own mechanism exactly - `/admin/setup` (D26) stays permanently one-time-only
  for the very first admin), but the `admin_users` insert itself goes through the caller's own
  session so it stays gated by the real RLS policy, not just the function's own `is_admin()` check.
  Removing an admin deletes the underlying Auth account, which cascades the `admin_users` row away
  with it - guarded against removing yourself or the last remaining admin. This reverses the original
  "keep the Auth account so a mistaken removal is recoverable": keeping it left the address registered,
  so re-adding that person was the one thing that could never be done. The two append-only history
  tables now release their pointer (`on delete set null`) instead of blocking the removal, so
  attribution for removed admins is given up in exchange for removal working at all.
**Resolved.**

**D47 — Red Castle Club shop cards get real metal colors too, reversing the website's own
"no literal gold/silver/bronze" rule from Phase 2 (D29) - scoped to exactly the Bronze/Silber/Gold
tiers, the same scope D29 already used for the PDF passes.** Claudio, looking at the actual card
grid, asked to color the tiles "in die entsprechende Farbe" so they visually stand out more than the
plain white cards did. Rather than inventing a second set of gold/silver/bronze tones, `src/lib/tier
-colors.ts` (moved from `src/lib/tickets/` to `src/lib/` since it's no longer PDF-only, sibling to
`src/lib/tier.ts`) now also exports each color as a web-usable hex string - the literal same accent
Claudio already approved for the printed pass now shows up on the web card too (eyebrow label,
border, and a soft background tint - the same three elements a Bronze/Silber/Gold PDF pass uses).
Tier 0-1 (season passes, and the Red Castle Club "Normal" tier) are completely unaffected - `Card`'s
new `accentColor`/`tintColor` props are only ever set when `getTicketAccentColor` returns a real
metal (i.e. `metalName !== null`), so the existing "quiet gradation via spacing/shadow" system
(`tier.ts`) keeps running underneath for everything else, restrained as before. Also loosened
`.cardGrid`'s `minmax` from 280px to 240px, per Claudio's "4 Kacheln in einer Reihe wenn möglich" -
now fits all four Red Castle Club tiers on one row at normal desktop widths, while still degrading
gracefully to fewer columns (confirmed down to a single column at mobile width) since it's still
`auto-fit`, not a hardcoded 4-column grid. **Resolved.**

**D48 — The match-day scanner login stays a self-issued HMAC session token rather than Supabase
Auth, as a knowing, documented exception.** Claudio asked for an audit that no login anywhere in the
project is self-built ("DAS IST EIN ABSOLUTES NO GO!!! alles muss über die supabase auth laufen").
The audit found exactly one: `src/lib/scanner/session.ts` mints its own JWT-shaped token (HMAC-SHA256
over a base64url payload, own `SCANNER_SESSION_SECRET`, verified by hand in each scanner Route
Handler, stored in `localStorage`). Everything else is genuinely Supabase Auth - `/admin/login`
(`signInWithPassword`), `/admin/setup` and admin creation (`auth.admin.createUser`), all authorization
via the `is_admin()` RLS helper. The ticket QR token (`TICKET_TOKEN_SECRET`, `src/lib/tickets/token.ts`)
is *not* a login: it signs an artifact printed on a pass, and no session is derived from it.

Two Supabase-native replacements were put to Claudio: (a) Supabase **anonymous sign-ins** - the helper
still types only the per-game code, the server verifies it and then calls `signInAnonymously()`, so
Supabase itself issues and validates a real session/JWT, with a `scanner_sessions` table plus RLS
scoping the session to one game; or (b) a real Supabase account per scanner device. Claudio chose to
**leave it as-is for now and document it**, given the 5 September launch and that (a) additionally
requires enabling "Anonymous sign-ins" in the Supabase dashboard.

Why this is defensible as a scoped exception: match-day helpers are *anonymous devices*, not people
with accounts - there is deliberately no user record to authenticate against (D32). The token is
scoped to exactly one game, expires after 8 hours, is signed with a secret in a different security
domain from the ticket secret, is verified with `timingSafeEqual`, and the code exchange behind it is
rate-limited (10 attempts / 10 minutes per IP). It grants only the ability to scan tickets for that
one game via Route Handlers - never a Supabase session, never admin access, never a database
credential.

The residual risk is real and should be understood: this is hand-rolled auth, so it does not get
Supabase's key rotation, revocation, or refresh handling. There is no way to revoke a leaked token
before its 8 hours are up other than rotating `SCANNER_SESSION_SECRET` (which logs out every scanner
at once, mid-game). **Deferred by decision - revisit after 5 September, preferring option (a).**

**D49 — Customers now get an order-confirmation email, reversing D38's "no order confirmations"
for exactly this one message.** Until now the confirmation existed only as a rendered page: close
the tab and the order number was gone for good, with nothing in the customer's inbox until the
office got round to sending the invoice by hand days later. Claudio asked for the mail to be built.
This is the second scoped exception to the "no email, ever" rule, after member cards (D40) - it is
*not* a general opening of the floodgates: still no admin notifications, no reminders, no marketing.

Content deliberately mirrors the on-screen confirmation (`src/app/(shop)/kasse/page.tsx`) rather
than inventing a second version of the story: order number, line items, total, and the same three
numbered next steps. It states outright that it is **not** the invoice and that the customer should
not transfer anything yet - without that, an email containing a total and an order number reads
exactly like a bill, and people would pay against it before the real invoice (with the actual
payment details) ever arrives. Sent as both `text` and a single-column inline-styled HTML part;
no images, no external CSS, no flex/grid, since desktop mail clients drop all of those.

**Sending is best-effort and deliberately cannot fail an order.** It runs inside Next's `after()`,
so it happens once the response is already flushed: a slow or broken SES never delays the
confirmation screen, and - the point that matters - never turns a committed order into a visible
error for the customer. The order is the real artifact; the mail is a courtesy copy of it. Any
failure is logged and left legible as a null `orders.confirmation_email_sent_at`, surfaced on the
admin order detail as a "Nicht versendet" badge, so "the customer says they got nothing" is a
question the office can answer from the UI instead of from server logs.

**Reserved-TLD guard (`isUndeliverableAddress`).** The Playwright suite deliberately creates real
orders on the production project with `@playwright-test.invalid` customers. Left alone, every local
test run would have fired hard bounces at SES, and AWS suspends accounts over sustained bounce
rates - so RFC 2606/6761 reserved TLDs (`.invalid`, `.test`, `.example`, `.localhost`) are never
handed to SES at all. `season-pass-order.spec.ts` asserts `confirmation_email_sent_at` stays null
for exactly this reason: it is a guard against a production reputation problem, not a test detail.

**Open operational question, not resolved in code:** whether the AWS SES account is still in
sandbox mode. The IAM user (`uhcuster-ticketshop-smtp`) is correctly send-only and cannot call
`GetAccount`, so this could not be checked from here. In sandbox, SES silently accepts sends only
to *verified* addresses - meaning real customers would receive nothing while the app records every
send as successful. This must be confirmed in the AWS console before 5 September.

**D50 — The order confirmation could not be delivered because SES_FROM_EMAIL is a gmail.com
address; sending must move to the club's own domain.** The first real test send (to a
Google-verified recipient, account still in SES sandbox) was accepted by SES - `sendEmail` returned
true with no error - and never arrived. Cause, confirmed by DNS rather than assumed: the configured
From address is on `gmail.com`. Mail sent through SES claiming that From can never pass SPF
alignment (gmail.com's SPF does not authorise AWS SES, and the club obviously cannot change
Google's DNS) nor DKIM alignment (that needs DNS control over the From domain). Receiving mail
servers - Gmail above all, which is deliberately strict about mail claiming `@gmail.com` arriving
from a non-Google host - therefore drop it silently *after* SES has already reported success. This
is why "SES accepted it" is not evidence of delivery, and the code now says so at the call site.

The fix is DNS work outside this repo, on `uhcuster.ch` (currently `v=spf1 mx include:spf.zynex.ch
-all`, and no DMARC record at all):
  1. Verify `uhcuster.ch` as a **domain identity** in SES in `eu-central-1` and enable Easy DKIM,
     adding the three CNAME records SES issues.
  2. Add SES to the SPF record: `v=spf1 mx include:spf.zynex.ch include:amazonses.com -all`. The
     existing `-all` is a hard fail, so without this SES-sent mail is explicitly rejected.
  3. Set `SES_FROM_EMAIL` to an address on that domain (e.g. `tickets@uhcuster.ch`).
  4. Optionally publish a DMARC record once 1-2 are in place.

`SES_REPLY_TO` was added for the case where the From becomes a no-reply address - the confirmation
invites the customer to reply, so that invitation has to reach a real mailbox.

Note this equally affects the **member card emails** (D40), which have been sending from the same
gmail.com address all along - anything that appeared to work there was luck or a lenient receiver,
not a working setup. Separately, and independently of all of the above, the account is still in the
**SES sandbox** (confirmed by Claudio), so only verified recipients get anything at all until
production access is granted - AWS takes up to 24 hours to approve. **Both must be resolved before
5 September.**

## 2026-08-31

**D51 — A game is shown as club crests, never as lettering, everywhere in the app.** Claudio
supplied the crests of all eleven clubs UHC Uster meets in 26/27 and asked that a fixture read as
UHC Uster's crest against the opponent's wherever a game appears, rather than "UHC Uster - Gegner"
as text, and that this be kept consistent rather than done only on the shop page. Implemented as one
shared `Matchup` component (`src/components/match/`) so no surface can drift: the shop's fixture
lists, the scanner's status bar and the admin live view, schedule cards and dashboard table all
render the same thing. Crests come from `src/lib/teamLogos.ts`, keyed on a normalised opponent name
because `games.opponent` is free text an admin can hand-correct; an unknown club falls back to its
name rather than to an empty row.

Two places keep the name **beside** the crests rather than instead of them, deliberately: the admin
schedule (it is the screen where that name is edited) and any operations view where somebody must be
*certain* which game they have - recognising a crest is not the same as reading a name. And two
places cannot take a crest at all: `<option>` elements render no markup, so the scanner's game picker
and the dashboard's game filter stay text. That is an HTML limitation, not an oversight.

**D52 — The ticket PDF has no opponent to show, because a ticket is not per-game.** Checked while
implementing D51: `tickets` has no game reference and `TicketPdfData` carries none - every ticket
this shop issues is a season pass or a Red Castle Club membership, valid for *all* home games
(single-game tickets are sold by Eventfrog, off this platform). So "both crests on the ticket" has
no meaning on the current artifact; the PDF already carries the full UHC Uster logo, emblem
included, in its header. If a per-game PDF is ever issued, or if the season pass should show the
crests of the games it covers, that is a deliberate design change - not something D51 did silently.

**D53 — Wallet passes must follow D51 when they are built.** Neither wallet exists yet (D28, blocked
on an Apple developer enrollment and a Google issuer account). Recording the requirement here so it
is not rediscovered later: whenever a wallet pass names a game, it carries both clubs' crests, from
the same `/public/logos` set the app uses, and not the club name as text. The 320x160 transparent
PNGs in that directory are already sized for it. A pass covering the whole season has the same
caveat as D52 - there is no single opponent to show.

**D54 — A customer reaches their order through a signed link, not an account.** Claudio compared the
shop against FC Basel's ticket shop and asked what was worth taking from it. The biggest difference
is structural, not cosmetic: there the purchase ends with the customer (payment, ticket in the
account), here the purchase *starts* the office's work (invoice by hand, PDFs handed over by hand).
Customer accounts and online payment stay out (D38 and the brief), so the only thing a buyer can be
given after the click is a link.

Built as `/meine-tickets/<token>` (`src/lib/orders/access-token.ts`): HMAC-SHA256 over the order
number, its own `ORDER_LINK_SECRET` - a third signing domain next to ticket tokens and scanner
sessions, for the same reason D32 keeps those two apart. The order number itself is sequential
(`UHCU-2627-0001`) and so cannot be the credential; the signature is what makes it unguessable. The
link is handed out in three places: on the confirmation screen right after checkout, in the order
confirmation e-mail (D49), and as a "Link kopieren" button on the admin order detail page, for the
invoice mail the office writes by hand anyway.

Deliberately **no expiry**, unlike the scanner session: this link is the customer's only durable way
back to their season pass, and that pass is valid all season. An expiring link would mean "lost your
PDF, call the office" - exactly the work this removes. A single link cannot be revoked; what sits
behind it is a paid season pass the customer already has a copy of.

**Fallback, not front door:** `/meine-tickets` takes an order number plus the e-mail the order was
placed with, for people who lost the link. Since the number is guessable, the e-mail is the only real
secret in the pair - hence the same IP rate limit the checkout uses (own key prefix `order-lookup:`,
10 attempts / 10 minutes) and *one* identical error message whether the number does not exist or the
e-mail does not match. The comparison runs in JS rather than as a PostgREST `ilike` filter: `%` and
`_` in a user-supplied string are wildcards there, which would make "any e-mail" a valid answer.

**What the page shows, and what it does not:** status (`neu` → `rechnung_versendet` → `bezahlt`), the
line items, the total, and from `bezahlt` on the ticket PDFs for self-service download (individually
and as a ZIP, through two Route Handlers that verify the token instead of an admin session and then
read service-role - the same shape `create_order` and the scanner routes already use). Not on the
page: address, phone, e-mail. A link that goes astray should expose a season pass, not a customer
record. Voided and replaced tickets are not offered either - otherwise somebody downloads a PDF that
no longer scans at the door.

**The real gain is office time:** the PDFs no longer have to be sent by hand, the order just gets
marked `bezahlt`. `orders.files_handed_over_at` and the member-card send stay untouched next to it,
for people who would rather receive their card by mail anyway.

**Open:** `NEXT_PUBLIC_SITE_URL` needs to be set to the real domain in Vercel, otherwise
`src/lib/site-url.ts` builds the link in the confirmation mail from `VERCEL_PROJECT_PRODUCTION_URL`.

---

**D55 — A card is now a thing in its own right: created, deactivated, replaced and sent one at a
time.** Until now a member's cards existed only as a number typed once at creation. `issue_tickets_for_order`
refuses to run twice for an order, so a typo in the member list could not be corrected at all; the only
route to a fresh QR code, `reissue_ticket`, had never been called and could not have been (it let
Postgres pick the new id, but Node needs that id *before* uploading, because the PDF path is derived
from it and the token is an HMAC over it, and it never set `pdf_path`). Claudio asked for the
flexibility after running into exactly this. He explicitly dropped an earlier idea of editing a
quantity field in favour of acting on individual cards - "so bleibt man flexibel was die tickets
anbelangt und kann fehler resonant frei korrigieren".

**The once-only guard stays.** It is the only thing standing between a double-click on "Als bezahlt
markieren" and a paying customer receiving two complete sets of passes, so it was not relaxed and no
bypass flag was added. Topping up goes through `add_member_tickets`, which accepts only the two
zero-price `mitglieder-*` products: an admin correcting the member list structurally cannot reach a
paid shop order through it, whatever the caller passes. Because those products cost 0, keeping
`order_items.quantity` in step leaves `orders.total_rappen` and every accounting figure untouched.

**Deactivating is final, replacing is separate** (Claudio's choice over a reversible toggle). A
deactivated card is refused at the door and stays that way; a replacement is only ever created by an
explicit second act, so a mis-click cannot quietly mint a new QR code. Worth knowing operationally:
scanner devices decide from a ticket list downloaded when they start, so a card deactivated mid-match
still gets in on a device that is already running.

**Running numbers** (`übertragbar-1`, `-2`) are per order and printed on the card. A replacement
inherits the number of the card it replaces - to the member and the office it is still the same card -
while a *voided* card keeps holding its own, so a newly created card can never end up sharing a number
with a QR code that once existed. That distinction is enforced by a partial unique index, not by
application logic. Existing PDFs were re-rendered in place (`scripts/rerender-ticket-pdfs.ts`, same
id, same token, same path) so they gained the number without any QR changing; the copy already in a
member's inbox naturally stays as it was.

**Send tracking moved to the card.** `members.cards_sent_at` was one timestamp for a whole member and
could not say "two sent, two still open" - it was simply wrong the moment a card was added after the
first send. It is deprecated but still written, so rolling the code back lands on data it understands.

**The "send to everyone" button is gone.** Sending is driven by an explicit selection, counts open
cards rather than people, and attaches only what has not gone out yet, so a member who gets one card
added later receives that card rather than their whole set again. A card whose PDF is missing from
Storage now fails that member visibly instead of quietly sending an incomplete set - one such ticket
exists in production today. **Resolved.**

## 2026-09-09

**D56 — Outbound email moves from Amazon SES to Resend.** The provider swap Claudio decided
outside the repo, now actually in the code. `src/lib/email/ses.ts` is replaced by
`src/lib/email/mailer.ts` - named for the job rather than the provider, since the two call sites
(checkout confirmation, member card send) only needed editing for this switch because the module
carried the first provider's name. `@aws-sdk/client-sesv2` and `nodemailer` are gone; `resend` is
the only mail dependency.

Nothing about *what* is sent changed: both templates in `src/lib/email/order-confirmation.ts` are
provider-independent, the reserved-TLD guard (D49) still keeps Playwright's `.invalid` addresses
away from a real provider, and the two exceptions to "no email anywhere" (D38/D40/D49) are still
the only two.

**One behavioural difference had to be handled explicitly.** Resend reports a refused send in its
response object instead of throwing, the opposite of the nodemailer transport it replaces. Left
unchecked that would have turned every rejection into a reported success - and the card send would
have stamped cards as delivered that never left. `sendEmail` therefore inspects `error` and throws.

Environment variables changed with it: `RESEND_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_REPLY_TO` replace
`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION`/`SES_FROM_EMAIL`/`SES_REPLY_TO`. Only the
API key name is provider-specific; the address ones are not, for the same reason the module was
renamed. Sending address: `tickets@uhcuster.ch`.

**Was not resolved in code, and blocked real delivery:** `uhcuster.ch` had to be verified in Resend
and its DKIM records added to DNS. As of that entry the domain's live DNS still pointed entirely at
SES (`v=spf1 include:amazonses.com`, MX `feedback-smtp.eu-central-1.amazonses.com` on
`tickets.uhcuster.ch`), so until that changed Resend-sent mail failed SPF/DKIM alignment and
receivers dropped it silently - the exact failure D50 documents, just with the providers swapped.

**The DNS side is done** (checked 2026-09-10 against live DNS, not against the dashboard):
`resend._domainkey.uhcuster.ch` carries Resend's DKIM key, and `send.uhcuster.ch` - the return-path
Resend uses as MAIL FROM - has `MX send.forge.rmta.net` with an SPF record authorising Resend's
sending IPs. Both are subdomains of `uhcuster.ch`, so both align with a `tickets@uhcuster.ch` From
under relaxed alignment; `_dmarc.uhcuster.ch` is `v=DMARC1; p=none`. **Resolved.**

Worth knowing, because it looks alarming and is not: the SES records are still live, but only on
`tickets.uhcuster.ch` - SPF `include:amazonses.com` and the SES feedback MX. That subdomain is not
the sending domain. The address is `tickets@uhcuster.ch` on the root, and alignment is judged
against `uhcuster.ch`, so the leftovers are inert here. They are cleanup, not a blocker. (The root's
own SPF, `v=spf1 mx include:spf.zynex.ch -all`, covers the club's ordinary mail host and does not
need Resend in it, since Resend's envelope sender lives on `send.uhcuster.ch`.)

One trap this entry warns about turned up in practice: a local `.env.local` was still carrying
`SES_FROM_EMAIL` set to a gmail.com address. Renaming that key to `MAIL_FROM_EMAIL` would have kept
a From nobody can authenticate - the club does not control gmail.com's DNS - and Resend would have
reported every such send as successful. The name changed *and* the value had to.

**D57 — The shop takes the FC Basel ticket shop's layout, and keeps UHC Uster's colours.** Claudio
was unhappy with the fixture list and the shop's overall arrangement and pointed at FC Basel's
shop as the model: a photo hero with a big capitalised headline, the date line, the pairing, both
crests, a countdown and a single ticket button; below it the coming games as cards with date,
league, crests and button. What is adopted is exactly that **arrangement**. What is not adopted is
FCB's dark theme: the pages stay white, the accent stays red, the type stays Inter (heavier and in
capitals for the display pieces, but no new font).

The hero (`HeroShell`) carries one photo, `public/hero/heimspiel.jpg`, under a white veil, so the
text on it is the same black as everywhere else. The file committed there is a light gradient
placeholder until Claudio drops in the real photo under the same name - a file swap, not a code
change. Three pages open with it: `/` and `/spielplan` with the next home game (`MatchHero`),
`/red-castle-club` with the club's logo and a "Mitglied werden" anchor. The header floats
transparently over the top of those three and turns into the usual white bar on scroll; on every
other page it is the white bar from the start. It gained "Meine Tickets" as a second ring icon
beside the cart, and its links moved to the centre.

The countdown is the one piece that ticks, and it is built so a page revalidated every 60 s (ISR)
cannot hydrate with different digits than it rendered: the data layer reads the clock once
(`getShopGames`, since a render must be pure), the server renders with that instant, and the
client's `useNow` hook hands React the very same instant as its server snapshot before starting
to tick. Dates are formatted only on the server (`formatGameDateLine`) - a browser's ICU is not
Node's. A game counts as "on" for three hours after kick-off ("Spiel läuft - Heute!"), then the
hero moves to the next candidate on its own; the server passes it three so that works between two
revalidations.

The cards (`MatchCard`) replace `GameRow`. They are white with a red radial glow from the centre -
the first gradients in this design system, so both are tokens, and the crests sit on a white halo
so a black wordmark never has to be read against saturated red. `L-UPL` is a constant, not a
column: every game in this shop is that team's (D-note on team 428535 above). One button per card,
Eventfrog or a disabled "Tickets folgen" - there is no VIP single ticket to link to (D10, D22).

Home page order became hero → coming games → season passes → Red Castle Club teaser, the FCB
pattern; season passes remain one click away in the header. `docs/uhcusterdesignanalyse.md` #4
records the visual rules.

Adjusted after the first preview, again against the FCB page: the crests had been the loudest
thing on the page. They are now small (36px in a card, 44px in the hero) and sit side by side with a hair
of space, like two badges on a match poster, with no "vs." - `Matchup layout="compact"`; the
columns layout the admin and scanner use is untouched. (An overlapping version was tried first
and dropped: Uster's crest is a wordmark, and a badge over its last letter looked like a mistake.)
That only works because the crests with a baked-in white background - Uster, Zug United, Chur
United, Köniz Bern - had it keyed out, flood-filled in from the edge so white inside a badge
stays white; every other place a crest appears already puts it on white (the scanner's chip,
admin tables), so nothing else changed. Kloten-Dietlikon's is on black and was left alone.

Two of those turned out to be half-done, and only showed once the crests were off white. The
edge-in fill cannot reach a white area a stroke closes off, so Zug United kept white in the
counters of its monogram - the triangle in the bowl and the oval below it - which read as white
blobs on the pink match card. Zug's mark is one flat blue, no white ink anywhere in it, so it is
keyed on colour rather than from the edge. And `public/uhc-uster-logo.png` - the header, admin
nav, scanner login and the ticket PDF, a different file from the `logos/uhc-uster.png` crest -
was never keyed at all: a fully opaque white plate, invisible while the header sat on white and a
white box the moment a photo went in under it. Keyed the same way; every place it is used draws
it on white, and pdf-lib carries the alpha into the ticket unchanged. The hero shrank to FCB's proportions
(title 56px and always one line, date 18px, pairing 24px, countdown 36px, ~60% viewport high), and
the "Meine Tickets" icon became a person, since a ticket icon beside a cart read as "buy" rather
than "mine". **Resolved.** Claudio's photo of a home game in the Buchholz - a full stand behind
the boards - is in as `public/hero/heimspiel.jpg`, 2400x1600, the width the design note asks for.

**D58 — The confirmation screen hands over the order link as one button, not a URL to copy.** Claudio
went through a purchase and did not like the screen it ends on. Three things were wrong with it. The
order number was set at `--text-h2-size` in red, the largest thing on the page, which made a payment
reference look like the point of the screen; it is now a bold line under the greeting at body size.
The heading was `Bestellung eingegangen` at `--text-h1-size`, whose 68px desktop end wrapped a
22-character heading onto two lines inside the 640px column; it now reads `Vielen Dank für deine
Bestellung` and is held to one line by its own clamp - `clamp(15px, 4.75vw, 36px)`, the ceiling being
what still fits the column beside the tick, which moved from a 56px badge above the heading to a 32px
mark on the same line. Because a one-line heading has to shrink on a phone, the lead, the order number
and the section titles track the same viewport scale a step below it under 640px: at 375px the
untouched 18px body and 22px section titles both outsized a 17.8px heading, which reads as no
hierarchy at all.

The third was the copyable link (D54). The screen showed the signed URL in a `<code>` block with a
"Link kopieren" button *and* a "Bestellung ansehen" button next to it - two ways to the same place,
and the raw URL is the uglier one on a page a customer sees once. Only the button stays, moved into a
panel of its own with the accent pill and a line saying it also works later, or via **Meine Tickets**
with the order number. D54's "handed out in three places" is unchanged: the confirmation screen still
hands over the link, as the button's target rather than as text.

What the screen promises changed too. Both it and the confirmation e-mail said the customer downloads
the cards themselves once the payment lands, which is now only half of it: the office sends the PDFs
out by e-mail when it marks the order paid (D55), and the same cards stay on the order page for good
(D54). Step 3 says both in both places, because the mail is written to say the same three things as
the screen.

## 2026-09-10

**D57 — A ticket that turns up at a second door gets its own alarm screen.** Same card, same
door, twice over is someone fumbling with their phone. Same card at a *different* door means the
code was handed on while the first person is already inside - and until now the scanner showed both
as the same amber "Bereits gescannt", so the second case was invisible to the staff who could
actually act on it. The second one now takes over the screen in dark red with an outsized "!",
naming the door that let the card in and when.

The device that redeemed a ticket was already in `scan_events.device_id`; it simply never reached
the scanner. It now arrives by all three routes the scanner learns about a redemption, so the alarm
does not depend on connectivity at the moment of the scan: the pre-doors ticket download, the
Realtime broadcast between devices (which gained the sending device's label), and the server's
answer to the scan itself.

**An unknown redeeming device is treated as the same door, never as an alarm.** A device that
decided offline from a download older than the redemption cannot know who took the first scan; it
shows the ordinary "already scanned" and upgrades to the alarm only if the server later names a
different door. Guessing the other way round would mean accusing a paying visitor of cheating in
front of a queue, which is far worse than missing one attempt. **Resolved.**


**D59 — The printed card is redrawn after the "Editorial Pass" design.** Claudio asked for a fresh,
modern ticket, chose the direction from a design canvas (a black landscape card with a tear-off stub,
the season as a hollow outline behind the text, club logo and season up top, "Gültigkeit" and "So
geht's" below), and then asked for exactly that in the PDF. `src/lib/tickets/pdf.ts` now draws it
with pdf-lib's own primitives: rounded corners as SVG paths, the perforation as a dashed line with
white die-cut notches, a pill in the top row of every card saying "ÜBERTRAGBAR-2" or "NICHT
ÜBERTRAGBAR" (Claudio asked for the season pass to say this outright, not only in the small note; the
transferable pill is white, the personal one muted), the holder line labelled "NAME" on season
passes - a member card is always one person's - and "NAME / FIRMA" on club cards, the outline number through the outline text-rendering mode, tracking through
the character-spacing operator. Every measurement is written in the design's CSS px and scaled by
0.75 to points, so the code and the canvas can be compared number by number.

What the card no longer prints: the membership highlights. Claudio decided the benefits do not belong
on the pass - the Red Castle Club crest does, and it takes the eyebrow's place on club cards. D29's
metal tones stay, and reach further: the badge, the perforation, the stub's tint, the outline number
and the tier word of the title ("CLUB **GOLD**") all take the tier's metal; season passes and the
"Normal" tier stay on the site's red. D30 (Helvetica, not Inter) holds: the design's Inter 900
headline is Helvetica Bold in capitals. The transferable member product's own "(übertragbar)" is
stripped from the headline, since the eyebrow's running number and the note under the holder both
say it and a third headline line left no room for the outline number.

Cards already in Storage keep the old layout until `scripts/rerender-ticket-pdfs.ts` runs; it
re-renders in place without touching ids, tokens or QR codes. Single-match tickets (the third
artboard on the canvas) are a proposal only - there is no product type for them yet. **Resolved.**

**D60 — A member card's headline is the member list's "Kategorie", split at its first comma.**
Claudio wants cards the office can personalise from the import - a sponsor's card reading
"Livestreampartner" over the sponsor's name - without a product per variant. The card printed the
product name ("Mitglieder UHC Uster"), so every member card read the same. Now a card issued from the
member list takes its headline from `members.kategorie`: the text before the first comma is line one,
the text after it line two; no comma means one line; an empty category falls back to the product
name. Shop orders have no member row and keep printing their product, since single tickets and
subscriptions cannot be bought there yet. Both lines shrink together to keep each whole - the comma is
where the office wants the break - down to 24px; only a line still too wide at that floor wraps, because
running off the card is the one thing worse than a third line. Capitals throughout, as the design has
it; the eyebrow and "Gültigkeit" text are unchanged, a sponsor card being a season pass all the same.

A category whose first line is "Red Castle Club" makes the card a club card - crest, tinted stub,
"NAME / FIRMA" - with the metal read off the last word of the second line ("Red Castle Club, Gold"),
so the two club imports Claudio mentioned print like the shop's own club cards; anything but Gold,
Silber or Bronze stays red like the shop's "Normal" tier. The shop's club cards still take their tier
from the product.

**Editing the category redraws the cards at once.** Until now nothing re-rendered a PDF after
issue but the one-off script; a change in the member table or on re-import now redraws that member's
live cards in place (same path, token and QR code), so the next download matches the list. That
overwrite goes through the admin's own session, which needed an update policy on the tickets bucket
(`20260914110001_allow_admin_ticket_file_replace.sql`) - the standing right the rerender script's
comment argued against granting. Accepted now, because "the list says one thing, the card another"
is the worse failure once the category *is* the card. The existing members' "Mitglied UHC Uster" was
changed in place to "Mitglied, UHC Uster" so their cards keep their two lines; the admin filter shows
the full comma value for now, to be revisited. On screen a card is called what the card calls
itself: the ticket tables in the member and order views and the customer's own card list all print
the category, comma and all, in place of the product name. **Resolved.**

**D61 — The card embeds Inter; D30's Helvetica is withdrawn.** Claudio sent a screenshot of a
card whose letters were wider and lighter than the samples he had approved, and asked for the
same font as before. The file had not changed: it named Helvetica without embedding it, and every
viewer substituted its own - real Helvetica in Vorschau, an Arial-alike in the browser he had
downloaded from. A card that looks different in every program is not "the design", so the fonts
are now in the file. And since a font is being embedded anyway, it is the site's own: Inter Black
for the headline and the season, Bold for labels and values, Regular for running text (Courier
stays for the token). The PDF now matches the canvas, which D30 had settled for as a compromise.

D30's obstacle was real: Google's font repo ships Inter only as a variable file, which pdf-lib
cannot take as three weights. The static instances come from Google's CSS API instead, which
serves per-weight TTFs to a client that does not announce variable-font support; they live in
`public/fonts` under the SIL Open Font License. Two things did not work along the way and are
written down so nobody retries them: pdf-lib's per-document subsetting drops most of Inter's
glyphs (a card came out as "G U U ÜB GB"), so the files are cut down once to the Latin range with
fontTools and embedded whole - 23 KB a weight, 72 KB a card; and the Google-served files must be
checked for `variationAxes` being empty before trusting them as static. Every stored card was
re-rendered so the members' downloads match. **Resolved.**

**D62 — A card downloads under a readable name, not its storage id.** Every download and every
mail attachment handed over `1fa15fc5-….pdf`, the id the file is stored under. Claudio asked for a
name a person can read and picked the shape: `Saisonkarte-26-27-Lea-Muster-uebertragbar-2.pdf`.
Generalised, the first part is what the card calls itself (the member-list category or the product
name, D60), then the season, the holder, and the running number of a transferable card. Umlauts are
spelt out (Müller -> Mueller) so the name survives every browser and mail program, and a ZIP
numbers a repeated name rather than overwriting it. The stored path keeps the id - only the name the
recipient sees changes, so nothing in Storage moves and no card is re-rendered. **Resolved.**

## 2026-09-16 — Bestellkategorien, CSV-Migration, manueller Mailversand, Red-Castle-Bestellprozess

Neuer Auftrag (Migrationsphase). Ab hier auf Deutsch, weil die Fragen und Antworten direkt mit
Claudio abgestimmt werden. Phase 0 (Analyse) ist abgeschlossen; dieser Abschnitt ist das
Interrogation Gate (Phase 0.5). Offene Punkte sind mit **O** nummeriert, entschiedene mit **D**.

### Phase 0 — was schon da ist (und wo der Auftrag davon abweicht)

Der Auftrag beschreibt ein Zielmodell, das zu grossen Teilen bereits existiert. Die relevanten
Befunde, weil sie die Fragen unten prägen:

- **Status-Modell existiert bereits exakt so** (`orders.status`: `neu | rechnung_versendet |
  bezahlt | storniert`, `transition_order_status()` mit `audit_log`-Eintrag inkl. Admin-User). Was
  fehlt: die Übergangsregeln werden nicht erzwungen (jeder Wechsel ist erlaubt), Stornieren
  deaktiviert keine Tickets, es gibt keinen Bestätigungsdialog, und Tickets werden erst bei
  `bezahlt` ausgestellt (`issue_tickets_for_order` verweigert alles andere und verlangt `is_admin()`).
- **`orders.source`** existiert mit den Werten `shop | csv_import`. Der Mitglieder-Import hat
  damit bereits **699 Bestellungen** (`csv_import`, alle `bezahlt`) angelegt, dazu 480 Mitglieder,
  763 Tickets, 36 Karten bereits per Mail verschickt. Der Auftrag nennt den Wert `import`.
- **Produkte sind flach**: eine Tabelle `products` mit `type` (`season_pass | membership`), ohne
  Varianten-Tabelle. Jede Variante ist heute eine eigene Produktzeile, auf die `order_items`,
  `tickets`, `price_history` und `sales_channels` zeigen. Live vorhanden (Saison 2627):
  Saisonkarte Erwachsene 150.–, Reduziert 80.–, Sponsoren Legi 0.–, Mitglieder (persönlich /
  übertragbar, 0.–, inaktiv), Red Castle Normal 300.– (1 persönliche Karte), Bronze 1000.– (2
  übertragbare), Silber 2500.– (2), Gold 5000.– (3), plus ein Testprodukt.
- **Name auf dem Ticket**: `tickets.holder_name` ist bereits der Snapshot beim Ausstellen und wird
  von PDF, Admin-Tabellen, Download-Dateinamen und `rename_ticket_holder()` gelesen. Die Regel
  «Firma vs. Person» liegt heute aber im Warenkorb (Freitext pro Zeile), nicht zentral.
- **Download-Link existiert** (`/meine-tickets/<token>`, D54): HMAC-signierter Link über die
  Bestellnummer, nicht erratbar, ohne Ablauf, in Bestätigungs- und Mitglieder-Mails bereits im
  Einsatz. Es gibt keine `download_token`-Spalte; der Link braucht keine. Download und
  Kartenliste sind heute auf `status = 'bezahlt'` gegated.
- **Mailversand**: `sendEmail()` in `src/lib/email/mailer.ts` (Resend). Zwei Aufrufer: die
  Bestellbestätigung nach dem Shop-Checkout (`after()` in `kasse/actions.ts`, best-effort,
  `confirmation_email_sent_at`) und der manuelle Kartenversand im Reiter Mitglieder
  (`sendMemberCards()`: Betreff/Text editierbar, Platzhalter `{{vorname}}`/`{{nachname}}`,
  Tipp-Bestätigung «Versenden», PDFs als Anhang, `tickets.card_sent_at` pro Karte). Es gibt keine
  Vorlagenauswahl, keine Vorschau, keine Testmail, keine Batches. Der Import versendet nichts —
  aber nur, weil ihn niemand aufruft; eine serverseitige Sperre nach `source` gibt es nicht.
- **Auto-Storno**: `auto_cancel_stale_orders()` (pg_cron, täglich) setzt jede Bestellung mit
  `status = 'neu'` nach 14 Tagen auf `storniert` (D14). Für Red-Castle-Rechnungen mit 30 Tagen
  Zahlungsfrist ist das falsch — und sobald Stornieren Tickets sperrt, würde der Job Sponsoren
  die Karten abschalten.
- **Checkout heute**: ein generischer Warenkorb (Name pro Karte, Adresse, Telefon Pflicht,
  Turnstile). Red Castle ist per `sales_channels` aktuell auf `shop` gestellt und läuft durch
  genau diesen Warenkorb; Saisonkarten stehen auf `website` (Bestellfrist abgelaufen).
- **Admin «Bestellungen»**: Liste mit Status-Filter und Suche, Detailseite mit Statuswechsel und
  Ticket-Tabelle, Excel- und FIBU-CSV-Export unter Einstellungen → Export. Keine Mehrfachauswahl,
  keine Kopier-Buttons, kein CSV-Import, keine Rechnungsnummer.
- **Tests**: nur Playwright (lokal destruktiv gegen das Produktionsprojekt, Preview read-only) und
  pgTAP für RLS. Es gibt keinen Unit-Test-Runner, den die Mail-Tests («Import erzeugt 0 Mails»)
  brauchen. Der bestehende Playwright-Test `rcc-membership-order.spec.ts` bestellt Red Castle
  über den heutigen Warenkorb und wird durch den neuen Flow ersetzt werden müssen.
- **Wallet-Passes** sind nicht gebaut (D28); «beim Import erzeugen» heisst konkret: der Import
  benutzt dieselbe Ausstellungsfunktion wie der Shop, sodass Passes dort mitkommen, sobald sie
  existieren. Es gibt dafür jetzt nichts zu bauen.

### Bereits im Auftrag beantwortet

**D63 — Saisonabo-Varianten und Preise:** wie live im Projekt definiert (`products`): Erwachsene
150.–, Reduziert 80.–, Sponsoren Legi 0.–. Die Mitglieder-Produkte bleiben als eigene Kategorie
(`mitglieder`), nicht als Saisonabo-Variante — sie werden über den Mitglieder-Reiter ausgestellt.
**Entschieden.**

**D64 — Zugang zur Red-Castle-Bestellung ist offen**, kein Sponsor-Code. **Entschieden.**

**D65 — Zahlungsfrist fix 30 Tage netto**, nicht pro Paket konfigurierbar. **Entschieden.**

**D66 — Keine Dankes-Mail bei `bezahlt`.** Kein Feature-Flag, kein Code dafür. **Entschieden.**

**D67 — Wallet-Passes beim Import erzeugen**, nicht erst beim ersten Abruf — d.h. der Import
läuft durch dieselbe Ticket-Ausstellung wie der Shop. **Entschieden.**

**D68 — Admin-Rollen: alle Admins dürfen alles**, Rollen kommen später (bestätigt D15).
**Entschieden.**

### Offene Fragen (Interrogation Gate)

Jede Frage hat einen Vorschlag; «wie vorgeschlagen» als Antwort reicht.

**O1 — Produkt/Variante: eigene Tabellen oder Spalten auf `products`?** Der Auftrag beschreibt
`products` (Hauptkategorie) und `product_variants` (mit Preis). Heute ist `products` bereits die
Varianten-Ebene, auf die alle Fremdschlüssel zeigen. *Vorschlag:* `products` bleibt die
Varianten-Ebene und bekommt zwei neue Spalten `category` (`red_castle | saisonabo | mitglieder`)
und `variant` (`gold | silber | bronze | normal` bzw. `erwachsene | reduziert | legi` bzw.
`persoenlich | uebertragbar`), eindeutig pro Saison; die gültigen Kombinationen stehen in einer
kleinen Lookup-Tabelle `product_variant_catalog (category, variant)`, auf die ein
Fremdschlüssel zeigt — ungültige Kombinationen (Saisonabo + Gold) sind damit per Constraint
ausgeschlossen. Kein Umbau von `order_items`/`tickets`, kein Risiko für die 700 bestehenden
Bestellungen. Alternative: echte Tabellen `products`/`product_variants` mit Umverdrahtung aller
Fremdschlüssel — ein grosser Migrationsschritt ohne funktionalen Gewinn.

**O2 — Red Castle «Normal»:** bleibt die persönliche Stufe (300.–, 1 Karte auf Personennamen) als
vierte Variante bestellbar? Der Auftrag nennt nur Gold/Silber/Bronze und «immer Firmenname».
*Vorschlag:* Normal bleibt als Variante bestehen, folgt aber demselben Rechnungs-Flow; auf der
Karte steht der Firmenname (Regel gilt für die ganze Kategorie). Falls Normal nicht mehr über den
Shop laufen soll: deaktivieren.

**O3 — «Anzahl Tickets» beim Red-Castle-Paket:** heute ist die Kartenzahl pro Stufe fix (Bronze 2,
Silber 2, Gold 3, Normal 1). Im CSV-Beispiel hat Gold aber `anzahl = 4`. *Vorschlag:* Im Shop
wählt der Sponsor die Stufe; die Kartenzahl ist die der Stufe, ohne Eingabefeld (der Preis ist ein
Paketpreis, ein freies Feld hätte keinen Preis). Im Import gilt `anzahl` aus der Datei als
gegeben (Altbestände dürfen abweichen). Falls Sponsoren im Shop tatsächlich mehr Karten wählen
dürfen: bitte sagen, zu welchem Preis (pro Zusatzkarte?).

**O4 — `ticket_name` vs. `holder_name`:** *Vorschlag:* die bestehende Spalte `tickets.holder_name`
ist das `ticket_name` des Auftrags (gleiche Bedeutung, gleicher Snapshot-Zeitpunkt); sie wird
nicht umbenannt, damit PDF, Admin, Scanner und die 763 bestehenden Tickets unverändert
funktionieren. Die Regel «red_castle → Firmenname, saisonabo → Vor- und Nachname» wandert an
eine zentrale Stelle in der Ticket-Erzeugung (`src/lib/tickets/issue.ts` + Bestellfunktion).
Alternative: zusätzliche Spalte `ticket_name`, die dann doppelt gepflegt werden müsste.

**O5 — `download_token`:** *Vorschlag:* der bestehende signierte Link (D54) bleibt der
Ticket-Link; keine neue Spalte. Er ist kryptografisch nicht erratbar (HMAC-SHA256 mit eigenem
Secret) und steht bereits in allen verschickten Mails. Eine zufällige Spalte brächte nur dann
etwas, wenn ein einzelner Link widerrufbar sein soll — dafür sehe ich keinen Bedarf. Wenn doch
gewünscht: bitte sagen, dann kommt `orders.download_token` (32 Bytes Zufall) und der Link wechselt.

**O6 — Auto-Storno nach 14 Tagen (D14):** *Vorschlag:* der Job cancelt nur noch Bestellungen
ohne ausgestellte Tickets (also Saisonabo-Vorkasse), nie Rechnungsbestellungen (`payment_method =
'invoice'`). Alternative: Job ganz abschalten, da Storno neu ein bewusster Admin-Schritt mit
Dialog ist. Was ist dir lieber?

**O7 — Saisonabo im Shop: weiterhin Vorkasse (Tickets erst bei `bezahlt`)?** Der Auftrag
beschreibt den Rechnungs-Flow nur für Red Castle. *Vorschlag:* ja, Saisonabo-Shopbestellungen
bleiben wie heute (Tickets bei `bezahlt`); nur `red_castle` stellt Tickets sofort bei `neu` aus.
Sobald der Shop dereinst Saisonabos wieder verkauft, kann das per Entscheid umgestellt werden.

**O8 — Red-Castle-Bestellung: eigenes Formular oder Warenkorb?** *Vorschlag:* eigene Seite
`/red-castle-club/bestellen?variante=gold` mit dem Firmenformular (Firma, Kontaktperson,
Rechnungsadresse, E-Mail, Referenz/PO optional, Pflicht-Checkbox 30 Tage netto, Turnstile),
ohne Warenkorb — Zahlungsart und Daten unterscheiden sich vom Saisonabo-Checkout, und ein
gemischter Warenkorb (Saisonabo + Red Castle) hätte zwei Zahlungsarten. Die «Auswählen»-Buttons
auf `/red-castle-club` führen direkt dorthin.

**O9 — Telefonnummer im Red-Castle-Formular:** heute Pflicht im Checkout; der Auftrag nennt sie
nicht. *Vorschlag:* optionales Feld.

**O10 — Firmendaten: auf `orders` oder auf `customers`?** Der Auftrag listet `company_name`,
`contact_person`, `billing_address` etc. auf `orders`. *Vorschlag:* die Adress- und
Kontaktfelder bleiben in `customers` (dort liegen sie heute, Export und Admin lesen sie dort);
`customers` bekommt `company_name`, `contact_person`, `customer_reference` dazu. `orders`
bekommt, was zur Bestellung gehört: `payment_method`, `invoice_number`, `terms_accepted_at`,
`external_ref`, `import_batch_id`, `notification_status`, `notified_at`.

**O11 — `source`-Wert:** `csv_import` (bestehend, 699 Zeilen) beibehalten statt `import`?
*Vorschlag:* beibehalten; das Wort im UI heisst «Import».

**O12 — Was zählt als «informiert» (`notification_status`)?** Heute gibt es zwei Marker: die
automatische Bestätigung (`confirmation_email_sent_at`) und pro Karte `card_sent_at` (manueller
Versand). *Vorschlag:* `notification_status`/`notified_at` auf `orders` werden **nur vom
manuellen Versand** gesetzt (Einführungs-Mail); die automatische Shop-Bestätigung setzt weiterhin
`confirmation_email_sent_at`. Filter «Noch nicht informiert» = `notification_status =
'nicht_versendet'`. Sollen Shop-Bestellungen, die die automatische Bestätigung bekommen haben,
im Filter trotzdem als «nicht informiert» erscheinen? *Vorschlag:* ja — die Einführungs-Mail ist
etwas anderes als die Bestätigung; im Standard-Filter sind sie aber per Quelle = Import ohnehin
ausgeblendet.

**O13 — Mail-Inhalt beim manuellen Versand:** Tickets als PDF-Anhang **und** Link (wie bei den
Mitgliedern) oder nur Link? *Vorschlag:* Anhang und Link — Sponsoren leiten die PDFs weiter, und
der Link ist die dauerhafte Rückkehr.

**O14 — Platzhalter-Syntax:** Mitglieder-Versand nutzt `{{vorname}}`; der Auftrag nennt `{name}`,
`{firma}`, `{bestellnummer}`, `{variante}`, `{ticket_link}`. *Vorschlag:* die generische
Komponente versteht beide Schreibweisen (`{name}` und `{{name}}`), die Vorlagen verwenden die
einfache aus dem Auftrag; bei Mitgliedern bleiben `vorname`/`nachname` zusätzlich verfügbar.

**O15 — Vorlagen im Code oder in der Datenbank?** *Vorschlag:* im Code (`src/lib/email/
templates.ts`), editierbar im Dialog vor dem Versand — so wie heute bei den Mitgliedern. Eine
Vorlagen-Verwaltung im Admin wäre ein eigener Auftrag.

**O16 — Testmail «an die eigene Adresse»:** die Login-Adresse des angemeldeten Admins, fix?
*Vorschlag:* ja, vorbelegt mit der Admin-Adresse, überschreibbar.

**O17 — Batch-Rollback:** hart löschen (Bestellungen, Positionen, Tickets, PDFs, Kunden des
Batches) oder stornieren? *Vorschlag:* hart löschen, aber nur solange kein Ticket des Batches
je gescannt wurde (`scan_events` verweist auf Tickets und darf nicht verändert werden); sonst
verweigert der Rollback mit Hinweis, und der Weg ist Stornieren pro Bestellung. Der Rollback
braucht dafür Löschrechte, die heute bewusst niemand hat — sie kommen als eigene, geprüfte
Funktion `rollback_import_batch()` nur für Bestellungen mit `import_batch_id`.

**O18 — `bestelldatum` aus dem CSV:** als `orders.created_at` übernehmen? Das beeinflusst die
Datumsspalte im FIBU-Export und die Sortierung. *Vorschlag:* ja; das Importdatum steht separat
im Batch.

**O19 — Interne Benachrichtigungsadresse:** neue ENV-Variable `ORDER_NOTIFICATION_EMAIL`
(Kassierin/Fibu). Betreff: «Neue Sponsorenbestellung UHCU-2627-0012 – Rechnung erstellen» (echte
Bestellnummer statt #1234). *Vorschlag:* so umsetzen; Adresse trägst du in Vercel ein.

**O20 — Unit-Test-Runner für die Mail-Tests:** es gibt keinen. *Vorschlag:* Vitest (versteht die
`@/`-Pfade aus `tsconfig.json` ohne Umwege), Script `npm test`; Resend wird gemockt. Playwright
bleibt für E2E.

**O21 — Filter «Produkt»/«Variante» im Reiter Bestellungen:** eine Bestellung hat heute mehrere
Positionen (Warenkorb). *Vorschlag:* der Filter trifft, wenn irgendeine Position passt; Red-Castle-
Bestellungen haben ohnehin genau eine.

**O22 — Bestehende Playwright-Tests:** `rcc-membership-order.spec.ts` (Red Castle durch den
Warenkorb) wird durch einen Test des neuen Formulars ersetzt, nicht nebenher gepflegt. Einverstanden?

**D63 — No transfer badge; the order number moves under the transfer note.** Claudio, looking at a
printed member card, took the "NICHT ÜBERTRAGBAR" pill in the card's top row back out: the note
under the holder already says it, and the pill said it a second time. The order number leaves its
column beside the name and sits under that note, in the same small type - "Bestellung
UHCU-2627-0764" - so the name has the panel's whole width, which is also what a long holder name
needed: "Corinne Achermann Sommer" had shrunk to fit half a panel. Three layout directions for very
long company names were sketched on the canvas and set aside; the width freed here covers the case
for now. **Resolved.**

**D64 — VIP stars on club cards, no label over the name, the season number sits low.** Every Red
Castle Club subscription is a VIP card, and the card now says so the way a hotel does: one star for
Bronze, two for Silber, three for Gold, in the tier's metal, on the crest's line where the transfer
badge used to be; the Normal tier has none. Two smaller moves came with the same look at the card:
the "NAME" / "NAME / FIRMA" label over the holder is gone on every card - a name over a card needs
no caption - and the hollow season number no longer floats mid-band but sits a hand's breadth above
the name, with the title's space above it, which reads as one block with the holder line rather
than as a gap between two. **Resolved.**

**D65 — The season number sits on the golden section; the gold gets fuller.** Claudio wanted the
hollow season number "eingemittet im goldenen Schnitt" between the card's title and the name, on
every card: the space above it is 1.618 times the space below, which the eye reads as balanced
where a true centre looks high and D64's low anchor looked pushed down. And the Gold tier's metal
was too muted for him - it is now #cfa62b (from #b18d2b), still a print-safe ochre gold rather
than a neon yellow. D47 means the shop's Gold tier cards take the same tone, deliberately: the
web card and the printed pass keep agreeing on what "Gold" looks like. **Resolved.**

### Antworten Runde 1 (2026-09-16)

**D69 — Auto-Storno wird ganz abgeschaltet (ersetzt D14).** Stornieren ist neu ein bewusster
Admin-Schritt mit Bestätigungsdialog; kein Job cancelt mehr im Hintergrund. Der pg_cron-Eintrag
wird entfernt, die Funktion bleibt ohne Zeitplan stehen. **Entschieden (O6).**

**D70 — Red Castle: Firma ist optional, Besteller sind heute Privatpersonen.** Das Formular
erfasst Vorname und Nachname der bestellenden Person plus ein optionales Feld Firma. Die Regel
«immer Firmenname auf dem Ticket» aus dem Auftrag gilt damit nicht mehr; welcher Name auf die
Karte kommt, wenn eine Firma angegeben ist, ist noch offen (siehe O2b). **Teilweise entschieden (O2).**

**D71 — Wie vorgeschlagen entschieden:** O1 (Spalten `category`/`variant` auf `products` mit
Lookup-Tabelle), O4 (`holder_name` bleibt das Ticket-Name-Feld), O5 (signierter Link bleibt, keine
`download_token`-Spalte), O9 (Telefon optional), O10 (Firmendaten auf `customers`, Bestellfelder auf
`orders`), O11 (`csv_import` bleibt), O12 (`notification_status` nur durch manuellen Versand),
O13 (PDF-Anhang und Link), O14 (beide Platzhalter-Schreibweisen), O15 (Vorlagen im Code),
O16 (Testmail an Admin-Adresse, überschreibbar), O17 (Rollback löscht hart, nur ohne Scans),
O18 (`bestelldatum` wird `created_at`), O19 (`ORDER_NOTIFICATION_EMAIL`), O20 (Vitest),
O21 (Filter trifft irgendeine Position), O22 (Playwright-Test wird ersetzt). **Entschieden.**

**D72 — Eigenes Red-Castle-Formular, DSG-konform (O8).** Claudio: «halte dich an die DSG-
Verordnung, wenn das geht, dann ja.» Ein eigenes Formular ist mit dem revidierten Datenschutzgesetz
(DSG, seit 1.9.2023) vereinbar, solange es Datensparsamkeit einhält: nur Felder, die für Rechnung
und Ticket nötig sind, Zweck beim Formular genannt, Link auf `/datenschutz`, keine Weitergabe
ausser an Resend (Mailversand) und Cloudflare (Turnstile) — beides ist in der Datenschutzerklärung
zu nennen, falls noch nicht geschehen. Die Pflicht-Checkbox bezieht sich nur auf die
Zahlungsbedingungen; eine separate Einwilligungs-Checkbox für die Datenverarbeitung ist nach DSG
nicht nötig, weil die Verarbeitung zur Vertragserfüllung erfolgt. **Entschieden.**

**Noch offen nach Runde 1:**
- **O2b** — Name auf der Karte, wenn eine Firma angegeben ist: Firma oder Person? Vorschlag:
  Firma, falls angegeben, sonst Vor- und Nachname.
- **O3** — Kartenzahl pro Red-Castle-Paket: fix pro Stufe oder frei wählbar (dann zu welchem Preis)?
- **O7** — Saisonabo-Shopbestellungen: weiterhin Tickets erst nach Zahlung, oder wie Red Castle
  sofort mit Rechnung nachher?
- Claudio ergänzt die Feldliste (siehe Anhang «Erfasste Attribute» unten).

### Anhang — Erfasste Attribute (Stand heute) und geplante Ergänzungen

Was der Shop und der Admin heute pro Datensatz speichern. Fett = im Shop-Checkout vom Kunden
selbst eingegeben; die anderen entstehen im System oder im Admin.

**Kunde (`customers`)** — **Name**, **E-Mail**, **Telefon** (Pflicht), **Strasse und Nr.**,
**PLZ**, **Ort**, Land (fix «CH»), Mitgliedernummer (Spalte vorhanden, wird nirgends befüllt).

**Bestellung (`orders`)** — Bestellnummer (UHCU-2627-0001, automatisch), Status (neu /
Rechnung versendet / bezahlt / storniert), Saison, Quelle (Shop / Import), Total, Rückerstattung
offen (ja/nein), Bestelldatum, Bestätigungsmail versendet am, Dateien übergeben am.

**Position (`order_items`)** — Produkt (Name-Snapshot), Anzahl, Einzelpreis zum Bestellzeitpunkt,
**Name auf der Karte** (bei übertragbaren Paketen ein gemeinsamer Name, z.B. Firma).

**Ticket (`tickets`)** — Name auf der Karte, übertragbar (ja/nein), laufende Nummer
(übertragbar-1, -2, …), Status (gültig / eingelöst / storniert / ersetzt), ersetzt Ticket X,
ausgestellt am, per Mail versendet am, PDF-Datei.

**Mitglied (`members`, nur Mitglieder-Import)** — Mitgliedsnummer, Vorname, Nachname, E-Mail,
Kategorie, Anzahl persönliche Karten, Anzahl übertragbare Karten, importiert am.

**Geplant neu (dieser Auftrag)** —
Kunde: Vorname und Nachname statt eines Namensfelds (für Red Castle), Firma (optional),
Kontaktperson (= die bestellende Person), Referenz/PO-Nummer (optional), Telefon neu optional.
Bestellung: Zahlungsart (Red Castle fix «Rechnung»), Rechnungsnummer (Fibu), Zahlungsbedingungen
akzeptiert am, externe Referenz (alte Bestellnummer aus dem CSV), Import-Batch, Benachrichtigung
(nicht versendet / versendet / fehlgeschlagen) und Zeitpunkt.
Produkt: Kategorie (Red Castle / Saisonabo / Mitglieder) und Variante (Gold, Silber, Bronze,
Normal / Erwachsene, Reduziert, Legi / persönlich, übertragbar).

### Antworten Runde 2 (2026-09-16)

**D73 — Name auf der Karte (O2b): Firma, falls angegeben, sonst Vor- und Nachname.** Gilt für
Red Castle; Saisonabo druckt immer Vor- und Nachname. Die Regel liegt zentral in der
Ticket-Erzeugung. **Entschieden.**

**D74 — Red-Castle-Pakete: Paketpreis fix, Kartenzahl pro Stufe im Admin einstellbar (O3).**
Gold 5000.– = 3 übertragbare VIP-Saisonkarten, Silber und Bronze analog, Normal = 1 nicht
übertragbare Saisonkarte ohne VIP-Status. Die Kartenzahl und die Übertragbarkeit pro Stufe müssen
unter Einstellungen → Preise editierbar sein (heute liegen sie in `products.benefits`
als `included_passes`/`transferable`, aber ohne Eingabefeld im Produktformular — das kommt dazu).
Im Shop gibt es kein Anzahl-Feld. Zusätzlich, **nur für den Import dieser Saison**: Variante
`spezial` = 2 übertragbare Saisonkarten ohne VIP-Status, im Shop nicht bestellbar
(`active = false`). Damit kennt der Import die Red-Castle-Varianten gold, silber, bronze, normal
und spezial; `anzahl` aus dem CSV darf von der Stufe abweichen. **Entschieden.**

**D75 — Saisonkarten wechseln ebenfalls auf den Rechnungs-Ablauf (O7):** Tickets entstehen
sofort bei der Bestellung, nicht erst bei `bezahlt`. Der Auto-Storno ist ohnehin weg (D69).
**Entschieden.** Offen bleibt, wer die Karten dem Kunden übergibt — siehe O7b.

**D76 — Rechnungsadresse wird auch im neuen Red-Castle-Formular erfasst** (Strasse und Nr.,
PLZ, Ort, wie heute). **Entschieden.**

**Noch offen nach Runde 2:**
- **O7b — Wer übergibt die Karten?** Claudio: «die Karten dürfen nur generiert und
  heruntergeladen werden, nicht automatisch versendet; versenden tut das Fibu-Büro zusammen mit
  der Rechnung, sie passen lediglich den Status an.» Das widerspricht Abschnitt 2 des Auftrags
  (Bestätigungsseite mit PDF-Download, Bestätigungsmail mit Tickets/Link). Zwei Lesarten:
  - **A:** Der Kunde bekommt die Karten sofort — Download auf der Bestätigungsseite und Link in
    der automatischen Bestätigungsmail. Das Büro schickt die Rechnung separat und stellt den Status um.
  - **B:** Der Kunde bekommt sofort nur eine Bestätigungsmail *ohne* Karten. Das Büro lädt die
    PDFs im Admin herunter, schickt sie zusammen mit der Rechnung aus der Fibu und stellt den
    Status auf «Rechnung versendet». Der Kunden-Link zeigt die Karten erst ab diesem Status.

### Antworten Runde 3 (2026-09-16) — Gate geschlossen

**D77 — Karten übergibt das Büro, nicht der Shop (O7b = Variante B).** Bei jeder Shop-Bestellung
(Red Castle und Saisonkarte) entstehen die Tickets sofort, aber der Kunde bekommt sie nicht
automatisch: die Bestätigungsmail geht ohne Karten raus (Bestellübersicht, Rechnungshinweis,
Kunden-Link), die Bestätigungsseite zeigt den Kunden-Link. Das Büro lädt die PDFs im Admin
herunter, schickt sie zusammen mit der Rechnung aus der Fibu und setzt den Status auf
«Rechnung versendet»; erst ab diesem Status (und bei «bezahlt») zeigt der Kunden-Link die Karten
zum Download. Importierte Bestellungen tragen ihren Status aus dem CSV und zeigen die Karten
entsprechend. Abschnitt 2 des Auftrags (PDF-Download auf der Bestätigungsseite, Tickets in der
Bestätigungsmail) ist damit überholt. **Entschieden.**

**D78 — Übergänge exakt nach Auftrag, also kein Storno einer bezahlten Bestellung.** Erlaubt:
`neu → rechnung_versendet → bezahlt`, `neu | rechnung_versendet → storniert`. Eine bezahlte
Bestellung kann nicht mehr storniert werden (bisher ging das, D16 nutzte es für Rückerstattungen).
Konsequenz: eine falsch importierte, bereits bezahlte Bestellung wird über den Batch-Rollback
entfernt, nicht storniert; `refund_owed` bleibt für bestehende stornierte Bestellungen erhalten.
Bewusst nach Auftrag umgesetzt — wenn Storno nach Zahlung doch nötig ist, ist es eine
Zeile in `transition_order_status()`. **Entschieden, leicht umkehrbar.**

### Umsetzung (2026-09-16/17) — Notizen, die nicht aus dem Code hervorgehen

**D79 — Import: Red Castle braucht Firma *oder* Person.** Der Auftrag sagt «bei red_castle ist
firma Pflicht»; mit D70 (Besteller sind Privatpersonen) und D73 (Firma, sonst Person) gilt im
Import dieselbe Regel wie im Formular: eine Zeile ohne Firma ist gültig, wenn Vor- und Nachname da
sind. Saisonabo verlangt weiterhin beide Namen. **Entschieden, aus D70 abgeleitet.**

**D80 — Storno-Semantik im Rollback.** Ein Batch wird hart gelöscht (D71/O17) und der Rollback
verweigert, sobald *irgendeine* Karte des Batches gescannt wurde — auch aus einer anderen Bestellung
desselben Batches. Einzelne Bestellungen bleiben dann über Stornieren erreichbar. Stornierte
Zeilen aus dem CSV werden ohne Karten importiert. **Entschieden.**

**D81 — Was der Import nicht übernimmt.** Den Betrag: der Preis wird beim Import aus dem
Produkt eingefroren, wie bei jeder Bestellung (`order_items.unit_price_rappen`). Für «Spezial»
steht der Preis auf 0, bis Claudio ihn unter Einstellungen → Preise setzt — **vor dem ersten
Import**, sonst tragen die importierten Bestellungen 0. Adressen: das CSV hat keine, `customers`
bleibt dort leer (kein Problem für Karten und Kundenlink; für eine Nachrechnung müsste sie im
Admin nachgetragen werden — heute nicht vorgesehen). **Bewusst so.**

**D82 — Rate-Limit beim Versand.** Sequenziell mit 600 ms Abstand (Resend erlaubt zwei Requests
pro Sekunde), in Fünferblöcken aus dem Browser, damit die Fortschrittsanzeige läuft. Jeder
Empfänger bekommt sein eigenes Ergebnis auf der Bestellung (`notification_status`,
`notification_error`). **Entschieden.**

**D83 — Saisonkarten-Checkout.** Der bestehende Warenkorb bleibt (Saisonkarten sind ohnehin auf
«Website» geschaltet), bekommt aber die Pflicht-Checkbox 30 Tage netto, stellt die Karten sofort
aus und sagt in Bestätigung und Mail, dass Rechnung und Karten vom Büro kommen (D75/D77).
Telefon bleibt dort Pflicht; im Red-Castle-Formular ist es optional (O9). **Entschieden.**

**D84 — Vitest als Unit-Test-Runner (O20).** `npm test` läuft `tests/unit/**` mit gemocktem
Resend: ein Import erzeugt 0 Mails, eine Shop-Bestellung genau eine Kunden- und eine interne
Mail, plus CSV-Regeln und Platzhalter. `@types/node` wurde dafür auf ^22 angehoben (Node 24
lokal). Playwright bleibt für E2E: `rcc-membership-order.spec.ts` ist durch
`red-castle-order.spec.ts` ersetzt (O22), dazu `order-import.spec.ts` und der erweiterte
`customer-order-status.spec.ts` (Rechnungsnummer-Dialog, Storno sperrt Karten). **Entschieden.**

**D85 — Stand der Tests am Ende der Umsetzung (2026-09-17).** Unit (Vitest): 18/18. pgTAP: 161
Assertions, die neun Abweichungen waren veraltete Aufrufe im Suite-Text (`reissue_ticket`,
`create_member_order`-Signatur) und sind korrigiert. Playwright lokal: 9 von 11 Specs grün; die
zwei übrigen (`season-pass-order`, `sales-channel-switch`) brauchen das Testprodukt «TEST - Bitte
nicht kaufen» sichtbar im Shop, das seit 15.9.2026 deaktiviert ist (Audit-Log, Admin
thomasschmid777) - sie sind nicht kaputt, sondern blockiert; die RPC-gestützten Specs weichen
seither auf «Sponsoren Legi» aus, wenn das Testprodukt inaktiv ist. Nebenbefund, behoben: die
Mitgliederliste brach bei ~480 Mitgliedern mit «fetch failed», weil alle Order-IDs in einer
URL standen - die Karten werden jetzt in 100er-Scheiben geladen. Playwright lokal: auf Port 3000
lief ein fremdes Projekt; die Suite läuft mit `PLAYWRIGHT_PORT=<Port des laufenden Dev-Servers>`.

**D86 — Die Red-Castle-Bestellseite zeigt die Karte, die bestellt wird.** Claudio fand das
Formular korrekt, aber unpersönlich: «könnte noch etwas kreativer gestaltet werden, packe das Logo
rein und die Farben der gewählten Stufe». Statt Logo und Metallton als Dekoration oben anzusetzen,
wird die Zusammenfassung rechts zur Karte selbst - gezeichnet wie die gedruckte (D59/D65):
schwarzer Korpus mit 24px-Radius, Club-Logo, VIP-Sterne und Stufenwort im Metallton, Saisonzahl als
Kontur im goldenen Schnitt zwischen Titel und Name, Abrissstub im Metallton mit Perforation und
Kerben. Der Name auf der Karte folgt der Eingabe, sodass D73 (Firma, sonst Person) sichtbar wird
statt erklärt werden zu müssen. Drei Variablen tragen die Stufe durch die Seite (`--tier`,
`--tier-ink`, `--tier-tint`).

`--tier-ink` ist neu in `tier-colors.ts`: die Metalltöne sind für die schwarze Karte abgestimmt und
erreichen auf Weiss nur 2.2:1 (Gold) bzw. 3.0:1 (Silber), dürfen dort also weder Text noch Linien
setzen. Der Ink-Wert ist derselbe Farbton, abgedunkelt bis über 4.5:1, und wird ausschliesslich auf
hellem Grund verwendet; auf Schwarz bleibt es beim Metall, damit Web und Druck weiterhin dasselbe
«Gold» meinen (D47).

Die Formularfelder waren erneut zu gross: der gemeinsame Input steht in 18px mit der Zeilenhöhe
1.6 des Fliesstexts, was bei elf Feldern türmt. Auf dieser Seite sind sie auf 16px, Zeilenhöhe 1.25
und 38px Höhe gesetzt, auf Touch-Geräten weiterhin 44px. Dazu höchstens zwei Spalten, PLZ schmal,
und die Formularspalte bei 34rem gedeckelt - ein Namensfeld über die halbe Seite lädt zum Aufsatz
ein. Die Kasse bleibt unverändert; die Regel ist auf diese Seite begrenzt. **Entschieden.**

**Nachtrag zu D86 (gleicher Tag):** Claudio fand die Seite «massiv besser», die schwarze
Kartenfläche aber noch nicht gut - «kannst du das noch anders gestalten, mit dem Logo einzeln?».
Der Wortmarken-Logo sass klein in der Ecke und sagte «Red Castle Club» ein zweites Mal direkt über
einem Titel, der es ausschreibt; sein Rot ging auf Schwarz zudem unter. Neu steht das Wappen
allein: `red-castle-club-icon.png` als CSS-Maske statt als Bild, eingefärbt im Metallton der Stufe,
gross und von der Kartenkante angeschnitten - ein Grafikelement der Karte statt eines Logos im Eck.
Die VIP-Sterne stehen jetzt beim Stufenwort, wo sie hingehören, und die Saisonzahl läuft klein in
der Kopfzeile mit, weil ein zweites Wasserzeichen neben dem Wappen zu viel war. Drei Varianten
wurden gebaut und vorgelegt (Wappen klein oben links / gross und transparent hinter dem Text /
massiv angeschnitten); **Claudio hat die zweite gewählt**: das Wappen gross bei 0.3 Deckkraft
hinter dem Text, wie ein in die Karte geprägter Stempel. Deckkraft nicht tiefer, weil Silber - der
matteste der drei Töne - darunter praktisch verschwindet; nichts liegt über dem Text, der Kontrast
der Schrift bleibt also unberührt. Die Karte ist ausserdem auf 24rem gedeckelt, damit sie im
gestapelten Layout nicht zum Banner über die ganze Seitenbreite wird.

**D87 — Der Bestell-Import bekommt die Feldzuordnung des Mitglieder-Imports.** Claudio: «der Import
bei den Bestellungen funktioniert nicht so wie bei den Mitgliedern, bitte den gleichen Prozess, also
mit Felderzuordnung». Der erste Wurf verlangte exakt die Spaltennamen aus dem Auftrag
(`external_ref;produkt;variante;…`) und lehnte jede echte Exportdatei ab. Neu: Datei → Zuordnung →
Vorschau → Import, wie bei den Mitgliedern. Die Zuordnung wird aus den Kopfzeilen vorgeschlagen
(Aliasse für die üblichen deutschen und englischen Bezeichnungen) und vom Admin bestätigt oder
korrigiert; ohne Zuordnung aller Pflichtfelder bleibt «Weiter» gesperrt und nennt die fehlenden.

Zwei Dinge gehen über den Mitglieder-Import hinaus, weil die Altdaten es verlangen:

1. **Fester Wert für die ganze Datei** bei Produkt, Variante, Anzahl und Status. Ein Export nur mit
   Red-Castle-Bestellungen schreibt nirgends «red_castle» hin - das weiss das Büro über die Datei,
   nicht die Datei über sich. Ohne diese Möglichkeit wäre so eine Datei gar nicht importierbar.
2. **Werte werden normalisiert**: «Red Castle Club» → red_castle, «Gold» → gold, «Bezahlt»/«Paid» →
   bezahlt, «Rechnung versendet»/«fakturiert» → rechnung_versendet. Verglichen wird über einen Slug
   (Umlaute ausgeschrieben, alles andere zu Wörtern), gegen den Variantenschlüssel *und* gegen das
   Label aus `product_variant_catalog` - «Sponsoren Legi» findet also `legi`.

Ohne Anzahl-Spalte gilt `included_passes` des Pakets, was der Normalfall ist: eine Zeile pro
Bestellung, ohne zu wiederholen, was im Paket steckt. **Entschieden.**
