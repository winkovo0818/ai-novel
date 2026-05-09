import { defineConfig, devices } from "@playwright/test";

const useBuilt = process.env.E2E_USE_BUILT === "1" || process.env.CI === "true";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    // CI runs `next start` against the prebuilt app for predictable startup;
    // local dev keeps `next dev` so hot reload works while iterating on specs.
    command: useBuilt ? "npm run start" : "npm run dev",
    url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      LLM_MOCK: "1",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
