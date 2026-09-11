import { expect, type Page } from "@playwright/test";

/**
 * Adds one product to the cart from its ProductCard on the current page (homepage or
 * /red-castle-club) and waits for the cart drawer to show it. Pure browser interaction,
 * no backend writes - safe for both the local and preview suites.
 *
 * The drawer replaced an "added to cart" toast: it opens on the same click and names
 * what went in, so it is both the confirmation and the way onward.
 */
export async function addProductToCart(page: Page, productName: string) {
  const heading = page.getByRole("heading", { name: productName, exact: true });
  await heading.scrollIntoViewIfNeeded();
  const card = heading.locator("xpath=ancestor::div[1]");
  await card.getByRole("button", { name: "Auswählen" }).click();

  const drawer = page.locator("aside").filter({ hasText: "Warenkorb" });
  await expect(drawer.getByText(productName, { exact: true })).toBeVisible();
}

/**
 * Leaves the drawer for the cart page. A freshly added card has no holder name yet,
 * so the drawer's own button reads "Namen eintragen" and goes there; the header cart
 * is a button that reopens the drawer, not a link, once something is in it.
 */
export async function openCartPage(page: Page) {
  const drawer = page.locator("aside").filter({ hasText: "Warenkorb" });
  await drawer.getByRole("button", { name: /Namen eintragen|Zur Kasse/ }).click();
}
