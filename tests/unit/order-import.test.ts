import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Brief §4, the other half: an import creates orders and cards and sends no
 * mail. The database and the PDF pipeline are stubbed; the mail transport is
 * mocked so a send would be caught, not just absent by luck.
 */
// vi.mock factories are hoisted above every import, so the functions they close
// over have to be hoisted too.
const { send, issueTicketsForOrder, rpc } = vi.hoisted(() => {
  const send = vi.fn(async () => ({ data: { id: "mock" }, error: null }));
  const issueTicketsForOrder = vi.fn(async () => ({ issued: 1 }));
  const rpc = vi.fn(async (name: string, _params?: Record<string, unknown>) => {
    if (name === "create_import_order") return { data: `order-${rpc.mock.calls.length}`, error: null };
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  });
  return { send, issueTicketsForOrder, rpc };
});

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

vi.mock("@/lib/tickets/issue", () => ({ issueTicketsForOrder }));

const PRODUCTS = [
  { id: "p-gold", name: "Red Castle Club Gold", category: "red_castle", variant: "gold", benefits: { included_passes: 3 } },
  { id: "p-legi", name: "UHC Sponsoren Legi", category: "saisonabo", variant: "legi", benefits: {} },
];

const CATALOG = [
  { category: "red_castle", variant: "gold", label: "Gold" },
  { category: "saisonabo", variant: "legi", label: "Sponsoren Legi" },
];

/** A thenable query builder that answers with whatever the table has, whatever
 * the chain of filters was. Enough for the two reads the import makes. */
function table(name: string) {
  const data =
    name === "products"
      ? PRODUCTS
      : name === "product_variant_catalog"
        ? CATALOG
        : name === "orders"
          ? [{ external_ref: "RC-2025-001" }]
          : [];
  const builder: Record<string, unknown> = {};
  const self = new Proxy(builder, {
    get(_target, property) {
      if (property === "then") return (resolve: (value: unknown) => void) => resolve({ data, error: null });
      return () => self;
    },
  });
  return self;
}

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: async () => ({
    rpc,
    from: (name: string) => table(name),
    auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) },
  }),
}));

process.env.RESEND_API_KEY = "re_test";
process.env.MAIL_FROM_EMAIL = "tickets@uhcuster.ch";

import { applyOrderImport, planOrderImport } from "@/lib/admin/order-import";
import { detectOrderMapping, parseOrderCsvHeader } from "@/lib/csv/orderCsv";

const CSV = [
  "external_ref;produkt;variante;firma;vorname;nachname;email;anzahl;status;rechnungsnummer;bestelldatum",
  "RC-2025-014;red_castle;gold;Muster AG;Anna;Muster;anna@muster.ch;4;bezahlt;RE-1023;2026-06-12",
  "SA-2025-201;saisonabo;legi;;Luca;Meier;luca@example.ch;1;bezahlt;;01.07.2026",
  "RC-2025-001;red_castle;gold;Alt AG;;;alt@example.ch;3;bezahlt;;",
  "SA-2025-202;saisonabo;legi;;;Meier;nobody@example.ch;1;bezahlt;;",
].join("\n");

/** The header is the brief's own, so the dialog's guess maps every field. */
const MAPPING = detectOrderMapping(parseOrderCsvHeader(CSV));

describe("order import", () => {
  beforeEach(() => {
    send.mockClear();
    rpc.mockClear();
    issueTicketsForOrder.mockClear();
  });

  it("plans ok, duplicate and error rows without writing", async () => {
    const plan = await planOrderImport(CSV, MAPPING);

    expect(plan.errors).toEqual([]);
    expect(plan.counts).toEqual({ ok: 2, duplicate: 1, error: 1 });
    expect(plan.rows.find((row) => row.externalRef === "RC-2025-001")?.state).toBe("duplicate");
    expect(plan.rows.find((row) => row.externalRef === "SA-2025-202")?.reason).toContain("Vorname und Nachname");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("creates the valid orders with cards and sends zero mails", async () => {
    const result = await applyOrderImport(CSV, MAPPING, "batch-1");

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(2);
    expect(result.failed).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(2);

    const params = (ref: string) =>
      rpc.mock.calls.find((call) => (call[1] as { p_external_ref?: string } | undefined)?.p_external_ref === ref)?.[1] as Record<string, unknown>;
    const gold = params("RC-2025-014");
    expect(gold.p_holder_name).toBe("Muster AG");
    expect(gold.p_quantity).toBe(4);
    expect(gold.p_invoice_number).toBe("RE-1023");
    expect(gold.p_batch_id).toBe("batch-1");
    expect(String(gold.p_ordered_at)).toMatch(/^2026-06-12T/);

    const legi = params("SA-2025-201");
    expect(legi.p_holder_name).toBe("Luca Meier");
    expect(String(legi.p_ordered_at)).toMatch(/^2026-07-01T/);

    expect(issueTicketsForOrder).toHaveBeenCalledTimes(2);
    expect(send).not.toHaveBeenCalled();
  });
});
