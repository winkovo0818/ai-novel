import { test as base, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

// A separate real user per test keeps quotas and projects independent.
export const test = base.extend({
  storageState: async ({ browser }, provideState, testInfo) => {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    try {
      const email = `e2e-${randomUUID()}@example.test`, password = randomUUID();
      const registered = await context.request.post("/api/auth/signup", { data: { email, password } });
      expect(registered.ok()).toBe(true);
      const csrf = await (await context.request.get("/api/auth/csrf")).json();
      const login = await context.request.post("/api/auth/callback/credentials", {
        form: { email, password, csrfToken: csrf.csrfToken, callbackUrl: testInfo.project.use.baseURL! },
        headers: { "X-Auth-Return-Redirect": "1" },
      });
      expect(login.ok()).toBe(true);
      const session = await (await context.request.get("/api/auth/session")).json();
      expect(session.user?.email).toBe(email);
      await provideState(await context.storageState());
    } finally { await context.close(); }
  },
});
export { expect } from "@playwright/test";

export type { Page, APIRequestContext } from "@playwright/test";
