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

/**
 * "Livestreampartner, Muster AG" -> ["Livestreampartner", "Muster AG"];
 * "Mitglied UHC Uster" -> ["Mitglied UHC Uster", null]; blank -> null (the card
 * prints its product name). Only the first comma splits, so a company name may
 * keep its own; the office's spacing around the comma does not matter.
 */
export function splitKategorie(kategorie: string | null | undefined): [string, string | null] | null {
  const value = kategorie?.trim();
  if (!value) return null;
  const comma = value.indexOf(",");
  if (comma === -1) return [value, null];
  const first = value.slice(0, comma).trim();
  const rest = value.slice(comma + 1).trim();
  if (!first) return rest ? [rest, null] : null;
  return [first, rest || null];
}

/** What a card is called: its member-list category - the card's two lines,
 * joined with a comma and a space however the import spaced them - else its
 * product. */
function baseName({ productName, kategorie }: Pick<TicketTypeLabelInput, "productName" | "kategorie">): string {
  const lines = splitKategorie(kategorie);
  if (!lines) return ticketProductName(productName);
  return lines[1] ? `${lines[0]}, ${lines[1]}` : lines[0];
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

/** "Lea Müller-Näf" -> "Lea-Mueller-Naef": what survives in a file name on every
 * system and in every mail program. Umlauts are spelt out rather than stripped,
 * so "Müller" stays recognisable. */
function fileSlug(text: string): string {
  return text
    .replace(/[ÄÖÜäöüß]/g, (c) => ({ Ä: "Ae", Ö: "Oe", Ü: "Ue", ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[c] ?? c)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The name a downloaded or mailed card carries (D62):
 * "Saisonkarte-Erwachsene-26-27-Lea-Muster.pdf", or for a transferable card
 * "Red-Castle-Club-Gold-26-27-Muster-AG-uebertragbar-2.pdf". The stored file
 * keeps its id; this is only what the customer sees in the download.
 */
export function ticketFileName(
  input: TicketTypeLabelInput & { holderName: string | null },
  seasonLabel: string
): string {
  const parts = [fileSlug(baseName(input)), fileSlug(seasonLabel)];
  const holder = input.holderName?.trim();
  if (holder) parts.push(fileSlug(holder));
  if (input.transferable) parts.push(input.transferableIndex ? `uebertragbar-${input.transferableIndex}` : "uebertragbar");
  return `${parts.filter(Boolean).join("-")}.pdf`;
}

/** Keeps every name in one ZIP distinct: a second "…-Lea-Muster.pdf" becomes
 * "…-Lea-Muster-2.pdf" rather than overwriting the first. */
export function uniqueFileName(name: string, taken: Map<string, number>): string {
  const count = (taken.get(name) ?? 0) + 1;
  taken.set(name, count);
  if (count === 1) return name;
  return name.replace(/\.pdf$/, `-${count}.pdf`);
}

/**
 * The short form printed in the card's eyebrow line, where the product name
 * already occupies the title right below it: "ÜBERTRAGBAR-2", never the whole
 * label again.
 */
export function ticketTypeEyebrowSuffix(transferableIndex?: number | null): string | null {
  return transferableIndex ? `ÜBERTRAGBAR-${transferableIndex}` : null;
}
