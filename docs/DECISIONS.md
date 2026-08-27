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
