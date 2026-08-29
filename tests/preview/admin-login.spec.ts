import { test, expect } from "@playwright/test";

test("Admin-Login gegen echte Preview-Auth landet im Bestellungen-Bereich", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();

  // Confirms Supabase Auth + env vars are configured correctly on this deployment - the
  // most common failure mode being missing/wrong env vars on Vercel (per the task brief).
  await page.waitForURL("**/admin");
  await expect(page.getByRole("heading", { name: "Bestellungen" })).toBeVisible();
});
