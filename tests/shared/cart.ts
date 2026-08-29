import type { Page } from "@playwright/test";

/**
 * Adds one product to the cart from its ProductCard on the current page (homepage or
 * /red-castle-club) and waits for the "added to cart" toast, by product heading text.
 * Pure browser interaction, no backend writes - safe for both the local and preview suites.
 */
export async function addProductToCart(page: Page, productName: string) {
  const heading = page.getByRole("heading", { name: productName, exact: true });
  await heading.scrollIntoViewIfNeeded();
  const card = heading.locator("xpath=ancestor::div[1]");
  await card.getByRole("button", { name: "Auswählen" }).click();
  await page.getByText(`${productName} zum Warenkorb hinzugefügt.`).waitFor();
}
