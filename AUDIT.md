# AI Novel — 项目审计报告

> 创建时间：2026-05-08
> 范围：当前 main 分支（最新提交 `8a90cdf`）
> 结论：TASKS.md 标记 21/21 完成，但**多项任务"实现了但没接通"**，且存在若干安全与构建 bug

---

## 概览

按"安全 / 完整性死链 / 构建配置 / 产品缺口 / UX / 测试 / 文档"七档整理。每条都给出文件定位与修复方向，便于直接转化为后续任务。

---

## 一、安全相关（建议优先处理）

| # | 问题 | 证据 | 修复方向 |
|---|------|------|---------|
| S1 | **RLS 策略全表已写，但 `setRlsUser` 全工程从未被调用** | `prisma/migrations/20260508010000_enable_rls/migration.sql` 启用 RLS；`lib/db.ts:22` 定义了 `setRlsUser`；全仓 grep `setRlsUser` 仅匹配 `lib/db.ts` 与 `TASKS.md` | 选其一：①把 `setRlsUser(userId)` 包进每条业务 query 的事务（`SET LOCAL` 只在事务内生效，目前即使调用也不跨 query 生效）；②直接放弃 RLS，承认应用层 ownership 是唯一防线，删除迁移 |
| S2 | **`/editor/[novelId]` 服务端没做 ownership 校验** | `app/(app)/editor/[novelId]/page.tsx` 直接 `prisma.novel.findUnique`，未调用 `canAccessOwnerResource` / `getRequiredUserId` | 在 SSR 里加 ownership 检查；否则任意登录用户拿到 novelId 都能 SSR 拿到他人小说全文（API 已挡，但 SSR 漏洞） |
| S3 | **Onboarding 全部子路由不验证 caller 与 session.user_id 一致** | `app/api/onboarding/sessions/[id]/{loglines,questions,bible,finalize}/route.ts` 都没用 `getRequiredUserId`，只 findUnique session 就调 LLM | 拿到 session 后比对 `session.user_id === currentUserId`（或 cookie sessionId），否则可被他人盗用 session_id 消耗 LLM 配额 |
| S4 | **LLM 模型配置 API 没有管理员权限，api_key 数据库明文且全用户共享** | `app/api/llm-models/route.ts`、`prisma/schema.prisma` 中 `LlmModel` 没有 `user_id`、`api_key` 是 `String` 明文 | 加管理员判断 / 加用户隔离 / 加密存储（KMS / pgcrypto） |
| S5 | **rate limit 只对一条路由生效，且是单进程内存版** | `lib/auth/rateLimit.ts` 仅在 `app/api/novels/[id]/chapters/draft/route.ts` 引用 | 至少要给 `bible`、`loglines`、`questions`、`consistency`、`summarize` 加上限流；多副本部署需要换 Redis 或 Supabase RPC |
| S6 | **用户输入端缺审核**：章节正文 PATCH、起草请求都没过 `moderateContent` | `app/api/chapters/[id]/route.ts`、`app/api/novels/[id]/chapters/draft/route.ts` 没引用 moderation | 至少在保存"完成态"或导出时审核一次 |
| S7 | **`setRlsUser` 用 `$executeRawUnsafe` + 字符串拼接**，单引号转义虽做了，但应改为参数化 | `lib/db.ts:22` | 改 `$executeRaw\`SET LOCAL ...\`` 用参数化；顺便修 S1 |

---

## 二、"实现了但没接通"——孤立 API（高 ROI 的完善点）

这一组是最值得优先处理的——**TASKS.md 标记完成，但前端根本没接入**：

| # | 现状 | 文件 |
|---|------|------|
| F1 | **章节摘要 / RAG 是孤岛**：`/api/chapters/[id]/summarize` 写好；`draft/route.ts:71-74` 会用 `chapter.summary` 做长篇上下文；但**前端 `useChapterEditor.ts` 从未调用 summarize**，故所有起草都退回到截断 900 字原文，"长篇记忆"形同虚设 | `app/api/chapters/[id]/summarize/route.ts` ↔ 无调用方 |
| F2 | **一致性校验无 UI 入口**：API `/api/novels/[id]/consistency` 已写，但 EditorClient/Sidebar 没有按钮，README 给的是 `curl` 示范 | `app/api/novels/[id]/consistency/route.ts` ↔ 无前端 |
| F3 | **章节版本历史无 UI 入口**：API 已写，但编辑器没有"查看历史 / 回滚"按钮 | `app/api/chapters/[id]/versions/route.ts` ↔ 无前端 |
| F4 | **AI 助手三个按钮是装饰**：`EditorClient.tsx` 的"润色改写""扩充细节""逻辑检查" `AIActionBtn` 没有 `onClick`（只有"全文续写"和底部"一键补全剧情"绑了 `draftChapter`） | `app/(app)/editor/[novelId]/EditorClient.tsx` |
| F5 | **`LlmModel` 表 / `/models` 页 / API 全建好，但 `lib/llm/client.ts` 仍硬读 `process.env.DEEPSEEK_API_KEY`**，用户在 UI 上配的模型不生效 | `lib/llm/client.ts` 应改成"先查 `LlmModel` 默认行，回退到 env" |

> 建议：保存章节后自动 `summarize` → 给 RAG 一个真实的工作面。一致性 / 版本历史接入到编辑器右上 toolbar。

---

## 三、构建与配置 bug

| # | 问题 | 文件 |
|---|------|------|
| B1 | **Dockerfile 与 next.config 配置不一致**：`next.config.ts:8` 仅当 `DOCKER_BUILD=1` 时启用 `output: "standalone"`；但 `Dockerfile` 没设这个 env，却 `COPY --from=builder /app/.next/standalone ./`。直接 `docker build .` 会失败 | `Dockerfile`、`next.config.ts` |
| B2 | **CSS 动画类未定义**：全仓 47 处用 `animate-fade` / `animate-slide`，但 `app/globals.css` 仅定义了 `animate-fade-in-up`。视觉退化静默发生 | `app/globals.css` |
| B3 | `.gitignore` 第 25-26 行有两个连续的 `.env` 行 | `.gitignore` |
| B4 | i18n 装了 `next-intl`，但 `i18n/request.ts` 把 locale 锁死成 `"zh"`、JSX 全部硬编码中文，`messages/en.json` 没生效。要么真接，要么删 | `i18n/request.ts` |
| B5 | health check 只有 `/api/healthz/llm`，缺 `/api/healthz`（DB + 进程整体），K8s liveness probe 不能用 | `app/api/healthz/` |

---

## 四、产品层缺口（写作工具不可绕过的能力）

| # | 缺口 | 备注 |
|---|------|------|
| P1 | **schema 限制无法"写长篇"**：`ChapterSchema.index` 限 1-20、outline 只有 `volume_1`、`chapters.min(8).max(12)`。与 README "百万字长篇"宣传矛盾 | `lib/validation/schemas.ts` |
| P2 | **没有导出**（docx / md / pdf）。design.md 有这一节，但代码里没影 | — |
| P3 | **Bible 写完后没法在编辑过程改**：Step5 finalize 后，BibleDraft 在编辑器里只读。用户写到第 5 章想加角色 / 调大纲，得直接改库 | `app/(app)/editor/[novelId]/EditorSidebar.tsx` |
| P4 | **profile 字段没影响 prompt**：`ai_freedom`、`audience` 等用户在 Step1 选了，但 `lib/llm/prompts/chapter.ts` 没把 `ai_freedom` 映射成 temperature；`chapter_word_count` 只是文字目标，无强制 | `lib/llm/prompts/chapter.ts` |
| P5 | **没有用量统计 / 配额**：`[LLM]` 日志算了 `cost_cny` 但没汇总到 user 维度，无法做 quota / 计费 | — |
| P6 | **`ChapterVersion` 无节流**：`app/api/chapters/[id]/route.ts:43-50` 每次 PATCH 都 `create` 一份。配合 3 秒 autosave，每章 / 天可能产生几百行版本——需要按内容 hash / 时间窗去重，并设上限 | `app/api/chapters/[id]/route.ts` |

---

## 五、UX 细节

| # | 问题 | 文件 |
|---|------|------|
| UX1 | **`window.confirm`** 用于切章 / 起草 / 删除三处对话，应换成自定义 modal / toast | `app/(app)/editor/[novelId]/useChapterEditor.ts:101,138,207` |
| UX2 | **autosave race**：useEffect debounce 在 saving 期间被跳过，但 saving 完成后下一次 keystroke 又会立刻触发新一轮——连续输入会产生密集快照（叠加 P6 的版本爆炸问题） | `useChapterEditor.ts:84-100` |
| UX3 | **SSE 中断不可续传**：bible / chapter draft 流断了得整段重来，token 浪费 | `app/api/onboarding/sessions/[id]/bible/route.ts`、`app/api/novels/[id]/chapters/draft/route.ts` |
| UX4 | **错误恢复**：API 错误普遍只 `setError`，无"重试"按钮；网络抖动等于把整个 onboarding 流程废掉 | 各页面 |
| UX5 | **加载态**：`/novels` 只有"正在同步…"文字；编辑器无骨架屏 | `app/(app)/novels/page.tsx`、`app/(app)/editor/` |
| UX6 | **设计语言混乱**：`design.md` 写的是 Notion / iA Writer / Sudowrite 风格，实际界面充斥 "STEP 01"、"协议"、"叙事圣经"、"启动逻辑审计"等"工业 / 赛博"措辞，与"作家长时间写作的工具"定位拧着 | 全站文案 |
| UX7 | **编辑器缺基础写作功能**：撤销 / 重做（textarea 自带但章节切换会丢）、查找 / 替换、字数目标 | `useChapterEditor.ts` |

---

## 六、测试缺口

- **没有 ownership 负向测试**：现有 `*.route.test.ts` 只测 happy path 和 invalid input，没有"用户 B 访问用户 A 资源应该 404"的用例。
- **`consistency`、`summarize`、`versions`、`llm-models`、`onboarding/finalize` 没有单测**。
- **没有 RLS E2E**：等修了 S1/S7 之后应该加一条"切到另一个 user_id 后查不到"的迁移级测试。
- **E2E 跳过 Auth**：`tests/e2e/onboarding.spec.ts` 假设登录已有，没覆盖登录 / 注册 / 重置密码全链路。

---

## 七、文档不一致

- `TASKS.md` 称"21/21 完成"，`PROGRESS.md` 仍显示 70-95% 不等，`design.md` 是另一份未实施的重设计任务书——三份文档相互矛盾，建议合并或在 README 里注明每份文档的"当前有效性"。
- README "百万字长篇" 与 schema 上限对不上（同 P1）。

---

## 八、推荐处理顺序（投入产出比）

1. **S2 + S3**（editor SSR 加 ownership / onboarding 子路由加 caller 一致性校验）——10 行代码挡掉两个真实越权面。
2. **F1 + F2 + F3**（章节保存后自动 summarize、一致性 / 版本历史 UI 入口）——把已写好的 API 落到产品价值。
3. **B1 + B2**——构建 / 视觉静默故障，必修。
4. **F5**（让 `/models` 页真正影响 LLM 调用）——否则这块代码是负资产。
5. **P6 + UX2**——给 `ChapterVersion` 加节流和上限，避免线上数据库爆。
6. **S1 / S7 二选一**：要么真启用 RLS（事务包装 + 参数化），要么删除迁移。
7. **S4 / S5 / S6**：管理员权限、限流扩面、用户输入审核。
8. **P1-P5**：长篇上限、Bible 编辑、prompt 接 profile、用量统计、导出能力。
9. **测试 + 文档收尾**。

---

## 附：本次审计涉及的关键文件

| 类别 | 文件 |
|------|------|
| 鉴权 | `lib/auth/ownership.ts`、`utils/supabase/auth.ts`、`utils/supabase/middleware.ts` |
| RLS | `prisma/migrations/20260508010000_enable_rls/migration.sql`、`lib/db.ts` |
| LLM | `lib/llm/client.ts`、`lib/llm/mock.ts`、`lib/llm/prompts/*.ts`、`lib/moderation/moderate.ts` |
| 限流 | `lib/auth/rateLimit.ts` |
| API | `app/api/{novels,chapters,onboarding,llm-models,healthz,auth}/**/route.ts` |
| 编辑器 | `app/(app)/editor/[novelId]/{page,EditorClient,EditorSidebar,EditorToolbar,useChapterEditor}.tsx` |
| 向导 | `app/(app)/new/{page.tsx,_components/*}` |
| 模型配置 | `app/(app)/models/page.tsx` |
| 数据 | `prisma/schema.prisma` |
| 校验 | `lib/validation/schemas.ts` |
| 构建 | `Dockerfile`、`next.config.ts`、`docker-compose.yml`、`.github/workflows/ci.yml` |
| 样式 | `app/globals.css` |
| i18n | `i18n/request.ts`、`messages/{en,zh}.json` |
