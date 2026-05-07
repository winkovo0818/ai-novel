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
  await expect(page.getByText("审阅并保存 Bible")).toBeVisible({ timeout: 30_000 });

  await page.getByPlaceholder("推荐书名").fill("逆魂纪测试版");
  await page.getByRole("button", { name: "新增节拍" }).click();
  await page.getByRole("button", { name: "开始写作" }).click();

  await expect(page).toHaveURL(/\/editor\//, { timeout: 30_000 });
  await expect(page.getByText("Chapter Draft")).toBeVisible();
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
  await editor.fill("第二章未保存草稿。");
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("未保存修改");
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: /^1\./ }).click();
  await expect(editor).toHaveValue("第二章未保存草稿。");
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("未保存修改");
    await dialog.accept();
  });
  await page.getByRole("button", { name: /^1\./ }).click();
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
});
