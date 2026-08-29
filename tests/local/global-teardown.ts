import { sweepTestData, resetLocalRateLimit } from "./fixtures/cleanup";

export default async function globalTeardown() {
  const swept = await sweepTestData();
  console.log(`[global-teardown] Cleaned up test data: ${JSON.stringify(swept)}`);
  await resetLocalRateLimit();
}
