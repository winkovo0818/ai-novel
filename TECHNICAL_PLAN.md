# AI Novel — 后续技术实现方案

> 创建时间：2026-05-08  
> 依据：`AUDIT.md` 当前优先级与原始 `AI小说网站技术实现方案 v1.0.md`  
> 目标：把当前 MVP 推进为可安全试用、可支撑长篇写作、逐步具备四层记忆与多 Agent 协作能力的系统。

---

## 一、实现原则

1. 先修安全和数据成本，再做复杂智能能力。
2. 先做闭环，再做规模化：章节摘要 + 状态 diff + Bible 回写优先于完整 RAG。
3. 先用轻量编排函数，不急着引入复杂 Agent 框架。
4. 每个阶段都必须有可验证结果：API 测试、回归测试或最小 E2E。
5. 不保留“看起来有但实际没生效”的能力，例如假 RLS、假 i18n、假 RAG。

---

## 二、Milestone A：安全与长篇基础

### A1. RLS 决策与落地

> **状态：已完成（2026-05-08）** — 新增 `prisma/migrations/20260508050000_disable_rls` 显式 DROP 策略并 DISABLE RLS；删除 `lib/db.ts` 中的 `setRlsUser`。当前版本明确依赖应用层 ownership。


当前问题：`prisma/migrations/20260508010000_enable_rls/migration.sql` 已启用 RLS，但业务查询没有在事务中调用 `setRlsUser`，所以 RLS 实际不可依赖。

推荐实现：短期删除或禁用 RLS，明确应用层 ownership 是当前隔离边界。

原因：
- 当前 Prisma 查询分散，强行接入事务化 RLS 会改动大。
- Supabase/Prisma/RLS 组合需要统一请求级事务边界，否则容易产生假安全。
- 应用层 ownership 已经在主要 API 和 SSR 页面接入，短期更可控。

实施步骤：
1. 删除或回滚 RLS migration，或新增 migration 禁用相关表 RLS。
2. 删除 `lib/db.ts` 中未使用的 `setRlsUser`。
3. 在 `AUDIT.md` 记录决策：当前版本只依赖应用层 ownership。
4. 为关键资源补 ownership 负向测试。

验收标准：
- 不存在未调用的 RLS helper。
- 文档明确当前隔离模型。
- 用户 B 不能访问用户 A 的 novel/chapter/session。

备选方案：如果坚持保留 RLS，必须新增请求级事务 helper，例如 `withRlsUser(userId, fn)`，并把所有 Prisma 业务查询迁入事务内。

---

### A2. LLM 模型配置权限收口

> **状态：已完成（2026-05-08）** — 新增 `lib/auth/admin.ts`（`isAdminUser` / `checkAdmin` / `adminGuardResponse`），所有 `/api/llm-models/**` 路由统一调用；`/models` 页面对 403 显示无权限提示；admin 通过 `ADMIN_USER_IDS` / `ADMIN_EMAILS` 环境变量配置。


当前问题：`app/api/llm-models/route.ts` 只要求登录，任何用户都可能写入全局共享模型配置和 API key。

推荐实现：MVP 阶段改成 admin-only。

数据设计：
- 短期不改表结构，使用环境变量 `ADMIN_USER_IDS` 或 `ADMIN_EMAILS` 判断。
- 中期再考虑 `UserRole` 表或 Supabase custom claims。

实施步骤：
1. 新增 `lib/auth/admin.ts`：读取当前用户并判断是否管理员。
2. `GET /api/llm-models`、`POST /api/llm-models`、`PATCH/DELETE /api/llm-models/[id]` 统一调用 admin guard。
3. `/models` 页面非管理员显示无权限提示或隐藏入口。
4. 增加 API 单测：匿名 401，普通用户 403，管理员可访问。

验收标准：
- 普通登录用户无法查看或修改共享模型配置。
- 当前 LLM 调用仍能读取默认模型配置。

---

### A3. 长篇 schema 解锁

> **状态：已完成（2026-05-08）** — `ChapterSchema.index` max → 1000；`volume_1.chapters` max → 50；`outline.volumes` 数组支持追加多卷；`POST /api/novels/[id]/chapters` 与 `/chapters/draft` 不再因 outline 缺失而拒绝；prompt 与编辑器侧栏走 `getAllChapters()` / `getVolumes()` helper，跨卷列章。


当前问题：`ChapterSchema.index` 限制 1-20，`volume_1.chapters` 限制 8-12，和长篇产品目标冲突。

推荐实现：把 onboarding 生成的大纲视为“首卷种子”，不要让它限制整本书。

Schema 调整：
- `ChapterSchema.index`: 从 `max(20)` 放宽到 `max(1000)`。
- `volume_1.chapters`: 从 `max(12)` 放宽到 `max(50)`，或者保留首卷 8-12 但章节 API 不再只允许 Bible outline 内章节。
- 新增章节时，如果 Bible 没有对应 outline，允许创建“未规划章节”，标题默认 `第 N 章`。

API 调整：
- `POST /api/novels/[id]/chapters` 不应因为章节不在 Bible outline 中直接拒绝长篇章节。
- `POST /api/novels/[id]/chapters/draft` 对无 outline 的章节使用最近摘要 + 当前状态生成临时 beat。

验收标准：
- 可以创建第 21 章及更后章节。
- 第 21 章可以保存和起草。
- 原有 onboarding 首卷流程不退化。

---

### A4. Autosave 与版本历史解耦

> **状态：已完成（2026-05-08）** — `UpdateChapterDraftRequestSchema` 增加 `source` 字段（默认 `autosave`）；PATCH `/api/chapters/[id]` 仅在 `manual` / `ai` / 状态切换时写 `ChapterVersion`，按 md5 content_hash 去重，每章保留最近 50 条。`useChapterEditor` 已分别传 `autosave` / `manual` / `ai`。新增 migration `20260508060000_chapter_version_hash` 加 `content_hash` 列与索引。


当前问题：`PATCH /api/chapters/[id]` 每次保存都会创建 `ChapterVersion`，3 秒 autosave 会制造大量版本。

推荐实现：区分草稿保存和重要版本。

API 设计：
- `PATCH /api/chapters/[id]` 默认只更新草稿，不创建版本。
- 请求体增加可选字段 `create_version: boolean` 或 `source: "manual" | "ai" | "status_change" | "autosave"`。
- 只有手动保存、AI 覆盖、标记完成、回滚前创建版本。

数据保护：
- 给 `ChapterVersion` 增加内容 hash 字段，避免重复版本。
- 每章最多保留最近 50 个版本，或按重要版本保留。

前端调整：
- autosave 调用不创建版本。
- 手动点击保存创建版本。
- AI 起草覆盖前创建版本。
- 标记完成创建版本。

验收标准：
- 连续输入 1 分钟不会产生几十条版本。
- 手动保存和 AI 覆盖仍可在历史中看到。

---

## 三、Milestone B：记忆闭环 v1

目标：先不做向量库，先实现“章节完成 -> 摘要 -> 状态变更 -> 人工确认 -> 回写 Bible/状态”的闭环。

### B1. 状态模型 v1

> **状态：已完成（2026-05-08）** — `lib/validation/schemas.ts` 新增 `StoryStateV1Schema`（characters / timeline / plot_threads 三个可选数组），并作为 `story_state?: StoryStateV1` 字段挂载在 `BibleDraftSchema` 下（可选，不影响 onboarding 生成的旧 Bible）。当前数据仍存储在 `BibleDraft.content` JSON 列内，未拆表。


短期可以先放在 `BibleDraft.content` 内的扩展字段，避免一次性拆太多表。

建议结构：

```ts
interface StoryStateV1 {
  characters: Array<{
    name: string;
    current_location?: string;
    current_goal?: string;
    emotional_state?: string;
    known_secrets?: string[];
    relationship_notes?: string[];
  }>;
  timeline: Array<{
    chapter_index: number;
    event: string;
    impact?: string;
  }>;
  plot_threads: Array<{
    id: string;
    title: string;
    status: "open" | "progressing" | "resolved";
    introduced_in?: number;
    resolved_in?: number;
    notes?: string;
  }>;
}
```

中期再拆表：`CharacterState`、`TimelineEvent`、`PlotThread`、`WorldRule`。

---

### B2. State Diff API

> **状态：已完成（2026-05-08）** — 新增 `POST /api/chapters/[id]/state-diff` 路由，ownership 校验 + `responseFormat: "json_object"` 非流式 LLM 调用；`lib/llm/prompts/stateDiff.ts` 负责 prompt 组装；返回结构化 `StateDiff`（character_updates / timeline_events / plot_thread_updates / new_entities）。前端 `useChapterEditor` 集成 `generateStateDiff`，`EditorClient` 新增 `StateDiffPanel` 确认弹窗，用户点击“采纳”后通过 `lib/validation/stateDiffMerge.ts` 的 `applyStateDiff()` 合并进 Bible，再调用 `PATCH /api/novels/[id]/bible` 回写。新增 5 条 API 单测 + 3 条 merge helper 单测。


新增接口：`POST /api/chapters/[id]/state-diff`

输入：章节正文、当前 Bible、当前 story state。

输出：结构化 diff。

```ts
interface StateDiff {
  character_updates: Array<{
    name: string;
    changes: Record<string, string>;
    confidence: "low" | "medium" | "high";
  }>;
  timeline_events: Array<{
    event: string;
    impact?: string;
  }>;
  plot_thread_updates: Array<{
    title: string;
    status: "open" | "progressing" | "resolved";
    notes?: string;
  }>;
  new_entities: Array<{
    type: "character" | "location" | "item" | "rule";
    name: string;
    description: string;
  }>;
}
```

流程：
1. 用户在 AI 面板点击「状态追踪」按钮。
2. 后台调用 LLM 生成 `state_diff`。
3. 前端显示结构化状态变更建议。
4. 用户确认（或跳过）。
5. 确认后通过 `applyStateDiff()` 合并并 `PATCH /api/novels/[id]/bible` 回写。

验收标准：
- ✅ 完成章节后能看到结构化状态变更建议。
- ✅ 用户确认后，下一章起草 prompt 会使用这些状态（Bible 已更新）。

---

### B3. Bible 编辑器

> **状态：已完成（2026-05-08）** — 新增 `PATCH /api/novels/[id]/bible` API 路由，应用层 ownership 校验 + `BibleDraftSchema` 全量校验；`EditorSidebar` 新增 Bible 编辑视图切换，`BibleEditorPanel` 组件支持编辑角色（姓名、性格、动机、目标）、世界规则（增删改）、章节大纲（标题和摘要）；`EditorClient` 使用 `useState` 管理 Bible 状态，保存成功后自动同步到 AI 助手面板和章节侧栏。新增 5 条 API 单测覆盖成功更新、404、401、403 和无效输入场景。


目标：让用户能在编辑器中修改关键设定，而不是只能看只读侧栏。

第一版范围：
- 角色：姓名、性格、动机、当前状态。
- 世界规则：新增、编辑、删除。
- 大纲：章节标题和摘要。
- Plot thread：伏笔/线索状态。（留待 B1 StoryState 实现后补充）

API：
- `PATCH /api/novels/[id]/bible`
- 使用 `BibleDraftSchema` 全量校验。
- `updated_at` 自动更新。

验收标准：
- ✅ 修改角色状态后，下一次章节起草能读到更新后的状态。
- ✅ 修改章节大纲后，章节侧栏和起草 prompt 同步变化。

---

## 四、Milestone C：Critic 与轻量 Agent 编排

目标：把当前散落的 prompt 调用整理成可维护的写作流水线。

### C1. Chapter Context Builder

> **状态：已完成（2026-05-08）** — 新增 `lib/agent/chapterContext.ts`，`buildChapterContext()` 统一负责：加载 Bible / story_state / 当前章节大纲 / 前文摘要（优先 summary，fallback 到 900 字 excerpt）/ 预留 `retrievedMemories` 空数组给 RAG v2。`draft/route.ts` 已重构为调用 `buildChapterContext()` 再传给 `buildChapterPrompt()`。`buildChapterPrompt` 已新增 `buildStoryStateSection()`，当 Bible 存在 `story_state` 时会在 prompt 中注入角色当前状态、活跃线索和最新时间线事件。新增 6 条 `chapterContext` 单测 + 4 条 prompt 单测（含 story_state 注入/省略场景）。


新增模块：`lib/agent/chapterContext.ts`

职责：
- 加载 Bible。
- 加载当前 story state。
- 加载章节大纲。
- 加载前文摘要。
- 后续接入检索结果。
- 输出统一上下文包给写作 prompt。

接口示例：

```ts
interface ChapterContext {
  bible: BibleDraft;
  storyState?: StoryStateV1;
  outline: {
    chapterIndex: number;
    title: string;
    summary?: string;
  };
  previousSummaries: Array<{
    chapterIndex: number;
    title: string;
    summary: string;
  }>;
  retrievedMemories: Array<{
    source: string;
    text: string;
    reason: string;
  }>;
}
```

验收标准：
- ✅ `draft/route.ts` 不再手工拼接上下文，而是调用 `buildChapterContext()`。
- ✅ 单测覆盖无摘要、有摘要、无 outline、story_state 传递的章节场景。

---

### C2. 自动 Critic

> **状态：已完成（2026-05-08）** — 新增 `POST /api/novels/[id]/chapters/critic` 路由，LLM 基于 `buildChapterContext()` 组装上下文（Bible + story_state + 前文摘要），检查角色行为、世界规则、线索推进、时间线、基调五个维度。`useChapterEditor` 在 AI 起草完成后自动调用 critic，若发现 critical/major 级别冲突，弹出 `CriticPanel` 让用户确认（仍要保存/重新生成/关闭），阻止静默覆盖；minor 级别不拦截。新增 6 条 API 单测覆盖有冲突、无冲突、404、401、403 和空内容场景。


当前一致性检查是手动按钮。下一步改成可选的生成后检查。

流程：
1. Writer 生成章节草稿。
2. Critic 检查草稿与 Bible/story state/前文摘要是否冲突。
3. 如果无严重冲突，正常保存。
4. 如果有严重冲突，前端提示：保留草稿、请求修订、放弃覆盖。

不建议第一版自动回炉多轮，成本和延迟不可控。先做人类确认。

验收标准：
- ✅ AI 起草后能返回 critic metadata。
- ✅ 严重冲突不会静默覆盖用户原文。

---

### C3. Agent 输入输出契约

短期不要引入 LangChain/CrewAI 等框架。先定义纯函数/服务边界：

| Agent | 输入 | 输出 |
|---|---|---|
| Outline Agent | Bible、story state、章节目标 | Beat Sheet |
| Retrieval Agent | 章节目标、角色/地点关键词 | 相关记忆片段 |
| Writer Agent | ChapterContext | 章节正文 |
| Critic Agent | ChapterContext、章节正文 | 冲突列表、严重程度 |
| State Updater | 章节正文、旧 story state | StateDiff |

验收标准：
- 每个 Agent 的输入输出都有 TypeScript 类型和 prompt 单测。
- LLM 日志能区分不同 Agent/route。

---

## 五、Milestone D：RAG 与分层摘要

目标：第 50 章以后不再靠拼接所有前文章摘要，而是召回相关记忆。

### D1. 分层摘要

> **状态：已完成（2026-05-08）** — Prisma schema 新增 `VolumeSummary`（novel_id + volume_index + summary + covered_chapters）和 `NovelSummary`（novel_id + summary）；`lib/agent/summaries.ts` 的 `refreshSummaries()` 自动按 dirty 检测策略刷新：卷摘要有新章节摘要覆盖时触发 LLM 重生成，全书梗概在任意卷更新后触发。`buildChapterContext()` 现在只注入最近 5 章摘要 + 当前卷摘要 + 全书梗概（而不是全部章节摘要），解决第 50 章后 prompt 过长问题。`buildChapterPrompt()` 已适配新的上下文结构。新增 `POST /api/novels/[id]/summaries/refresh` 手动触发接口。新增 migration `20260509010000_add_tiered_summaries`。


新增模型建议：
- `VolumeSummary`: novel_id、volume_index、summary、covered_chapters。
- `NovelSummary`: novel_id、summary、updated_at。

刷新策略：
- 章节摘要更新后，标记所属卷摘要 dirty。
- 每 5-10 章或用户手动触发时刷新卷摘要。
- 全书梗概由卷摘要压缩生成。

验收标准：
- ✅ 第 N 章起草 prompt 不再塞所有章节摘要，只塞：全书梗概 + 当前卷摘要 + 最近 5 章摘要。

---

### D2. MemoryChunk 与 embedding

> **状态：已完成（2026-05-08）** — Prisma schema 新增 `MemoryChunk`（novel_id, chapter_id, chunk_type, text, embedding `Float[]`, metadata）；新增 migration `20260509020000_add_memory_chunks`。`lib/llm/embeddings.ts` 封装 `edgefn.net` `BAAI/bge-m3` embedding API（需 `EDGEFN_API_KEY`）。`lib/agent/chunking.ts` 实现按段落分块（merge 策略保持 80-800 字/块）+ 启发式分类（scene/dialogue/world_rule/plot_thread/character_fact）。`lib/agent/retrieval.ts` 实现 hybrid search：先用角色/地点/线索关键词预过滤，再对候选 chunk 做向量余弦相似度排序，取 top 5 注入 prompt。`draft/route.ts` 已集成检索，fail-open（检索失败不阻塞写作）。`POST /api/chapters/[id]/index` 提供手动/后台索引入口，`useChapterEditor` 在章节 mark done 后自动调用索引。新增 4 条 chunking 单测。


新增模型建议：
- `MemoryChunk`: novel_id、chapter_id、chunk_type、text、metadata、embedding、created_at。

chunk 类型：
- `scene`
- `dialogue`
- `character_fact`
- `world_rule`
- `plot_thread`
- `summary`

检索策略：
1. 从章节目标、角色、地点、伏笔生成 query。
2. 关键词过滤候选。
3. 向量相似度排序。
4. 可选 LLM rerank。
5. 注入 top K 片段和引用来源。

验收标准：
- ✅ 生成第 50 章时能召回第 3 章埋下的相关伏笔片段。
- ✅ prompt 中能看到检索来源，便于 debug。

---

## 六、建议实施顺序

1. ~~RLS 去留决策~~。✅ 已完成 2026-05-08。
2. ~~`/models` admin-only~~。✅ 已完成 2026-05-08。
3. ~~长篇 schema 解锁~~。✅ 已完成 2026-05-08。
4. ~~autosave/版本历史解耦~~。✅ 已完成 2026-05-08。
5. ~~ownership 负向测试~~。✅ 已完成 2026-05-08。
6. ~~Bible 编辑器~~。✅ 已完成 2026-05-08。
7. ~~章节摘要重算与 `state_diff`~~。✅ 已完成 2026-05-08。
8. ~~`buildChapterContext()`~~。✅ 已完成 2026-05-08。
9. ~~自动 Critic~~。✅ 已完成 2026-05-08。
10. ~~分层摘要~~。✅ 已完成 2026-05-08。
11. MemoryChunk + RAG。

---

## 七、近期不建议做的事

- 不建议马上做完整多 Agent 框架，当前先用轻量编排层即可。
- 不建议马上做复杂向量 RAG，先把摘要和状态闭环打通。
- 不建议先做 UI 大改版，除非影响写作主流程。
- 不建议继续堆“看起来完成”的 API，必须接入真实使用路径。
- 不建议同时保留未生效 RLS 和应用层 ownership 两套说法。
