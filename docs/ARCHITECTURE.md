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
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public | Cloudflare Turnstile widget on `/kasse`. Currently Cloudflare's public always-pass test key (`docs/DECISIONS.md` D25) — swap for a real Turnstile site's key before launch |
| `TURNSTILE_SECRET_KEY` | server-only | Server-side Turnstile verification in the checkout Server Action. Currently the matching test secret — same swap needed |
| `APPLE_WALLET_PASS_TYPE_ID` | server-only | Apple Wallet pass type identifier |
| `APPLE_WALLET_TEAM_ID` | server-only | Apple Developer team ID |
| `APPLE_WALLET_CERTIFICATE` / `_PASSWORD` | server-only | Apple pass-signing certificate, supplied by the club later (Phase 6, see `docs/WALLET-SETUP.md`) |
| `APPLE_WALLET_WWDR_CERTIFICATE` | server-only | Apple WWDR intermediate certificate |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | server-only | Google Wallet API service account credentials |
| `GOOGLE_WALLET_ISSUER_ID` / `_CLASS_ID` | server-only | Google Wallet API identifiers |
| `NEXT_PUBLIC_SITE_URL` | public | Canonical site URL for absolute links |

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

## 8. Open questions — superseded by `docs/DECISIONS.md`

The five items originally listed here (Supabase project/plan, missing design doc, missing price
list/schedule/Eventfrog links, the HMAC-vs-offline-verification tension, and the brief's mandated
lifecycle questions) are now tracked live in `docs/DECISIONS.md`, which is the single running log for
Phase 0.5 and onward. This section is intentionally left short rather than duplicated and drifting
out of sync — check `docs/DECISIONS.md` for current status.
