import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { verifyOrderAccessToken } from "@/lib/orders/access-token";
import { loadPaidOrderForToken } from "../../order-access";

/**
 * The customer's own copy of a ticket PDF (docs/DECISIONS.md D54) - the same file
 * the admin route serves, authorised by the signed link instead of an admin
 * session. The `tickets` Storage bucket stays private; the file is streamed
 * through here, never linked to directly.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string; ticketId: string }> }) {
  const { token, ticketId } = await params;

  const orderNumber = verifyOrderAccessToken(token);
  if (!orderNumber) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const order = await loadPaidOrderForToken(orderNumber);
  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = getSupabaseAdminClient();
  // The order_id filter is what stops a valid link for order A from downloading a
  // ticket id belonging to order B.
  const { data: ticket, error } = await supabase
    .from("tickets")
    .select("pdf_path, status, order_items!inner(order_id)")
    .eq("id", ticketId)
    .eq("order_items.order_id", order.id)
    .in("status", ["gueltig", "eingeloest"])
    .maybeSingle();

  if (error || !ticket?.pdf_path) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: file, error: downloadError } = await supabase.storage.from("tickets").download(ticket.pdf_path);
  if (downloadError || !file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(await file.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ticket.pdf_path.split("/").pop()}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
