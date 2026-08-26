# Claude Code Brief — UHC Uster Ticket Shop (MVP V1)

You are the lead developer on a ticket shop for UHC Uster, a Swiss floorball club.
Work strictly in phases. **End each phase with a summary and wait for my approval before starting
the next one.** Do not skip phases, do not run two phases in parallel, and do not build anything
outside the defined scope.

---

## 0. Hard constraints

- **Deadline:** 5 September. Season pass sales open that day. Phases 0–5 must be live by then.
  Phases 6–8 may follow after. The first home game is 19 September — nothing gets scanned before that.
- **Stack:** Next.js (App Router) on Vercel, Supabase Pro (Postgres, Auth, Storage, Realtime).
  These decisions are made — do not propose alternatives unless you hit a genuine technical blocker,
  in which case raise it and wait.
- **The system sends no email whatsoever.** No order confirmation, no office notification, no
  transactional mail of any kind. Do not add an email provider, do not configure Supabase Auth email
  templates beyond what admin login strictly requires, and do not build a "send" button anywhere.
  All customer correspondence is composed by hand in the club's accounting software, with the
  generated files attached manually. If you find yourself reaching for an email dependency, stop and
  ask me.
- **No payment processing in the MVP.** Customers pay by bank transfer against an invoice.
  Card details and bank account numbers are **never** collected, stored, or processed by this system.
- **Language:** All user-facing content, labels, and emails in German, using Swiss orthography
  ("ss" instead of "ß"). Code, comments, and commit messages in English.
- **Scalability:** Build so that a match day with 1,500 scans creates no load spike on the database.
  You achieve that through signed tokens and local pre-validation, not by adding compute.

## Explicit non-goals for the MVP

- No single-match ticket sales in the shop — individual games link out to Eventfrog
- No online payment, no payment provider integration
- No automated accounting (FIBU) integration — prepare only, see Phase 8
- No seating chart, no seat selection
- No ticket resale or transfer
- No outbound email of any kind, and therefore no email provider, no templates, no send queue

If you believe something is missing: **write it into `docs/BACKLOG.md`, do not build it.**

---

## 1. Skill usage

**Your very first action:** list every available skill and write them, with a note on what each is
useful for here, into `docs/SKILLS.md`. From then on, follow this mapping:

| Situation | Skill | When it is mandatory |
|---|---|---|
| Before writing **any** UI component, page, or styling decision | `frontend-design` (or the current design skill) | Phases 2 and 3, every time, before the first line of code |
| PDF generation (season pass, invoice layout) | `pdf` | Phase 6 |
| Exporting orders for the club office | `xlsx` | Phase 5 |
| If a project-specific skill exists (house style, repo conventions) | that one first | always — it overrides the generic skills |

When a relevant skill exists, read it **before** writing code, not afterwards as a check.
When none exists, say so explicitly rather than silently proceeding.

---

## 2. Design direction

- The baseline is the attached `uhcusterdesignanalyse.md` (colour values, type scale, spacing).
- **However:** the shop should deliberately *not* look like a copy of the club website. It may feel
  more independent, more modern, more product-like. What must match: the logo and the colours —
  **white as the base, red as the brand colour (`#E4032E`), black as the accent.**
  No other colours beyond neutral greys.
- **Season passes are the focus.** They get the hero, the largest surface area, and the primary CTA.
  Individual games are visible but secondary.
- **Price-dependent treatment:** the higher the tier, the calmer and more premium the presentation
  (more whitespace, more restrained colour, finer detail) — not louder. The gradation must come from
  the data model (`tier_level`), never hardcoded per product.
- **Sell the pricing, don't just state it:** show the equivalent single-ticket value and the saving
  for every pass. These figures are **calculated**, not maintained as text.
- Accessibility as a baseline: keyboard operable, visible focus states, `prefers-reduced-motion` respected.

**Do not invent prices.** The real prices for season passes and Red Castle Club memberships are on
uhcuster.ch (Fanzone section). That site blocks automated access — so ask me for the price list and
wait for my answer before creating seed data. The same applies to the home game schedule and the
Eventfrog links.

---

## Phase 0 — Inventory and plan (no production code)

1. Scan the entire repository: structure, existing dependencies, configuration, code already present,
   `.env` variables (names only, never print values).
2. List the available skills → `docs/SKILLS.md` (see section 1).
3. Check the Supabase connection: which project, which plan, which tables already exist?
4. Write `docs/ARCHITECTURE.md` covering: system overview, data flow from order click to wallet pass,
   the full environment variable list, and open questions for me.
5. Write `docs/PHASE-PLAN.md` with your reading of this brief, an effort estimate per phase, and a
   clear marker for what must be standing by 5 September.

**Definition of done:** the three documents exist, I have a list of open questions, and not a single
line of application code has been written.

---

## Phase 0.5 — Interrogate me (mandatory gate)

Before Phase 1, you interview me. This is not optional politeness — it is the cheapest point in the
project to catch a wrong assumption, and I would rather answer twenty questions now than rebuild in
September.

Rules for this phase:

1. Ask in **batches of at most five questions**, numbered, so I can answer in one message.
2. Order the batches by consequence: things that change the data model first, things that change the
   UI last. A wrong column costs a migration; a wrong colour costs a CSS edit.
3. For each question, state in one line **why it matters** and what you will assume if I dodge it.
4. Do not accept vague answers. If I say "we'll see" or "probably", say so plainly and ask again with
   two concrete options.
5. Actively challenge the brief itself. If a requirement is contradictory, underspecified, or will
   cause pain in operation, name it. Specifically probe at least: what happens when someone orders
   and never pays; how a pass is reissued when a customer loses their phone; who exactly has admin
   access and what happens when that person leaves; whether pass holders are named individuals or
   transferable; what happens to a season pass mid-season if a game is cancelled; how refunds work
   without a payment provider; whether the club is VAT-registered and what that means for invoicing;
   what the retention period for customer data is.
6. Keep asking until you can state, in your own words, the full order-to-scan lifecycle without a
   single "presumably" in it. Then write the answers into `docs/DECISIONS.md` as a numbered decision
   log with dates.

**Definition of done:** `docs/DECISIONS.md` exists, contains my actual answers rather than your
assumptions, and every open question from Phase 0 is either answered or explicitly marked as
deferred with a named owner and a deadline.

**Do not start Phase 1 until I confirm the decision log is correct.**

---

## Phase 1 — Data model and database

Create Supabase migrations, versioned in the repo — do not click schema changes together in the web UI.

At minimum these tables:

- `products` — season pass variants and Red Castle Club memberships.
  Fields include: `slug`, `name`, `description`, `type` (`season_pass` | `membership`),
  `price_chf`, `tier_level` (drives the visual treatment), `benefits` (jsonb),
  `active`, `sort_order`, `valid_season`.
- `price_history` — every price change with timestamp and the admin who made it. A price is never
  overwritten without the previous version being preserved.
- `orders` — order with status (`neu` | `rechnung_versendet` | `bezahlt` | `storniert`),
  order number, total amount, timestamps.
- `order_items` — line item with the **price frozen at order time** (never join to `products` to
  retrieve a current price for an existing order).
- `customers` — name, address, email, phone, optional membership number.
- `tickets` — one row per issued pass: `token`, `holder_name`, `product_id`, `season`, `status`,
  `issued_at`. A ticket belongs to exactly one order item.
- `scan_events` — every scan with device, timestamp, and result. Append-only, never updated.
- `admin_users` — access for the club office.

Rules:
- **Row Level Security enabled on every table**, no exceptions. The only publicly readable data is
  `products` where `active = true`.
- Store money as integers in Rappen, never as floats.
- All timestamps `timestamptz` in UTC.
- Indexes on `tickets.token`, `orders.status`, `scan_events.ticket_id`.

**Definition of done:** migrations run cleanly, RLS policies are backed by a short test script, and
`docs/DATA-MODEL.md` explains every table in two sentences.

---

## Phase 2 — Design system and shell

**Read the design skill first.** Then:

1. Design tokens as CSS custom properties in one single place: colours, type scale, spacing, radii,
   shadows. No colour value may appear anywhere else in the codebase.
2. Base components: Button (primary/secondary), Card, Input, Select, Badge, Modal, Toast, Table.
3. Layout shell: header with logo and cart entry point, footer, container.
4. A `/styleguide` route showing every component and every tier treatment side by side.

**Definition of done:** `/styleguide` renders, is responsive down to 375px, and I can sign off on the
visual direction there before any real pages exist.

---

## Phase 3 — Public shop

1. **Landing page:** hero focused on season passes, below it the pass variants as cards with
   price-dependent treatment, calculated savings, and a clear CTA.
2. **Red Castle Club:** its own section or page, same ordering mechanics.
3. **Individual games:** list of home games from the database. Each "Tickets" button opens the
   configured Eventfrog link for that specific game via `target="_blank"`. If no link is configured,
   the button renders disabled — **never a link that goes nowhere.** Make it visibly clear that
   single tickets are handled by Eventfrog.
4. Static pages: imprint, privacy policy, ticket terms (placeholder copy, clearly marked as such —
   I will supply the real content).

**Definition of done:** the shop is fully navigable up to just before order submission, all prices
come from the database, nothing is hardcoded.

---

## Phase 4 — Order flow

1. Cart (client state, no browser storage APIs) and order form: name, address, email, phone, and the
   pass holder's name for each pass.
2. **Prices are resolved server-side only.** The client sends product IDs and quantities, never amounts.
3. The order is written to `orders` / `order_items` / `customers` with status `neu` and an order
   number following the pattern `UHCU-2627-0001`.
4. **No email is sent at any point.** The order exists in the database and nowhere else.
5. Confirmation page showing the order number and setting expectations clearly, since this screen is
   the customer's only written feedback: what was ordered, what it costs, that the club office will
   send an invoice with payment details by email within a few working days, and a note to save or
   screenshot the order number. Offer a "print this page" affordance.
6. Spam protection: Cloudflare Turnstile before submission.

**Definition of done:** a test order lands completely in the database, no outbound email is
triggered anywhere in the flow, and a tampered price in the request is rejected server-side.

---

## Phase 5 — Admin area (club office)

Access via Supabase Auth, restricted to accounts listed in `admin_users`.

1. **Order overview:** table with status filter, search by name and order number, detail view per order.
   Because nothing notifies the club office by email, this screen has to do that job: default the view
   to new orders, show a prominent count of orders in status `neu`, sort newest first, and make the
   count visible in the page title so it shows up in a pinned browser tab. Assume the office checks
   this once or twice a day and design for that.
2. **Status transitions:** `neu` → `rechnung_versendet` → `bezahlt`, each transition logged with
   timestamp and user.
3. **Price management:** create, edit, and deactivate products — price, name, description, benefits,
   tier level, sort order. Every change writes to `price_history`. Price changes **never** apply
   retroactively to existing orders.
4. **Schedule management:** maintain home games with date, opponent, and Eventfrog link.
5. **Export:** download orders as XLSX, with columns laid out so they can be transcribed directly
   into the accounting system (use the `xlsx` skill for this).

**Definition of done:** the club office can change prices, view orders, set statuses, and export
without involving me. This is the point at which 5 September is covered.

---

## Phase 6 — Ticket artefacts: QR, PDF, wallet passes

1. **Token design.** Every ticket gets a short signed token: payload (season, ticket ID) plus an
   HMAC-SHA256 signature, Base32-encoded, under 40 characters total, so the QR code stays low-density
   and therefore fast to scan. The secret lives in a server-side environment variable only and is
   **never** shipped to the client or committed to the repo.
2. **Season pass PDF** (use the `pdf` skill): club logo, pass holder name, pass type, season, seat or
   fan zone, QR code, order number. We will settle the visual details separately — build it so layout
   changes happen in one place.
3. **Apple Wallet (.pkpass):** the Pass Type ID and certificate come from the Apple Developer Program.
   **You do not obtain certificates and do not upload keys** — instead write `docs/WALLET-SETUP.md`
   with a step-by-step guide covering what I need to do in the Apple Developer portal and where the
   files go afterwards. Implement generation so that it works as soon as the certificates are present
   and fails with a clear error message when they are missing.
4. **Google Wallet:** the equivalent via the Wallet API with a service account, with the same
   separation between code and credentials.
5. **Trigger and handover:** as soon as an order is marked `bezahlt` in the admin area, the PDF and
   both wallet passes are generated and stored in Supabase Storage. **Nothing is sent.** The club
   office writes the invoice email by hand in the accounting software and attaches the files there.

   Design the admin order detail view around exactly that workflow:
   - one button per file for individual download
   - one "download all files for this order" button producing a single ZIP, so the whole set can be
     attached in one drag
   - filenames that make sense in an email attachment list and in a mailbox archive, e.g.
     `UHCU-2627-0042_Muster-Anna_Saisonkarte.pdf`
   - a copyable block containing name, address, email, order number and amount, so the office can
     paste it into the accounting software without retyping
   - a manual "files handed over" marker with timestamp, so the office can see at a glance which
     paid orders still need their email sent

**Definition of done:** a paid test order produces a PDF and both wallet passes, the ZIP download
contains all of them with readable filenames, the pass can be added to a real iPhone and a real
Android device, and no email left the system at any point.

---

## Phase 7 — Scanner PWA (multiple devices)

Must be ready before the first home game, not before 5 September.

1. PWA with camera access. `BarcodeDetector` as primary, `zxing-js` as fallback for iOS Safari.
2. **Before doors open**, each device downloads all valid tickets for that game and holds them locally
   in memory. Validation then runs offline: verify the signature, check against the local set.
   Target time from scan to result: under 100 milliseconds.
3. **Feedback:** full-screen green or red, large type, haptic feedback, two clearly distinguishable
   sounds, automatic advance after 800 ms. No confirmation tap. On red, always show the reason:
   "already redeemed at 17:42", "invalid signature", "wrong game".
4. **Multiple scanners:** each device broadcasts redeemed tickets to the others over a Supabase
   Realtime channel, and the others update their local set. If the network drops, each device keeps
   scanning independently and syncs later. Document this residual risk explicitly in `docs/OPERATIONS.md`.
5. A simple live view for the club office: tickets redeemed, tickets outstanding, rejections.

**Definition of done:** two devices running simultaneously, the same QR code works exactly once, the
result feels instant, and a test has been carried out on real hardware in the Buchholz sports hall.

---

## Phase 8 — Hardening, operations, accounting groundwork

1. Security pass: exercise every RLS policy, add rate limiting on the order endpoint, verify that no
   secrets end up in the client bundle.
2. `docs/OPERATIONS.md`: what to do when a scanner fails, how an order is cancelled, how a ticket is
   reissued, who holds which credentials.
3. Keep the Supabase spend cap enabled and document which thresholds apply when.
4. **Accounting groundwork:** define in `docs/FIBU-INTERFACE.md` the data format that will later be
   handed to the accounting system (debtor, amount, document number, date, account). Build an internal
   export function that produces exactly that format. The integration itself comes later —
   **do not implement an interface to any specific accounting system**, the target system is not
   decided yet.
5. `docs/BACKLOG.md` listing everything you deliberately left out along the way.

---

## 3. Working rules

- After each phase: short summary, open items, then **stop and wait for approval.**
- When information is missing (prices, schedule, Eventfrog links, logo, copy): **ask me, invent nothing.**
  Placeholders are allowed but must be marked in code as `TODO(claudio):`.
- No secrets in the repo, no credentials in logs, no `.env` values in output.
- Commits small and thematic, messages in English, imperative mood.
- If you notice a requirement is technically problematic or security-critical, say so before
  implementing it.
- If a phase puts 5 September at risk, flag it immediately with a proposal for what drops out of
  scope — not once it is already too late.
