import { test, expect } from "@playwright/test";
import { fillAndSubmitCheckout, makeTestCustomer } from "./fixtures/test-data";
import { createServiceRoleClient } from "./fixtures/cleanup";
import { addProductToCart } from "../shared/cart";

// Deliberately uses the "TEST - Bitte nicht kaufen" season-pass product (CHF 1.00, active in
// the catalog specifically for this purpose - see decisions/playwright-retrofit-decisions.md).
const PRODUCT_NAME = "TEST - Bitte nicht kaufen";
const PRODUCT_PRICE_RAPPEN = 100;

test("Season-Pass-Bestellung E2E: Produkt wählen, Formular ausfüllen, absenden, landet korrekt in Supabase", async ({
  page,
}) => {
  const customer = makeTestCustomer("season-pass");
  const holderName = "Playwright Karteninhaber";

  await page.goto("/");
  await addProductToCart(page, PRODUCT_NAME);

  await page.getByRole("link", { name: /Warenkorb, 1 Artikel/ }).click();
  await expect(page).toHaveURL(/\/warenkorb$/);
  await page.getByLabel("Name Karteninhaber:in").fill(holderName);
  await page.getByRole("button", { name: "Zur Kasse" }).click();

  await expect(page).toHaveURL(/\/kasse$/);
  await fillAndSubmitCheckout(page, customer);

  await expect(page.getByRole("heading", { name: "Bestellung eingegangen" })).toBeVisible();
  const orderNumberLocator = page.locator("text=/^UHCU-\\d{4}-\\d{4}$/");
  await expect(orderNumberLocator).toBeVisible();
  const orderNumber = (await orderNumberLocator.textContent())?.trim() ?? "";
  expect(orderNumber).toMatch(/^UHCU-\d{4}-\d{4}$/);

  await expect(page.getByText(`${PRODUCT_NAME} - ${holderName}`)).toBeVisible();
  await expect(page.getByText(customer.email, { exact: false })).toBeVisible();

  // The confirmation screen only proves the client rendered something - confirm the order
  // actually landed in Supabase with the right status and customer, via the service role
  // (bypasses RLS deliberately, same as the tag-and-cleanup sweep).
  const supabase = createServiceRoleClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("status, total_rappen, confirmation_email_sent_at, customers(email, name)")
    .eq("order_number", orderNumber)
    .single();

  expect(error).toBeNull();
  expect(order?.status).toBe("neu");
  expect(order?.total_rappen).toBe(PRODUCT_PRICE_RAPPEN);
  expect((order?.customers as unknown as { email: string; name: string } | null)?.email).toBe(customer.email);

  // The order confirmation email must NOT have been sent here: test customers use the
  // reserved @playwright-test.invalid domain, which would hard-bounce and damage the
  // SES sending reputation. A timestamp appearing here means the bounce guard in
  // src/lib/email/ses.ts stopped working - that is a real production problem, not a
  // test-only detail, so it is asserted on every run.
  expect(order?.confirmation_email_sent_at).toBeNull();
});
