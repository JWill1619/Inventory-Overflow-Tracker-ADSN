import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testIgnore: ["**/catalog.spec.ts", "**/shelves.spec.ts"],
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: "http://127.0.0.1:3004", trace: "retain-on-failure" },
  webServer: {
    command: "npx tsx scripts/e2e-server.ts",
    env: { E2E_PORT: "3004", E2E_DB_PORT: "55443", E2E_ISOLATED: "true" },
    url: "http://127.0.0.1:3004",
    timeout: 120000,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "tablet",
      use: { ...devices["iPad Mini"], defaultBrowserType: "chromium" },
    },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
