# AI Novel — 当前审计报告与后续规划

> 更新时间：2026-05-09  
> 范围：当前工作区代码、文档审阅和实测命令（`typecheck`、Vitest、`build`）  
> 总结：项目已具备可演示、可内部试用的 AI 小说写作 MVP。Onboarding、多章节编辑、Critic、State Diff、分层摘要、RAG 雏形、导出、用量表等能力均已落地；但距离生产级长篇写作工具仍有工程交付、CI/lint、成本配额、审核覆盖、后台任务和写作体验缺口。
> 技术落地方案见：`TECHNICAL_PLAN.md`

---

## 一、总体完成度判断

| 模块 | 当前完成度 | 判断 |
|---|---:|---|
| Onboarding 一句话开书 | 80-88% | 主链路可用，已有 session、logline、追问、流式 Bible、Review、Finalize；跳过/恢复/直接开写仍需补 |
| 多章节编辑器 | 78-85% | 可写、可保存、可 AI 起草、可查看历史、可删除、可导出，Critic/State Diff 已接入 |
| 多 Agent 协作 | 55-65% | Writer、Critic、StateUpdater、Outline/BeatSheet、Retrieval 均有实现；自动修订/回炉和稳定编排不足 |
| 四层记忆架构 | 60-70% | L1 Bible、L2 分层摘要、L3 MemoryChunk/RAG、L4 State Diff 都有实现；可靠性和任务化不足 |
| 长篇稳定创作能力 | 60-70% | schema 已解锁长篇，摘要/RAG/状态可影响生成；dirty/hash、索引失败、召回质量仍需增强 |
| 产品化完整度 | 45-55% | 能内部试用，已有导出和用量雏形；候选稿、写作工具、低噪声 UI、CI/coverage 未完成 |

核心结论：当前已经不再只是“带 Story Bible 和章节摘要雏形的单 Agent 写作 MVP”，而是具备多 Agent/记忆闭环雏形的写作 MVP。但它仍不是生产级“长篇记忆系统”：可靠性、可观测性、后台任务、成本控制和写作体验还需要系统性收敛。

---

## 当前实测验证

| 命令 | 当前结果 | 说明 |
|---|---|---|
| `npm run typecheck` | 通过 | TypeScript 检查通过 |
| `npm run test` | 通过 | 33 files / 209 tests passed |
| `npm run build` | 通过 | Next.js 15 生产构建成功 |
| `npm run lint` | 未通过质量门禁 | 脚本仍为废弃 `next lint`，本次运行 120 秒超时 |

工程交付风险：`.github/workflows/ci.yml` 已恢复基础 verify workflow，但 lint、coverage、E2E 仍未进入 CI；同时仍有大量核心源码、测试、迁移文件处于 modified/untracked 状态，需要分批提交并确认远端 CI 运行。

---

## 二、已修复或已接通的旧审计项

以下问题在旧版 `AUDIT.md` 中被列为缺口，但当前代码已经修复或部分修复，应从阻塞项中移出：

| 旧编号 | 当前状态 | 证据 |
|---|---|---|
| S2 `/editor/[novelId]` SSR 无 ownership | 已修复 | `app/(app)/editor/[novelId]/page.tsx` 已调用 `getRequiredUserId` 和 `canAccessOwnerResource` |
| S3 onboarding 子路由无 caller 校验 | 已修复 | `lib/auth/onboardingAccess.ts` 统一校验/认领 session，`bible`、`finalize` 等路由已接入 |
| F1 章节摘要 API 未接入 | 已部分接通 | `useChapterEditor.ts` 在章节标记 `done` 且内容超过 100 字后后台调用 `/summarize` |
| F2 一致性校验无 UI | 已接通 | `EditorClient.tsx` 的“逻辑审计”按钮调用 `runConsistency` |
| F3 版本历史无 UI | 已接通 | `EditorToolbar.tsx` 有历史按钮，`EditorClient.tsx` 有版本弹窗 |
| F5 `/models` 配置不影响 LLM | 已修复 | `lib/llm/client.ts` 已优先读取默认启用的 `LlmModel`，再回退 env |
| B1 Docker standalone 配置不一致 | 已修复 | `Dockerfile` builder 阶段已设置 `DOCKER_BUILD=1` |
| B2 `animate-fade` / `animate-slide` 未定义 | 已修复 | `app/globals.css` 已定义对应 keyframes 和 class |

注意：这些修复不代表架构目标完成，只表示旧审计里的“孤岛 API/配置错误”已有推进。

---

## 三、仍需优先处理的安全与上线风险

| # | 优先级 | 问题 | 证据 | 修复方向 |
|---|---|---|---|---|
| ~~S1~~ | 已落地 | **RLS 决策**：禁用 RLS，明确依赖应用层 ownership | migration `20260508050000_disable_rls` 已 DROP 所有策略并 DISABLE ROW LEVEL SECURITY；`lib/db.ts` 已删除 `setRlsUser` helper | 完成（2026-05-08）。当前版本明确以 `lib/auth/ownership.ts` + SSR/API guard 作为唯一隔离层 |
| ~~S2~~ | 已落地 | **`setRlsUser` 字符串拼接** | 已随 RLS 决策一并删除 | 完成（2026-05-08） |
| ~~S3~~ | 已落地 | **LLM 模型配置 admin-only + api_key 加密** | `app/api/llm-models/**` 已接入 `adminGuardResponse`；`lib/llm/encryption.ts` AES-256-GCM 加密存储；API 返回脱敏 key；兼容旧明文 | 完成（2026-05-09） |
| ~~S4~~ | 已完成 | **限流扩面 + 接口抽象** | `lib/auth/rateLimit.ts` 已抽象 `RateLimiter` 接口；保留 memory 实现；新增 `healthz_llm`、`critic`、`state-diff` 限流；支持 `RATE_LIMIT_STORE=redis` 占位 | 完成 2026-05-09 |
| ~~S5~~ | 已完成 | **内容审核策略化** | `MODERATION_FAILURE_MODE=allow|block|review`；生产默认 `block`；本地关键词永远强阻断；LLM 失败按策略处理 | 完成 2026-05-09 |
| ~~S6~~ | 已完成 | **LLM 模型配置 SSRF 防护** | `POST/PATCH /api/llm-models` 已接入 `LlmModelInputSchema`，校验 URL scheme、provider allowlist、私网 IP 拒绝 | 完成 2026-05-09 |
| ~~S7~~ | 已完成 | **`/api/healthz/llm` 公开接口保护** | 已改为 admin-only，新增 `/api/healthz` 基础公开探针，深度探针加限流 | 完成 2026-05-09 |
| ~~S8~~ | 已完成 | **API key 加密与脱敏** | `lib/llm/encryption.ts` AES-256-GCM 加密；`GET/POST/PATCH` 返回 `api_key_masked`；`client.ts` 解密使用；兼容旧明文 | 完成 2026-05-09 |
| ~~S9~~ | 已完成 | **ownership 负向测试补齐** | 新增 `novels/route`、`summaries/refresh` 负向测试；覆盖 401/404 场景 | 完成 2026-05-09 |
| ~~S10~~ | 已完成 | **owner 为空资源策略收紧** | `canAccessOwnerResource` 默认拒绝空 owner；新增 `canClaimAnonymousResource`；onboarding claim 流程单独受控 | 完成 2026-05-09 |

建议：P0 先完成 S1/S2/S3，否则不要进入公网多人试用。

---

## 四、四层记忆架构缺口

原设计在 `AI小说网站技术实现方案 v1.0.md` 中定义了 L1-L4：Story Bible、分层摘要、向量检索、实时状态机。当前实现只覆盖前两层的一小部分。

| 层级 | 当前状态 | 缺口 | 下一步 |
|---|---|---|---|
| L1 Story Bible | 有 `BibleDraft.content` JSON，包含角色、世界、首卷大纲、第一章节拍 | 字段浅 | 已支持 Bible 编辑器（2026-05-08），可编辑角色/世界规则/大纲 |
| L2 分层摘要 | 已落地 v1（2026-05-08） | 级联刷新策略（dirty 检测）仍待更精细调优 | 新增 `NovelSummary` / `VolumeSummary`，prompt 只注入梗概+卷摘要+最近5章，不再拼接全部摘要 |
| L3 RAG / Hybrid Search | 已落地雏形 | pgvector、MemoryChunk、embedding、SQL 检索、关键词+向量混合检索已有；索引失败、后台任务、召回质量仍需生产化 | 先修索引事务/失败可见，再增加 rerank 和召回评估 |
| L4 实时状态机 | 已落地 v2（2026-05-09） | 自动 diff、人工确认、new_entities 合并、改稿后级联刷新已有；刷新 dirty/hash 仍较粗 | State Tracker v2 继续增强：基于 hash 判断过期，状态更新失败可见可重试 |

阶段目标不要一口气做完整 RAG。推荐先做“章节摘要 + 状态 diff + 可编辑 Bible”闭环，再做向量库。

---

## 五、多 Agent 协作缺口

原设计流程：大纲 Agent -> 检索 Agent -> 写作 Agent -> Critic Agent -> State Updater。当前实际流程：前端按钮 -> 单个章节 prompt -> LLM 流式输出。

| Agent | 当前状态 | 缺口 | 建议实现顺序 |
|---|---|---|---|
| 大纲 Agent | 已落地 v1 | Beat Sheet prompt 和章节 outline route 已有；用户编辑和动态规划体验仍弱 | 接入编辑器候选章纲，允许生成前确认 |
| 检索 Agent | 已落地雏形 | MemoryChunk/RAG 检索已有；召回质量、rerank、失败可观测性不足 | 增加召回评估、rerank、引用片段展示 |
| 写作 Agent | 已有，已升级 | `buildChapterPrompt` 已接入 `buildChapterContext()`，消费 story_state、摘要、retrievalStatus、beatSheet | 保留，后续增强候选稿和差异合并 |
| Critic Agent | 已落地 v1 | 只检查单章，不涉及跨章一致性；不自动回炉 | Critic v1 已支持：起草后自动校验，critical/major 冲突阻止静默覆盖 |
| State Updater | 已落地 v1 | 还需让 draft prompt 显式消费 story_state | State Updater v1 已支持：LLM 生成 `state_diff`，人工确认后回写 Bible |

建议新增一个轻量编排层，而不是马上做复杂 agent 框架：`buildChapterContext()` 负责调用摘要、检索、状态、Bible 切片，再交给写作 prompt。

---

## 六、产品层缺口

| # | 优先级 | 缺口 | 证据/备注 | 修复方向 |
|---|---|---|---|---|
| ~~P1~~ | 已落地 | **schema 限制无法写长篇** | `ChapterSchema.index` 已放宽到 1-1000；`volume_1.chapters` 上限 50；`outline.volumes[]` 支持追加多卷；`POST /api/novels/[id]/chapters` 与 `/draft` 不再因不在 outline 中拒绝 | 完成 2026-05-08。 |
| ~~P2~~ | 已落地 | **`ChapterVersion` 已节流** | PATCH `/api/chapters/[id]` 默认 `source=autosave` 不创建版本；只有 `manual` / `ai` / 状态切换创建版本；按 content_hash 去重；每章保留 50 条 | 完成 2026-05-08。客户端 `useChapterEditor` 自动保存→`autosave`，手动保存→`manual`，AI 起草→`ai`。 |
| ~~P3~~ | 已落地 | **Bible 编辑能力不足** | finalize 后编辑器侧栏基本只读 | 完成 2026-05-08。新增 `PATCH /api/novels/[id]/bible` + `BibleEditorPanel`，支持编辑角色、世界规则、章节大纲。 |
| ~~P4~~ | 已落地 | **profile 字段影响 prompt 不充分** | 已有 generation policy 映射 tone/pace/ai_freedom/audience/pov 到 prompt 和参数 | 后续继续按真实生成质量调参 |
| ~~P5~~ | 已落地 | **一致性检查不是闭环** | AI 起草后自动 Critic，严重冲突阻止静默保存 | 后续增加自动修订/回炉策略 |
| ~~P6~~ | 已落地 | **没有导出** | Markdown/TXT 导出 API 和编辑器菜单已实现 | 后续补 docx/epub |
| ~~P7~~ | 已完成 | **用量统计/配额覆盖** | summarize / consistency / loglines / questions 已接入 checkQuota；`QUOTA_FAILURE_MODE=allow|block`，生产默认 block；usage.test.ts 覆盖 block/allow 两个分支 | 完成 2026-05-09 |

---

## 七、构建、配置与文档问题

| # | 优先级 | 问题 | 处理建议 |
|---|---|---|---|
| ~~B1~~ | 已完成 | `.gitignore` 重复 `.env` 已修复为 `.env*` + `!.env.example` | 完成 2026-05-09 |
| B2 | P2 | i18n 已装但 locale 锁死为 `zh`，大量 JSX 硬编码中文 | 如果近期只做中文产品，删除假 i18n；如果要国际化，补完整路由和消息抽取 |
| B3 | P2 | 缺 `/api/healthz` 总体健康检查 | 增加 DB + 进程基本探针，保留 `/api/healthz/llm` 作为深度检查 |
| B4 | P1 | `TASKS.md`、`PROGRESS.md`、README 与当前事实不一致 | 将 `AUDIT.md` 作为当前准绳，后续统一文档状态 |

---

## 八、UX 与写作体验缺口

| # | 优先级 | 问题 | 建议 |
|---|---|---|---|
| UX1 | P1 | `window.confirm` 用于切章/起草/删除 | 改成自定义 modal/toast，避免浏览器原生弹窗打断写作 |
| ~~UX2~~ | 已落地 | 自动保存和版本历史已解耦 | autosave 只更新草稿；手动保存/AI 起草/状态切换才写版本（2026-05-08） |
| UX3 | P2 | SSE 中断不可续传 | 先增加“重试并保留已生成内容”；之后再做 stream resume |
| UX4 | P2 | 错误恢复弱 | onboarding 和编辑器关键错误增加重试按钮 |
| UX5 | P2 | 编辑器缺基础写作工具 | 查找/替换、字数目标、章节目标进度优先于花哨 AI 按钮 |
| UX6 | P2 | 设计语言偏“赛博协议”，与长时间写作工具定位不一致 | 统一为安静、编辑器优先、低噪声文案 |

---

## 九、测试缺口

- ~~增加 ownership 负向测试~~：已新增 `summarize` / `versions` / `consistency` 三条路径的负向测试（2026-05-08）。`novels/[id]`、`chapters/[id]`、`novels/[id]/chapters`、`chapters/draft` 此前已覆盖。`onboarding/sessions/**` 仍待补。
- 为 `consistency`、`summarize`、`versions`、`llm-models`、`onboarding/finalize` 补 API 单测。
- 如果保留 RLS，增加迁移级/集成级 RLS 测试；如果删除 RLS，文档明确应用层 ownership 是唯一隔离层。
- 为 autosave + version throttling 增加回归测试，防止版本表爆炸。
- E2E 增加登录/注册/重置密码最小链路。

---

## 十、推荐执行顺序（重新审计后的优先级）

### P0：先让系统安全且不会自毁

1. ~~**RLS 决策与修复**~~：已完成（2026-05-08）。新增 `20260508050000_disable_rls` migration，删除 `setRlsUser`，确认只依赖应用层 ownership。
2. ~~**锁定 LLM 模型配置权限**~~：已完成（2026-05-08）。`/api/llm-models/**` 全部走 `adminGuardResponse`，使用 `ADMIN_USER_IDS` / `ADMIN_EMAILS` 环境变量；`/models` 页面对非管理员显示提示。
3. ~~**解除长篇 schema 限制**~~：单卷限制已解除（2026-05-08）。多卷支持仍待办。
4. ~~**修复 autosave/版本爆炸**~~：已完成 2026-05-08。`source` 字段区分 autosave/manual/ai/status_change；md5 去重；每章 50 条上限。

### P1：把 MVP 推成可持续写作工具

5. ~~**章节完成后的记忆闭环 v1**~~：已完成 2026-05-08。新增 `StoryStateV1` + `StateDiff` + `POST /api/chapters/[id]/state-diff` + `applyStateDiff()`，用户确认后回写 Bible。
6. ~~**Bible 可编辑**~~：已完成 2026-05-08。新增 `PATCH /api/novels/[id]/bible` + `BibleEditorPanel`。
7. ~~**Critic 接入写作闭环**~~：已完成 2026-05-08。新增 `POST /api/novels/[id]/chapters/critic`，AI 起草后自动审校，critical/major 冲突阻止静默覆盖。
8. ~~**`buildChapterContext()` 编排层**~~：已完成 2026-05-08。`draft/route.ts` 已接入，`buildChapterPrompt` 已消费 `story_state`。
9. ~~**分层摘要**~~：已完成 2026-05-08。新增 `VolumeSummary` + `NovelSummary` + `refreshSummaries()`，prompt 只注入梗概+卷摘要+最近5章。
10. **限流和审核扩面**：覆盖所有高成本/高风险 LLM 路由。
11. **profile 策略化**：将 `ai_freedom`、`audience`、`pace`、`chapter_word_count` 统一映射到 prompt 和参数。

### P2：实现真正的长篇记忆

10. **分层摘要**：新增卷摘要、全书梗概，建立级联更新策略。
11. **检索 Agent v1**：先用章节摘要做关键词检索和相关性筛选。
12. **RAG v2**：加入 `MemoryChunk`、embedding、pgvector/hybrid search、reranker。
13. **多 Agent 编排层**：明确 Outline/Retrieval/Writer/Critic/StateUpdater 的输入输出契约和日志。

### P3：产品化补齐

14. **导出 Markdown/TXT/docx/epub**。
15. **用量统计与配额**。
16. **健康检查、文档统一、E2E 登录链路**。
17. **写作体验打磨**：查找替换、字数目标、低噪声 UI、错误重试。

---

## 十一、建议拆分成后续里程碑

### Milestone A：安全与长篇解锁

- RLS 去留决策并落地。**[已完成 2026-05-08]** 选择禁用，新增 `20260508050000_disable_rls`，移除 `setRlsUser`。
- `/models` admin-only。**[已完成 2026-05-08]** 新增 `lib/auth/admin.ts`、`adminGuardResponse`，单测覆盖 401/403/200。
- schema 支持长篇/多卷。**[已完成 2026-05-08]** index 上限改为 1000，volume_1 章节上限改为 50，outline 外章节可创建/起草；新增 `volumes` 数组支持多卷，编辑器侧栏按卷分组渲染。
- autosave 与版本历史解耦。**[已完成 2026-05-08]** 默认 autosave 不创建版本，hash 去重 + 50 条上限。
- 给核心越权路径补负向测试。**[已完成 2026-05-08]** 新增 summarize/versions/consistency 三条 ownership 负向测试。

完成标准：可以让真实用户登录试用，不会越权、不容易烧 key、不因 autosave 打爆版本表。

### Milestone B：记忆闭环 v1

- ~~Bible 编辑器~~。✅ 已完成 2026-05-08。
- 章摘要稳定生成和重算。
- ~~`state_diff` 生成、展示、确认、回写~~。✅ 已完成 2026-05-08。
- 章节起草 prompt 使用当前状态切片。（下一步：修改 `buildChapterPrompt` 注入 story_state）

完成标准：用户写完一章后，系统能把角色状态/情节推进变成可追踪数据，并影响下一章。

### Milestone C：Critic 与 Agent 编排

- ~~起草后自动 Critic~~。✅ 已完成 2026-05-08。
- 严重冲突不直接覆盖，提供修订建议。✅ 已完成 2026-05-08（CriticPanel 提供「仍要保存/重新生成」选项）。
- ~~增加 `buildChapterContext()` 编排层~~。✅ 已完成 2026-05-08。
- 为 Writer/Critic/StateUpdater 定义输入输出契约。（下一步：将契约写入 `lib/agent/README.md`）

完成标准：系统从“生成文本”升级为“生成 + 检查 + 修正建议”的半闭环。

### Milestone D：RAG 与分层摘要

- ~~卷摘要、全书梗概~~。✅ 已完成 2026-05-08。
- MemoryChunk 表。
- embedding/hybrid search。
- 检索 Agent 接入章节生成。

完成标准：第 50 章生成时不再依赖拼接前文章摘要，而能召回相关人物、地点、伏笔和历史片段。

---

## 附：关键文件索引

| 类别 | 文件 |
|---|---|
| 鉴权 | `lib/auth/ownership.ts`、`lib/auth/onboardingAccess.ts`、`utils/supabase/auth.ts`、`utils/supabase/middleware.ts` |
| RLS | `prisma/migrations/20260508010000_enable_rls/migration.sql`、`lib/db.ts` |
| LLM | `lib/llm/client.ts`、`lib/llm/mock.ts`、`lib/llm/prompts/*.ts`、`lib/moderation/moderate.ts` |
| 限流 | `lib/auth/rateLimit.ts` |
| API | `app/api/{novels,chapters,onboarding,llm-models,healthz,auth}/**/route.ts` |
| 编辑器 | `app/(app)/editor/[novelId]/{page,EditorClient,EditorSidebar,EditorToolbar,useChapterEditor}.tsx` |
| 向导 | `app/(app)/new/{page.tsx,_components/*}` |
| 模型配置 | `app/(app)/models/page.tsx`、`app/api/llm-models/route.ts` |
| 数据 | `prisma/schema.prisma` |
| 校验 | `lib/validation/schemas.ts` |
| 构建 | `Dockerfile`、`next.config.ts`、`docker-compose.yml`、`.github/workflows/ci.yml` |
| 样式 | `app/globals.css` |
| i18n | `i18n/request.ts`、`messages/{en,zh}.json` |
