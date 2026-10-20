import { defineConfig, devices } from "@playwright/test";

// Runs against a throwaway database: E2E_DATABASE_URL (it's changed by the tests). See tests/e2e/README.md.
const url = process.env.E2E_DATABASE_URL ?? "postgresql://cashew@localhost:5433/cashew_e2e";
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] }, testIgnore: /desktop\.spec\.ts/ },
    { name: "desktop", use: { viewport: { width: 1280, height: 860 } }, testMatch: /desktop\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next start -p ${port}`,
    url: `http://localhost:${port}/login`,
    reuseExistingServer: false,
    env: { DATABASE_URL: url, NODE_ENV: "production" },
    timeout: 60_000,
  },
});
