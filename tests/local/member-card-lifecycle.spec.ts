import { test, expect, type Page } from "@playwright/test";
import { testEmail } from "./fixtures/cleanup";

/**
 * The whole life of a member's cards: created, numbered, deactivated, replaced,
 * and topped up afterwards.
 *
 * The last step is the one that matters most. Adding a fourth card to an order
 * that already has three has to produce "übertragbar-3", which is only possible
 * if issue_tickets_for_order's once-only guard was routed around rather than
 * relaxed - that guard is what keeps a double-click on "Als bezahlt markieren"
 * from giving a paying customer two complete sets of passes.
 *
 * Uses a @playwright-test.invalid address, so global-teardown sweeps the member,
 * their order and every ticket, and the bounce guard in src/lib/email/ses.ts
 * keeps any send away from SES.
 */

async function loginAsAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("**/admin");
}

/** The row for one card, found by the label in its first column. */
function cardRow(page: Page, label: string) {
  return page.getByRole("row").filter({ hasText: label });
}

test("a member's cards can be created, deactivated, replaced and topped up", async ({ page }) => {
  const email = testEmail("member-cards");
  const nachname = `Kartenleben ${Date.now().toString(36)}`;

  await loginAsAdmin(page);
  await page.goto("/admin/members");

  await page.getByRole("button", { name: "Mitglied hinzufügen" }).click();
  await page.getByLabel("Vorname").fill("Playwright");
  await page.getByLabel("Name", { exact: true }).fill(nachname);
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Anzahl persönliche Karten").fill("1");
  await page.getByLabel("Anzahl übertragbare Karten").fill("2");
  await page.getByRole("button", { name: "Erfassen und Karte(n) generieren" }).click();

  // Straight into the member from their name, the way an order opens from its number.
  const memberLink = page.getByRole("link", { name: `Playwright ${nachname}` });
  await expect(memberLink).toBeVisible();
  await memberLink.click();
  await page.waitForURL("**/admin/members/**");

  await expect(cardRow(page, "(nicht übertragbar)")).toBeVisible();
  await expect(cardRow(page, "(übertragbar-1)")).toBeVisible();
  await expect(cardRow(page, "(übertragbar-2)")).toBeVisible();
  await expect(page.getByText("0 von 3")).toBeVisible();

  // Deactivating is final - the control disappears with it.
  await cardRow(page, "(übertragbar-2)").getByRole("button", { name: "Deaktivieren" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Deaktivieren" }).click();
  await expect(cardRow(page, "(übertragbar-2)").getByText("Inaktiv", { exact: true })).toBeVisible();
  await expect(cardRow(page, "(übertragbar-2)").getByRole("button", { name: "Deaktivieren" })).toHaveCount(0);

  // The replacement inherits the number, so two rows now carry it: the retired
  // one and the live one.
  await cardRow(page, "(übertragbar-2)").getByRole("button", { name: "Code neu generieren" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Neu generieren" }).click();
  await expect(cardRow(page, "(übertragbar-2)")).toHaveCount(2);
  await expect(cardRow(page, "(übertragbar-2)").getByText("Ersetzt", { exact: true })).toBeVisible();
  await expect(cardRow(page, "(übertragbar-2)").getByText("Aktiv", { exact: true })).toBeVisible();

  // A voided number is never handed on: the next card is -3, not a reused -2.
  await page.getByRole("button", { name: "Karten erstellen" }).click();
  await page.getByRole("dialog").getByLabel("Anzahl übertragbare Karten").fill("1");
  await page.getByRole("dialog").getByRole("button", { name: /Karte\(n\) erstellen/ }).click();
  await expect(cardRow(page, "(übertragbar-3)")).toBeVisible();
  await expect(cardRow(page, "(übertragbar-3)").getByText("Aktiv", { exact: true })).toBeVisible();
});

test("an undeliverable address leaves the cards open instead of marking them sent", async ({ page }) => {
  const email = testEmail("member-send");
  const nachname = `Unzustellbar ${Date.now().toString(36)}`;

  await loginAsAdmin(page);
  await page.goto("/admin/members");

  await page.getByRole("button", { name: "Mitglied hinzufügen" }).click();
  await page.getByLabel("Vorname").fill("Playwright");
  await page.getByLabel("Name", { exact: true }).fill(nachname);
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Anzahl persönliche Karten").fill("1");
  await page.getByLabel("Anzahl übertragbare Karten").fill("0");
  await page.getByRole("button", { name: "Erfassen und Karte(n) generieren" }).click();

  const row = page.getByRole("row").filter({ hasText: nachname });
  await expect(row).toBeVisible();
  await row.getByRole("checkbox").check();

  // Counted in cards, not members.
  await page.getByRole("button", { name: "1 Karte(n) versenden" }).click();
  await page.getByRole("dialog").getByLabel('Zum Bestätigen "Versenden" eingeben').fill("Versenden");
  await page.getByRole("dialog").getByRole("button", { name: /jetzt versenden/ }).click();

  // The bounce guard refuses a reserved-TLD address, and the card must stay
  // open rather than be recorded as delivered.
  await expect(page.getByText(/fehlgeschlagen/)).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: nachname })).toContainText("0 von 1 versendet");
});
