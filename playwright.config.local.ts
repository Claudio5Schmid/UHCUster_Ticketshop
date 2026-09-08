import { defineConfig, devices } from "@playwright/test";

// Node 20.6+/24: loads real Supabase/AWS creds and the generated test-admin credentials.
// See decisions/playwright-retrofit-decisions.md - these tests run against the production
// Supabase project (no isolated branch), tagged and swept clean by global-setup/teardown.
process.loadEnvFile(".env.local");
process.loadEnvFile(".env.test.local");

// Overridable because port 3000 is a popular default - another project's dev
// server sitting there gets silently reused by `reuseExistingServer`, and the
// suite then tests that app instead of this one.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/local",
  globalSetup: "./tests/local/global-setup.ts",
  globalTeardown: "./tests/local/global-teardown.ts",
  // Serial on purpose: these tests write real rows into the shared production project via
  // the app's own checkout/admin flows. Running them concurrently risks interleaved writes
  // (e.g. two tests racing the order-number sequence or admin session state).
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
