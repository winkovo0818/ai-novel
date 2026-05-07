import { expect, test } from "@playwright/test";

test("completes onboarding with mock LLM", async ({ page }) => {
  await page.goto("/new");

  await page.getByPlaceholder("书名（可选）").fill("逆魂纪 E2E");
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
  await expect(page.getByText("逆魂纪").first()).toBeVisible();
  await expect(page.getByText("审阅并保存 Bible")).toBeVisible({ timeout: 30_000 });

  await page.getByPlaceholder("推荐书名").fill("逆魂纪测试版");
  await page.getByRole("button", { name: "新增节拍" }).click();
  await page.getByRole("button", { name: "开始写作" }).click();

  await expect(page).toHaveURL(/\/editor\//, { timeout: 30_000 });
  await expect(page.getByText("Editor Placeholder")).toBeVisible();
});
