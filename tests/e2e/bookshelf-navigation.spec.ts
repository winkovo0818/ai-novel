import { expect, test, type APIRequestContext } from "@playwright/test";

async function createNovelViaApi(request: APIRequestContext, title: string): Promise<string> {
  const sessionRes = await request.post("/api/onboarding/sessions", {
    data: { title, genre_main: "web", genre_sub: "玄幻" },
  });
  expect(sessionRes.ok()).toBe(true);
  const sessionJson = await sessionRes.json();
  const sessionId = sessionJson.data.session_id as string;
  const profile = sessionJson.data.default_profile as unknown;

  const bible = {
    meta: { suggested_title: title, alternative_titles: ["书架甲", "书架乙", "书架丙"] },
    characters: [
      {
        role: "protagonist",
        name: "沈言",
        age: 16,
        appearance: "瘦削少年，腕有旧疤",
        personality: "冷静隐忍",
        catchphrase: "我没有，你别乱说。",
        abilities: ["剑魂共振"],
        goals: "查清父母旧案",
        motivation: "他第一次拥有追问真相的能力。",
        secrets: ["体内封着上古剑魂"],
        relations: [],
      },
      {
        role: "mentor",
        name: "几",
        age: "上古残魂",
        appearance: "青烟般的老者剑影",
        personality: "毒舌护短",
        catchphrase: "老夫头疼。",
        abilities: ["剑道残识"],
        goals: "保住沈言",
        motivation: "借沈言体质逃过旧敌追索。",
        secrets: ["认识沈言父亲"],
        relations: ["沈言的导师"],
      },
      {
        role: "antagonist",
        name: "蒋阶",
        age: 42,
        appearance: "白袍温和，指节发黑",
        personality: "外宽内狠",
        catchphrase: "本门同心。",
        abilities: ["驭人心术"],
        goals: "夺取剑魂",
        motivation: "相信牺牲沈言能换来全门生机。",
        secrets: ["知道沈言父母死因"],
        relations: ["沈言名义上的门主"],
      },
    ],
    world: {
      setting_summary: "九州仙门衰落，剑魂是上古遗留的力量核心。废柴宗门靠收留弃徒苟延残喘，各大宗门暗中寻找能承载剑魂的少年。",
      factions: [
        { name: "柴饦门", alignment: "中立偏黑", role: "沈言所在宗门" },
        { name: "天代宗", alignment: "正道", role: "外部压力来源" },
      ],
      rules: ["剑魂认主不可逆", "弟子三年不出师即逐出"],
      geography: ["柴饦峰", "雨宗古道"],
    },
    outline: {
      volume_1: {
        name: "柴门起",
        theme: "被收留者反过来审判收留者",
        chapter_count_estimate: 8,
        chapters: Array.from({ length: 8 }, (_, index) => ({
          index: index + 1,
          title: `第${index + 1}章`,
          summary: "沈言在宗门压迫中积累线索，逐步确认自己必须反过来利用考核脱身。",
        })),
      },
    },
    first_chapter_beats: [
      { beat: 1, scene: "雨夜火房", purpose: "交代沈言在宗门底层的处境" },
      { beat: 2, scene: "执事责罚", purpose: "制造压迫并展示主角伪装" },
      { beat: 3, scene: "后山裂井", purpose: "引出剑魂低语" },
      { beat: 4, scene: "残魂试探", purpose: "建立师徒张力" },
      { beat: 5, scene: "门主召见", purpose: "抛出下一章考核危机" },
    ],
  };

  const finalizeRes = await request.post(`/api/onboarding/sessions/${sessionId}/finalize`, {
    data: { bible_draft: bible, profile, action: "start_writing" },
  });
  const finalizeJson = await finalizeRes.json();
  expect(finalizeRes.ok(), JSON.stringify(finalizeJson)).toBe(true);
  return finalizeJson.data.novel_id as string;
}

test("bookshelf project card opens the novel detail page", async ({ page, request }) => {
  const title = "书架点测";
  const novelId = await createNovelViaApi(request, title);

  await page.goto("/novels");
  await expect(page.getByRole("heading", { name: "我的创作书架" })).toBeVisible();

  const projectCard = page.getByRole("link", { name: new RegExp(title) });
  await expect(projectCard).toBeVisible();
  await projectCard.click();

  await expect(page).toHaveURL(new RegExp(`/novels/${novelId}$`));
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("link", { name: /继续写作|开启首章创作/ })).toBeVisible();
});
