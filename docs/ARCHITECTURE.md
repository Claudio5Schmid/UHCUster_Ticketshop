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
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | Server Actions that must bypass RLS (e.g. ticket issuance, admin operations) — usage should stay minimal and audited. Also needed by the Swiss Unihockey games sync (Phase 3) — still blank, see `docs/DECISIONS.md` |
| `CRON_SECRET` | server-only | Set once deployed to Vercel; Vercel sends it back as `Authorization: Bearer …` on scheduled requests, which `/api/sync/swissunihockey` checks so the sync can't be triggered by an arbitrary public GET |
| `TICKET_TOKEN_SECRET` | server-only | HMAC signing key for ticket tokens (Phase 6) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public | Cloudflare Turnstile widget (Phase 4) |
| `TURNSTILE_SECRET_KEY` | server-only | Server-side Turnstile verification |
| `APPLE_WALLET_PASS_TYPE_ID` | server-only | Apple Wallet pass type identifier |
| `APPLE_WALLET_TEAM_ID` | server-only | Apple Developer team ID |
| `APPLE_WALLET_CERTIFICATE` / `_PASSWORD` | server-only | Apple pass-signing certificate, supplied by the club later (Phase 6, see `docs/WALLET-SETUP.md`) |
| `APPLE_WALLET_WWDR_CERTIFICATE` | server-only | Apple WWDR intermediate certificate |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | server-only | Google Wallet API service account credentials |
| `GOOGLE_WALLET_ISSUER_ID` / `_CLASS_ID` | server-only | Google Wallet API identifiers |
| `NEXT_PUBLIC_SITE_URL` | public | Canonical site URL for absolute links |

Not needed, and must never be added: any email/SMTP provider credential, any payment provider key.

## 6. Open questions — superseded by `docs/DECISIONS.md`

The five items originally listed here (Supabase project/plan, missing design doc, missing price
list/schedule/Eventfrog links, the HMAC-vs-offline-verification tension, and the brief's mandated
lifecycle questions) are now tracked live in `docs/DECISIONS.md`, which is the single running log for
Phase 0.5 and onward. This section is intentionally left short rather than duplicated and drifting
out of sync — check `docs/DECISIONS.md` for current status.
