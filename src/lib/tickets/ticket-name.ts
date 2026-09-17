import type { ProductCategory } from "@/lib/products";

/**
 * The one rule for what a card is made out to (D73). Every path that creates a
 * line item - the Red Castle form, the season-pass checkout, the order import -
 * asks here, so the name on the PDF, in the admin table and in the download's
 * file name can never come from three different opinions.
 *
 *  - red_castle: the company, when the customer gave one, otherwise the person.
 *  - saisonabo:  the person the pass is for - which, in the cart, may be
 *    somebody other than the buyer (a parent ordering for a child), so a name
 *    typed for the line wins over the buyer's own.
 *  - mitglieder: the member, as the member list spells them.
 *
 * Stored as tickets.holder_name - the column the brief calls ticket_name (D71/O4).
 */
export interface TicketNameInput {
  category: ProductCategory | null;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** A name given for this line specifically (the cart's "Name Karteninhaber:in"). */
  lineHolderName?: string | null;
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function ticketNameFor(input: TicketNameInput): string {
  const company = clean(input.companyName);
  const person = clean(`${clean(input.firstName)} ${clean(input.lastName)}`);
  const line = clean(input.lineHolderName);

  let name: string;
  if (input.category === "red_castle") {
    name = company || person || line;
  } else {
    name = line || person || company;
  }

  if (!name) {
    throw new Error("Für die Karte fehlt ein Name: Firma oder Vor- und Nachname angeben.");
  }
  return name;
}
