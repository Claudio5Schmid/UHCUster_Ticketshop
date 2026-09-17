import { describe, expect, it } from "vitest";
import {
  detectOrderMapping,
  parseOrderCsvHeader,
  parseOrderDate,
  readOrderCsv,
  missingRequiredFields,
  type ImportableProduct,
} from "@/lib/csv/orderCsv";

const PRODUCTS: ImportableProduct[] = [
  { id: "p-gold", name: "Red Castle Club Gold", category: "red_castle", variant: "gold", label: "Gold", includedPasses: 3 },
  { id: "p-spezial", name: "Red Castle Club Spezial", category: "red_castle", variant: "spezial", label: "Spezial", includedPasses: 2 },
  { id: "p-erw", name: "Saisonkarte Erwachsene", category: "saisonabo", variant: "erwachsene", label: "Erwachsene", includedPasses: 1 },
  { id: "p-legi", name: "UHC Sponsoren Legi", category: "saisonabo", variant: "legi", label: "Sponsoren Legi", includedPasses: 1 },
];

const HEADER = "external_ref;produkt;variante;firma;vorname;nachname;email;anzahl;status;rechnungsnummer;bestelldatum";

/** What the dialog does: guess the mapping from the header, then read the file. */
function read(...lines: string[]) {
  const content = [HEADER, ...lines].join("\n");
  return readOrderCsv(content, detectOrderMapping(parseOrderCsvHeader(content)), PRODUCTS);
}

describe("readOrderCsv", () => {
  it("accepts the brief's example rows", () => {
    const { results, errors } = read(
      "RC-2025-014;red_castle;gold;Muster AG;Anna;Muster;anna@muster.ch;4;bezahlt;RE-1023;2026-06-12",
      "SA-2025-201;saisonabo;erwachsene;;Luca;Meier;luca@example.ch;1;bezahlt;;2026-07-01"
    );
    expect(errors).toEqual([]);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("guesses the mapping from the header names", () => {
    const mapping = detectOrderMapping(parseOrderCsvHeader(HEADER));
    expect(missingRequiredFields(mapping)).toEqual([]);
    expect(mapping.externalRef).toEqual({ column: 0 });
    expect(mapping.orderedAt).toEqual({ column: 10 });
  });

  it("reads a file whose header is worded differently", () => {
    const content = [
      "Bestellnummer;Kategorie;Paket;Firmenname;Vorname;Name;Mail;Menge;Zahlungsstatus;Beleg-Nr;Bestellt am",
      "X-9;Red Castle Club;Gold;Muster AG;Anna;Muster;anna@muster.ch;4;Bezahlt;RE-7;12.06.2026",
    ].join("\n");
    const { results } = readOrderCsv(content, detectOrderMapping(parseOrderCsvHeader(content)), PRODUCTS);
    expect(results[0].ok).toBe(true);
    expect(results[0].ok && results[0].row).toMatchObject({ category: "red_castle", variant: "gold", quantity: 4, status: "bezahlt" });
  });

  it("takes product, variant and status as one value for the whole file", () => {
    const content = ["Nr;Firma;Vorname;Name;Mail", "X-10;Muster AG;Anna;Muster;anna@muster.ch"].join("\n");
    const { results } = readOrderCsv(
      content,
      {
        externalRef: { column: 0 },
        company: { column: 1 },
        firstName: { column: 2 },
        lastName: { column: 3 },
        email: { column: 4 },
        category: { fixed: "red_castle" },
        variant: { fixed: "gold" },
        status: { fixed: "bezahlt" },
      },
      PRODUCTS
    );
    expect(results[0].ok).toBe(true);
    // No quantity column and none fixed: the package's own card count applies.
    expect(results[0].ok && results[0].row.quantity).toBe(3);
  });

  it("names the fields still to be mapped instead of reading the file", () => {
    const content = ["Nr;Mail", "X-11;anna@muster.ch"].join("\n");
    const { results, errors } = readOrderCsv(content, { externalRef: { column: 0 }, email: { column: 1 } }, PRODUCTS);
    expect(results).toEqual([]);
    expect(errors[0]).toContain("Produkt");
    expect(errors[0]).toContain("Variante");
  });

  it("matches a variant by the catalog's own word for it", () => {
    const { results } = read("X-12;saisonabo;Sponsoren Legi;;Luca;Meier;luca@example.ch;1;bezahlt;;");
    expect(results[0].ok && results[0].row.variant).toBe("legi");
  });

  it("refuses a variant that belongs to another product", () => {
    const { results } = read("X-1;saisonabo;gold;;Luca;Meier;luca@example.ch;1;bezahlt;;");
    expect(results[0]).toMatchObject({ ok: false, reason: expect.stringContaining("passt nicht zu diesem Produkt") });
  });

  it("lets a Red Castle row stand on a person when there is no company (D70)", () => {
    const { results } = read("X-2;red_castle;spezial;;Jan;Wüthrich;jan@example.ch;2;bezahlt;;");
    expect(results[0].ok).toBe(true);
  });

  it("refuses a Red Castle row with neither company nor person", () => {
    const { results } = read("X-3;red_castle;gold;;;;jan@example.ch;3;bezahlt;;");
    expect(results[0]).toMatchObject({ ok: false, reason: expect.stringContaining("Firma oder Vor- und Nachname") });
  });

  it("requires first and last name for a season pass", () => {
    const { results } = read("X-4;saisonabo;erwachsene;;Luca;;luca@example.ch;1;bezahlt;;");
    expect(results[0]).toMatchObject({ ok: false, reason: expect.stringContaining("Vorname und Nachname") });
  });

  it("checks e-mail, quantity and status", () => {
    const { results } = read(
      "X-5;saisonabo;erwachsene;;Luca;Meier;luca-at-example;1;bezahlt;;",
      "X-6;saisonabo;erwachsene;;Luca;Meier;luca@example.ch;0;bezahlt;;",
      "X-7;saisonabo;erwachsene;;Luca;Meier;luca@example.ch;1;wartet auf Freigabe;;"
    );
    expect(results.map((r) => (r.ok ? "ok" : r.reason))).toEqual([
      expect.stringContaining("E-Mail"),
      expect.stringContaining("Anzahl"),
      expect.stringContaining("Status"),
    ]);
  });

  it("reads the words an export actually uses for a status", () => {
    const { results } = read(
      "X-13;saisonabo;erwachsene;;Luca;Meier;luca@example.ch;1;Paid;;",
      "X-14;saisonabo;erwachsene;;Luca;Meier;luca@example.ch;1;Rechnung versendet;;",
      "X-15;saisonabo;erwachsene;;Luca;Meier;luca@example.ch;1;offen;;"
    );
    expect(results.map((r) => (r.ok ? r.row.status : r.reason))).toEqual(["bezahlt", "rechnung_versendet", "neu"]);
  });

  it("flags a reference that appears twice in one file", () => {
    const { results } = read(
      "X-8;saisonabo;erwachsene;;Luca;Meier;luca@example.ch;1;bezahlt;;",
      "X-8;saisonabo;erwachsene;;Luca;Meier;luca@example.ch;1;bezahlt;;"
    );
    expect(results[1]).toMatchObject({ ok: false, reason: expect.stringContaining("mehrfach") });
  });

  it("reports an empty file once, for the file", () => {
    const { errors, results } = readOrderCsv("", detectOrderMapping([]), PRODUCTS);
    expect(results).toEqual([]);
    expect(errors[0]).toContain("leer");
  });
});

describe("parseOrderDate", () => {
  it("reads ISO and Swiss dates, keeps the day, and rejects nonsense", () => {
    expect(parseOrderDate("2026-06-12")).toMatch(/^2026-06-12T/);
    expect(parseOrderDate("1.7.2026")).toMatch(/^2026-07-01T/);
    expect(parseOrderDate("")).toBeNull();
    expect(parseOrderDate("2026-13-40")).toBeUndefined();
    expect(parseOrderDate("gestern")).toBeUndefined();
  });
});
