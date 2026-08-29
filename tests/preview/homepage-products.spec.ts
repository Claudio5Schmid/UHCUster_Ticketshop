import { test, expect } from "@playwright/test";

// "Season-Pass-Seite" has no dedicated URL in this app - season passes are a section
// (#saisonkarten) on the homepage itself, not a separate route (confirmed by reading
// src/app/(shop)/page.tsx). So this covers "Homepage" and "Season-Pass-Seite" as one
// check on "/", plus a second check on the real Red Castle Club route.
const PAGES = [
  { path: "/", label: "Homepage / Saisonkarten" },
  { path: "/red-castle-club", label: "Red Castle Club (Membership)" },
];

for (const { path, label } of PAGES) {
  test(`${label}: lädt mit HTTP 200 und ohne Console-Errors`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    expect(consoleErrors, `Console errors on ${path}`).toEqual([]);
    expect(pageErrors, `Uncaught page errors on ${path}`).toEqual([]);
  });
}
