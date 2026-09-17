"use server";

import { revalidatePath } from "next/cache";
import type { OrderCsvMapping, ImportableProduct } from "@/lib/csv/orderCsv";
import {
  planOrderImport,
  loadImportableProducts,
  createImportBatch,
  applyOrderImport,
  rollbackImportBatch,
  type OrderImportPlan,
  type OrderImportResult,
} from "@/lib/admin/order-import";

/** Step 2, the field mapping: which packages and statuses the file may name,
 *  and what a whole file can be set to at once. */
export async function importOptionsAction(): Promise<ImportableProduct[]> {
  return loadImportableProducts();
}

/** Step 3 of the dialog: read-only. */
export async function planOrderImportAction(csvContent: string, mapping: OrderCsvMapping): Promise<OrderImportPlan> {
  return planOrderImport(csvContent, mapping);
}

/** Step 3, first call: the batch the chunks below attach to. */
export async function createImportBatchAction(filename: string, rowCount: number): Promise<string> {
  return createImportBatch(filename, rowCount);
}

/** Step 3, one slice of the file. */
export async function applyOrderImportAction(
  csvContent: string,
  mapping: OrderCsvMapping,
  batchId: string,
  range: { offset: number; limit: number }
): Promise<OrderImportResult> {
  const result = await applyOrderImport(csvContent, mapping, batchId, range);
  revalidatePath("/admin");
  return result;
}

export async function rollbackImportBatchAction(batchId: string): Promise<{ orders: number; tickets: number; customers: number }> {
  const result = await rollbackImportBatch(batchId);
  revalidatePath("/admin");
  revalidatePath(`/admin/import/${batchId}`);
  return result;
}
