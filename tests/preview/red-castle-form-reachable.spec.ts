import { test, expect } from "@playwright/test";

/**
 * Read-only: the Red Castle order form is reachable and the browser's own
 * validation stops an empty submit before the Server Action could run. Skipped
 * when the club currently sells the Red Castle Club on its own site.
 */
test("Red-Castle-Bestellformular ist erreichbar, clientseitige Validierung greift, OHNE Absenden", async ({ page }) => {
  await page.goto("/red-castle-club");
  const orderLinks = page.getByRole("link", { name: "Bestellen" });
  test.skip((await orderLinks.count()) === 0, "Red Castle Club wird zurzeit nicht über den Shop verkauft.");

  await orderLinks.first().click();
  await expect(page).toHaveURL(/\/red-castle-club\/bestellen\?variante=/);

  const submit = page.getByRole("button", { name: "Kostenpflichtig bestellen" });
  const firstName = page.getByLabel("Vorname");

  await submit.click();
  await expect(page.getByRole("heading", { name: "Vielen Dank für deine Bestellung" })).toHaveCount(0);
  expect(await firstName.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);

  // The terms are a required tick: everything filled but that one still cannot be sent.
  await firstName.fill("Preview");
  await page.getByLabel("Nachname").fill("Test");
  await page.getByLabel("E-Mail").fill("not-an-email");
  await page.getByLabel("Strasse und Nr.").fill("Teststrasse 1");
  await page.getByLabel("PLZ").fill("8610");
  await page.getByLabel("Ort").fill("Uster");
  await submit.click();
  expect(await page.getByLabel("E-Mail").evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  expect(await page.getByRole("checkbox", { name: /30 Tagen netto/ }).evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  await expect(page.getByRole("heading", { name: "Vielen Dank für deine Bestellung" })).toHaveCount(0);
});
