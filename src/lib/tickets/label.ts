/**
 * The one place a ticket's kind is turned into words. The admin tables and the
 * printed card both go through here, so what an admin reads on screen and what
 * a member is holding can never drift apart.
 */

export interface TicketTypeLabelInput {
  productName: string;
  transferable: boolean;
  transferableIndex?: number | null;
}

/**
 * The transferable member product is itself called "Mitglieder UHC Uster
 * (übertragbar)". Appending naively would produce "Mitglieder UHC Uster
 * (übertragbar) (übertragbar-2)", so the existing suffix comes off first.
 */
const TRAILING_TRANSFERABLE = /\s*\(übertragbar\)\s*$/i;

export function ticketProductName(productName: string): string {
  return productName.replace(TRAILING_TRANSFERABLE, "").trim();
}

/** "Mitglieder UHC Uster (übertragbar-2)" / "Mitglieder UHC Uster (nicht übertragbar)". */
export function ticketTypeLabel({ productName, transferable, transferableIndex }: TicketTypeLabelInput): string {
  const base = ticketProductName(productName);

  if (!transferable) return `${base} (nicht übertragbar)`;

  // Tickets issued before running numbers existed have none, and nothing
  // back-fills them for shop orders - those fall back to the plain word.
  return transferableIndex ? `${base} (übertragbar-${transferableIndex})` : `${base} (übertragbar)`;
}

/**
 * The short form printed in the card's eyebrow line, where the product name
 * already occupies the title right below it: "ÜBERTRAGBAR-2", never the whole
 * label again.
 */
export function ticketTypeEyebrowSuffix(transferableIndex?: number | null): string | null {
  return transferableIndex ? `ÜBERTRAGBAR-${transferableIndex}` : null;
}
