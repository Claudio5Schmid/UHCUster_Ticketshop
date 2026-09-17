import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { buildInvoiceCsv } from "@/lib/admin/invoice-export";
import { parseOrderFilters } from "@/lib/admin/order-filters";

/**
 * The invoice data of the filtered order list as a CSV (brief §2.5). Same
 * query string as the list itself, so what the office sees is what it gets.
 */
export async function GET(request: Request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const filters = parseOrderFilters(Object.fromEntries(url.searchParams.entries()));
  const csv = await buildInvoiceCsv(filters);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rechnungsdaten-${filters.status ?? "alle"}-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
