/**
 * The one place a ticket's kind is turned into words. The admin tables and the
 * printed card both go through here, so what an admin reads on screen and what
 * a member is holding can never drift apart.
 */

export interface TicketTypeLabelInput {
  productName: string;
  transferable: boolean;
  transferableIndex?: number | null;
  /** The member list's "Kategorie" (D60). When set it is the card's name, on
   * screen exactly as on the card - the product name is only what a card is
   * called when no category names it. */
  kategorie?: string | null;
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

/** What a card is called: its member-list category, else its product. */
function baseName({ productName, kategorie }: Pick<TicketTypeLabelInput, "productName" | "kategorie">): string {
  const category = kategorie?.trim();
  return category ? category : ticketProductName(productName);
}

/** "Mitglieder UHC Uster (übertragbar-2)" / "Mitglieder UHC Uster (nicht übertragbar)". */
export function ticketTypeLabel({ productName, kategorie, transferable, transferableIndex }: TicketTypeLabelInput): string {
  const base = baseName({ productName, kategorie });

  if (!transferable) return `${base} (nicht übertragbar)`;

  // Tickets issued before running numbers existed have none, and nothing
  // back-fills them for shop orders - those fall back to the plain word.
  return transferableIndex ? `${base} (übertragbar-${transferableIndex})` : `${base} (übertragbar)`;
}

/**
 * What a customer sees on their own page. Same running number as the admin
 * table, but a personal card keeps its plain product name: "(nicht übertragbar)"
 * answers a question only someone comparing kinds of card is asking.
 */
export function ticketDisplayName({ productName, kategorie, transferable, transferableIndex }: TicketTypeLabelInput): string {
  const base = baseName({ productName, kategorie });

  if (!transferable) return base;

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
