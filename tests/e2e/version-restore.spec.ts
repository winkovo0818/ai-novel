import { expect, test } from "@playwright/test";

import { completeOnboardingToEditor } from "./helpers/onboarding";

test("M3.2.6: restores an older chapter version and persists after reload", async ({ page }) => {
  await completeOnboardingToEditor(page, { title: "版本恢复 E2E" });

  const editor = page.locator("textarea").first();
  const firstVersion = "第一版正文：沈言在雨夜听见剑魂低语。";
  const secondVersion = "第二版正文：沈言决定离开火房，追踪旧剑的回声。";

  await editor.fill(firstVersion);
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("草稿已保存")).toBeVisible({ timeout: 8_000 });

  await editor.fill(secondVersion);
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("草稿已保存")).toBeVisible({ timeout: 8_000 });
  await expect(editor).toHaveValue(secondVersion);

  await page.locator('button[title="查看历史版本"]').click();
  await expect(page.getByRole("heading", { name: "历史版本" })).toBeVisible();

  const firstVersionRow = page.locator("article").filter({ hasText: firstVersion }).first();
  await expect(firstVersionRow).toBeVisible();
  await firstVersionRow.getByRole("button", { name: "恢复此版本" }).click();

  await expect(page.getByRole("dialog", { name: "恢复到此版本？" })).toBeVisible();
  await page.getByRole("button", { name: "恢复", exact: true }).click();

  await expect(page.getByText("已恢复历史版本")).toBeVisible({ timeout: 8_000 });
  await expect(editor).toHaveValue(firstVersion);

  await page.reload();
  await expect(page.getByRole("button", { name: "保存草稿" })).toBeVisible({ timeout: 15_000 });
  await expect(editor).toHaveValue(firstVersion);
});
