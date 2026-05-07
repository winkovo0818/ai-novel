import { expect, test } from "@playwright/test";

import { completeOnboardingToEditor } from "./helpers/onboarding";

test("keeps existing chapter text when AI drafting fails", async ({ page }) => {
  await completeOnboardingToEditor(page, { title: "失败保护 E2E" });

  const editor = page.locator("textarea");
  await editor.fill("这段原文不能被失败的 AI 起草覆盖。");
  await expect(page.getByText("已自动保存")).toBeVisible({ timeout: 8_000 });

  await page.route("**/api/novels/*/chapters/draft", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: 'event: error\ndata: {"code":"LLM_TIMEOUT","message":"timeout","retryable":true}\n\n',
    });
  });

  await page.getByRole("button", { name: "AI 起草第 1 章" }).click();
  await expect(page.getByText("timeout")).toBeVisible();
  await expect(editor).toHaveValue("这段原文不能被失败的 AI 起草覆盖。");
});
