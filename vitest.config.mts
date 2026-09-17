import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Unit tests only (Phase 3 of the migration brief): the mail boundary, the CSV
 * parser, the placeholder rules. Everything that needs a browser or the real
 * database stays in Playwright (npm run test:local / test:preview).
 */
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
