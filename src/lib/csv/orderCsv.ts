import { parseCsvTable } from "@/lib/csv/memberCsv";
import type { ProductCategory } from "@/lib/products";
import type { OrderStatus } from "@/lib/orders/visibility";

/**
 * Pure parsing and validation for the order import (brief §3) - no server-only
 * imports, so the admin dialog can read the file in the browser and the unit
 * tests can exercise every rule without a database.
 *
 * The file decides nothing by itself. As in the member import, the admin says
 * which column belongs to which field and confirms a guess made from the header
 * names; a misdetected or unusual header can then never import the wrong column
 * into the right-looking field.
 *
 * Three fields may instead be given one value for the whole file. A legacy
 * export of Red Castle orders usually has no column saying "red_castle" - that
 * it is a Red Castle file is what the office knows about it - and the same goes
 * for a file that is all one package, or all already paid.
 */

export type OrderCsvField =
  | "externalRef"
  | "category"
  | "variant"
  | "company"
  | "firstName"
  | "lastName"
  | "email"
  | "quantity"
  | "status"
  | "invoiceNumber"
  | "orderedAt";

/** A field takes its value from a column of the file, or from one value the
 *  admin picked for every row. */
export type OrderFieldSource = { column: number } | { fixed: string };

export type OrderCsvMapping = Partial<Record<OrderCsvField, OrderFieldSource>>;

export interface OrderCsvFieldInfo {
  key: OrderCsvField;
  label: string;
  required: boolean;
  /** Whether one value may stand for the whole file. */
  allowsFixed: boolean;
  hint?: string;
}

export const ORDER_CSV_FIELDS: OrderCsvFieldInfo[] = [
  {
    key: "externalRef",
    label: "Bestellnummer im Altsystem",
    required: true,
    allowsFixed: false,
    hint: "Verhindert, dass dieselbe Bestellung zweimal importiert wird.",
  },
  { key: "category", label: "Produkt", required: true, allowsFixed: true },
  { key: "variant", label: "Variante", required: true, allowsFixed: true },
  { key: "company", label: "Firma", required: false, allowsFixed: false },
  { key: "firstName", label: "Vorname", required: false, allowsFixed: false },
  { key: "lastName", label: "Nachname", required: false, allowsFixed: false },
  { key: "email", label: "E-Mail", required: true, allowsFixed: false },
  { key: "quantity", label: "Anzahl Karten", required: false, allowsFixed: true, hint: "Ohne Angabe: die Kartenzahl des Pakets." },
  { key: "status", label: "Status", required: true, allowsFixed: true },
  { key: "invoiceNumber", label: "Rechnungsnummer", required: false, allowsFixed: false },
  { key: "orderedAt", label: "Bestelldatum", required: false, allowsFixed: false, hint: "Ohne Angabe: das Importdatum." },
];

/** One product the import may resolve a row to. */
export interface ImportableProduct {
  id: string;
  name: string;
  category: ProductCategory;
  variant: string;
  /** The catalog's word for the variant ("Gold"), so a file may spell it either way. */
  label: string;
  /** Cards this package includes, when the file does not say. */
  includedPasses: number;
}

export interface OrderCsvRow {
  line: number;
  externalRef: string;
  category: ProductCategory;
  variant: string;
  productId: string;
  productName: string;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  quantity: number;
  status: OrderStatus;
  invoiceNumber: string | null;
  /** ISO timestamp, or null to use the import time. */
  orderedAt: string | null;
}

export type OrderCsvRowResult =
  | { ok: true; line: number; row: OrderCsvRow }
  | { ok: false; line: number; externalRef: string | null; reason: string };

/** Umlauts spelt out and everything else reduced to words, so "Red Castle Club",
 *  "red_castle" and "RED-CASTLE" are one value. */
function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Header names an export is likely to use, per field. First match wins, and a
 *  column is only claimed once. */
const HEADER_ALIASES: Record<string, OrderCsvField> = {
  external_ref: "externalRef",
  externalref: "externalRef",
  bestellnummer: "externalRef",
  bestell_nr: "externalRef",
  bestellnr: "externalRef",
  auftragsnummer: "externalRef",
  referenz: "externalRef",
  nummer: "externalRef",
  nr: "externalRef",
  id: "externalRef",

  produkt: "category",
  produktgruppe: "category",
  kategorie: "category",
  typ: "category",
  art: "category",

  variante: "variant",
  stufe: "variant",
  paket: "variant",
  produktvariante: "variant",
  kategorie_2: "variant",

  firma: "company",
  firmenname: "company",
  company: "company",
  unternehmen: "company",

  vorname: "firstName",
  first_name: "firstName",
  firstname: "firstName",

  nachname: "lastName",
  name: "lastName",
  last_name: "lastName",
  lastname: "lastName",

  email: "email",
  e_mail: "email",
  mail: "email",
  mailadresse: "email",

  anzahl: "quantity",
  anzahl_karten: "quantity",
  menge: "quantity",
  karten: "quantity",
  quantity: "quantity",

  status: "status",
  bestellstatus: "status",
  zahlungsstatus: "status",

  rechnungsnummer: "invoiceNumber",
  rechnung: "invoiceNumber",
  rechnungs_nr: "invoiceNumber",
  belegnummer: "invoiceNumber",

  bestelldatum: "orderedAt",
  datum: "orderedAt",
  date: "orderedAt",
  bestellt_am: "orderedAt",
};

export function parseOrderCsvHeader(content: string): string[] {
  return parseCsvTable(content)[0]?.map((cell) => cell.replace(/^﻿/, "").trim()) ?? [];
}

/** The guess the mapping step opens with - confirmed or corrected by the admin,
 *  never used to import on its own. */
export function detectOrderMapping(header: string[]): OrderCsvMapping {
  const mapping: OrderCsvMapping = {};
  header.forEach((name, index) => {
    const field = HEADER_ALIASES[slug(name)];
    if (field && mapping[field] === undefined) mapping[field] = { column: index };
  });
  return mapping;
}

const CATEGORY_ALIASES: Record<string, ProductCategory> = {
  red_castle: "red_castle",
  red_castle_club: "red_castle",
  redcastle: "red_castle",
  rcc: "red_castle",
  sponsor: "red_castle",
  saisonabo: "saisonabo",
  saisonkarte: "saisonabo",
  saison: "saisonabo",
  abo: "saisonabo",
  saisonpass: "saisonabo",
};

const STATUS_ALIASES: Record<string, OrderStatus> = {
  neu: "neu",
  offen: "neu",
  new: "neu",
  rechnung_versendet: "rechnung_versendet",
  rechnung: "rechnung_versendet",
  verrechnet: "rechnung_versendet",
  fakturiert: "rechnung_versendet",
  bezahlt: "bezahlt",
  paid: "bezahlt",
  beglichen: "bezahlt",
  storniert: "storniert",
  annulliert: "storniert",
  cancelled: "storniert",
};

export function normaliseCategory(value: string): ProductCategory | null {
  return CATEGORY_ALIASES[slug(value)] ?? null;
}

export function normaliseStatus(value: string): OrderStatus | null {
  return STATUS_ALIASES[slug(value)] ?? null;
}

/** Matches the file's word for a package against the variant key and against
 *  the catalog's label, so "gold" and "Gold" both land. */
export function findProduct(products: ImportableProduct[], category: ProductCategory, value: string): ImportableProduct | null {
  const wanted = slug(value);
  return (
    products.find((product) => product.category === category && (slug(product.variant) === wanted || slug(product.label) === wanted)) ?? null
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** "2026-06-12" or "12.06.2026" -> ISO date at noon Zurich time, so the day never
 * shifts when it is displayed. Anything else is an error. */
export function parseOrderDate(value: string): string | null | undefined {
  const text = value.trim();
  if (!text) return null;

  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  const swiss = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text);
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (swiss) {
    [day, month, year] = [Number(swiss[1]), Number(swiss[2]), Number(swiss[3])];
  } else {
    return undefined;
  }

  const date = new Date(Date.UTC(year, month - 1, day, 10, 0, 0));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date.toISOString();
}

/** Which required fields the mapping still leaves open - what keeps the
 *  dialog's "Weiter" disabled. */
export function missingRequiredFields(mapping: OrderCsvMapping): OrderCsvFieldInfo[] {
  return ORDER_CSV_FIELDS.filter((field) => field.required && mapping[field.key] === undefined);
}

function readValue(source: OrderFieldSource | undefined, cells: string[]): string {
  if (!source) return "";
  if ("fixed" in source) return source.fixed.trim();
  return (cells[source.column] ?? "").trim();
}

/** The rules from brief §3, plus D70: a Red Castle row needs a company or a person. */
function validateRow(line: number, cells: string[], mapping: OrderCsvMapping, products: ImportableProduct[]): OrderCsvRowResult {
  const value = (field: OrderCsvField) => readValue(mapping[field], cells);
  const externalRef = value("externalRef") || null;
  const fail = (reason: string): OrderCsvRowResult => ({ ok: false, line, externalRef, reason });

  if (!externalRef) return fail("Bestellnummer im Altsystem fehlt.");

  const categoryRaw = value("category");
  const category = normaliseCategory(categoryRaw);
  if (!category) {
    return fail(`Unbekanntes Produkt «${categoryRaw}» - erlaubt sind Red Castle Club und Saisonabo.`);
  }

  const variantRaw = value("variant");
  const product = findProduct(products, category, variantRaw);
  if (!product) {
    const known = products
      .filter((candidate) => candidate.category === category)
      .map((candidate) => candidate.label)
      .join(", ");
    return fail(`Variante «${variantRaw}» passt nicht zu diesem Produkt - erlaubt sind ${known || "keine"}.`);
  }

  const companyName = value("company") || null;
  const firstName = value("firstName") || null;
  const lastName = value("lastName") || null;

  if (category === "red_castle" && !companyName && !(firstName && lastName)) {
    return fail("Bei Red Castle Club braucht es eine Firma oder Vor- und Nachname.");
  }
  if (category === "saisonabo" && !(firstName && lastName)) {
    return fail("Beim Saisonabo sind Vorname und Nachname Pflicht.");
  }

  const email = value("email").toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return fail(`Ungültige E-Mail-Adresse «${value("email")}».`);

  // Unmapped, the package's own card count applies - the usual case for a file
  // that lists one order per line without repeating what the package contains.
  const quantityRaw = value("quantity");
  const quantity = quantityRaw ? Number(quantityRaw) : product.includedPasses;
  if (!Number.isInteger(quantity) || quantity < 1) return fail(`Ungültige Anzahl «${quantityRaw}» - ganze Zahl ab 1.`);

  const statusRaw = value("status");
  const status = normaliseStatus(statusRaw);
  if (!status) return fail(`Ungültiger Status «${statusRaw}» - erlaubt sind neu, Rechnung versendet, bezahlt, storniert.`);

  const orderedAt = parseOrderDate(value("orderedAt"));
  if (orderedAt === undefined) return fail(`Ungültiges Bestelldatum «${value("orderedAt")}» - JJJJ-MM-TT oder TT.MM.JJJJ.`);

  return {
    ok: true,
    line,
    row: {
      line,
      externalRef,
      category,
      variant: product.variant,
      productId: product.id,
      productName: product.name,
      companyName,
      firstName,
      lastName,
      email,
      quantity,
      status,
      invoiceNumber: value("invoiceNumber") || null,
      orderedAt,
    },
  };
}

/**
 * The whole file under a confirmed mapping: every data row validated, and a
 * reference that appears twice in the same file caught here - two rows racing
 * the unique index would otherwise come back as a raw constraint error.
 */
export function readOrderCsv(
  content: string,
  mapping: OrderCsvMapping,
  products: ImportableProduct[]
): { results: OrderCsvRowResult[]; errors: string[] } {
  const table = parseCsvTable(content);
  if (table.length === 0) return { results: [], errors: ["Die Datei ist leer."] };

  const missing = missingRequiredFields(mapping);
  if (missing.length > 0) {
    return { results: [], errors: [`Diesen Feldern ist noch keine Spalte zugeordnet: ${missing.map((f) => f.label).join(", ")}.`] };
  }

  const seen = new Set<string>();
  const results = table.slice(1).map((cells, index) => {
    // +2: past the header row, and from zero-based to what the file calls line 1.
    const line = index + 2;
    const result = validateRow(line, cells, mapping, products);
    if (!result.ok) return result;
    if (seen.has(result.row.externalRef)) {
      return {
        ok: false as const,
        line,
        externalRef: result.row.externalRef,
        reason: `Bestellnummer ${result.row.externalRef} kommt in der Datei mehrfach vor.`,
      };
    }
    seen.add(result.row.externalRef);
    return result;
  });

  return { results, errors: [] };
}
