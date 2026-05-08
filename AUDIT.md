# AI Novel — 当前审计报告与后续规划

> 更新时间：2026-05-08  
> 范围：当前 main 分支（最新提交 `4c1921f`）  
> 总结：项目已具备可演示的 AI 小说写作 MVP，但距离最初设计的“四层记忆架构 + 多 Agent 协同”仍有明显差距。当前最应该优先处理的是安全边界、版本/自动保存成本、长篇 schema 解锁，以及把现有摘要/一致性能力推进成真实的记忆闭环。
> 技术落地方案见：`TECHNICAL_PLAN.md`

---

## 一、总体完成度判断

| 模块 | 当前完成度 | 判断 |
|---|---:|---|
| Onboarding 一句话开书 | 80-90% | 主链路可用，已有鉴权、审核、流式 Bible 生成 |
| 多章节编辑器 | 60-70% | 可写、可保存、可 AI 起草、可查看历史 |
| 多 Agent 协作 | 20-30% | 只有写作 Agent + 手动 Critic，未形成 Agent 闭环 |
| 四层记忆架构 | 20-25% | L1/L2 有雏形，L3/L4 基本未实现 |
| 长篇稳定创作能力 | 25-35% | 仍受 schema、摘要、检索、状态同步限制 |
| 产品化完整度 | 35-45% | 能演示，尚不能按长篇创作工具上线 |

核心结论：当前不是“多 Agent 长篇记忆系统”，而是“带 Story Bible 和章节摘要雏形的单 Agent 写作 MVP”。

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
| S1 | P0 | **RLS 已启用但未真正生效到业务查询** | `prisma/migrations/20260508010000_enable_rls/migration.sql` 已启用 RLS；`lib/db.ts` 有 `setRlsUser`，但业务查询未包事务调用 | 二选一：要么为每个请求建立带 `SET LOCAL app.current_user_id` 的事务边界；要么删除/禁用 RLS，明确只依赖应用层 ownership。不要保留“看似有 RLS”的假安全 |
| S2 | P0 | **`setRlsUser` 使用 `$executeRawUnsafe` 字符串拼接** | `lib/db.ts:22` | 如果保留 RLS，改成参数化 `$executeRaw`，并把调用放到事务内 |
| S3 | P0 | **LLM 模型配置仍无管理员边界，api_key 明文存储且全用户共享** | `app/api/llm-models/route.ts` 只要求登录；`prisma/schema.prisma` 中 `api_key String` | MVP 阶段至少限制为 admin-only；下一步再做 per-user/provider 配置和加密存储 |
| S4 | P1 | **限流只覆盖章节起草** | `isRateLimited` 仅在 `app/api/novels/[id]/chapters/draft/route.ts` 使用 | 给 `bible`、`loglines`、`questions`、`consistency`、`summarize`、`llm-models` 扩面；生产改 Redis/Supabase RPC |
| S5 | P1 | **章节保存和章节起草输入缺内容审核** | `moderateContent` 目前主要用于 onboarding bible/finalize | 至少在章节标记 `done`、AI 起草请求、导出前审核 |

建议：P0 先完成 S1/S2/S3，否则不要进入公网多人试用。

---

## 四、四层记忆架构缺口

原设计在 `AI小说网站技术实现方案 v1.0.md` 中定义了 L1-L4：Story Bible、分层摘要、向量检索、实时状态机。当前实现只覆盖前两层的一小部分。

| 层级 | 当前状态 | 缺口 | 下一步 |
|---|---|---|---|
| L1 Story Bible | 有 `BibleDraft.content` JSON，包含角色、世界、首卷大纲、第一章节拍 | 字段浅，缺角色当前状态、位置、关系、道具、伏笔、时间线；编辑器中基本只读 | 拆出可编辑实体表或结构化 JSON 子区：CharacterState、PlotThread、TimelineEvent、WorldRule、Item/Clue |
| L2 分层摘要 | 有 `ChapterSummary`，章节完成后可后台生成摘要 | 没有卷摘要、全书梗概、状态变更摘要；摘要不会级联重算；手动改稿后状态不可靠 | 新增 `NovelSummary` / `VolumeSummary`，建立“章节摘要 -> 卷摘要 -> 全书梗概”的刷新策略 |
| L3 RAG / Hybrid Search | 基本没有。无 embedding、无 pgvector、无 BM25、无 reranker | 起草时只是拼接所有前文章摘要或截断原文，不是真检索 | 新增 `MemoryChunk` + embedding；按章节/场景切块；实现关键词 + 向量混合检索；起草时只注入相关片段 |
| L4 实时状态机 | 没有 | 章节完成后不会 diff 角色状态/伏笔/时间推进，也不会回写 Bible | 新增 State Tracker：章节完成后输出结构化 `state_diff`，人工确认后回写 Bible/状态表 |

阶段目标不要一口气做完整 RAG。推荐先做“章节摘要 + 状态 diff + 可编辑 Bible”闭环，再做向量库。

---

## 五、多 Agent 协作缺口

原设计流程：大纲 Agent -> 检索 Agent -> 写作 Agent -> Critic Agent -> State Updater。当前实际流程：前端按钮 -> 单个章节 prompt -> LLM 流式输出。

| Agent | 当前状态 | 缺口 | 建议实现顺序 |
|---|---|---|---|
| 大纲 Agent | 未独立存在 | 不能按当前状态动态生成 Beat Sheet | 第 2 阶段实现：先用章节大纲 + 当前状态生成本章 Beat Sheet |
| 检索 Agent | 未实现 | 没有 query 构建、检索、rerank、引用片段 | 第 4 阶段实现：先基于摘要检索，再接 embedding |
| 写作 Agent | 已有 | `buildChapterPrompt` 是核心写作 Agent，但上下文来源单薄 | 保留，改为吃 Agent Orchestrator 组装后的上下文包 |
| Critic Agent | 有手动一致性检查 | 不参与生成闭环；不通过不会回炉；检查只截断每章 600 字 | 第 3 阶段接入：起草后自动校验，严重问题阻止直接覆盖或提示重写 |
| State Updater | 未实现 | 不会从章节提取状态变更 | 第 2 阶段实现：章节完成后生成 `state_diff`，人工确认后回写 |

建议新增一个轻量编排层，而不是马上做复杂 agent 框架：`buildChapterContext()` 负责调用摘要、检索、状态、Bible 切片，再交给写作 prompt。

---

## 六、产品层缺口

| # | 优先级 | 缺口 | 证据/备注 | 修复方向 |
|---|---|---|---|---|
| P1 | P0 | **schema 限制无法写长篇** | `ChapterSchema.index` 限 1-20，`chapters.min(8).max(12)`，只有 `volume_1` | 放宽章节上限；支持多卷；不要让 onboarding outline 限死整本书 |
| P2 | P0 | **`ChapterVersion` 无节流，autosave 会制造大量版本** | `app/api/chapters/[id]/route.ts` 每次 PATCH 都创建版本 | 按内容 hash + 时间窗去重；仅手动保存/状态切换/AI 覆盖创建重要版本；设置每章版本上限 |
| P3 | P1 | **Bible 编辑能力不足** | finalize 后编辑器侧栏基本只读 | 增加角色/世界规则/大纲编辑入口，并保存回 `BibleDraft` 或新结构表 |
| P4 | P1 | **profile 字段影响 prompt 不充分** | `ai_freedom`、`audience` 等未完整映射到温度、审核、风格策略 | 建立 profile -> generation policy 映射，集中管理 temperature、字数、自由度、审核等级 |
| P5 | P1 | **一致性检查不是闭环** | 用户手动点“逻辑审计”，结果只展示，不影响写作流程 | AI 起草后可选自动 Critic；严重冲突提示回炉或生成修订建议 |
| P6 | P2 | **没有导出** | design 有导出，代码无实现 | 先做 Markdown/TXT，再做 docx/epub |
| P7 | P2 | **没有用量统计/配额** | LLM 日志只输出到 console | 新增 `LlmUsage` 表，按 user/novel/route 汇总 token 和成本 |

---

## 七、构建、配置与文档问题

| # | 优先级 | 问题 | 处理建议 |
|---|---|---|---|
| B1 | P2 | `.gitignore` 有重复 `.env` | 小修即可 |
| B2 | P2 | i18n 已装但 locale 锁死为 `zh`，大量 JSX 硬编码中文 | 如果近期只做中文产品，删除假 i18n；如果要国际化，补完整路由和消息抽取 |
| B3 | P2 | 缺 `/api/healthz` 总体健康检查 | 增加 DB + 进程基本探针，保留 `/api/healthz/llm` 作为深度检查 |
| B4 | P1 | `TASKS.md`、`PROGRESS.md`、README 与当前事实不一致 | 将 `AUDIT.md` 作为当前准绳，后续统一文档状态 |

---

## 八、UX 与写作体验缺口

| # | 优先级 | 问题 | 建议 |
|---|---|---|---|
| UX1 | P1 | `window.confirm` 用于切章/起草/删除 | 改成自定义 modal/toast，避免浏览器原生弹窗打断写作 |
| UX2 | P1 | 自动保存和版本历史耦合，造成保存频率与版本膨胀 | 与 P2 一起处理：autosave 只更新草稿，重要节点才写版本 |
| UX3 | P2 | SSE 中断不可续传 | 先增加“重试并保留已生成内容”；之后再做 stream resume |
| UX4 | P2 | 错误恢复弱 | onboarding 和编辑器关键错误增加重试按钮 |
| UX5 | P2 | 编辑器缺基础写作工具 | 查找/替换、字数目标、章节目标进度优先于花哨 AI 按钮 |
| UX6 | P2 | 设计语言偏“赛博协议”，与长时间写作工具定位不一致 | 统一为安静、编辑器优先、低噪声文案 |

---

## 九、测试缺口

- 增加 ownership 负向测试：用户 B 访问用户 A 的 novel/chapter/session 应返回 404/401。
- 为 `consistency`、`summarize`、`versions`、`llm-models`、`onboarding/finalize` 补 API 单测。
- 如果保留 RLS，增加迁移级/集成级 RLS 测试；如果删除 RLS，文档明确应用层 ownership 是唯一隔离层。
- 为 autosave + version throttling 增加回归测试，防止版本表爆炸。
- E2E 增加登录/注册/重置密码最小链路。

---

## 十、推荐执行顺序（重新审计后的优先级）

### P0：先让系统安全且不会自毁

1. **RLS 决策与修复**：保留就事务化 + 参数化；不保留就删除迁移和 `setRlsUser`，避免假安全。
2. **锁定 LLM 模型配置权限**：`/models` 先改 admin-only，避免任意登录用户写入共享 API key。
3. **解除长篇 schema 限制**：放宽 `ChapterSchema.index`、支持多卷/更多章节，避免产品目标和代码硬冲突。
4. **修复 autosave/版本爆炸**：版本创建节流、内容去重、版本数量上限。

### P1：把 MVP 推成可持续写作工具

5. **章节完成后的记忆闭环 v1**：完成章摘要后生成 `state_diff`，用户确认后更新 Bible/状态 JSON。
6. **Bible 可编辑**：在编辑器中编辑角色、规则、大纲，并影响下一次生成。
7. **Critic 接入写作闭环**：起草后自动做轻量一致性检查，冲突时给出修订建议或一键回炉。
8. **限流和审核扩面**：覆盖所有高成本/高风险 LLM 路由。
9. **profile 策略化**：将 `ai_freedom`、`audience`、`pace`、`chapter_word_count` 统一映射到 prompt 和参数。

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

- RLS 去留决策并落地。
- `/models` admin-only。
- schema 支持长篇/多卷。
- autosave 与版本历史解耦。
- 给核心越权路径补负向测试。

完成标准：可以让真实用户登录试用，不会越权、不容易烧 key、不因 autosave 打爆版本表。

### Milestone B：记忆闭环 v1

- Bible 编辑器。
- 章摘要稳定生成和重算。
- `state_diff` 生成、展示、确认、回写。
- 章节起草 prompt 使用当前状态切片。

完成标准：用户写完一章后，系统能把角色状态/情节推进变成可追踪数据，并影响下一章。

### Milestone C：Critic 与 Agent 编排

- 起草后自动 Critic。
- 严重冲突不直接覆盖，提供修订建议。
- 增加 `buildChapterContext()` 编排层。
- 为 Writer/Critic/StateUpdater 定义输入输出契约。

完成标准：系统从“生成文本”升级为“生成 + 检查 + 修正建议”的半闭环。

### Milestone D：RAG 与分层摘要

- 卷摘要、全书梗概。
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
