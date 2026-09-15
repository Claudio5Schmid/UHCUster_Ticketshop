import { ticketFileName } from "./label";
import { CURRENT_SEASON_LABEL } from "@/lib/season";

/** The columns a download route needs to name the file it serves (D62). */
export const TICKET_DOWNLOAD_COLUMNS =
  "pdf_path, status, holder_name, transferable, transferable_index, order_id, order_items!inner(order_id, product_name_snapshot)";

export interface TicketDownloadRow {
  pdf_path: string | null;
  holder_name: string | null;
  transferable: boolean;
  transferable_index: number | null;
  order_id: string;
  order_items: { product_name_snapshot: string } | { product_name_snapshot: string }[] | null;
}

/** The file name for one row, given the member list's category for its order
 * (null for a shop order). */
export function ticketDownloadName(row: TicketDownloadRow, kategorie: string | null): string {
  const orderItem = Array.isArray(row.order_items) ? row.order_items[0] : row.order_items;
  return ticketFileName(
    {
      productName: orderItem?.product_name_snapshot ?? "Ticket",
      kategorie,
      holderName: row.holder_name,
      transferable: row.transferable,
      transferableIndex: row.transferable_index,
    },
    CURRENT_SEASON_LABEL
  );
}
