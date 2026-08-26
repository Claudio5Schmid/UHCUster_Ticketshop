import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Route Handlers don't go through the (protected) layout's auth check (same note
 * as /admin/export/download) - repeated here directly. The Storage read itself is
 * also RLS-gated to admins (see the "tickets" bucket policies), so this is defense
 * in depth, not the only guard.
 */
export async function GET(request: Request, { params }: { params: Promise<{ orderNumber: string; ticketId: string }> }) {
  const { ticketId } = await params;
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

  const { data: ticket, error } = await supabase.from("tickets").select("pdf_path").eq("id", ticketId).maybeSingle();
  if (error || !ticket?.pdf_path) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const { data: file, error: downloadError } = await supabase.storage.from("tickets").download(ticket.pdf_path);
  if (downloadError || !file) {
    return NextResponse.json({ error: "PDF not found in storage" }, { status: 404 });
  }

  return new NextResponse(await file.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ticket.pdf_path.split("/").pop()}"`,
    },
  });
}
