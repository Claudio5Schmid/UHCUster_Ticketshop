# Accounting interface (FIBU) — groundwork only

Phase 8, per the brief: define the data format that will later be handed to the
accounting system, and build an internal export function producing exactly that
format. **The integration itself is explicitly out of scope** - no specific
accounting system is implemented against, because none has been chosen yet.

## Format

One row per **paid** order (`status = 'bezahlt'`) - unpaid, cancelled, or pending
orders never generate a booking. Five columns, per the brief's own naming:

| Field | Source | Notes |
|---|---|---|
| Debitor (debtor) | `customers.name` | The name on the order, not a customer/debtor ID - this system has no customer accounts, so there's no stable ID to reference beyond the name itself. |
| Betrag (amount) | `orders.total_rappen` | Converted to CHF with two decimals in the CSV (`142.50`, not Rappen) - internally still carried as Rappen (`FibuEntry.amountRappen`) until the very last formatting step, consistent with the rest of this codebase's money handling. Gross amount, no separate VAT line (D17). |
| Belegnummer (document number) | `orders.order_number` | e.g. `UHCU-2627-0042` - already the natural, unique reference for this order everywhere else in the system. |
| Datum (date) | `orders.created_at` | The order's creation date, not a separate "paid on" date - `orders` doesn't track when a status transition happened, only the order's own `created_at`. If the accounting system specifically needs the payment date rather than the order date, that's a schema gap to close when the real integration is built (`docs/BACKLOG.md`). |
| Konto (account) | *(empty)* | Deliberately blank. Which general-ledger account each product/revenue type posts to depends entirely on the eventual accounting system and its chart of accounts - neither exists yet, and the brief is explicit: don't invent it. |

## Where it lives

- `src/lib/admin/fibu.ts` — `getFibuEntries(season)` (the format, as data) and
  `fibuEntriesToCsv(entries)` (one concrete serialization - semicolon-separated,
  since that's what Excel expects by default under Swiss/German locale settings,
  where comma is already the decimal separator).
- `/admin/export/fibu` — downloads the current season's CSV. A thin route handler
  around the same function; swapping in a real accounting system's API later means
  replacing this one download action with a real integration call, not touching the
  format function itself.

## Explicitly not built

- Any actual API call to an accounting system (Bexio, Abacus, Banana, or anything
  else) - not decided, not started.
- A real chart-of-accounts mapping (which product/revenue type → which account
  number).
- A "paid on" timestamp distinct from `created_at` (see the Datum row above).
- Per-line-item accounting detail (this export is one row per order, not per
  order_item) - revisit if the eventual system needs product-level revenue
  categorization rather than one line per transaction.
