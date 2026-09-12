import { test, expect } from "@playwright/test";
import { fillAndSubmitCheckout, makeTestCustomer } from "./fixtures/test-data";
import { createServiceRoleClient } from "./fixtures/cleanup";
import { addProductToCart, openCartPage } from "../shared/cart";

// Cheapest, non-transferable Red Castle Club tier - a real product (no dedicated test
// product exists for memberships), but no payment is actually taken (no payment
// integration yet, see decisions/playwright-retrofit-decisions.md §3), and the row is
// swept by global-teardown regardless.
const PRODUCT_NAME = "Red Castle Club Normal";
const PRODUCT_PRICE_RAPPEN = 30000;

/**
 * Red Castle is sold on uhcuster.ch while the shop has no payment provider, so the
 * card links out and there is no "Auswählen" to click. The checkout still exists and
 * still has to work, so this test puts the group back in the shop for its own run and
 * restores it afterwards - through the admin page, because that is what clears the
 * cached shop pages; writing the row directly would leave a stale page behind.
 */
async function setRedCastleChannel(page: import("@playwright/test").Page, mode: "shop" | "website" | "disabled") {
  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("**/admin");

  await page.goto("/admin/sales");
  const row = page.locator("section").filter({ hasText: "Red Castle Club" }).first();
  const labels = { shop: "Im Shop kaufen", website: "Auf der Website kaufen", disabled: "Kauf deaktiviert" };
  const radio = row.locator(`input[type="radio"][value="${mode}"]`);
  if (!(await radio.isChecked())) {
    // The radio is visually hidden; the label is what a person clicks.
    await row.locator("label").filter({ hasText: labels[mode] }).click();
    await row.getByRole("button", { name: "Speichern" }).click();
    await expect(row.getByText(/Gespeichert/)).toBeVisible();
  }
}

/** Whatever the setting was before this test borrowed it. */
let modeBefore: "shop" | "website" | "disabled" = "website";

test.beforeEach(async () => {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("sales_channels").select("mode").eq("product_type", "membership").single();
  modeBefore = (data?.mode as typeof modeBefore) ?? "website";
});

// Restores the real setting even when the test above fails part-way: leaving the
// shop selling Red Castle would mean real orders nobody is ready to book.
test.afterEach(async ({ page }) => {
  await setRedCastleChannel(page, modeBefore);
});

test("Red Castle Club Membership Bestellung: analog zum Season-Pass-Flow, eigene Produktseite", async ({ page }) => {
  const customer = makeTestCustomer("rcc-membership");
  const holderName = "Playwright RCC Mitglied";

  await setRedCastleChannel(page, "shop");
  await page.goto("/red-castle-club");
  await addProductToCart(page, PRODUCT_NAME);

  await openCartPage(page);
  await expect(page).toHaveURL(/\/warenkorb$/);
  // Non-transferable tier: same "Name Karteninhaber:in" label as a season pass, not the
  // "Name (z.B. Firma)" bundle label (that only applies to transferable RCC tiers).
  await page.getByLabel("Name Karteninhaber:in").fill(holderName);
  await page.getByRole("button", { name: "Zur Kasse" }).click();

  await expect(page).toHaveURL(/\/kasse$/);
  await fillAndSubmitCheckout(page, customer);

  await expect(page.getByRole("heading", { name: "Vielen Dank für deine Bestellung" })).toBeVisible();
  const orderNumberLocator = page.locator("text=/^UHCU-\\d{4}-\\d{4}$/");
  await expect(orderNumberLocator).toBeVisible();
  const orderNumber = (await orderNumberLocator.textContent())?.trim() ?? "";

  await expect(page.getByText(`${PRODUCT_NAME} - ${holderName}`)).toBeVisible();

  const supabase = createServiceRoleClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("status, total_rappen, customers(email)")
    .eq("order_number", orderNumber)
    .single();

  expect(error).toBeNull();
  expect(order?.status).toBe("neu");
  expect(order?.total_rappen).toBe(PRODUCT_PRICE_RAPPEN);
  expect((order?.customers as unknown as { email: string } | null)?.email).toBe(customer.email);
});
