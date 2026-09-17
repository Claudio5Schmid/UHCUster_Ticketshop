import { parseCsvTable } from "@/lib/csv/memberCsv";
import type { ProductCategory } from "@/lib/products";
import type { OrderStatus } from "@/lib/orders/visibility";

/**
 * Pure parsing and validation for the order import (brief §3) - no server-only
 * imports, so the admin dialog can read the file in the browser and the unit
 * tests can exercise every rule without a database.
 *
 * Fixed columns, by name, in any order:
 *   external_ref;produkt;variante;firma;vorname;nachname;email;anzahl;status;rechnungsnummer;bestelldatum
 */

export const ORDER_CSV_COLUMNS = [
  "external_ref",
  "produkt",
  "variante",
  "firma",
  "vorname",
  "nachname",
  "email",
  "anzahl",
  "status",
  "rechnungsnummer",
  "bestelldatum",
] as const;

export type OrderCsvColumn = (typeof ORDER_CSV_COLUMNS)[number];

const REQUIRED_COLUMNS: OrderCsvColumn[] = ["external_ref", "produkt", "variante", "email", "anzahl", "status"];

const IMPORTABLE_CATEGORIES: ProductCategory[] = ["red_castle", "saisonabo"];
const STATUSES: OrderStatus[] = ["neu", "rechnung_versendet", "bezahlt", "storniert"];

/** One product the import may resolve a row to. */
export interface ImportableProduct {
  id: string;
  name: string;
  category: ProductCategory;
  variant: string;
}

export interface OrderCsvRecord {
  /** 1-based line in the file, header included, as the office counts it. */
  line: number;
  values: Record<OrderCsvColumn, string>;
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

/** Splits the file into records keyed by column name. Errors here are about the
 * file as a whole (missing columns), not about single rows. */
export function parseOrderCsv(content: string): { records: OrderCsvRecord[]; errors: string[] } {
  const table = parseCsvTable(content);
  if (table.length === 0) {
    return { records: [], errors: ["Die Datei ist leer."] };
  }

  const header = table[0].map((cell) => cell.replace(/^﻿/, "").trim().toLowerCase());
  const index = new Map<string, number>();
  header.forEach((name, i) => {
    if (!index.has(name)) index.set(name, i);
  });

  const missing = REQUIRED_COLUMNS.filter((column) => !index.has(column));
  if (missing.length > 0) {
    return {
      records: [],
      errors: [`Spalten fehlen in der Kopfzeile: ${missing.join(", ")}. Erwartet: ${ORDER_CSV_COLUMNS.join(";")}`],
    };
  }

  const records: OrderCsvRecord[] = table.slice(1).map((cells, i) => {
    const values = {} as Record<OrderCsvColumn, string>;
    for (const column of ORDER_CSV_COLUMNS) {
      const position = index.get(column);
      values[column] = position === undefined ? "" : (cells[position] ?? "").trim();
    }
    return { line: i + 2, values };
  });

  return { records, errors: [] };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** "2026-06-12" or "12.06.2026" -> ISO date at noon Zurich time, so the day never
 * shifts when it is displayed. Anything else is an error. */
export function parseOrderDate(value: string): string | null | undefined {
  const text = value.trim();
  if (!text) return null;

  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const swiss = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
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

/** The rules from brief §3, plus D70: a Red Castle row needs a company or a person. */
export function validateOrderRecord(record: OrderCsvRecord, products: ImportableProduct[]): OrderCsvRowResult {
  const { line, values } = record;
  const externalRef = values.external_ref || null;
  const fail = (reason: string): OrderCsvRowResult => ({ ok: false, line, externalRef, reason });

  if (!externalRef) return fail("external_ref fehlt.");

  const category = values.produkt.toLowerCase() as ProductCategory;
  if (!IMPORTABLE_CATEGORIES.includes(category)) {
    return fail(`Unbekanntes Produkt «${values.produkt}» - erlaubt sind ${IMPORTABLE_CATEGORIES.join(", ")}.`);
  }

  const variant = values.variante.toLowerCase();
  const product = products.find((candidate) => candidate.category === category && candidate.variant === variant);
  if (!product) {
    const known = products
      .filter((candidate) => candidate.category === category)
      .map((candidate) => candidate.variant)
      .join(", ");
    return fail(`Variante «${values.variante}» passt nicht zu ${category} - erlaubt sind ${known || "keine"}.`);
  }

  const companyName = values.firma || null;
  const firstName = values.vorname || null;
  const lastName = values.nachname || null;

  if (category === "red_castle" && !companyName && !(firstName && lastName)) {
    return fail("Bei red_castle braucht es eine Firma oder Vor- und Nachname.");
  }
  if (category === "saisonabo" && !(firstName && lastName)) {
    return fail("Bei saisonabo sind Vorname und Nachname Pflicht.");
  }

  const email = values.email.toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return fail(`Ungültige E-Mail-Adresse «${values.email}».`);

  const quantity = Number(values.anzahl);
  if (!Number.isInteger(quantity) || quantity < 1) return fail(`Ungültige Anzahl «${values.anzahl}» - ganze Zahl ab 1.`);

  const status = values.status.toLowerCase() as OrderStatus;
  if (!STATUSES.includes(status)) return fail(`Ungültiger Status «${values.status}» - erlaubt sind ${STATUSES.join(", ")}.`);

  const orderedAt = parseOrderDate(values.bestelldatum);
  if (orderedAt === undefined) return fail(`Ungültiges Bestelldatum «${values.bestelldatum}» - JJJJ-MM-TT oder TT.MM.JJJJ.`);

  return {
    ok: true,
    line,
    row: {
      line,
      externalRef,
      category,
      variant,
      productId: product.id,
      productName: product.name,
      companyName,
      firstName,
      lastName,
      email,
      quantity,
      status,
      invoiceNumber: values.rechnungsnummer || null,
      orderedAt,
    },
  };
}

/** The whole file: parsed, validated row by row, and checked for a reference
 * that appears twice in the same file - two rows racing the unique index would
 * otherwise come back as a raw constraint error. */
export function readOrderCsv(content: string, products: ImportableProduct[]): { results: OrderCsvRowResult[]; errors: string[] } {
  const { records, errors } = parseOrderCsv(content);
  if (errors.length > 0) return { results: [], errors };

  const seen = new Set<string>();
  const results = records.map((record) => {
    const result = validateOrderRecord(record, products);
    if (!result.ok) return result;
    if (seen.has(result.row.externalRef)) {
      return { ok: false as const, line: record.line, externalRef: result.row.externalRef, reason: `external_ref ${result.row.externalRef} kommt in der Datei mehrfach vor.` };
    }
    seen.add(result.row.externalRef);
    return result;
  });

  return { results, errors: [] };
}
