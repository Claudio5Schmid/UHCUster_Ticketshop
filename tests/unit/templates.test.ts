import { describe, expect, it } from "vitest";
import { applyPlaceholders, placeholdersIn } from "@/lib/email/templates";

describe("applyPlaceholders", () => {
  it("fills both spellings and leaves unknown ones visible", () => {
    const text = "Hallo {name} / {{vorname}}, Bestellung {bestellnummer} - {unbekannt}";
    expect(applyPlaceholders(text, { name: "Anna Muster", vorname: "Anna", bestellnummer: "UHCU-2627-0001" })).toBe(
      "Hallo Anna Muster / Anna, Bestellung UHCU-2627-0001 - {unbekannt}"
    );
  });

  it("writes an empty value as nothing", () => {
    expect(applyPlaceholders("Firma: {firma}.", { firma: null })).toBe("Firma: .");
  });

  it("lists the keys a text uses", () => {
    expect(placeholdersIn("{name} und {{name}} und {ticket_link}")).toEqual(["name", "ticket_link"]);
  });
});
