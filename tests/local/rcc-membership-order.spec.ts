import { test, expect } from "@playwright/test";
import { fillAndSubmitCheckout, makeTestCustomer } from "./fixtures/test-data";
import { createServiceRoleClient } from "./fixtures/cleanup";
import { addProductToCart } from "../shared/cart";

// Cheapest, non-transferable Red Castle Club tier - a real product (no dedicated test
// product exists for memberships), but no payment is actually taken (no payment
// integration yet, see decisions/playwright-retrofit-decisions.md §3), and the row is
// swept by global-teardown regardless.
const PRODUCT_NAME = "Red Castle Club Normal";
const PRODUCT_PRICE_RAPPEN = 30000;

test("Red Castle Club Membership Bestellung: analog zum Season-Pass-Flow, eigene Produktseite", async ({ page }) => {
  const customer = makeTestCustomer("rcc-membership");
  const holderName = "Playwright RCC Mitglied";

  await page.goto("/red-castle-club");
  await addProductToCart(page, PRODUCT_NAME);

  await page.getByRole("link", { name: /Warenkorb, 1 Artikel/ }).click();
  await expect(page).toHaveURL(/\/warenkorb$/);
  // Non-transferable tier: same "Name Karteninhaber:in" label as a season pass, not the
  // "Name (z.B. Firma)" bundle label (that only applies to transferable RCC tiers).
  await page.getByLabel("Name Karteninhaber:in").fill(holderName);
  await page.getByRole("button", { name: "Zur Kasse" }).click();

  await expect(page).toHaveURL(/\/kasse$/);
  await fillAndSubmitCheckout(page, customer);

  await expect(page.getByRole("heading", { name: "Bestellung eingegangen" })).toBeVisible();
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
