import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["catalog.spec.ts", "shelves.spec.ts"],
  workers: 1,
  timeout: 45000,
  use: { baseURL: "http://127.0.0.1:3002", trace: "retain-on-failure" },
  webServer: {
    command: "npx tsx scripts/e2e-server.ts",
    env: { E2E_PORT: "3002", E2E_DB_PORT: "55441", E2E_CATALOG: "true" },
    url: "http://127.0.0.1:3002",
    timeout: 120000,
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
