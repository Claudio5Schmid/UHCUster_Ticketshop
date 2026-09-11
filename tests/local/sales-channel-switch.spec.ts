import { test, expect, type Page } from "@playwright/test";
import { createServiceRoleClient } from "./fixtures/cleanup";

/**
 * The switch in Admin → Einstellungen → Verkauf has to reach the shop, or it is
 * decoration. This flips it both ways and reads the button a visitor would see.
 *
 * It writes to the one shared settings row there is, so the original state is
 * captured first and put back in a finally - through the service-role client,
 * which bypasses RLS, so the restore works even if the UI is the thing at fault.
 */

const SEASON_PASS_CARD = "Saisonkarte Erwachsene";
const TEST_PRODUCT_CARD = "TEST - Bitte nicht kaufen";

async function loginAsAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("**/admin");
}

/** The button inside the card whose title is `title`. */
function cardButton(page: Page, title: string) {
  return page
    .locator("article, li, div")
    .filter({ hasText: title })
    .last()
    .getByRole("link", { name: /kaufen/ })
    .or(page.locator("article, li, div").filter({ hasText: title }).last().getByRole("button", { name: "Auswählen" }));
}

test("the Verkauf switch decides whether a season pass goes in the cart or to uhcuster.ch", async ({ page }) => {
  const supabase = createServiceRoleClient();
  const { data: before } = await supabase
    .from("sales_channels")
    .select("redirect_to_website, website_url")
    .eq("product_type", "season_pass")
    .single();

  try {
    await loginAsAdmin(page);
    await page.goto("/admin/sales");

    const row = page.locator("section").filter({ hasText: "Saisonkarten" }).first();
    const toggle = row.getByRole("switch");

    // --- left: the shop sells it itself
    if ((await toggle.getAttribute("aria-checked")) === "true") {
      await toggle.click();
    }
    await row.getByRole("button", { name: "Speichern" }).click();
    await expect(row.getByText(/Kauf läuft im Shop/)).toBeVisible();

    await page.goto("/");
    await expect(cardButton(page, SEASON_PASS_CARD)).toHaveText("Auswählen");

    // --- right: the visitor is sent to the club's own site
    await page.goto("/admin/sales");
    const rowAgain = page.locator("section").filter({ hasText: "Saisonkarten" }).first();
    await rowAgain.getByRole("switch").click();
    await rowAgain.getByRole("button", { name: "Speichern" }).click();
    await expect(rowAgain.getByText(/über die Website/)).toBeVisible();

    await page.goto("/");
    const link = cardButton(page, SEASON_PASS_CARD);
    await expect(link).toHaveText("Auf uhcuster.ch kaufen");
    await expect(link).toHaveAttribute("href", /^https:\/\/uhcuster\.ch\//);
    // A new tab, so the shop stays open behind it.
    await expect(link).toHaveAttribute("target", "_blank");

    // The test product is exempt by design: without it there would be no way to
    // walk the checkout while everything else points away.
    await expect(cardButton(page, TEST_PRODUCT_CARD)).toHaveText("Auswählen");
  } finally {
    if (before) {
      await supabase
        .from("sales_channels")
        .update({ redirect_to_website: before.redirect_to_website, website_url: before.website_url })
        .eq("product_type", "season_pass");
    }
  }
});

test("a redirect cannot be saved without an https address", async ({ page }) => {
  const supabase = createServiceRoleClient();
  const { data: before } = await supabase
    .from("sales_channels")
    .select("redirect_to_website, website_url")
    .eq("product_type", "membership")
    .single();

  try {
    await loginAsAdmin(page);
    await page.goto("/admin/sales");

    const row = page.locator("section").filter({ hasText: "Red Castle Club" }).first();
    if ((await row.getByRole("switch").getAttribute("aria-checked")) !== "true") {
      await row.getByRole("switch").click();
    }

    // Plain http would drop a visitor from a secure page onto an insecure one.
    await row.getByLabel("Adresse auf uhcuster.ch").fill("http://uhcuster.ch/de/fanzone/red_castle/red_castle.htm");
    await row.getByRole("button", { name: "Speichern" }).click();
    await expect(row.getByText(/https/)).toBeVisible();

    // And the saved value is untouched by the rejected attempt.
    const { data: after } = await supabase
      .from("sales_channels")
      .select("website_url")
      .eq("product_type", "membership")
      .single();
    expect(after?.website_url).toBe(before?.website_url);
  } finally {
    if (before) {
      await supabase
        .from("sales_channels")
        .update({ redirect_to_website: before.redirect_to_website, website_url: before.website_url })
        .eq("product_type", "membership");
    }
  }
});
