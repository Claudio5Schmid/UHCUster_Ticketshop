/**
 * The mail templates the office picks from in the send dialog, and the one
 * placeholder rule both dialogs share.
 *
 * In code rather than in a table (D71/O15): the dialog lets the office edit the
 * text before every send, so a template is a starting point, not a setting. Two
 * spellings are understood - `{name}` as the brief writes them and `{{name}}` as
 * the member dialog always had - so a text pasted from either place works.
 */

export interface MailTemplate {
  id: string;
  label: string;
  subject: string;
  body: string;
}

/** What each placeholder stands for, shown as help under the text box. */
export interface PlaceholderInfo {
  key: string;
  description: string;
}

const PLACEHOLDER_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}|\{\s*([a-z_]+)\s*\}/g;

/**
 * Replaces every known placeholder; an unknown one is left as typed, so a typo
 * shows up in the preview instead of vanishing into an empty string.
 */
export function applyPlaceholders(text: string, values: Record<string, string | null | undefined>): string {
  return text.replace(PLACEHOLDER_PATTERN, (match, doubleKey: string | undefined, singleKey: string | undefined) => {
    const key = doubleKey ?? singleKey ?? "";
    if (!(key in values)) return match;
    return values[key] ?? "";
  });
}

/** The placeholder keys a text uses - the dialog warns about the ones its
 * recipients cannot fill. */
export function placeholdersIn(text: string): string[] {
  const keys = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    keys.add(match[1] ?? match[2] ?? "");
  }
  return [...keys].filter(Boolean);
}

export const ORDER_PLACEHOLDERS: PlaceholderInfo[] = [
  { key: "name", description: "Vor- und Nachname der bestellenden Person" },
  { key: "firma", description: "Firma, falls angegeben, sonst leer" },
  { key: "bestellnummer", description: "Bestellnummer im Ticketshop (UHCU-…)" },
  { key: "variante", description: "Paket bzw. Variante, z.B. Gold oder Erwachsene" },
  { key: "ticket_link", description: "Persönlicher Link zu Bestellung und Karten" },
];

export const MEMBER_PLACEHOLDERS: PlaceholderInfo[] = [
  { key: "vorname", description: "Vorname des Mitglieds" },
  { key: "nachname", description: "Nachname des Mitglieds" },
];

const SIGNATURE = ["Sportliche Grüsse", "UHC Uster"].join("\n");

export const ORDER_TEMPLATES: MailTemplate[] = [
  {
    id: "intro-red-castle",
    label: "Einführung neuer Ticketshop – Red Castle",
    subject: "Red Castle Club: Deine Karten im neuen Ticketshop des UHC Uster",
    body: [
      "Hallo {name}",
      "",
      "Der UHC Uster hat einen neuen Ticketshop. Deine Red-Castle-Club-Karten ({variante})",
      "der Bestellung {bestellnummer} findest du ab sofort dort - und im Anhang dieser",
      "E-Mail als PDF.",
      "",
      "Über diesen Link kommst du jederzeit zu deinen Karten:",
      "{ticket_link}",
      "",
      "Zeig den QR-Code am Eingang direkt auf dem Handy oder ausgedruckt vor. Bei Fragen",
      "kannst du einfach auf diese E-Mail antworten.",
      "",
      SIGNATURE,
    ].join("\n"),
  },
  {
    id: "intro-saisonabo",
    label: "Einführung neuer Ticketshop – Saisonabo",
    subject: "Deine Saisonkarte im neuen Ticketshop des UHC Uster",
    body: [
      "Hallo {name}",
      "",
      "Der UHC Uster hat einen neuen Ticketshop. Deine Saisonkarte ({variante}) der",
      "Bestellung {bestellnummer} findest du ab sofort dort - und im Anhang dieser",
      "E-Mail als PDF.",
      "",
      "Über diesen Link kommst du jederzeit zu deiner Karte:",
      "{ticket_link}",
      "",
      "Zeig den QR-Code am Eingang direkt auf dem Handy oder ausgedruckt vor. Bei Fragen",
      "kannst du einfach auf diese E-Mail antworten.",
      "",
      SIGNATURE,
    ].join("\n"),
  },
  {
    id: "blank",
    label: "Leere Vorlage",
    subject: "",
    body: "",
  },
];

export const MEMBER_TEMPLATES: MailTemplate[] = [
  {
    id: "member-cards",
    label: "Mitgliederkarte",
    subject: "Deine Mitgliederkarte UHC Uster",
    body: ["Hallo {{vorname}},", "", "im Anhang findest du deine Mitgliederkarte(n) für die Saison 26/27 als PDF.", "", SIGNATURE].join(
      "\n"
    ),
  },
  {
    id: "blank",
    label: "Leere Vorlage",
    subject: "",
    body: "",
  },
];
