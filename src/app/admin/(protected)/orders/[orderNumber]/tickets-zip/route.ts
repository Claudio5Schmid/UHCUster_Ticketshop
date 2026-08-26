import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: order, error: orderError } = await supabase.from("orders").select("id").eq("order_number", orderNumber).maybeSingle();
  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: tickets, error: ticketsError } = await supabase
    .from("tickets")
    .select("pdf_path, order_items!inner(order_id)")
    .eq("order_items.order_id", order.id);
  if (ticketsError) {
    return NextResponse.json({ error: ticketsError.message }, { status: 500 });
  }
  if (!tickets || tickets.length === 0) {
    return NextResponse.json({ error: "No tickets issued for this order yet" }, { status: 404 });
  }

  const zip = new JSZip();
  for (const ticket of tickets) {
    if (!ticket.pdf_path) continue;
    const { data: file, error: downloadError } = await supabase.storage.from("tickets").download(ticket.pdf_path);
    if (downloadError || !file) {
      return NextResponse.json({ error: `Failed to download ${ticket.pdf_path}: ${downloadError?.message}` }, { status: 500 });
    }
    zip.file(ticket.pdf_path.split("/").pop() ?? ticket.pdf_path, await file.arrayBuffer());
  }

  const zipBytes = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(new Uint8Array(zipBytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${orderNumber}-tickets.zip"`,
    },
  });
}
