import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { createServiceRoleClient } from "./fixtures/cleanup";
import { makeTestCustomer, seedProductId } from "./fixtures/test-data";

const CURRENT_SEASON = "2627";

/**
 * The customer-facing order page (docs/DECISIONS.md D54) under the invoice flow
 * (D77): find the order without an account, see the status, and download the
 * cards once the office has sent them with the invoice - not before, and not
 * after a cancellation.
 */
test("Kundenbestellung: Statusseite finden, Status verfolgen, Karten nach Rechnungsversand herunterladen", async ({ page }) => {
  const customer = makeTestCustomer("order-status");
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
    p_lines: [{ product_id: productId, holder_name: "Playwright Statusseite" }],
    p_season: CURRENT_SEASON,
    p_terms_accepted: true,
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

  await page.getByLabel("E-Mail-Adresse").fill(customer.email);
  await page.getByRole("button", { name: "Bestellung anzeigen" }).click();
  await page.waitForURL(/\/meine-tickets\/.+/);

  const statusUrl = page.url();
  await expect(page.getByRole("heading", { name: orderNumber })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  await expect(page.getByText("Wir haben deine Bestellung")).toBeVisible();
  // Nothing to download before the office has sent invoice and cards.
  await expect(page.getByRole("heading", { name: "Deine Karten" })).toHaveCount(0);

  const token = statusUrl.split("/meine-tickets/")[1];
  const tamperedToken = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
  const tamperedResponse = await page.goto(`/meine-tickets/${tamperedToken}`);
  expect(tamperedResponse?.status()).toBe(404);

  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("**/admin");

  await page.goto(`/admin/orders/${orderNumber}`);
  // Seeded through the RPC alone, the order has no cards yet - the office's
  // fallback for exactly this case creates them.
  await page.getByRole("button", { name: "Karten erstellen" }).click();
  await expect(page.getByRole("heading", { name: "Tickets" })).toBeVisible();

  // Invoice and cards sent: the transition records the invoice number.
  await page.getByRole("button", { name: "Als 'Rechnung versendet' markieren" }).click();
  await page.getByRole("dialog").getByLabel("Rechnungsnummer").fill("RE-PLAYWRIGHT-1");
  await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("button", { name: "Als 'Bezahlt' markieren" })).toBeVisible();
  await expect(page.getByText("RE-PLAYWRIGHT-1").first()).toBeVisible();

  // Same link as before - now with the card behind it.
  await page.goto(statusUrl);
  await expect(page.getByText("Rechnung und Karten sind unterwegs")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deine Karten" })).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "PDF herunterladen" }).first().click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const pdfPath = await download.path();
  expect(pdfPath).not.toBeNull();
  const pdfBuffer = await readFile(pdfPath!);
  expect(pdfBuffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

  // Cancelling switches the cards off (D78): scanner refuses, link says so.
  await page.goto(`/admin/orders/${orderNumber}`);
  await page.getByRole("button", { name: "Stornieren" }).click();
  await page.getByRole("button", { name: "Ja, stornieren" }).click();
  await expect(page.getByText("storniert").first()).toBeVisible();

  const { data: tickets } = await supabase.from("tickets").select("status").eq("order_id", order.order_id);
  expect(tickets?.every((ticket) => ticket.status === "storniert")).toBe(true);

  await page.goto(statusUrl);
  await expect(page.getByText("Diese Bestellung wurde storniert")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deine Karten" })).toHaveCount(0);
});
