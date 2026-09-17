"use server";

import { revalidatePath } from "next/cache";
import {
  planOrderImport,
  createImportBatch,
  applyOrderImport,
  rollbackImportBatch,
  type OrderImportPlan,
  type OrderImportResult,
} from "@/lib/admin/order-import";

/** Step 2 of the dialog: read-only. */
export async function planOrderImportAction(csvContent: string): Promise<OrderImportPlan> {
  return planOrderImport(csvContent);
}

/** Step 3, first call: the batch the chunks below attach to. */
export async function createImportBatchAction(filename: string, rowCount: number): Promise<string> {
  return createImportBatch(filename, rowCount);
}

/** Step 3, one slice of the file. */
export async function applyOrderImportAction(
  csvContent: string,
  batchId: string,
  range: { offset: number; limit: number }
): Promise<OrderImportResult> {
  const result = await applyOrderImport(csvContent, batchId, range);
  revalidatePath("/admin");
  return result;
}

export async function rollbackImportBatchAction(batchId: string): Promise<{ orders: number; tickets: number; customers: number }> {
  const result = await rollbackImportBatch(batchId);
  revalidatePath("/admin");
  revalidatePath(`/admin/import/${batchId}`);
  return result;
}
