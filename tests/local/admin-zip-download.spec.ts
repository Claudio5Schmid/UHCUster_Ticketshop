import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { test, expect } from "@playwright/test";
import { createServiceRoleClient } from "./fixtures/cleanup";
import { makeTestCustomer, seedProductId } from "./fixtures/test-data";

const CURRENT_SEASON = "2627";

test("Admin: ZIP-Download nach Bezahlt-Markierung enthält Ticket-PDF, korrekter Dateiname", async ({ page }) => {
  const customer = makeTestCustomer("admin-zip");
  const supabase = createServiceRoleClient();
  const productId = await seedProductId();

  const { data: order, error } = await supabase.rpc("create_order", {
    p_customer: {
      name: customer.name,
      address_street: customer.addressStreet,
      address_zip: customer.addressZip,
      address_city: customer.addressCity,
      address_country: "CH",
      email: customer.email,
      phone: customer.phone,
    },
    p_lines: [{ product_id: productId, holder_name: "Playwright ZIP Test" }],
    p_season: CURRENT_SEASON,
    p_terms_accepted: true,
  });
  expect(error).toBeNull();
  const orderNumber: string = order.order_number;

  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("**/admin");

  await page.goto(`/admin/orders/${orderNumber}`);

  // Seeded through the RPC alone, the order has no cards yet; the office's
  // fallback creates them. Then the real status walk an admin would click
  // (OrderActions.tsx): invoice number, then paid.
  await page.getByRole("button", { name: "Karten erstellen" }).click();
  await expect(page.getByRole("heading", { name: "Tickets" })).toBeVisible();
  await page.getByRole("button", { name: "Als 'Rechnung versendet' markieren" }).click();
  await page.getByRole("dialog").getByLabel("Rechnungsnummer").fill("RE-PLAYWRIGHT-ZIP");
  await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("button", { name: "Als 'Bezahlt' markieren" })).toBeVisible();
  await page.getByRole("button", { name: "Als 'Bezahlt' markieren" }).click();
  await page.getByRole("button", { name: "Ja, bezahlt" }).click();
  await expect(page.getByRole("button", { name: "Als 'Bezahlt' markieren" })).toHaveCount(0);

  const zipLink = page.getByRole("link", { name: "Alle als ZIP herunterladen" });
  await expect(zipLink).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), zipLink.click()]);

  expect(download.suggestedFilename()).toBe(`${orderNumber}-tickets.zip`);

  const zipPath = await download.path();
  expect(zipPath).not.toBeNull();
  const zipBuffer = await readFile(zipPath!);
  const zip = await JSZip.loadAsync(zipBuffer);
  const entryNames = Object.keys(zip.files);

  expect(entryNames.length).toBeGreaterThan(0);
  expect(entryNames.every((name) => name.endsWith(".pdf"))).toBe(true);

  const firstEntry = await zip.files[entryNames[0]].async("nodebuffer");
  expect(firstEntry.subarray(0, 5).toString("latin1")).toBe("%PDF-");
});
