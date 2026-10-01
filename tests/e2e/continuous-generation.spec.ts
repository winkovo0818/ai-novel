import { test, expect } from "./fixtures";
import { completeOnboardingToEditor } from "./helpers/onboarding";

test("configures continuous serialization, pauses planning, adjusts budget, and resumes", async ({ page }) => {
  await completeOnboardingToEditor(page, { title: "长期连载 E2E" });
  const novelId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.goto(`/novels/${novelId}`);
  await page.getByRole("button", { name: "启动全自动生成" }).click();
  await page.getByRole("checkbox", { name: "持续连载同一本小说（不预设完结章数）" }).check();
  await page.getByRole("spinbutton", { name: "每批规划章数" }).fill("10");
  await page.getByRole("button", { name: "每卷暂停", exact: true }).click();
  const started = page.waitForResponse(r => r.url().endsWith(`/api/novels/${novelId}/auto-generate`) && r.request().method() === "POST");
  await page.getByRole("button", { name: "确认启动", exact: true }).click();
  expect((await started).ok()).toBe(true);
  await expect(page.getByText("大纲规划中", { exact: true })).toBeVisible();
  const status = async () => (await (await page.request.get(`/api/novels/${novelId}/auto-generate`)).json()).data;
  expect(await status()).toMatchObject({ continuous: true, planning_window: 10, checkpoint_mode: "per_volume", total_chapters: 10, status: "planning" });
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(page.getByText("已暂停", { exact: true })).toBeVisible();
  await page.getByRole("spinbutton", { name: "新的累计预算", exact: true }).fill("10");
  await page.getByRole("button", { name: "更新预算", exact: true }).click();
  await expect(page.getByText("上限 ¥10.00", { exact: true })).toBeVisible();
  expect((await status()).status).toBe("paused");
  await page.getByRole("button", { name: "恢复生成", exact: true }).click();
  await expect(page.getByText("大纲规划中", { exact: true })).toBeVisible();
  await page.route(`**/api/novels/${novelId}/story-memory`, route => route.fulfill({ json: { ok: true, data: {
    state: { plot_threads: [{ title: "父亲旧案", status: "open" }] }, stale_records: 1,
    volume_arc: { start_chapter: 1, end_chapter: 80, plan: { name: "旧案追索", goal: "查清证人的去向", central_conflict: "调查与宗门利益的冲突", resolution: "保护证人并取得证据", thread_targets: [{ kind: "plot_threads", title: "父亲旧案", action: "resolve", deadline_chapter: 70 }] } },
  } } }));
  await page.reload();
  const progress = page.getByRole("region", { name: "连载剧情进度" });
  await expect(progress.getByText("旧案追索 · 第 1–80 章", { exact: true })).toBeVisible();
  await expect(progress.getByText("父亲旧案：第 70 章前回收", { exact: true })).toBeVisible();
  await expect(progress.getByText("历史正文已修改，相关剧情状态需要重新校准。", { exact: true })).toBeVisible();
  await page.unroute(`**/api/novels/${novelId}/story-memory`);
  await expect(page.getByText("持续连载 · 已完成 0 章", { exact: true })).toBeVisible();
  expect(await status()).toMatchObject({ continuous: true, cost_cap_cny: 10, status: "planning" });
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByText("已取消", { exact: true })).toBeVisible();
});
