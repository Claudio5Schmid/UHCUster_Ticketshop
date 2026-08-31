import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { createServiceRoleClient } from "./fixtures/cleanup";
import { makeTestCustomer } from "./fixtures/test-data";

const CURRENT_SEASON = "2627";
const TEST_PRODUCT_ID = "f0000000-0000-0000-0000-00000000aa02";

/**
 * The customer-facing order page (docs/DECISIONS.md D54). Covers the whole loop the
 * feature exists for: find the order without an account, see the status, and - once
 * the office marks it paid - download the ticket PDF without anyone sending it.
 */
test("Kundenbestellung: Statusseite finden, Status verfolgen, Ticket selbst herunterladen", async ({ page }) => {
  const customer = makeTestCustomer("order-status");
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
    p_lines: [{ product_id: TEST_PRODUCT_ID, holder_name: "Playwright Statusseite" }],
    p_season: CURRENT_SEASON,
  });
  expect(error).toBeNull();
  const orderNumber: string = order.order_number;

  // A wrong e-mail must not reveal whether the order number itself exists.
  await page.goto("/meine-tickets");
  await page.getByLabel("Bestellnummer").fill(orderNumber);
  await page.getByLabel("E-Mail-Adresse").fill("jemand-anderes@playwright-test.invalid");
  await page.getByRole("button", { name: "Bestellung anzeigen" }).click();
  await expect(page.getByText("Wir konnten keine Bestellung mit diesen Angaben finden.")).toBeVisible();
  await expect(page).toHaveURL(/\/meine-tickets$/);

  // The real pair lands on the signed link.
  await page.getByLabel("E-Mail-Adresse").fill(customer.email);
  await page.getByRole("button", { name: "Bestellung anzeigen" }).click();
  await page.waitForURL(/\/meine-tickets\/.+/);

  const statusUrl = page.url();
  await expect(page.getByRole("heading", { name: orderNumber })).toBeVisible();
  // The URL is a bearer credential - it must never be indexable or leak as a referrer.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  await expect(page.getByText("Wir haben deine Bestellung")).toBeVisible();
  // Nothing to download before the office has been paid.
  await expect(page.getByRole("heading", { name: "Deine Karten" })).toHaveCount(0);

  // A tampered signature is a 404, not a different customer's order.
  const token = statusUrl.split("/meine-tickets/")[1];
  const tamperedToken = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
  const tamperedResponse = await page.goto(`/meine-tickets/${tamperedToken}`);
  expect(tamperedResponse?.status()).toBe(404);

  // The office walks the order to "bezahlt", which is what issues the tickets.
  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("**/admin");

  await page.goto(`/admin/orders/${orderNumber}`);
  await page.getByRole("button", { name: "Als 'Rechnung versendet' markieren" }).click();
  await expect(page.getByRole("button", { name: "Als 'Bezahlt' markieren" })).toBeVisible();
  await page.getByRole("button", { name: "Als 'Bezahlt' markieren" }).click();
  await expect(page.getByRole("heading", { name: "Tickets" })).toBeVisible();

  // Same link as before - now with the card behind it.
  await page.goto(statusUrl);
  await expect(page.getByText("Zahlung eingegangen")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deine Karten" })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "PDF herunterladen" }).first().click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);

  const pdfPath = await download.path();
  expect(pdfPath).not.toBeNull();
  const pdfBuffer = await readFile(pdfPath!);
  expect(pdfBuffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
});
