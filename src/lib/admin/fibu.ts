import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Accounting handoff format (Phase 8, brief's explicit fields: debtor, amount,
 * document number, date, account). One row per paid order - accounting cares
 * about the transaction total, not the line-item breakdown. `account` is left
 * empty on purpose: no target accounting system or chart of accounts has been
 * chosen yet (see docs/FIBU-INTERFACE.md) - the brief explicitly says not to
 * invent that, only to define the shape.
 */
export interface FibuEntry {
  debtor: string;
  amountRappen: number;
  documentNumber: string;
  date: string; // ISO date (yyyy-mm-dd), the day the order was marked bezahlt would be more accurate than created_at, but orders doesn't track a paid_at timestamp separately (see docs/BACKLOG.md) - created_at is what's available today.
  account: string;
}

export async function getFibuEntries(season: string): Promise<FibuEntry[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("order_number, total_rappen, created_at, customers(name)")
    .eq("season", season)
    .eq("status", "bezahlt")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load orders for FIBU export: ${error.message}`);
  }

  return (data ?? []).map((order) => {
    const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
    return {
      debtor: customer?.name ?? "-",
      amountRappen: order.total_rappen,
      documentNumber: order.order_number,
      date: order.created_at.slice(0, 10),
      account: "",
    };
  });
}

function csvEscape(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Semicolon-separated (not comma) - the common convention for CSV opened directly
 * in Excel under Swiss/German locale settings, which use comma as the decimal
 * separator. */
export function fibuEntriesToCsv(entries: FibuEntry[]): string {
  const header = ["Debitor", "Betrag", "Belegnummer", "Datum", "Konto"].join(";");
  const rows = entries.map((entry) =>
    [
      csvEscape(entry.debtor),
      (entry.amountRappen / 100).toFixed(2),
      csvEscape(entry.documentNumber),
      entry.date,
      csvEscape(entry.account),
    ].join(";")
  );
  return [header, ...rows].join("\n");
}
