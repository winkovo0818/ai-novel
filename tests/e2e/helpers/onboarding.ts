import { expect, type Page } from "@playwright/test";

interface CompleteOnboardingOptions {
  title: string;
}

export async function completeOnboardingToEditor(page: Page, options: CompleteOnboardingOptions) {
  await page.goto("/new");

  await page.getByPlaceholder("书名（可选）").fill(options.title);
  await page.getByPlaceholder("子类型，例如：玄幻、都市、悬疑").fill("玄幻");
  await page.getByRole("button", { name: "下一步" }).click();

  await page
    .getByPlaceholder("例如：一个被废柴宗门收留的少年，意外觉醒了上古剑魂。")
    .fill("一个被废柴宗门收留的少年，意外觉醒了上古剑魂。");
  await page.getByRole("button", { name: "下一步" }).click();

  await page.getByRole("button", { name: "生成反向追问" }).click();
  await expect(page.getByText("主角的性格底色是？")).toBeVisible();
  await page.getByRole("button", { name: "生成 Bible" }).click();
  await page.getByRole("button", { name: "开始生成" }).click();
  await expect(page.getByText("审阅并保存 Bible")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "开始写作" }).click();
  await expect(page.getByText("Chapter Draft")).toBeVisible({ timeout: 30_000 });
}
