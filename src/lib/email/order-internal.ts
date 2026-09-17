import { formatRappenAsChf } from "@/lib/pricing";

/**
 * The note to the office when a shop order comes in (brief §2.4): everything the
 * invoice needs, in the order the accounting software asks for it. Plain text on
 * purpose - it is read by one person who copies out of it, not marketing.
 */
export interface InternalOrderNotificationInput {
  orderNumber: string;
  createdAt: string;
  categoryLabel: string;
  billingName: string;
  companyName: string | null;
  contactName: string | null;
  email: string;
  phone: string | null;
  addressLines: string[];
  customerReference: string | null;
  items: Array<{ productName: string; quantity: number; lineTotalRappen: number }>;
  totalRappen: number;
  adminUrl: string;
}

export function internalOrderSubject(orderNumber: string, categoryLabel: string): string {
  const kind = categoryLabel === "Red Castle Club" ? "Sponsorenbestellung" : "Bestellung";
  return `Neue ${kind} ${orderNumber} – Rechnung erstellen`;
}

export function internalOrderText(input: InternalOrderNotificationInput): string {
  const lines = input.items.map(
    (item) => `  - ${item.quantity}x ${item.productName}: ${formatRappenAsChf(item.lineTotalRappen)}`
  );

  return [
    `Neue Bestellung im Ticketshop: ${input.orderNumber} (${input.categoryLabel})`,
    "",
    "Die Karten sind erstellt. Bitte die Rechnung in der Fibu erstellen, die Karten",
    "aus dem Admin herunterladen und beides zusammen an den Kunden senden - danach im",
    "Shop die Rechnungsnummer erfassen und den Status auf «Rechnung versendet» setzen.",
    "",
    `Bestellung im Admin: ${input.adminUrl}`,
    "",
    "Rechnungsdaten",
    `  Rechnungsadresse:  ${input.billingName}`,
    ...(input.companyName && input.contactName ? [`  Kontaktperson:     ${input.contactName}`] : []),
    ...input.addressLines.map((line) => `                     ${line}`),
    `  E-Mail:            ${input.email}`,
    ...(input.phone ? [`  Telefon:           ${input.phone}`] : []),
    ...(input.customerReference ? [`  Referenz/PO:       ${input.customerReference}`] : []),
    `  Bestelldatum:      ${input.createdAt}`,
    `  Zahlungsfrist:     30 Tage netto`,
    "",
    "Positionen",
    ...lines,
    "",
    `Total: ${formatRappenAsChf(input.totalRappen)}`,
    `Referenz auf der Rechnung: ${input.orderNumber}`,
  ].join("\n");
}
