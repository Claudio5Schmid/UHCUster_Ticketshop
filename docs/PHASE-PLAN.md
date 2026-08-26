# Phase Plan — UHC Uster Ticket Shop

Written 2026-08-26. Today to the 5 September launch date is **10 calendar days**, including today.

## Reading of the brief

The brief defines nine phases (0 through 8) with a hard gate: no phase starts until the previous one
is approved, and Phase 0.5 (interrogation) is itself a hard gate before any schema work. Phases 0–5
must be live by 5 September (season pass sales open); Phase 7 (scanner) must be ready before 19
September (first home game); Phases 6 and 8 have no hard deadline beyond "after 5 September."

One structural gap: the brief's Phase 1 assumes a repo skeleton (Next.js app, Vercel project,
Supabase CLI link) that doesn't exist yet — see `docs/ARCHITECTURE.md` §1. That scaffolding work is
folded into Phase 1 below rather than treated as a separate phase, since it's a prerequisite with no
independent design decisions of its own.

## Effort estimate per phase

Estimates are focused-effort days assuming prompt answers to open questions; they are not calendar
days (see risk section below for why those diverge).

| Phase | Scope | Estimate | Depends on |
|---|---|---|---|
| 0 | Inventory + planning docs | Done (this pass) | — |
| 0.5 | Interrogation, `docs/DECISIONS.md` | ~1 day of Q&A rounds | Your response time — this is the main lever on the whole timeline |
| 1 | Next.js/Vercel/Supabase scaffolding + migrations + RLS tests + `docs/DATA-MODEL.md` | 1–1.5 days | Phase 0.5 answers; Supabase project decision (§ below) |
| 2 | Design tokens, base components, shell, `/styleguide` | 1–1.5 days | `frontend-design` skill (available); `uhcusterdesignanalyse.md` (missing, see below) |
| 3 | Landing page, Red Castle Club, individual games list, static pages | 1.5–2 days | Price list, schedule, Eventfrog links (all missing, see below) |
| 4 | Cart, order form, server-side pricing, order write, confirmation page, Turnstile | 1.5 days | Phase 1 schema; Turnstile site/secret keys |
| 5 | Admin auth, order overview, status transitions, price management, schedule management, XLSX export | 2 days | Phase 1 schema; `xlsx` skill (available) |
| **Subtotal, Phases 0.5–5** | | **~7.5–8 focused days** | |
| 6 | Token design, PDF, Apple/Google Wallet, admin handover workflow | 2–2.5 days | Apple/Google credentials (club-supplied later, see `docs/WALLET-SETUP.md` once written); the HMAC-vs-offline-verification question in `docs/ARCHITECTURE.md` §4 |
| 7 | Scanner PWA, offline validation, multi-device sync, live view | 2–2.5 days, plus real-hardware test time | Phase 6 tokens; must be done before 19 Sept, not before 5 Sept |
| 8 | Security pass, `docs/OPERATIONS.md`, spend cap, `docs/FIBU-INTERFACE.md`, `docs/BACKLOG.md` | 1–1.5 days | Phases 1–7 complete |

## What must be standing by 5 September

Phases 0 through 5, in full: public shop navigable end-to-end, a real order lands in the database
with server-resolved prices, and the club office can independently view orders, manage prices and
the schedule, and export an XLSX — all without involving you. Phase 6 (tickets/PDFs/wallet passes)
is explicitly allowed to land after 5 September, since nothing gets scanned before 19 September.

## Timeline risk — flagging now, per the brief's own working rule

10 calendar days is tight for ~7.5–8 days of focused effort **only if every external input arrives
immediately and every phase approval happens same-day.** Three things are still outstanding and
sit on the critical path before real work can start or finish:

1. **Supabase project decision** — no existing project is the ticket shop, and the account's org is
   on the Free plan, not Pro as the brief assumes. This blocks Phase 1 outright until decided.
2. **Price list, schedule, and Eventfrog links** — blocks real seed data in Phase 3 (mockups/dummy
   data could proceed in parallel, but the "definition of done: nothing hardcoded, from the
   database" still needs real rows before sign-off).
3. **`uhcusterdesignanalyse.md`** — referenced by the brief as the design baseline but absent from
   the repo — blocks Phase 2 token decisions beyond the three colours already specified in the brief.

None of these are effort-heavy to resolve — they're waiting on you, not on build time. If any of
them stall past a day or two, the single biggest schedule risk is **not** implementation speed, it's
turnaround time on Phase 0.5 answers and these three inputs. If that happens, the proposal is to
protect Phases 1–4 (schema, design shell, public shop, order flow — the parts customers touch on 5
September) and let Phase 5's admin polish be the first thing trimmed (e.g. XLSX export could ship as
a plain CSV initially, with the `xlsx`-skill version following within days), rather than slipping the
public launch date. This is a proposal, not a decision — flagging it now rather than on 4 September.

## Not yet in scope for this document

Everything a fixed-price/effort phase depends on that isn't yet known (e.g. exact admin headcount,
retention policy, refund handling) is a Phase 0.5 question, not a planning assumption here.
