import { test, expect } from "@playwright/test";
import { createServiceRoleClient, testEmail } from "./fixtures/cleanup";

// The cheapest tier, so a swept test order is as small as a real one gets. No
// payment is taken anywhere in this shop; the row is swept by global-teardown.
const PRODUCT_NAME = "Red Castle Club Normal";
const PRODUCT_PRICE_RAPPEN = 30000;

/**
 * The Red Castle Club sells through its own form since the migration brief
 * (D70-D77): person plus optional company, invoice only, cards issued at once
 * but handed over by the office. This test walks the form and checks what the
 * database holds afterwards - not just what the confirmation screen says.
 */
async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("**/admin");
}

async function setRedCastleChannel(page: import("@playwright/test").Page, mode: "shop" | "website" | "disabled") {
  await loginAsAdmin(page);
  await page.goto("/admin/sales");
  const row = page.locator("section").filter({ hasText: "Red Castle Club" }).first();
  const labels = { shop: "Im Shop kaufen", website: "Auf der Website kaufen", disabled: "Kauf deaktiviert" };
  const radio = row.locator(`input[type="radio"][value="${mode}"]`);
  if (!(await radio.isChecked())) {
    await row.locator("label").filter({ hasText: labels[mode] }).click();
    await row.getByRole("button", { name: "Speichern" }).click();
    await expect(row.getByText(/Gespeichert/)).toBeVisible();
  }
}

let modeBefore: "shop" | "website" | "disabled" = "website";

test.beforeEach(async () => {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("sales_channels").select("mode").eq("product_type", "membership").single();
  modeBefore = (data?.mode as typeof modeBefore) ?? "website";
});

test.afterEach(async ({ page }) => {
  await setRedCastleChannel(page, modeBefore);
});

test("Red Castle Club: Bestellung auf Rechnung über das eigene Formular, Karten sofort erstellt", async ({ page }) => {
  const email = testEmail("red-castle");
  const company = "Playwright RCC AG";

  await setRedCastleChannel(page, "shop");
  await page.goto("/red-castle-club");

  const heading = page.getByRole("heading", { name: PRODUCT_NAME, exact: true });
  await heading.scrollIntoViewIfNeeded();
  await heading.locator("xpath=ancestor::div[1]").getByRole("link", { name: "Bestellen" }).click();
  await expect(page).toHaveURL(/\/red-castle-club\/bestellen\?variante=normal$/);
  await expect(page.getByRole("heading", { name: `${PRODUCT_NAME} bestellen` })).toBeVisible();

  await page.getByLabel("Vorname").fill("Playwright");
  await page.getByLabel("Nachname").fill("Sponsor");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Firma", { exact: true }).fill(company);
  await page.getByLabel(/Referenz/).fill("PO-PLAYWRIGHT");
  await page.getByLabel("Strasse und Nr.").fill("Teststrasse 1");
  await page.getByLabel("PLZ").fill("8610");
  await page.getByLabel("Ort").fill("Uster");
  await page.getByRole("checkbox", { name: /30 Tagen netto/ }).check();

  await page.waitForFunction(() => {
    const el = document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
    return !!el?.value;
  });
  await page.getByRole("button", { name: "Kostenpflichtig bestellen" }).click();

  await expect(page.getByRole("heading", { name: "Vielen Dank für deine Bestellung" })).toBeVisible();
  const orderNumberLocator = page.locator("text=/^UHCU-\\d{4}-\\d{4}$/");
  await expect(orderNumberLocator).toBeVisible();
  const orderNumber = (await orderNumberLocator.textContent())?.trim() ?? "";
  // The office hands the cards over with the invoice (D77) - the screen says so
  // and offers the durable link, not a download.
  await expect(page.getByText(/Rechnung und deine Karten innert 2 bis 4 Werktagen/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Zu meiner Bestellung" })).toBeVisible();

  const supabase = createServiceRoleClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, source, payment_method, total_rappen, terms_accepted_at, customers(email, name, company_name, first_name, last_name, customer_reference, phone)")
    .eq("order_number", orderNumber)
    .single();
  expect(error).toBeNull();
  expect(order?.status).toBe("neu");
  expect(order?.source).toBe("shop");
  expect(order?.payment_method).toBe("invoice");
  expect(order?.total_rappen).toBe(PRODUCT_PRICE_RAPPEN);
  expect(order?.terms_accepted_at).not.toBeNull();

  const customer = order?.customers as unknown as {
    email: string;
    name: string;
    company_name: string | null;
    first_name: string | null;
    last_name: string | null;
    customer_reference: string | null;
    phone: string | null;
  };
  expect(customer.email).toBe(email);
  expect(customer.name).toBe(company);
  expect(customer.company_name).toBe(company);
  expect(customer.first_name).toBe("Playwright");
  expect(customer.last_name).toBe("Sponsor");
  expect(customer.customer_reference).toBe("PO-PLAYWRIGHT");
  expect(customer.phone).toBeNull();

  // Cards exist the moment the order does, made out to the company (D73).
  const { data: tickets } = await supabase.from("tickets").select("holder_name, status, pdf_path").eq("order_id", order!.id);
  expect(tickets?.length).toBe(1);
  expect(tickets?.[0].holder_name).toBe(company);
  expect(tickets?.[0].status).toBe("gueltig");
  expect(tickets?.[0].pdf_path).toBeTruthy();

  // Not the customer's yet: the link shows the order, not the cards.
  await page.getByRole("link", { name: "Zu meiner Bestellung" }).click();
  await expect(page.getByRole("heading", { name: orderNumber })).toBeVisible();
  await expect(page.getByText("Wir haben deine Bestellung")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deine Karten" })).toHaveCount(0);
});
