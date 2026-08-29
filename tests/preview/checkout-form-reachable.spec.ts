import { test, expect } from "@playwright/test";
import { addProductToCart } from "../shared/cart";

// The dedicated test product (CHF 1.00, "please don't buy" by name) already active in the
// same Supabase project this preview deployment reads from - see
// decisions/playwright-retrofit-decisions.md. Safe to add to a cart; this test never
// actually submits, so no order is ever created.
const PRODUCT_NAME = "TEST - Bitte nicht kaufen";

test("Checkout-Formular ist erreichbar, clientseitige Validierung greift, OHNE Absenden", async ({ page }) => {
  await page.goto("/");
  await addProductToCart(page, PRODUCT_NAME);

  await page.getByRole("link", { name: /Warenkorb, 1 Artikel/ }).click();
  await expect(page).toHaveURL(/\/warenkorb$/);
  await page.getByLabel("Name Karteninhaber:in").fill("Preview Test Holder");
  await page.getByRole("button", { name: "Zur Kasse" }).click();
  await expect(page).toHaveURL(/\/kasse$/);

  const submitButton = page.getByRole("button", { name: "Bestellung abschicken" });
  const nameField = page.getByLabel("Name", { exact: true });

  // Every field is empty: the browser's native HTML5 `required` validation blocks the
  // submit event before React's onSubmit (and therefore submitOrder()) ever runs - so
  // clicking here cannot create a real order.
  await submitButton.click();
  await expect(page.getByRole("heading", { name: "Bestellung eingegangen" })).toHaveCount(0);
  expect(await nameField.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);

  // Fill everything except a valid email, to check the type="email" format validation
  // specifically. The email stays invalid for the rest of the test, so submitOrder() is
  // structurally guaranteed to never run, not just skipped by omission.
  await nameField.fill("Preview Test");
  await page.getByLabel("Telefon").fill("079 000 00 00");
  await page.getByLabel("Strasse und Nr.").fill("Teststrasse 1");
  await page.getByLabel("PLZ").fill("8610");
  await page.getByLabel("Ort").fill("Uster");
  const emailField = page.getByLabel("E-Mail");
  await emailField.fill("not-an-email");

  await submitButton.click();
  expect(await emailField.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  await expect(page.getByRole("heading", { name: "Bestellung eingegangen" })).toHaveCount(0);
});
