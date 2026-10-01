import { expect, test } from "./fixtures";

import { completeOnboardingToEditor, openWritingAssistant } from "./helpers/onboarding";

test("AI draft errors stay inside the candidate panel and never touch the editor body", async ({ page }) => {
  await completeOnboardingToEditor(page, { title: "失败保护 E2E" });

  const editor = page.getByPlaceholder("开始书写故事…");
  await editor.fill("这段原文不能被失败的 AI 起草覆盖。");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByTitle("草稿已保存", { exact: true })).toBeVisible({ timeout: 8_000 });

  await page.route("**/api/novels/*/chapters/draft", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: 'event: error\ndata: {"code":"LLM_TIMEOUT","message":"timeout","retryable":true}\n\n',
    });
  });

  await openWritingAssistant(page);
  await page.getByRole("button", { name: /生成本章初稿|重新起草本章/ }).click();
  // The error surfaces in the editor status line, not the body.
  await expect(page.getByText("生成中断：timeout · 未生成可用正文，可重新生成")).toBeVisible();
  await expect(editor).toHaveValue("这段原文不能被失败的 AI 起草覆盖。");
});
