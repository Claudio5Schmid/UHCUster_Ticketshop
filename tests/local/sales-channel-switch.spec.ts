import { test, expect, type Page } from "@playwright/test";
import { createServiceRoleClient } from "./fixtures/cleanup";

/**
 * The setting in Admin → Einstellungen → Verkauf has to reach the shop, or it is
 * decoration. This walks all three modes and reads the button a visitor sees.
 *
 * It writes to the one shared settings row there is, so the original is captured
 * first and put back in a finally - through the service-role client, which
 * bypasses RLS, so the restore works even if the UI is the thing at fault.
 */

const SEASON_PASS_CARD = "Saisonkarte Erwachsene";
const TEST_PRODUCT_CARD = "TEST - Bitte nicht kaufen";

type Mode = "shop" | "website" | "disabled";

async function loginAsAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("**/admin");
}

/** The radio itself is visually hidden, so this clicks the label - what a person does. */
const MODE_LABELS: Record<Mode, string> = {
  shop: "Im Shop kaufen",
  website: "Auf der Website kaufen",
  disabled: "Kauf deaktiviert",
};

async function setMode(page: Page, group: string, mode: Mode) {
  await page.goto("/admin/sales");
  const row = page.locator("section").filter({ hasText: group }).first();
  await row.locator("label").filter({ hasText: MODE_LABELS[mode] }).click();
  await expect(row.locator(`input[type="radio"][value="${mode}"]`)).toBeChecked();
  await row.getByRole("button", { name: "Speichern" }).click();
  await expect(row.getByText(/Gespeichert/)).toBeVisible();
}

/** The buy control inside the card whose title is `title`, whatever shape it has. */
function cardControl(page: Page, title: string) {
  const card = page.locator("article, li, div").filter({ hasText: title }).last();
  return card.getByRole("link", { name: /kaufen/ }).or(card.getByRole("button", { name: "Auswählen" }));
}

test("the three Verkauf modes each reach the shop", async ({ page }) => {
  const supabase = createServiceRoleClient();
  const { data: before } = await supabase
    .from("sales_channels")
    .select("mode, website_url, note")
    .eq("product_type", "season_pass")
    .single();

  try {
    await loginAsAdmin(page);

    // --- shop: the cart, as originally built
    await setMode(page, "Saisonkarten", "shop");
    await page.goto("/");
    const cartButton = cardControl(page, SEASON_PASS_CARD);
    await expect(cartButton).toHaveText("Auswählen");
    await expect(cartButton).toBeEnabled();

    // --- website: away to the club's own page, in a new tab
    await setMode(page, "Saisonkarten", "website");
    await page.goto("/");
    const link = cardControl(page, SEASON_PASS_CARD);
    await expect(link).toHaveText("Auf uhcuster.ch kaufen");
    await expect(link).toHaveAttribute("href", /^https:\/\/uhcuster\.ch\//);
    await expect(link).toHaveAttribute("target", "_blank");

    // --- disabled: the offer stays on display, the button stops working
    await setMode(page, "Saisonkarten", "disabled");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: SEASON_PASS_CARD, exact: true })).toBeVisible();
    // The price is still there: someone looking at the offer wants to know what
    // it is, even where they cannot buy it here.
    await expect(page.getByText("CHF 150.–").first()).toBeVisible();
    const dead = cardControl(page, SEASON_PASS_CARD);
    await expect(dead).toHaveText("Auswählen");
    await expect(dead).toBeDisabled();

    // A dead button with nothing beside it just looks broken, so the note from
    // the admin sits under it and says why.
    if (before?.note) {
      await expect(page.getByText(before.note).first()).toBeVisible();
    }

    // The test product is exempt in every mode: without it there would be no way
    // to walk the checkout while everything else is switched off. The note is
    // part of that exemption - a line about season-pass ordering being closed
    // has no business under a card that is still on sale.
    const testCard = page.locator("article, li, div").filter({ hasText: TEST_PRODUCT_CARD }).last();
    await expect(cardControl(page, TEST_PRODUCT_CARD)).toBeEnabled();
    if (before?.note) {
      await expect(testCard.getByText(before.note)).toHaveCount(0);
    }
  } finally {
    if (before) {
      await supabase
        .from("sales_channels")
        .update({ mode: before.mode, website_url: before.website_url, note: before.note })
        .eq("product_type", "season_pass");
    }
  }
});

test("the website mode cannot be saved without an https address", async ({ page }) => {
  const supabase = createServiceRoleClient();
  const { data: before } = await supabase
    .from("sales_channels")
    .select("mode, website_url, note")
    .eq("product_type", "membership")
    .single();

  try {
    await loginAsAdmin(page);
    await page.goto("/admin/sales");

    const row = page.locator("section").filter({ hasText: "Red Castle Club" }).first();
    await row.locator("label").filter({ hasText: "Auf der Website kaufen" }).click();

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
        .update({ mode: before.mode, website_url: before.website_url, note: before.note })
        .eq("product_type", "membership");
    }
  }
});
