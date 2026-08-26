import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { buildOrdersWorkbook } from "@/lib/admin/export";
import { CURRENT_SEASON } from "@/lib/season";

/**
 * Route Handlers don't go through the (protected) layout's auth check, so this
 * repeats it directly - otherwise an authenticated-but-non-admin session (there's
 * no public sign-up path, but the layout itself treats this as worth checking
 * defensively) could hit this URL directly. The underlying query is also
 * RLS-gated via is_admin(), so this is defense in depth, not the only guard.
 */
export async function GET() {
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

  const workbook = await buildOrdersWorkbook(CURRENT_SEASON);
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bestellungen-${CURRENT_SEASON}.xlsx"`,
    },
  });
}
