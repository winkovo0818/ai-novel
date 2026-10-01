import { defineConfig, devices } from "@playwright/test";

const useBuilt = process.env.E2E_USE_BUILT === "1" || process.env.CI === "true";
const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl) throw new Error("E2E_DATABASE_URL must point to a dedicated test database");
// Test fixtures also import Prisma; use the same isolated database as the server.
process.env.DATABASE_URL = databaseUrl;
process.env.DIRECT_URL = process.env.E2E_DIRECT_URL ?? databaseUrl;
const authFile = "test-results/.auth/user.json";
const browserChannel = process.env.E2E_BROWSER_CHANNEL;

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
      EDGEFN_API_KEY: "",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-local-auth-secret-replace-in-production",
      AUTH_TRUST_HOST: "true",
      DATABASE_URL: databaseUrl,
      DIRECT_URL: process.env.E2E_DIRECT_URL ?? databaseUrl,
    },
  },
  projects: [
    { name: "setup", testMatch: /auth.setup.ts/, use: browserChannel ? { channel: browserChannel } : {} },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
        ...(browserChannel ? { channel: browserChannel } : {}),
      },
    },
  ],
});
