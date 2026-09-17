export type OrderStatus = "neu" | "rechnung_versendet" | "bezahlt" | "storniert";

/**
 * When a customer may see and download their cards (D77): the office sends the
 * cards together with the invoice and only then sets the status, so before
 * `rechnung_versendet` the cards exist but are not the customer's yet. A
 * cancelled order shows "storniert" instead of any card.
 *
 * Pure and shared, so the page, the two download routes and the tests all read
 * the same rule.
 */
export function ticketsVisibleToCustomer(status: OrderStatus): boolean {
  return status === "rechnung_versendet" || status === "bezahlt";
}
