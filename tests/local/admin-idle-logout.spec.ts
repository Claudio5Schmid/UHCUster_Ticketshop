import { test, expect } from "@playwright/test";
import { ADMIN_INACTIVITY_TIMEOUT_MS, ADMIN_INACTIVITY_WARNING_MS } from "../../src/lib/admin/session";

const STORAGE_KEY = "uhc-admin-last-activity";

/**
 * Drives the idle clock by rewriting the shared "last activity" timestamp rather
 * than waiting an hour. page.evaluate fires no pointer or key events, so it does
 * not itself count as activity and reset what it just set.
 */
async function setIdleFor(page: import("@playwright/test").Page, idleMs: number) {
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [STORAGE_KEY, String(Date.now() - idleMs)] as const
  );
}

/**
 * Read-only: this one logs in and watches a timer, it writes no rows. Kept in the
 * local suite anyway because it needs a real Supabase Auth session - the sign-out
 * being genuine, rather than a redirect, is the whole point of the feature.
 */
test("an idle admin is warned and then signed out", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("**/admin");

  const warning = page.getByRole("dialog").filter({ hasText: "Noch da?" });
  await expect(warning).toBeHidden();

  // Four minutes short of the timeout: inside the warning window, not past it.
  await setIdleFor(page, ADMIN_INACTIVITY_TIMEOUT_MS - ADMIN_INACTIVITY_WARNING_MS + 60_000);
  await expect(warning).toBeVisible({ timeout: 30_000 });

  // "Angemeldet bleiben" has to actually clear it, or the warning is just noise.
  await page.getByRole("button", { name: "Angemeldet bleiben" }).click();
  await expect(warning).toBeHidden();

  await setIdleFor(page, ADMIN_INACTIVITY_TIMEOUT_MS + 60_000);
  await page.waitForURL("**/admin/login", { timeout: 30_000 });

  // The session must be gone, not merely navigated away from: going back to a
  // protected page has to bounce rather than render it.
  await page.goto("/admin/members");
  await expect(page).toHaveURL(/\/admin\/login$/);
});
