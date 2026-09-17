import { test, expect } from "@playwright/test";
import { createServiceRoleClient, TEST_EMAIL_DOMAIN } from "./fixtures/cleanup";

/**
 * The order migration (brief §3): file, preview, confirm - and the batch
 * rollback that takes it all back. Everything the import creates carries the
 * suite's e-mail tag, so a run that dies half-way is still swept.
 */
test("CSV-Import: Vorschau mit Prüfung pro Zeile, Import, Batch zurückrollen", async ({ page }) => {
  const stamp = Date.now().toString(36);
  const refGold = `PW-RC-${stamp}`;
  const refLegi = `PW-SA-${stamp}`;
  const csv = [
    "external_ref;produkt;variante;firma;vorname;nachname;email;anzahl;status;rechnungsnummer;bestelldatum",
    `${refGold};red_castle;gold;Playwright Import AG;Anna;Muster;e2e-import-a-${stamp}@${TEST_EMAIL_DOMAIN};4;bezahlt;RE-PW-1;2026-06-12`,
    `${refLegi};saisonabo;legi;;Luca;Meier;e2e-import-b-${stamp}@${TEST_EMAIL_DOMAIN};1;bezahlt;;01.07.2026`,
    `PW-BAD-${stamp};saisonabo;gold;;Luca;Meier;e2e-import-c-${stamp}@${TEST_EMAIL_DOMAIN};1;bezahlt;;`,
  ].join("\n");

  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("**/admin");

  await page.getByRole("button", { name: "CSV importieren" }).click();
  await page.getByLabel("CSV-Datei").setInputFiles({ name: "playwright-import.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") });

  // Step two: the header is the canonical one, so every field is mapped for us
  // and "Weiter" is the only thing left to do.
  await expect(page.getByLabel("Bestellnummer im Altsystem *")).toHaveValue("col:0");
  await expect(page.getByLabel("Produkt *")).toHaveValue("col:1");
  await page.getByRole("button", { name: "Weiter" }).click();

  // The preview names the verdict per row before anything is written.
  await expect(page.getByRole("button", { name: "2 Bestellung(en) importieren" })).toBeVisible();
  await expect(page.getByText(/passt nicht zu diesem Produkt/)).toBeVisible();

  await page.getByRole("button", { name: "2 Bestellung(en) importieren" }).click();
  await expect(page.getByText(/2 Bestellung\(en\) importiert/)).toBeVisible({ timeout: 60_000 });

  const supabase = createServiceRoleClient();
  const { data: imported } = await supabase
    .from("orders")
    .select("id, status, source, invoice_number, created_at, notification_status, customers(name), order_items(quantity, holder_name), tickets(holder_name, status)")
    .in("external_ref", [refGold, refLegi]);
  expect(imported?.length).toBe(2);
  const gold = imported?.find((order) => (order.customers as unknown as { name: string }).name === "Playwright Import AG");
  expect(gold?.status).toBe("bezahlt");
  expect(gold?.source).toBe("csv_import");
  expect(gold?.invoice_number).toBe("RE-PW-1");
  expect(gold?.created_at).toMatch(/^2026-06-12/);
  // No mail was triggered by the import: the customer stays "not informed".
  expect(gold?.notification_status).toBe("nicht_versendet");
  // Four cards as the file says (D74), all on the company (D73).
  expect((gold?.tickets as Array<{ holder_name: string; status: string }>).length).toBe(4);
  expect((gold?.tickets as Array<{ holder_name: string }>).every((ticket) => ticket.holder_name === "Playwright Import AG")).toBe(true);

  // Importing the same file again reports the rows as already there.
  await page.getByRole("button", { name: "Fertig" }).click();
  await page.getByRole("button", { name: "CSV importieren" }).click();
  await page.getByLabel("CSV-Datei").setInputFiles({ name: "playwright-import.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") });
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByText("Bereits importiert").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "0 Bestellung(en) importieren" })).toBeDisabled();
  await page.getByRole("button", { name: "Abbrechen" }).click();


  // A file with the club's own column names: nothing is detected, so the
  // mapping is set by hand - including the two values that hold for the whole
  // file and have no column at all.
  const ref = `PW-MAN-${stamp}`;
  const ownWording = [
    "Auftrag;Kunde;Mailadresse",
    `${ref};Playwright Handzuordnung AG;e2e-import-d-${stamp}@${TEST_EMAIL_DOMAIN}`,
  ].join("\n");
  await page.getByRole("button", { name: "CSV importieren" }).click();
  await page.getByLabel("CSV-Datei").setInputFiles({ name: "playwright-eigene-spalten.csv", mimeType: "text/csv", buffer: Buffer.from(ownWording, "utf-8") });
  await expect(page.getByRole("button", { name: /Noch zuordnen/ })).toBeVisible();
  await page.getByLabel("Bestellnummer im Altsystem *").selectOption("col:0");
  await page.getByLabel("Firma").selectOption("col:1");
  await page.getByLabel("E-Mail *").selectOption("col:2");
  await page.getByLabel("Produkt *").selectOption("fix:red_castle");
  await page.getByLabel("Variante *").selectOption("fix:gold");
  await page.getByLabel("Status *").selectOption("fix:bezahlt");
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByRole("button", { name: "1 Bestellung(en) importieren" })).toBeVisible();
  await page.getByRole("button", { name: "1 Bestellung(en) importieren" }).click();
  await expect(page.getByText(/1 Bestellung\(en\) importiert/)).toBeVisible({ timeout: 60_000 });

  const { data: manual } = await supabase
    .from("orders")
    .select("id, status, customers(name), order_items(quantity), import_batch_id")
    .eq("external_ref", ref)
    .single();
  expect(manual?.status).toBe("bezahlt");
  expect((manual?.customers as unknown as { name: string }).name).toBe("Playwright Handzuordnung AG");
  // No quantity column and none fixed: the Gold package's own three cards.
  expect((manual?.order_items as Array<{ quantity: number }>)[0].quantity).toBe(3);
  await page.getByRole("button", { name: "Fertig" }).click();
  await page.goto(`/admin/import/${manual!.import_batch_id}`);
  await page.getByRole("button", { name: "Batch zurückrollen" }).click();
  await page.getByRole("button", { name: "Ja, zurückrollen" }).click();
  await expect(page.getByText(/1 Bestellung\(en\)/)).toBeVisible();

  // The batch page takes it all back.
  const { data: batchOrder } = await supabase.from("orders").select("import_batch_id").eq("external_ref", refGold).single();
  await page.goto(`/admin/import/${batchOrder!.import_batch_id}`);
  await expect(page.getByRole("heading", { name: /Import playwright-import\.csv/ })).toBeVisible();
  await page.getByRole("button", { name: "Batch zurückrollen" }).click();
  await page.getByRole("button", { name: "Ja, zurückrollen" }).click();
  await expect(page.getByText(/2 Bestellung\(en\), 5 Karte\(n\)/)).toBeVisible();

  const { data: after } = await supabase.from("orders").select("id").in("external_ref", [refGold, refLegi]);
  expect(after?.length).toBe(0);
});
