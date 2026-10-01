import { expect, type Page } from "@playwright/test";

interface CompleteOnboardingOptions {
  title: string;
}

export async function completeOnboardingToEditor(page: Page, options: CompleteOnboardingOptions) {
  await page.goto("/new");

  await page.locator("#wizard-title").fill(options.title);
  await page.getByRole("spinbutton", { name: "目标章数" }).fill("8");
  await page.locator("#wizard-logline").fill("一个被废柴宗门收留的少年，意外觉醒了上古剑魂。");
  await page.getByRole("button", { name: "使用灵感并继续" }).click();
  await page.getByRole("button", { name: "开始生成" }).click();
  await expect(page.getByText("核对作品设定")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /开始写作/ }).click();
  await expect(page).toHaveURL(/\/editor\//, { timeout: 30_000 });
  // Editor shell is ready once the persistent "保存草稿" toolbar button mounts.
  // Previously asserted on a "Chapter Draft" eyebrow that the M3.5 UI降噪 pass
  // removed; using the save button keeps this resilient to chrome restyling.
  await expect(page.getByRole("button", { name: "保存草稿" })).toBeVisible({ timeout: 15_000 });
}

export async function openWritingAssistant(page: Page) {
  const toggle = page.getByRole("button", { name: "展开写作助手" });
  if (await toggle.isVisible()) await toggle.click();
}
