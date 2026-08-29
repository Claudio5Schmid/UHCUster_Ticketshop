import { defineConfig, devices } from "@playwright/test";

// Only test-admin credentials, never the service role or AWS keys - these tests are
// read-only against a live Vercel Preview deployment and must never write anything.
process.loadEnvFile(".env.test.local");

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL;
if (!BASE_URL) {
  throw new Error(
    "PLAYWRIGHT_BASE_URL is required for the preview suite, e.g.\n" +
      "PLAYWRIGHT_BASE_URL=https://<preview-deployment>.vercel.app npm run test:preview",
  );
}

export default defineConfig({
  testDir: "./tests/preview",
  fullyParallel: true,
  retries: 1,
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // No webServer: BASE_URL points at an already-deployed Vercel Preview.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
