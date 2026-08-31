# Architecture — UHC Uster Ticket Shop (Phase 0 draft)

Status: **planning only**. No application code exists yet (see Repository State below). Everything
in this document describes the target architecture per the brief; it will be revisited once Phase
0.5 answers are in.

## 1. Repository state as found

- Not a git repository (`.git` absent).
- No `package.json`, no Next.js scaffold, no `supabase/` folder, no `.env*` file anywhere in the tree.
- Contents present: the brief itself (`claude-code-prompt-uhcu-ticketshop-en.md`), a club logo
  (`Bilder_Videos/UHCUster_Logo_neu.jpg`), and Claude Code skill scaffolding (`.claude/`, `.agents/`,
  `skills-lock.json`).
- The `uhcusterdesignanalyse.md` referenced in the brief as the design baseline **is not in the
  repo**. This is an open question (see below and `docs/DECISIONS.md`).
- Consequence for the phase plan: **Phase 1 must include scaffolding the Next.js app, connecting it
  to Vercel, and initializing the Supabase CLI project link** — the brief's phase list assumes a
  repo skeleton that doesn't exist yet. Folded into Phase 1 in `docs/PHASE-PLAN.md`.

## 2. Supabase connection check

Two projects exist on the connected Supabase account, in organization **"Büsnei from CS"**
(`kehkzusdmuybcqhwnfsg`), plan **Free** — not Pro as the brief's hard constraints assume:

| Project | Ref | Status | Contents |
|---|---|---|---|
| `WebsidesClients` | `eznfstaxjtaxpdbqfftr` | INACTIVE | Not inspected further (paused); name suggests a shared multi-client hosting project, not ticket-shop-specific. |
| `improveyourskills` | `rrbammpuowneztbxpcht` | ACTIVE_HEALTHY | Unrelated client site — tables are `admins`, `content_blocks`, `team_members`, `carousel_images`, `testimonials`, `stats`, `site_settings`, `gallery_photos`, `contact_messages`, `home_facts`. Clearly a different business (coaching/personal training), not UHC Uster. |

**Neither project is the ticket shop, and no project is on the Pro plan.** This is a real blocker
against the brief's hard constraint ("Supabase Pro") and needs a decision before Phase 1: create a
new project (and upgrade the org, or a new org, to Pro), or repurpose one of the above. Logged as an
open question.

## 3. System overview (target state)

```
Customer browser                Next.js (Vercel)                  Supabase
─────────────────                ─────────────────                 ────────────────
Public shop pages    ──GET──▶    Server Components        ──SQL──▶ products (RLS: active=true
                                  read active products               readable by anon)
                                                                     price_history

Cart (in-memory only,
no storage APIs)     ──submit──▶ Server Action / route     ──SQL──▶ customers, orders (neu),
  sends product IDs +            handler:                          order_items (price frozen
  quantities only                 - verify Turnstile                at insert time, resolved
                                  - resolve prices server-           server-side only)
                                    side from `products`
                                  - never trusts client
                                    amounts

Confirmation page     ◀─────────  order number, no email sent anywhere in this path

                                  ┌── admin area (Supabase Auth, gated by admin_users) ──┐
Club office browser  ──login──▶  │  order overview, status transitions, price mgmt,     │
                                  │  schedule mgmt, XLSX export                          │
                                  └───────────────────────────────────────────────────────┘
                                        │ status: neu → rechnung_versendet → bezahlt
                                        ▼ (on transition to bezahlt)
                                  Server-side ticket issuance:
                                   - insert `tickets` row per order item
                                   - build signed token (HMAC-SHA256, Base32, <40 chars;
                                     secret is server-env-only)
                                   - render season-pass PDF (pdf skill) with QR of the token
                                   - render Apple .pkpass (if certs present) and
                                     Google Wallet pass (if service account present)
                                   - store all artefacts in Supabase Storage
                                  Admin order detail view:
                                   - per-file download buttons + "download all as ZIP"
                                   - copyable customer/amount block for the accounting software
                                   - manual "files handed over" marker + timestamp
                                  Nothing is emailed. The office attaches the downloaded files
                                  by hand in the accounting software.

Scanner PWA (match day)          Before doors open: downloads the full valid-ticket set for
 (offline-first)                 that game into memory over a normal authenticated request.
                                  Per scan: decode token, verify signature/validity, check
                                  local set, mark redeemed locally, broadcast the redemption
                                  to other scanner devices over a Supabase Realtime channel.
                                  If the network drops, keeps scanning independently and
                                  reconciles later (residual double-scan risk, documented in
                                  docs/OPERATIONS.md once written in Phase 7/8).
```

## 4. Token verification model — resolved 2026-08-26 (see `docs/DECISIONS.md` D13)

The brief asks for two things that are in tension:

1. Phase 6.1: tokens are **HMAC-SHA256**, Base32-encoded, **under 40 characters total**, secret
   **server-side only, never shipped to the client**.
2. Phase 7.2: the scanner **verifies the signature locally, offline**, before doors open.

HMAC is symmetric — verifying a signature requires the same secret used to create it. If the secret
never reaches the scanner device, the scanner cannot actually check the signature; it can only check
whether the scanned token appears in the pre-downloaded valid-ticket list for that game. That set
membership check is already a complete authorization check on its own (a token not issued by the
server for this game simply won't be in the list), which makes the signature useful mainly as:
- a fast, cheap pre-filter to reject garbage/malformed scans before touching the local set, and
- a defence against someone tampering with the locally cached list on a compromised device.

A 40-character budget also rules out asymmetric alternatives (Ed25519 signatures alone are 64 bytes
— already over budget before encoding), so "ship a public key to the scanner and verify a real
signature offline" doesn't fit the length constraint either.

This needed a decision, not a silent assumption: is the "invalid signature" rejection reason in
Phase 7.3 actually reachable, or does it collapse into "not in the local valid set"?

**Resolved:** confirmed with Claudio that any ticket, however it was created (shop order, Red Castle
Club bundle, or CSV member import), only becomes scannable by existing as a row in `tickets` — a
signature alone cannot establish current validity (redeemed vs. not, voided/replaced, correct game).
So the design is: the local valid-ticket set downloaded before doors open is the authoritative
source of truth; the HMAC signature is a cheap pre-filter / tamper-defence on top of it, not a
replacement for it. "Invalid signature" (malformed/forged token) and "not in the local valid set"
(well-formed but not authorized, or already synced-out) remain two distinct, both reachable,
rejection reasons at the scanner.

## 5. Environment variables

Set up in Phase 1: `.env.example` (committed, names only) and `.env.local` (gitignored, real
values — Supabase URL and publishable key populated from the "UHC Uster - Ticketshop" project;
`SUPABASE_SERVICE_ROLE_KEY` left blank with a `TODO(claudio)` since Claude has no way to fetch that
secret and shouldn't handle it even if it could). Names only below, no values, per the brief's rule
against printing `.env` contents.

| Variable | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Supabase's modern publishable key (`sb_publishable_...`), RLS-constrained — used instead of the legacy anon JWT per Supabase's current recommendation for new projects |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | Set by Claudio directly in `.env.local`. Used by the Swiss Unihockey sync and by `create_order()`'s Server Action — both session-less server contexts, never a shared client used elsewhere |
| `CRON_SECRET` | server-only | Set once deployed to Vercel; Vercel sends it back as `Authorization: Bearer …` on scheduled requests, which `/api/sync/swissunihockey` checks so the sync can't be triggered by an arbitrary public GET |
| `TICKET_TOKEN_SECRET` | server-only | HMAC signing key for ticket tokens (Phase 6) |
| `SCANNER_SESSION_SECRET` | server-only | HMAC signing key for scanner-device session tokens (Phase 7) — a separate secret from `TICKET_TOKEN_SECRET` on purpose, different security domain |
| `ORDER_LINK_SECRET` | server-only | HMAC signing key for the customer order links behind `/meine-tickets` (D54) - a third, separate secret from `TICKET_TOKEN_SECRET` and `SCANNER_SESSION_SECRET`, same reasoning |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public | Cloudflare Turnstile widget on `/kasse`. Currently Cloudflare's public always-pass test key (`docs/DECISIONS.md` D25) — swap for a real Turnstile site's key before launch |
| `TURNSTILE_SECRET_KEY` | server-only | Server-side Turnstile verification in the checkout Server Action. Currently the matching test secret — same swap needed |
| `APPLE_WALLET_PASS_TYPE_ID` | server-only | Apple Wallet pass type identifier |
| `APPLE_WALLET_TEAM_ID` | server-only | Apple Developer team ID |
| `APPLE_WALLET_CERTIFICATE` / `_PASSWORD` | server-only | Apple pass-signing certificate - not built (D28); `docs/WALLET-SETUP.md` doesn't exist yet and isn't needed unless this work resumes |
| `APPLE_WALLET_WWDR_CERTIFICATE` | server-only | Apple WWDR intermediate certificate |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | server-only | Google Wallet API service account credentials |
| `GOOGLE_WALLET_ISSUER_ID` / `_CLASS_ID` | server-only | Google Wallet API identifiers |
| `NEXT_PUBLIC_SITE_URL` | public | Canonical site URL for absolute links. Read through `src/lib/site-url.ts`, which falls back to `VERCEL_PROJECT_PRODUCTION_URL` and then localhost - set it in production so the order link in a confirmation e-mail always points at the real domain (D54) |

Not needed, and must never be added: any email/SMTP provider credential, any payment provider key.

## 6. Admin application layer (Phase 5)

Three distinct Supabase client contexts, each for a different trust/session situation:

- **Public client** (`src/lib/supabase.ts::getSupabaseClient`) - anon/publishable key, used by the
  public shop's Server Components. Bound by RLS as `anon`.
- **Service-role client** (`src/lib/supabase.ts::getSupabaseAdminClient`) - bypasses RLS entirely,
  server-only. Reserved for genuinely session-less system work: the Swiss Unihockey cron sync,
  `create_order()`'s Server Action, and bootstrapping the very first admin account (no admin session
  can exist yet to do it any other way).
- **Session-aware client** (`src/lib/supabase-server.ts`, `src/lib/supabase-browser.ts`, via
  `@supabase/ssr`) - carries the logged-in admin's own cookie-based session, so `auth.uid()` resolves
  correctly inside `SECURITY DEFINER` functions and every audit-log row is attributed to the admin who
  actually made the change, not to a shared service identity. Every admin Server Action and page uses
  this client, never the service-role one - the service-role client would work (it bypasses RLS) but
  would silently break attribution.

**Route structure:** `src/app/(shop)/` groups the public site (Header/Footer/Cart/Toast in its own
layout); `src/app/admin/(auth)/` holds `/admin/login` and `/admin/setup`, reachable without a
session; `src/app/admin/(protected)/` holds everything else and re-checks both "is there a session"
(redirects to login) and "does that session's user have an `admin_users` row" (signs out and
redirects if not - defense in depth beyond `src/proxy.ts`, which only checks for *a* session, not
admin status specifically, so it can stay a cheap middleware-level check). Route Handlers (e.g. the
XLSX export's `/admin/export/download`) sit outside any layout, so they repeat the same `is_admin()`
check directly rather than relying on the layout to have run first.

**Admin surface, all built on the Phase 1 mutation functions:** order overview (filter by status,
search by order number or customer name - two parallel queries merged client-side, since PostgREST
can't `OR` a plain column against a joined table's column in one request) and detail with status
transitions (`transition_order_status`, `set_refund_owed`); price management (`products` list/create/
edit - a direct `price_rappen` update to trigger `price_history`, plus `update_product_details` for
everything else); schedule management (`games` list, per-row `eventfrog_url` edit, and a manual
"sync now" button that runs the same Swiss Unihockey upsert as the daily cron job, just through the
admin's own session instead of the service-role client); and an XLSX export (`exceljs`, two sheets,
see `docs/DECISIONS.md` D27).

## 7. Ticket issuance and PDFs (Phase 6)

On marking an order `bezahlt` (`src/app/admin/(protected)/orders/actions.ts::updateOrderStatus`),
`src/lib/tickets/issue.ts::issueTicketsForOrder` runs automatically: for every order item, one ticket
per unit of quantity gets a fresh id and an HMAC-SHA256 token (`src/lib/tickets/token.ts`, Base32,
26 characters - well under the 40-character budget), a rendered PDF (`src/lib/tickets/pdf.ts`,
pdf-lib + qrcode), and a path in the private `tickets` Storage bucket. All PDFs upload before any
database row is written, so a failed upload never leaves a `tickets.pdf_path` pointing at a file that
doesn't exist; the `issue_tickets_for_order` function additionally refuses a second issuance for an
order that already has tickets, so retrying after a failure is safe. The admin order-detail page lists
issued tickets with per-file download links, a "download all as ZIP" link, and the manual
`files_handed_over_at` marker (`set_files_handed_over`) - nothing is emailed, per the brief; the
office hands the downloaded PDFs to the customer outside this app.

Red Castle Club tiers 2-4 (Bronze/Silber/Gold) get a real metal accent color on the PDF, driven purely
by `tier_level` (`src/lib/tickets/tier-colors.ts`, see `docs/DECISIONS.md` D29) - the website itself
still never uses these colors, only the printed pass does.

Apple Wallet and Google Wallet are both **not built** this phase - see `docs/DECISIONS.md` D28. Every
ticket already has a fully functional PDF regardless.

## 8. Scanner PWA (Phase 7)

A standalone PWA at `/scanner`, outside both `(shop)` and `admin` (its own root shell, no site
Header/Footer/Cart/AdminNav) - installable via `public/manifest.json` + `public/sw.js` (app-shell
caching only; the actual validation logic never depends on the network once the ticket set is
downloaded).

**Access model (D32):** helpers are not admin users. `/scanner` exchanges a per-game code
(`game_scanner_codes`, admin-set on `/admin/schedule`) for a short-lived signed session token
(`src/lib/scanner/session.ts`), stored client-side and sent as a Bearer token to three Route
Handlers under `/api/scanner/*` - `session` (code → token), `tickets` (the one-time download),
`scan` (per-scan server round trip). All three verify the token themselves and act via the
service-role client; there is no real Supabase Auth session involved, matching the same
"service-role plus custom verification" shape already used by `create_order` and the cron sync.

**Offline-first validation (`src/lib/scanner/useScannerEngine.ts`):** before doors open, the device
downloads every ticket for the season (not just currently-valid ones, so a voided ticket resolves
to "voided" locally instead of a generic "not found") into an in-memory map. Every scan after that
is decided locally and instantly - format check first (`src/lib/scanner/format.ts` - shape only,
D33), then a map lookup - with the server call happening in the background purely to log the
attempt and settle the one real race condition: two devices scanning the same ticket a few
milliseconds apart. A partial unique index (`scan_events (ticket_id, game_id) where result =
'accepted'`) is what actually decides that race, not application code - a concurrent second
acceptance fails the constraint and the route reports `already_redeemed` instead. The one exception
to "always instant, always local" is a token this device has never seen at all (D35): that one
case waits on the network rather than risking a false "not found" for a ticket issued minutes
before kickoff.

**Multi-device sync:** an accepted scan is broadcast over a Supabase Realtime channel scoped to
the game (`scan-game-{gameId}`, anon key only, no RLS needed - channel name plus game UUID is
sufficient scoping for a non-sensitive "this ticket got redeemed" signal), so other devices update
their local map without a server round trip. If a device's network drops, it keeps validating
independently and reconciles later - a known, documented residual double-scan risk
(`docs/OPERATIONS.md`), not something perfectly preventable in an offline-first design.

**Live view:** `/admin/dashboard/[gameId]` (renamed from `/admin/live/[gameId]`, see §12) shows redeemed / outstanding / rejections for a game,
subscribed to the same Realtime channel for the redeemed count and polling every 20s for the rest
(rejections aren't broadcast, only redemptions are, per the brief). "Outstanding" means season-pass
holders who haven't checked in for *this* game yet, not unsold inventory.

## 9. Hardening pass (Phase 8)

**Rate limiting** (`src/lib/rate-limit.ts`, `check_order_rate_limit` in Postgres): every
`submitOrder` call and every `/api/scanner/session` call records an attempt against the client's
IP (`x-forwarded-for`, Vercel-supplied) before doing any real work, and is rejected outright once
that IP is over its window's limit - 5 checkout attempts / 10 minutes, 10 scanner-code attempts /
10 minutes (codes are short human-typed strings, not high-entropy secrets, so brute-forcing them
without a limit was a real gap). One shared table (`order_rate_limits`) and function serve both,
distinguished only by a key prefix (`scanner-session:<ip>` vs. bare `<ip>`) - not a second schema
for what's structurally the same mechanism. The check fails open (allows the request) if the
database call itself errors, so a transient database issue can never block a legitimate order.

**Secrets-in-bundle check:** confirmed no `"use client"` file references any server-only
environment variable (`SUPABASE_SERVICE_ROLE_KEY`, `TICKET_TOKEN_SECRET`, `SCANNER_SESSION_SECRET`,
`TURNSTILE_SECRET_KEY`, `CRON_SECRET`) - the five files that do are a Server Action, two Route
Handlers, and two server-only libraries (`src/lib/tickets/token.ts`, `src/lib/scanner/session.ts`,
both built on Node's `crypto`, which doesn't exist in a browser bundle anyway and would fail the
build outright if ever imported client-side).

**RLS re-verification:** the pgTAP suite grew to 92 assertions, adding coverage for
`game_scanner_codes` (admin-only, correctly excluded from the public `games` policy) and
`check_order_rate_limit` (grant-gated like `create_order`, no internal `is_admin()` check needed
since it's system-only). Also fixed two things the suite hadn't caught until this pass: a
`scan_events` fixture that predated the Phase 7 `game_id NOT NULL` column, and several Group C
assertions that had quietly gone from "the only rows in the table" (safe when this was a brand-new
project) to real undercounts once Claudio's own live testing added genuine customers, orders, and
an admin account - converted to "at least N" checks, the same fix already applied once before to
`order_number_sequences` for the same underlying reason.

**Left to the Supabase dashboard** (not reachable via SQL/migration): enabling "leaked password
protection" for admin logins, and confirming the project's spend cap is still enabled - both
documented as explicit `docs/OPERATIONS.md` action items rather than silently skipped.

## 10. Member card distribution (post-Phase-8)

A new `/admin/members` area (`src/app/admin/(protected)/members/`) for distributing membership cards
to existing club members going forward — CSV import or single-member entry generates a personal card
and/or N transferable codes per member (two `products`, see `docs/DATA-MODEL.md`), reusing the
existing Phase 6 `issue_tickets_for_order` PDF pipeline unchanged. This is the one deliberate, scoped
exception to the project's original "no email anywhere" rule (`docs/DECISIONS.md` D38): a batch
"send" button emails each member their card PDF(s) via Amazon SES (`src/lib/email/ses.ts`, nodemailer
+ `@aws-sdk/client-sesv2`), gated behind an editable subject/body and a typed confirmation phrase
(D42) so nothing goes out without an explicit human step. `create_member_order()` (Postgres,
`SECURITY DEFINER`, admin-only) creates an already-`bezahlt` order per member — there's no payment to
wait for — so ticket issuance and PDF generation work exactly as they do for a real checkout.

Not built: any migration of pre-existing/legacy member QR codes (D41, explicitly out of scope for
now), and a `kategorie`-to-product mapping (D40, category is currently a display-only label).

## 12. Admin nav restyle and attendance dashboard (post-Phase-8)

The admin bar (`src/components/admin/AdminNav`) now matches the shop's own branding - club logo,
divider, "Admin Bereich" label in the site's one accent red, centered nav links (CSS grid, so
centering doesn't depend on the brand/logout blocks' widths) - instead of the plain dark strip from
Phase 5. `/admin/live` was renamed to `/admin/dashboard`: the old plain game-list landing page is now
a multi-game attendance overview (`src/lib/admin/dashboard.ts`'s `getAttendanceReport`), and the
single-game Realtime live-scan monitor from Phase 7 moved to `/admin/dashboard/[gameId]` unchanged.
Attendance is counted from `scan_events` (`result = 'accepted'`, scoped per game per D31) joined
through `tickets` to `products.name` - not from tickets sold, and not a hardcoded category list (see
`docs/DECISIONS.md` D44). The member-card send form in `/admin/members` moved from an inline
expanding section into the shared `Modal` component (D45), so it can't go unnoticed the way the
inline version could.

## 13. Admin tooling gaps closed (post-Phase-8, D46)

All four gaps `docs/BACKLOG.md` had tracked as "admin tooling, currently SQL-only" are built: a new
`/admin/admins` page for adding/removing admin accounts in-app (real Supabase Auth users via the
service-role client, same mechanism as `/admin/setup`'s one-time bootstrap); `void_ticket()` plus a
"Stornieren" action on the order detail page's ticket rows, for voiding a single ticket with no
replacement issued (distinct from `reissue_ticket()`); inline-editable ticket holder names on the
same page, finally calling the already-existing `rename_ticket_holder()`; and a per-game scan log
table on `/admin/dashboard/[gameId]`, below the aggregate live stats, for investigating a suspected
double-scan or a run of rejections without querying `scan_events` directly.

## 14. Open questions — superseded by `docs/DECISIONS.md`

The five items originally listed here (Supabase project/plan, missing design doc, missing price
list/schedule/Eventfrog links, the HMAC-vs-offline-verification tension, and the brief's mandated
lifecycle questions) are now tracked live in `docs/DECISIONS.md`, which is the single running log for
Phase 0.5 and onward. This section is intentionally left short rather than duplicated and drifting
out of sync — check `docs/DECISIONS.md` for current status.

## 15. Customer order page (post-Phase-8, D54)

`/meine-tickets/<token>` is the one customer-facing surface that is not part of buying something:
an order's status and, once it is `bezahlt`, its ticket PDFs, reachable without an account. The
token is an HMAC over the order number (`src/lib/orders/access-token.ts`, own `ORDER_LINK_SECRET`)
and is issued on the confirmation screen, in the confirmation e-mail, and as a copyable link on the
admin order detail page. `/meine-tickets` without a token is the lost-link fallback: order number
plus the e-mail the order was placed with, rate-limited through the same `check_order_rate_limit`
function as the checkout under an `order-lookup:` key prefix.

Both download routes (`.../tickets/[ticketId]` and `.../tickets-zip`) sit under the same token
segment and repeat the verification themselves, exactly like the admin routes repeat `is_admin()`:
verify the signature, resolve the order, require `status = 'bezahlt'`, then read via the
service-role client - the third place in the app (after `create_order` and the scanner routes) that
uses "verify your own caller, then act service-role" because no Supabase session exists.
`src/lib/orders/customer-view.ts` deliberately narrows what it returns: no address, phone, or
e-mail, and no voided or replaced tickets.
