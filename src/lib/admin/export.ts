import ExcelJS from "exceljs";
import { getSupabaseServerClient } from "@/lib/supabase-server";

interface OrderExportRow {
  order_number: string;
  status: string;
  refund_owed: boolean;
  total_rappen: number;
  created_at: string;
  customers: { name: string; email: string; address_street: string; address_zip: string; address_city: string } | null;
}

interface OrderItemExportRow {
  quantity: number;
  unit_price_rappen: number;
  line_total_rappen: number;
  holder_name: string | null;
  product_name_snapshot: string;
  orders: { order_number: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  neu: "Neu",
  rechnung_versendet: "Rechnung versendet",
  bezahlt: "Bezahlt",
  storniert: "Storniert",
};

const CHF_FORMAT = '#,##0.00" CHF"';
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4032E" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { color: { argb: "FFFFFFFF" }, bold: true };

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });
}

/**
 * Builds the admin orders export: one sheet per order (for reconciling against bank
 * transfers), one per order line (for per-ticket/pass detail). No VAT column per D17 -
 * this shop only ever shows gross prices, VAT is the accounting software's concern.
 */
export async function buildOrdersWorkbook(season: string): Promise<ExcelJS.Workbook> {
  const supabase = await getSupabaseServerClient();

  const [ordersResult, itemsResult] = await Promise.all([
    supabase
      .from("orders")
      .select("order_number, status, refund_owed, total_rappen, created_at, customers(name, email, address_street, address_zip, address_city)")
      .eq("season", season)
      .order("created_at", { ascending: true })
      .returns<OrderExportRow[]>(),
    supabase
      .from("order_items")
      .select("quantity, unit_price_rappen, line_total_rappen, holder_name, product_name_snapshot, orders!inner(order_number, season)")
      .eq("orders.season", season)
      .returns<OrderItemExportRow[]>(),
  ]);

  if (ordersResult.error) throw new Error(`Failed to load orders: ${ordersResult.error.message}`);
  if (itemsResult.error) throw new Error(`Failed to load order items: ${itemsResult.error.message}`);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "UHC Uster Ticketshop";
  workbook.created = new Date();

  const ordersSheet = workbook.addWorksheet("Bestellungen");
  ordersSheet.columns = [
    { header: "Bestellnummer", key: "order_number", width: 18 },
    { header: "Status", key: "status", width: 20 },
    { header: "Rückerstattung offen", key: "refund_owed", width: 18 },
    { header: "Name", key: "name", width: 26 },
    { header: "E-Mail", key: "email", width: 28 },
    { header: "Strasse", key: "street", width: 24 },
    { header: "PLZ", key: "zip", width: 10 },
    { header: "Ort", key: "city", width: 20 },
    { header: "Total", key: "total", width: 14 },
    { header: "Erstellt am", key: "created_at", width: 18 },
  ];
  styleHeaderRow(ordersSheet.getRow(1));

  for (const order of ordersResult.data ?? []) {
    ordersSheet.addRow({
      order_number: order.order_number,
      status: STATUS_LABELS[order.status] ?? order.status,
      refund_owed: order.refund_owed ? "Ja" : "Nein",
      name: order.customers?.name ?? "",
      email: order.customers?.email ?? "",
      street: order.customers?.address_street ?? "",
      zip: order.customers?.address_zip ?? "",
      city: order.customers?.address_city ?? "",
      total: order.total_rappen / 100,
      created_at: new Date(order.created_at),
    });
  }
  ordersSheet.getColumn("total").numFmt = CHF_FORMAT;
  ordersSheet.getColumn("created_at").numFmt = "dd.mm.yyyy hh:mm";

  const itemsSheet = workbook.addWorksheet("Bestellpositionen");
  itemsSheet.columns = [
    { header: "Bestellnummer", key: "order_number", width: 18 },
    { header: "Produkt", key: "product", width: 32 },
    { header: "Name auf Ticket", key: "holder_name", width: 26 },
    { header: "Anzahl", key: "quantity", width: 10 },
    { header: "Einzelpreis", key: "unit_price", width: 14 },
    { header: "Total", key: "line_total", width: 14 },
  ];
  styleHeaderRow(itemsSheet.getRow(1));

  for (const item of itemsResult.data ?? []) {
    itemsSheet.addRow({
      order_number: item.orders?.order_number ?? "",
      product: item.product_name_snapshot,
      holder_name: item.holder_name ?? "",
      quantity: item.quantity,
      unit_price: item.unit_price_rappen / 100,
      line_total: item.line_total_rappen / 100,
    });
  }
  itemsSheet.getColumn("unit_price").numFmt = CHF_FORMAT;
  itemsSheet.getColumn("line_total").numFmt = CHF_FORMAT;

  return workbook;
}
