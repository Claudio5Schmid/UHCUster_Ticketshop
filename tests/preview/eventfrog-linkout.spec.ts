import { test, expect } from "@playwright/test";

// The guaranteed-present fallback link on /spielplan (src/app/(shop)/spielplan/page.tsx:48,
// src/lib/eventfrog.ts:4-5) - a hardcoded constant, unlike GameRow's per-game link which only
// renders when a game row has eventfrog_url set in the DB. Checking the deterministic one
// keeps this test stable regardless of which games happen to have a link set right now.
const EXPECTED_HREF = "https://eventfrog.ch/de/events/ch/sport-fitness.html?searchTerm=UHC+Uster";

test("Eventfrog-Link-out: vorhanden, korrektes href, öffnet extern", async ({ page }) => {
  await page.goto("/spielplan");

  const link = page.getByRole("link", { name: "Eventfrog", exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", EXPECTED_HREF);
  await expect(link).toHaveAttribute("target", "_blank");
  const rel = await link.getAttribute("rel");
  expect(rel).toContain("noopener");
  expect(rel).toContain("noreferrer");
});
