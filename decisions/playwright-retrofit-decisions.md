# Playwright Retrofit — Interrogation & Decisions

Logged 2026-08-28, before any Playwright implementation. Answers come from reading the
codebase (Explore agent + direct verification) and from Claudio's answers where the
codebase alone didn't decide the question.

## 1. Framework / router

- **Next.js 16.3.3, App Router only** (`node_modules/next/package.json`). `src/app/` exists
  (`(shop)`, `admin/`, `api/`, `scanner/`); no `src/pages`.
- Dev server: `npm run dev` → `next dev` on **port 3000** (confirmed via `.claude/launch.json`).
- Build/start: `npm run build` / `npm run start`. No existing test/typecheck/ci script.
- Single package, not a monorepo (no workspaces, no turbo/pnpm-workspace config).
- `vercel.json` only configures a cron job (`/api/sync/swissunihockey`), nothing that affects
  Preview URL discovery — standard Vercel Preview URLs apply
  (`https://<project>-<hash>-<team>.vercel.app`), so `PLAYWRIGHT_BASE_URL` will just be
  whatever URL CI/the user passes in explicitly, no special-casing needed.

## 2. Supabase test/seed strategy

- No existing test/seed infrastructure for app-level (Playwright-style) tests. There is a
  pgTAP RLS test suite (`supabase/tests/rls_test.sql`), unrelated to this retrofit.
- Single Supabase project (`oojixascgoxdxzlwomrt`, Pro plan, `eu-central-1`), **zero dev
  branches** at the time of this retrofit.
- **Decision (initially proposed, then revised by Claudio):** a dedicated Supabase dev branch
  was proposed as the cleanest isolation. Cost was surfaced ($0.01344/hour, ~$9.70/month if
  left running) — **Claudio chose not to pay for a standing branch.**
- **Final decision: local write tests run directly against the production Supabase project,
  using a tag-and-cleanup strategy:**
  - All data created by local Playwright tests is tagged so it's unambiguously identifiable:
    customer email uses a fixed pattern `e2e-playwright+<run-id>@uhcuster-test.invalid`
    (see [[playwright-cleanup-strategy]] for the exact convention once tests are written).
  - A global teardown (service-role client, bypasses RLS) hard-deletes every row created
    under that pattern after each local run — `tickets` → `order_items` → `orders` →
    `customers`, in that FK-safe order.
  - **Risk accepted knowingly:** `orders`/`order_items`/`tickets` have no update/insert
    policies for anyone — writes only happen through the app's own `SECURITY DEFINER`
    functions (confirmed via `list_tables` comments), so local tests exercise the real
    checkout path, not direct DB pokes. Order numbers (`UHCU-2627-NNNN`) are a monotonic
    sequence and won't be reclaimed on cleanup — acceptable, sequence exhaustion is not a
    near-term concern.
  - Because there is no separate test project, a failed/interrupted test run can leave
    orphaned tagged rows. The global teardown also runs as a **global setup** sweep (delete
    anything matching the tag pattern before a run starts, not just after), so a crashed
    previous run self-heals on the next one instead of accumulating.

## 3. SES / email sending

- File: [`src/lib/email/ses.ts`](../src/lib/email/ses.ts) — `SESv2Client` + `nodemailer`'s SES
  transport, direct server-side AWS SDK call (no Edge Function; `supabase/functions/` doesn't
  exist).
- Per the file's own header comment: this is *"the one deliberate, scoped exception to this
  project's original 'no email, ever' rule"* — used only for sending Red Castle Club members
  their membership-card PDF, triggered **manually by an admin** from `/admin/members`
  (`sendPendingMemberCards` in `src/lib/admin/members.ts:198`).
- **Checkout (Season Pass or Red Castle Club order) sends no email at all**, confirmed by
  grepping `src/app/(shop)/kasse/actions.ts` — no email/SES reference anywhere in the order
  flow.
- Claudio confirmed: no payment integration exists yet, invoices currently go out by hand
  from FIBU/accounting; proper order-confirmation email sending is **future work**, tied to
  the payment integration landing.
- **Decision: drop SES-mock verification from the Season-Pass order test.** It doesn't apply
  to current behavior and asserting "no email fires" would just be testing the absence of a
  feature that was never wired up — not a meaningful regression guard. The existing RCC
  card-email feature is a separate, admin-triggered flow, out of scope for this initial
  local-write test set. Revisit once payment + order-confirmation email is implemented.

## 4. Admin test account

- No admin test account existed anywhere in migrations or seed data — `admin_users` only had
  two real admins (Claudio's own account, and a club-office account), confirmed via direct
  query against `public.admin_users`.
- First-admin bootstrap is deliberately manual (`/admin/setup`, one-time-only route, per
  `docs/BACKLOG.md` decision D26) — no admin is seeded automatically by the app itself.
- **Decision: create a dedicated Playwright test-admin account automatically**, via the
  Supabase Admin API (service role, `auth.admin.createUser`) plus an insert into
  `admin_users` — not reusing Claudio's real admin account. Email uses Gmail plus-addressing
  off Claudio's real address (`claudioschmid777+playwright-admin@gmail.com`) so it's
  reachable for any Supabase Auth email flows but clearly distinguishable as a test account.
  Password is randomly generated and stored only in `.env.test.local` (already covered by the
  repo's `.env*.local` gitignore rule) — never committed, never printed in full.
- This is a **real account in the production project** (same decision as §2 — no isolated
  branch), so the admin login test authenticates for real; the ZIP-download test downloads
  real generated files for whatever orders exist/are created by the season-pass/RCC tests.

## 5. CI

- **No `.github/` directory, no GitHub Actions, no CI at all currently.** `package.json` has
  no `test`/`ci`/`typecheck` script. `vercel.json` has no build/test hooks beyond the cron
  job.
- **Decision: out of scope for this retrofit.** The ask was for two runnable Playwright
  configs (`npm run test:local`, `npm run test:preview`), not a CI pipeline. Wiring GitHub
  Actions (or a Vercel deploy hook) to run `test:preview` against each Preview deployment is
  a natural follow-up, left for Claudio to request separately once the two suites exist and
  are trustworthy.

## Open item resolved mid-session

`playwright-retrofit-prompt.md`, referenced in the original request as attached, did not
exist anywhere on disk. Claudio pasted its contents directly into the conversation instead of
providing the file — test scope/detail below is sourced from that pasted content plus the
original chat message's 8-bullet list.

## Scaffolding built (2026-08-28, before test bodies were written)

- `@playwright/test` installed as a devDependency; Chromium downloaded via
  `npx playwright install chromium`.
- Test-admin account created directly in the production project via the Supabase Admin API
  (`scripts/playwright-create-test-admin.mjs`, idempotent - safe to re-run to rotate the
  password). Email: `claudioschmid777+playwright-admin@gmail.com`. Credentials written to
  `.env.test.local` (gitignored), never printed to chat/logs.
- [`playwright.config.local.ts`](../playwright.config.local.ts): serial (`workers: 1`,
  `fullyParallel: false`) on purpose — these tests write real rows into the shared production
  project through the app's own checkout/admin flows, and running them concurrently risks
  interleaving (e.g. racing the order-number sequence). Runs `npm run dev` as its `webServer`
  on port 3000. Loads `.env.local` + `.env.test.local` via Node's built-in
  `process.loadEnvFile` (Node 24 in use here).
- [`playwright.config.preview.ts`](../playwright.config.preview.ts): parallel, read-only,
  requires `PLAYWRIGHT_BASE_URL` (throws with a usage hint if missing). Only loads
  `.env.test.local` (admin test credentials) — deliberately never touches the service role or
  AWS keys, since nothing in the preview suite should be able to write.
- [`tests/local/fixtures/cleanup.ts`](../tests/local/fixtures/cleanup.ts): the tag-and-sweep
  helper. Tags test data via a fixed `@playwright-test.invalid` email domain
  (`testEmail(label)` helper), and `sweepTestData()` deletes matching customers/orders/tickets
  in FK-safe order (checked all four relevant foreign keys directly against the DB schema:
  `orders.customer_id`, `tickets.order_item_id`, and `scan_events.ticket_id` are all
  `RESTRICT`; `members.order_id` is `NO ACTION`; only `order_items.order_id` cascades) —
  tickets and scan_events and members rows are deleted explicitly before orders, orders before
  customers.
- Run both as pre-sweep (`tests/local/global-setup.ts`) and post-sweep
  (`tests/local/global-teardown.ts`), so an interrupted run self-heals on the next one instead
  of accumulating orphaned rows.
- **Correction made while building this:** `global-setup.ts` originally tried to share a
  run-ID across tests via `process.env`. Playwright runs `globalSetup` and test workers as
  separate processes, so that mutation never reached the tests — removed; `testEmail()` now
  generates its own uniqueness (timestamp + random suffix) per call instead.
- **Correction:** initially (wrongly) concluded `check_order_rate_limit()` wasn't wired up
  anywhere, based on a grep that missed the indirection — `kasse/actions.ts:70` calls
  `checkOrderRateLimit()` from `src/lib/rate-limit.ts:17`, which *does* call the RPC. It's
  live: max 5 checkout attempts per 10-minute window, keyed by client IP
  (`order_rate_limits.ip_address`). Local dev never sets `x-forwarded-for`
  (`rate-limit.ts:7-11`), so every local checkout — season-pass test and RCC test alike —
  shares one `"unknown"` bucket. Without clearing it, a handful of local runs in a row would
  start failing for real (a genuine rate-limit rejection, not a test bug). Fixed by adding
  `resetLocalRateLimit()` to `tests/local/fixtures/cleanup.ts`, called from both
  `global-setup.ts` and `global-teardown.ts` alongside the tagged-data sweep.
- `npm run test:local` / `npm run test:preview` added to `package.json`. `.gitignore` extended
  with `/test-results/`, `/playwright-report/`, `/blob-report/`.
## Test bodies written and verified green (2026-08-28)

`playwright-retrofit-prompt.md` was moved into the repo root by Claudio and read in full.
Two corrections against its literal spec, both already agreed with Claudio in this session:

- Dropped SES-mock verification from the season-pass test (§3 above).
- The prompt's test #4 asked for "PDF + Wallet-Pass" in the ZIP. Verified via
  `TicketsPanel.tsx`/`tickets-zip/route.ts` and `docs/BACKLOG.md:29-32` that **no wallet-pass
  feature exists yet** (Apple/Google Wallet is explicitly unbuilt, D28) — the ZIP contains
  PDF tickets only. Test asserts PDF-only content instead.

**Local suite** (`tests/local/*.spec.ts`, run via two Explore agents reading the actual
source for exact selectors/text, not guessed):

- `season-pass-order.spec.ts` — uses the **`"TEST - Bitte nicht kaufen"` product**
  (`f0000000-0000-0000-0000-00000000aa02`, CHF 1.00, `active: true`), a product clearly
  already provisioned in the catalog for exactly this purpose. Full flow: homepage → add to
  cart → `/warenkorb` (holder name) → `/kasse` (customer form) → submit → confirms the
  order via a direct Supabase query (service role), not just the confirmation screen.
- `rcc-membership-order.spec.ts` — same flow from `/red-castle-club`, using the cheapest
  non-transferable tier ("Red Castle Club Normal", CHF 300 — no dedicated test product
  exists for memberships; safe since no payment integration exists yet and the row is swept
  after).
- `admin-new-order-visibility.spec.ts` — seeds an order directly via the `create_order` RPC
  (same one the real checkout uses), logs in as the test admin, confirms the `/admin`
  default view (`status=neu`) shows the "N neu" badge and the order, opens the detail page.
- `admin-zip-download.spec.ts` — seeds an order, walks the real two-click status transition
  (`neu` → `rechnung_versendet` → `bezahlt`, per `OrderActions.tsx`) which triggers real PDF
  issuance, downloads the ZIP, asserts the filename (`${orderNumber}-tickets.zip`) and that
  every entry is a valid PDF (`%PDF-` magic bytes via `jszip`, already a project dependency).

**Real bug found and fixed while building these:** `src/lib/rate-limit.ts` *does* call
`check_order_rate_limit()` (5 attempts/10 min, keyed by IP) — my initial grep missed the
indirection through `checkOrderRateLimit()` and wrongly concluded it wasn't wired up (see the
correction logged in §"Scaffolding built" above). Local dev has no `x-forwarded-for`, so every
local checkout shares one `"unknown"` bucket — a few consecutive local runs would have started
failing for real. Fixed by adding `resetLocalRateLimit()` (clears that bucket) to both
`global-setup.ts` and `global-teardown.ts`.

**Preview suite** (`tests/preview/*.spec.ts`):

- `homepage-products.spec.ts` — "Season-Pass-Seite" has no dedicated URL (season passes are
  a section on `/`, confirmed by reading `page.tsx`); adapted to check `/` and
  `/red-castle-club`, HTTP 200 + zero console/page errors each.
- `eventfrog-linkout.spec.ts` — checks the **deterministic fallback link** on `/spielplan`
  (hardcoded `EVENTFROG_UHC_USTER_SEARCH_URL` constant), not the per-game `GameRow` link,
  which only renders when a specific game happens to have `eventfrog_url` set in the DB —
  the fallback is stable regardless of current schedule data.
- `admin-login.spec.ts` — logs in with the same test-admin account (same Supabase project
  backs preview, no separate branch), confirms landing on the orders view.
- `checkout-form-reachable.spec.ts` — reaches `/kasse` via the real cart flow, clicks submit
  twice (once fully empty, once with a deliberately invalid email) to exercise HTML5
  `required`/`type="email"` validation. Never fills a syntactically valid email, so
  `submitOrder()` is structurally guaranteed to never run — not just skipped by omission.

**Shared helper**: `tests/shared/cart.ts` (`addProductToCart`) — pure browser interaction (no
backend writes), used by both suites; kept outside both `testDir`s so neither config picks it
up as a test file.

**Verification run** (this session, both suites clean before and after):
- `npm run test:local` → **4/4 passed** (21.7s). `global-teardown` reported cleaning exactly
  what was created: `{"customers":4,"orders":4,"tickets":1}`. Confirmed via direct SQL after
  the run: zero leftover `@playwright-test.invalid` rows.
- `npx tsc --noEmit` → clean, zero errors across the whole project including all new test
  files.
- `npm run test:preview` against the current live Vercel deployment
  (`uhc-uster-ticketshop-7cv09k84w-uhc-uster.vercel.app`, found via the Vercel MCP tool since
  no `.vercel/project.json` exists locally) → **5/5 passed** (6.5s). Confirmed via SQL
  afterward: zero rows created (fully read-only, as designed).
