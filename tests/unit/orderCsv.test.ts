import { describe, expect, it } from "vitest";
import { parseOrderDate, readOrderCsv, type ImportableProduct } from "@/lib/csv/orderCsv";

const PRODUCTS: ImportableProduct[] = [
  { id: "p-gold", name: "Red Castle Club Gold", category: "red_castle", variant: "gold" },
  { id: "p-spezial", name: "Red Castle Club Spezial", category: "red_castle", variant: "spezial" },
  { id: "p-erw", name: "Saisonkarte Erwachsene", category: "saisonabo", variant: "erwachsene" },
];

const HEADER = "external_ref;produkt;variante;firma;vorname;nachname;email;anzahl;status;rechnungsnummer;bestelldatum";

function read(...lines: string[]) {
  return readOrderCsv([HEADER, ...lines].join("\n"), PRODUCTS);
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

  it("refuses a variant that belongs to another product", () => {
    const { results } = read("X-1;saisonabo;gold;;Luca;Meier;luca@example.ch;1;bezahlt;;");
    expect(results[0]).toMatchObject({ ok: false, reason: expect.stringContaining("passt nicht zu saisonabo") });
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
      "X-7;saisonabo;erwachsene;;Luca;Meier;luca@example.ch;1;paid;;"
    );
    expect(results.map((r) => (r.ok ? "ok" : r.reason))).toEqual([
      expect.stringContaining("E-Mail"),
      expect.stringContaining("Anzahl"),
      expect.stringContaining("Status"),
    ]);
  });

  it("flags a reference that appears twice in one file", () => {
    const { results } = read(
      "X-8;saisonabo;erwachsene;;Luca;Meier;luca@example.ch;1;bezahlt;;",
      "X-8;saisonabo;erwachsene;;Luca;Meier;luca@example.ch;1;bezahlt;;"
    );
    expect(results[1]).toMatchObject({ ok: false, reason: expect.stringContaining("mehrfach") });
  });

  it("reports a missing column once, for the file", () => {
    const { errors, results } = readOrderCsv("external_ref;produkt\nX;red_castle", PRODUCTS);
    expect(results).toEqual([]);
    expect(errors[0]).toContain("variante");
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
