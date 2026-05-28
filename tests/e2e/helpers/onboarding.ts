import { expect, type Page } from "@playwright/test";

interface CompleteOnboardingOptions {
  title: string;
}

export async function completeOnboardingToEditor(page: Page, options: CompleteOnboardingOptions) {
  await page.goto("/new");

  await page.locator("#wizard-title").fill(options.title);
  await page.locator("#wizard-genre-sub").fill("玄幻");
  await page.getByRole("button", { name: /下一步/ }).click();

  await page.locator("#wizard-logline").fill("一个被废柴宗门收留的少年，意外觉醒了上古剑魂。");
  await page.getByRole("button", { name: /继续/ }).click();

  await page.getByRole("button", { name: /生成追问/ }).click();
  await expect(page.getByText("主角的性格底色是？")).toBeVisible();
  await page.getByRole("button", { name: /开始生成作品设定/ }).click();
  await page.getByRole("button", { name: "开始生成" }).click();
  await expect(page.getByText("核对作品设定")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /开始写作/ }).click();
  await expect(page).toHaveURL(/\/editor\//, { timeout: 30_000 });
  // Editor shell is ready once the persistent "保存草稿" toolbar button mounts.
  // Previously asserted on a "Chapter Draft" eyebrow that the M3.5 UI降噪 pass
  // removed; using the save button keeps this resilient to chrome restyling.
  await expect(page.getByRole("button", { name: "保存草稿" })).toBeVisible({ timeout: 15_000 });
}
