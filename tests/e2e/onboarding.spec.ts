import { expect, test } from "@playwright/test";

import { completeOnboardingToEditor } from "./helpers/onboarding";

test("completes onboarding with mock LLM", async ({ page }) => {
  await completeOnboardingToEditor(page, { title: "逆魂纪 E2E" });

  await expect(page).toHaveURL(/\/editor\//, { timeout: 30_000 });
  await expect(page.getByText("Chapter Draft")).toBeVisible();
  await expect(page.getByText("章节", { exact: true })).toBeVisible();
  await expect(page.getByText("已存", { exact: true })).toBeVisible();
  await expect(page.getByText("完成", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "AI 起草第 1 章" }).click();
  await expect(page.getByText("AI 草稿已生成并保存")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  const editor = page.locator("textarea");
  await expect(editor).toHaveValue(/沈言/, { timeout: 30_000 });
  await editor
    .fill("烟雨夜，火房里只剩一盏将熄的灯。\n沈言听见剑魂第一次低语。");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("草稿已保存")).toBeVisible();

  await page.getByRole("button", { name: /^2\./ }).click();
  await expect(editor).toHaveValue("");
  await page.getByRole("button", { name: "AI 起草第 2 章" }).click();
  await expect(page.getByText("AI 草稿已生成并保存")).toBeVisible({ timeout: 30_000 });
  await expect(editor).toHaveValue(/沈言/, { timeout: 30_000 });
  await editor.fill("第二章未保存草稿。");
  await page.getByRole("button", { name: /^1\./ }).click();
  // First switch attempt: cancel via the new ConfirmDialog, content should stay.
  await expect(page.getByRole("dialog", { name: /切换章节/ })).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(editor).toHaveValue("第二章未保存草稿。");
  // Second switch attempt: accept and verify chapter 1 loads.
  await page.getByRole("button", { name: /^1\./ }).click();
  await expect(page.getByRole("dialog", { name: /切换章节/ })).toBeVisible();
  await page.getByRole("button", { name: "切换并丢弃" }).click();
  await expect(editor).toHaveValue(/沈言听见剑魂/);
  await page.getByRole("button", { name: /^2\./ }).click();
  await editor.fill("第二章测试草稿。");
  await page.getByRole("button", { name: "标记完成" }).click();
  await expect(page.getByText("有未保存修改")).toBeVisible();
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("草稿已保存")).toBeVisible();
  await expect(page.getByText("已完成")).toBeVisible();
  await page.getByRole("button", { name: /^1\./ }).click();
  await expect(editor).toHaveValue(/沈言听见剑魂/);
  await page.getByRole("button", { name: /^2\./ }).click();
  await expect(editor).toHaveValue("第二章测试草稿。");
  await expect(page.getByRole("button", { name: "恢复草稿" })).toBeVisible();

  await editor.fill("第二章自动保存草稿。");
  await expect(page.getByText("已自动保存")).toBeVisible({ timeout: 8_000 });

  await editor.fill("第二章快捷键保存草稿。");
  await page.keyboard.press("Control+S");
  await expect(page.getByText("草稿已保存")).toBeVisible();
});
