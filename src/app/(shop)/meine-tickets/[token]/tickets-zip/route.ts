import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { verifyOrderAccessToken } from "@/lib/orders/access-token";
import { loadDownloadableOrderForToken } from "../order-access";
import { TICKET_DOWNLOAD_COLUMNS, ticketDownloadName, type TicketDownloadRow } from "@/lib/tickets/download-name";
import { uniqueFileName } from "@/lib/tickets/label";

/** All of an order's still-valid tickets in one file - the customer-side twin of
 * the admin ZIP route, authorised by the signed link instead of a session. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const orderNumber = verifyOrderAccessToken(token);
  if (!orderNumber) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const order = await loadDownloadableOrderForToken(orderNumber);
  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: tickets, error } = await supabase
    .from("tickets")
    .select(TICKET_DOWNLOAD_COLUMNS)
    .eq("order_items.order_id", order.id)
    .in("status", ["gueltig", "eingeloest"])
    .returns<TicketDownloadRow[]>();

  if (error || !tickets || tickets.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: member } = await supabase.from("members").select("kategorie").eq("order_id", order.id).maybeSingle<{ kategorie: string | null }>();
  const kategorie = member?.kategorie ?? null;
  const taken = new Map<string, number>();

  const zip = new JSZip();
  for (const ticket of tickets) {
    if (!ticket.pdf_path) continue;
    const { data: file, error: downloadError } = await supabase.storage.from("tickets").download(ticket.pdf_path);
    // One unreadable file must not cost the customer the rest of the order - skip
    // it and hand over what does exist, rather than failing the whole download.
    if (downloadError || !file) continue;
    zip.file(uniqueFileName(ticketDownloadName(ticket, kategorie), taken), await file.arrayBuffer());
  }

  if (Object.keys(zip.files).length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const zipBytes = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(new Uint8Array(zipBytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${orderNumber}-tickets.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
