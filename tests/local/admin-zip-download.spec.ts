import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { test, expect } from "@playwright/test";
import { createServiceRoleClient } from "./fixtures/cleanup";
import { makeTestCustomer } from "./fixtures/test-data";

const CURRENT_SEASON = "2627";
const TEST_PRODUCT_ID = "f0000000-0000-0000-0000-00000000aa02";

test("Admin: ZIP-Download nach Bezahlt-Markierung enthält Ticket-PDF, korrekter Dateiname", async ({ page }) => {
  const customer = makeTestCustomer("admin-zip");
  const supabase = createServiceRoleClient();

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
    p_lines: [{ product_id: TEST_PRODUCT_ID, holder_name: "Playwright ZIP Test" }],
    p_season: CURRENT_SEASON,
  });
  expect(error).toBeNull();
  const orderNumber: string = order.order_number;

  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("**/admin");

  await page.goto(`/admin/orders/${orderNumber}`);

  // Ticket PDFs (and with them the ZIP link) only exist once an order is "bezahlt" - walk
  // the real two-step status transition an admin would click, same as OrderActions.tsx.
  await page.getByRole("button", { name: "Als 'Rechnung versendet' markieren" }).click();
  await expect(page.getByRole("button", { name: "Als 'Bezahlt' markieren" })).toBeVisible();
  await page.getByRole("button", { name: "Als 'Bezahlt' markieren" }).click();

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
