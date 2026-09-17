import { getSupabaseServerClient } from "@/lib/supabase-server";
import { issueTicketsForOrder } from "@/lib/tickets/issue";
import { ticketNameFor } from "@/lib/tickets/ticket-name";
import { CURRENT_SEASON } from "@/lib/season";
import { readOrderCsv, type ImportableProduct, type OrderCsvMapping, type OrderCsvRow, type OrderCsvRowResult } from "@/lib/csv/orderCsv";
import type { OrderStatus } from "@/lib/orders/visibility";

/**
 * The order migration (brief §3): legacy Red Castle Club and season-pass orders
 * come in from a CSV, become real orders with real cards, and never trigger a
 * mail. This module has no path to the mailer at all - the Phase 3 tests
 * import it with the mail transport mocked and assert it stays untouched.
 */

export interface OrderImportPlanRow {
  line: number;
  externalRef: string | null;
  state: "ok" | "error" | "duplicate";
  reason?: string;
  /** A short description of what the row would create, for the preview table. */
  summary?: string;
  row?: OrderCsvRow;
}

export interface OrderImportPlan {
  rows: OrderImportPlanRow[];
  counts: { ok: number; error: number; duplicate: number };
  /** File-level problems (missing columns), which stop the whole import. */
  errors: string[];
}

/**
 * Everything the import may resolve a row to: the season's products that carry
 * a category, with the catalog's word for each variant so a file may spell it
 * either way. Read by the dialog too, which offers these as the fixed value a
 * whole file can share.
 */
export async function loadImportableProducts(): Promise<ImportableProduct[]> {
  const supabase = await getSupabaseServerClient();
  const [{ data, error }, { data: catalog }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, category, variant, benefits")
      .eq("valid_season", CURRENT_SEASON)
      .not("category", "is", null),
    supabase.from("product_variant_catalog").select("category, variant, label"),
  ]);
  if (error) throw new Error(`Failed to load products: ${error.message}`);

  const labels = new Map((catalog ?? []).map((row) => [`${row.category}/${row.variant}`, row.label as string]));

  return (data ?? [])
    // Only what an order can actually be for: the member cards are issued from
    // the member list, never imported as an order.
    .filter((product) => product.category !== "mitglieder")
    .map((product) => ({
      id: product.id as string,
      name: product.name as string,
      category: product.category as ImportableProduct["category"],
      variant: product.variant as string,
      label: labels.get(`${product.category}/${product.variant}`) ?? (product.variant as string),
      includedPasses: Number((product.benefits as { included_passes?: number } | null)?.included_passes ?? 1),
    }));
}

function describe(row: OrderCsvRow): string {
  const who = row.companyName ?? `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
  return `${row.quantity}x ${row.productName} für ${who}`;
}

async function findImportedRefs(refs: string[]): Promise<Set<string>> {
  if (refs.length === 0) return new Set();
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("orders").select("external_ref").in("external_ref", refs);
  if (error) throw new Error(`Failed to check existing orders: ${error.message}`);
  return new Set((data ?? []).map((order) => order.external_ref as string));
}

/**
 * Step 2 of the dialog: what the file would do, row by row, without writing
 * anything. A row whose reference already exists is reported as such rather
 * than silently skipped or duplicated.
 */
export async function planOrderImport(content: string, mapping: OrderCsvMapping): Promise<OrderImportPlan> {
  const products = await loadImportableProducts();
  const { results, errors } = readOrderCsv(content, mapping, products);
  if (errors.length > 0) {
    return { rows: [], counts: { ok: 0, error: 0, duplicate: 0 }, errors };
  }

  const imported = await findImportedRefs(results.filter((r) => r.ok).map((r) => (r as { row: OrderCsvRow }).row.externalRef));

  const rows: OrderImportPlanRow[] = results.map((result) => {
    if (!result.ok) return { line: result.line, externalRef: result.externalRef, state: "error", reason: result.reason };
    if (imported.has(result.row.externalRef)) {
      return { line: result.line, externalRef: result.row.externalRef, state: "duplicate", reason: "Bereits importiert.", summary: describe(result.row), row: result.row };
    }
    return { line: result.line, externalRef: result.row.externalRef, state: "ok", summary: describe(result.row), row: result.row };
  });

  const counts = { ok: 0, error: 0, duplicate: 0 };
  for (const row of rows) counts[row.state]++;
  return { rows, counts, errors: [] };
}

export async function createImportBatch(filename: string, rowCount: number): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("import_batches")
    .insert({ filename, row_count: rowCount, created_by: user?.id ?? null })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error(error?.message ?? "Failed to create import batch");
  return data.id;
}

export interface OrderImportResult {
  imported: number;
  skipped: number;
  failed: Array<{ line: number; externalRef: string | null; reason: string }>;
}

/** Rows are written a few at a time; each renders a PDF per card. */
const IMPORT_CONCURRENCY = 4;

/**
 * Step 3: writes one slice of the file into the batch. Re-parses the file rather
 * than trusting a plan sent back from the browser - the server works out for
 * itself what each row means, so a tampered payload can at most import less.
 *
 * `range` lets the browser walk the file a chunk at a time and show progress.
 */
export async function applyOrderImport(
  content: string,
  mapping: OrderCsvMapping,
  batchId: string,
  range?: { offset: number; limit: number }
): Promise<OrderImportResult> {
  const products = await loadImportableProducts();
  const { results: allResults, errors } = readOrderCsv(content, mapping, products);
  if (errors.length > 0) throw new Error(errors.join(" "));

  const results = range ? allResults.slice(range.offset, range.offset + range.limit) : allResults;
  const imported = await findImportedRefs(results.filter((r) => r.ok).map((r) => (r as { row: OrderCsvRow }).row.externalRef));

  const outcome: OrderImportResult = { imported: 0, skipped: 0, failed: [] };

  const queue: OrderCsvRowResult[] = [...results];
  const workers = Array.from({ length: Math.min(IMPORT_CONCURRENCY, queue.length) }, async () => {
    for (let result = queue.shift(); result; result = queue.shift()) {
      await handle(result);
    }
  });

  async function handle(result: OrderCsvRowResult) {
    if (!result.ok) {
      // Reported by the plan already; counted here so the summary adds up.
      outcome.skipped++;
      return;
    }
    if (imported.has(result.row.externalRef)) {
      outcome.skipped++;
      return;
    }
    try {
      await importRow(result.row, batchId);
      outcome.imported++;
    } catch (importError) {
      outcome.failed.push({
        line: result.line,
        externalRef: result.row.externalRef,
        reason: importError instanceof Error ? importError.message : "Unbekannter Fehler",
      });
    }
  }

  await Promise.all(workers);
  return outcome;
}

async function importRow(row: OrderCsvRow, batchId: string): Promise<string> {
  const supabase = await getSupabaseServerClient();

  // The one rule for the name on the card (D73), applied here for imported rows
  // exactly as the checkout applies it for new ones.
  const holderName = ticketNameFor({
    category: row.category,
    companyName: row.companyName,
    firstName: row.firstName,
    lastName: row.lastName,
  });

  const { data: orderId, error } = await supabase.rpc("create_import_order", {
    p_customer: {
      first_name: row.firstName,
      last_name: row.lastName,
      company_name: row.companyName,
      email: row.email,
    },
    p_product_id: row.productId,
    p_quantity: row.quantity,
    p_holder_name: holderName,
    p_status: row.status,
    p_invoice_number: row.invoiceNumber,
    p_external_ref: row.externalRef,
    p_batch_id: batchId,
    p_ordered_at: row.orderedAt,
    p_season: CURRENT_SEASON,
  });
  if (error || !orderId) throw new Error(error?.message ?? "Failed to create order");

  // Cards, PDFs and all - through the same pipeline as a shop order (D67), so
  // wallet passes come along the day they exist. A cancelled legacy order gets
  // none: the database refuses, and there is nothing to show for it anyway.
  if (row.status !== "storniert") {
    await issueTicketsForOrder(orderId as string, { kategorie: null });
  }
  return orderId as string;
}

export interface ImportBatchSummary {
  id: string;
  filename: string | null;
  rowCount: number;
  createdAt: string;
  createdByEmail: string | null;
  rolledBackAt: string | null;
  orderCount: number;
}

export interface ImportBatchDetail extends ImportBatchSummary {
  orders: Array<{
    id: string;
    orderNumber: string;
    externalRef: string | null;
    status: OrderStatus;
    customerName: string;
    productName: string;
    quantity: number;
    scanned: boolean;
  }>;
}

export async function getImportBatches(): Promise<ImportBatchSummary[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("id, filename, row_count, created_at, created_by_email, rolled_back_at, orders(count)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Failed to load import batches: ${error.message}`);

  return (data ?? []).map((batch) => {
    const counted = Array.isArray(batch.orders) ? batch.orders[0] : batch.orders;
    return {
      id: batch.id as string,
      filename: batch.filename as string | null,
      rowCount: batch.row_count as number,
      createdAt: batch.created_at as string,
      createdByEmail: batch.created_by_email as string | null,
      rolledBackAt: batch.rolled_back_at as string | null,
      orderCount: (counted as { count: number } | null)?.count ?? 0,
    };
  });
}

export async function getImportBatch(batchId: string): Promise<ImportBatchDetail | null> {
  const supabase = await getSupabaseServerClient();
  const { data: batch, error } = await supabase
    .from("import_batches")
    .select("id, filename, row_count, created_at, created_by_email, rolled_back_at")
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load import batch: ${error.message}`);
  if (!batch) return null;

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id, order_number, external_ref, status, customers(name), order_items(product_name_snapshot, quantity)")
    .eq("import_batch_id", batchId)
    .order("order_number", { ascending: true });
  if (ordersError) throw new Error(`Failed to load batch orders: ${ordersError.message}`);

  const orderIds = (orders ?? []).map((order) => order.id as string);
  const scannedOrders = new Set<string>();
  if (orderIds.length > 0) {
    const { data: scans } = await supabase
      .from("scan_events")
      .select("tickets!inner(order_id)")
      .in("tickets.order_id", orderIds);
    for (const scan of scans ?? []) {
      const ticket = Array.isArray(scan.tickets) ? scan.tickets[0] : scan.tickets;
      if (ticket?.order_id) scannedOrders.add(ticket.order_id as string);
    }
  }

  return {
    id: batch.id as string,
    filename: batch.filename as string | null,
    rowCount: batch.row_count as number,
    createdAt: batch.created_at as string,
    createdByEmail: batch.created_by_email as string | null,
    rolledBackAt: batch.rolled_back_at as string | null,
    orderCount: orders?.length ?? 0,
    orders: (orders ?? []).map((order) => {
      const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
      const items = (order.order_items ?? []) as Array<{ product_name_snapshot: string; quantity: number }>;
      return {
        id: order.id as string,
        orderNumber: order.order_number as string,
        externalRef: order.external_ref as string | null,
        status: order.status as OrderStatus,
        customerName: (customer as { name: string } | null)?.name ?? "-",
        productName: items[0]?.product_name_snapshot ?? "-",
        quantity: items.reduce((sum, item) => sum + item.quantity, 0),
        scanned: scannedOrders.has(order.id as string),
      };
    }),
  };
}

/**
 * Takes a whole batch back (D71/O17). The database removes the rows and refuses
 * if any card was scanned; the PDFs are removed here afterwards, best-effort -
 * an orphaned file in a private bucket is harmless, a dangling order is not.
 */
export async function rollbackImportBatch(batchId: string): Promise<{ orders: number; tickets: number; customers: number }> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("rollback_import_batch", { p_batch_id: batchId });
  if (error) throw new Error(error.message);

  const result = data as { orders: number; tickets: number; customers: number; pdf_paths: string[] };
  if (result.pdf_paths.length > 0) {
    const { error: removeError } = await supabase.storage.from("tickets").remove(result.pdf_paths);
    if (removeError) {
      console.warn(`[order-import] Batch ${batchId} rolled back, but ${result.pdf_paths.length} PDFs could not be removed: ${removeError.message}`);
    }
  }
  return { orders: result.orders, tickets: result.tickets, customers: result.customers };
}
