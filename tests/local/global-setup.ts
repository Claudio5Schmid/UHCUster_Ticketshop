import { sweepTestData, resetLocalRateLimit } from "./fixtures/cleanup";

/**
 * Sweeps leftover tagged test data before a run starts, not just after. There's no isolated
 * test branch (decisions/playwright-retrofit-decisions.md §2) - a crashed previous run would
 * otherwise leave orphaned rows in production that silently accumulate. Also clears the
 * local checkout rate-limit bucket (see resetLocalRateLimit) so repeated runs don't start
 * failing for real once the 5-attempts/10-minutes limit is hit.
 */
export default async function globalSetup() {
  const swept = await sweepTestData();
  if (swept.orders > 0 || swept.customers > 0) {
    console.log(`[global-setup] Swept leftover test data from a previous run: ${JSON.stringify(swept)}`);
  }
  await resetLocalRateLimit();
}
