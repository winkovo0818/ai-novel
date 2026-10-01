import { test as setup, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

setup("sign in through the credentials provider", async ({ page, request }) => {
  const email = `e2e-${randomUUID()}@example.test`;
  const password = randomUUID();
  const registration = await request.post("/api/auth/signup", { data: { email, password } });
  expect(registration.ok()).toBe(true);
  const scriptErrors: string[] = [];
  page.on("console", message => {
    if (message.type() === "error" && /script.*Content Security Policy|Content Security Policy.*script/i.test(message.text())) scriptErrors.push(message.text());
  });
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "进入创作空间" }).click();
  await page.waitForURL(url => !url.pathname.startsWith("/login"), { timeout: 20_000 });
  expect(scriptErrors).toEqual([]);
  await expect(page).not.toHaveURL(/\/login/);
  await mkdir("test-results/.auth", { recursive: true });
  await page.context().storageState({ path: "test-results/.auth/user.json" });
});
