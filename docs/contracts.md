# Onboarding MVP 接口与数据契约 v1.0

本文档是 **Step 0 前置对齐** 的产物，作为后续所有 Step 的唯一引用源。

> 任何字段、路径、Schema、Fixture、决策若与其它文档冲突，**以本文档为准**。
> 本文档冻结后，修改必须按 §10 流程进行，不允许在 Implementation 阶段反复改。

---

## 1. 决策记录（Decision Log）

冻结以下决策。Implementation 阶段如需推翻，必须按 §10 走变更流程。

| ID | 决策 | 选择 | 理由 |
| --- | --- | --- | --- |
| D-01 | 数据库部署 | 本地 PostgreSQL 16 + Docker Compose | 避免引入 Supabase 网络依赖，本地开发一键起；后续上云再迁 |
| D-02 | Bible JSON key 命名 | 全英文 `snake_case` | 避免中英文混用导致 zod schema 与前端类型维护混乱 |
| D-03 | 匿名用户身份 | HTTP-only cookie 携带 `sessionId`；`Novel.user_id` 允许为空 | MVP 不接鉴权；接鉴权后再迁移已有匿名 Novel |
| D-04 | 重摆计数存储 | 服务端 `OnboardingSession.regeneration_count` | 防止 localStorage 清空绕过限制 |
| D-05 | partial-json 兜底 | 解析失败 → 等待全文返回后 `JSON.parse` 重试一次 → 仍失败发 `error` 事件 + 占位 Bible | 避免 Step 4 完全白屏 |
| D-06 | 首字 / 总耗时目标 | 首字 P95 < 3s，Bible 总耗时 P95 < 10s | 与 README §14 验收口径统一（修正原文「8 秒首字」过紧） |
| D-07 | 测试基线 | `lib/llm/client.ts`、`lib/stream/jsonStreamParser.ts`、`lib/validation/schemas.ts` 必须各有一组 vitest 单测 | 错误处理矩阵（Step 9）需要可回归 |
| D-08 | logline 推荐回退 | 用户跳过 Step 2 时，调用本接口生成最常规的默认 logline，不再走 5.3 的"无 logline"分支 | 简化 Prompt 5.3 入参，避免双路径 |
| D-09 | 2026-10-01 并发写入及自动生成 | 恢复必须带 expected_version；质量未通过保留草稿，按 checkpoint_mode 推进 | 防止旧客户端覆盖新正文，明确生成完成与定稿的区别；详见末尾补充及回归测试 |

---

## 2. API 路径与契约

### 2.1 路径表（冻结）

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/api/healthz/llm` | DeepSeek 探活 |
| POST | `/api/onboarding/sessions` | 创建会话，返回 `session_id` 与 `default_profile` |
| POST | `/api/onboarding/sessions/:id/loglines` | 生成 5 条 logline 推荐 |
| POST | `/api/onboarding/sessions/:id/questions` | 生成 3–5 道反向追问题 |
| POST | `/api/onboarding/sessions/:id/bible` | **SSE** 流式生成 Bible |
| POST | `/api/onboarding/sessions/:id/finalize` | 保存草稿 / 创建 Novel |

> 所有 path param `:id` 都是 `OnboardingSession.id`（UUID）。
> 所有非 SSE 接口 `Content-Type: application/json`，请求与响应都走 zod 校验。
> SSE 接口 `Content-Type: text/event-stream`，详见 §2.3。

### 2.2 通用响应格式

成功：

```json
{ "ok": true, "data": { ... } }
```

失败：

```json
{ "ok": false, "error": { "code": "STRING_CODE", "message": "human readable", "retryable": true } }
```

错误码（MVP 集合）：

| code | HTTP | 含义 |
| --- | --- | --- |
| `INVALID_INPUT` | 400 | zod 校验失败 |
| `SESSION_NOT_FOUND` | 404 | sessionId 无效 |
| `REGEN_LIMIT_EXCEEDED` | 429 | 重摆已达 3 次 |
| `LLM_TIMEOUT` | 504 | LLM 调用超时（>15s） |
| `LLM_PARSE_FAILED` | 502 | LLM 输出 JSON 不可解析 |
| `INTERNAL` | 500 | 兜底 |

### 2.3 Bible SSE 事件流

事件类型固定 8 种，前端按 `event` 字段分发：

| event | payload | 触发时机 |
| --- | --- | --- |
| `meta` | `{ suggested_title, alternative_titles }` | `meta` 节点完整 |
| `character` | 完整 Character 对象 + `index` | 每个 character 完整 |
| `world` | 完整 World 对象 | `world` 节点完整 |
| `outline_chapter` | 完整 Chapter 对象 + `index` | 每章完整 |
| `first_chapter_beat` | 完整 Beat 对象 + `index` | 每个 beat 完整 |
| `done` | `{ token_in, token_out, cost_cny, took_ms }` | 流正常结束 |
| `error` | `{ code, message, retryable }` | 异常（终止流） |
| (heartbeat) | `:heartbeat` 注释行 | 每 15s 一次（无 event 名） |

**事件粒度原则**：只在节点完整时 emit，不发部分对象（避免前端做对象 merge）。

---

## 3. Bible JSON Schema（最终字段表）

全英文 `snake_case`（决策 D-02）。`口头禅` → `catchphrase`。

```jsonc
{
  "meta": {
    "suggested_title": "string (2-5 字)",
    "alternative_titles": ["string", "string", "string"]   // 长度严格 3
  },
  "characters": [
    {
      "role": "protagonist | mentor | antagonist | sidekick | hidden",
      "name": "string",
      "age": "number | string",
      "appearance": "string (≤30 字)",
      "personality": "string",
      "catchphrase": "string (1 句)",
      "abilities": ["string"],          // 1-3 项
      "goals": "string",                // 短/长期各 1
      "motivation": "string (1-2 句)",
      "secrets": ["string"],            // 1-2 个
      "relations": ["string"]           // 可空
    }
    // 长度 3-5，必须含且仅含 1 个 role=protagonist
  ],
  "world": {
    "setting_summary": "string (60-120 字)",
    "factions": [
      { "name": "string", "alignment": "string", "role": "string" }
      // 长度 2-4
    ],
    "rules": ["string (≤30 字)"],       // 长度 2-4
    "geography": ["string"]              // 长度 2-4
  },
  "outline": {
    "volume_1": {
      "name": "string (3-5 字)",
      "theme": "string",
      "chapter_count_estimate": "number",
      "chapters": [
        { "index": "number", "title": "string", "summary": "string (40-80 字)" }
        // 长度严格 8-12（硬规则 3）
      ]
    }
  },
  "first_chapter_beats": [
    { "beat": "number", "scene": "string", "purpose": "string" }
    // 长度 5-8
  ]
}
```

**结构约束**（zod schema 必须强制）：

- `characters` 长度 ∈ [3, 5]，且恰好 1 个 `role=protagonist`
- `outline.volume_1.chapters` 长度 ∈ [8, 12]
- `first_chapter_beats` 长度 ∈ [5, 8]
- 所有字符串字段长度上限按本表

---

## 4. NovelProfile 默认值（MVP 最小集）

MVP 仅冻结这些字段。其它（合规等级、文风预设等）进入主编辑器后再扩展。

```ts
type NovelProfile = {
  genre_main: "web" | "literary" | "script" | "fanfic" | "shortstory"; // 来自 Step 1
  genre_sub: string;                                                    // 来自 Step 1，自定义 ≤ 12 字
  audience: "male" | "female" | "general";          // MVP 默认 "general"
  length: "short" | "mid" | "long" | "super_long";  // MVP 默认 "long"
  tone: "cool" | "serious" | "healing" | "dark" | "comedy"; // MVP 默认 "cool"
  pace: "fast" | "mid" | "slow";                    // MVP 默认 "fast"
  pov: "first" | "third_limited" | "omniscient";    // MVP 默认 "third_limited"
  chapter_word_count: 2000 | 3000 | 5000;           // MVP 默认 3000
  ai_freedom: "conservative" | "mid" | "wild";      // MVP 默认 "mid"
};
```

**MVP 行为**：用户只输入 `genre_main` + `genre_sub`，其它字段一律使用默认值。Onboarding 阶段不暴露修改入口，进入主编辑器后才能改。

---

## 5. Wizard State Shape（Zustand store）

```ts
type WizardState = {
  step: 1 | 2 | 3 | 4 | 5;
  session_id?: string;            // POST /sessions 后写入

  inputs: {
    title?: string;                                 // ≤ 64 字
    genre_main: NovelProfile["genre_main"];
    genre_sub: string;
    logline?: string;                               // ≤ 200 字
    logline_suggestions?: string[];                 // 来自 7.2，长度 5
    questions?: Question[];                         // 来自 7.3，长度 3-5
    answers?: Record<string, string | string[]>;    // key 来自 questions[].key
  };

  bible_draft?: Partial<BibleDraft>;                // 流式累积，允许部分

  regeneration_count: number;                       // 与服务端同步，每次 7.4 前刷新
  status: "idle" | "loading" | "streaming" | "error" | "done";
  error?: { step: number; message: string; retryable: boolean };
};

type Question = {
  key: string;                                      // 英文 snake_case
  question: string;
  type: "single" | "multi";
  options: string[];                                // 长度 4
  recommended_index: number;                        // 0-3
};
```

**持久化策略**：

- `step`、`session_id`、`inputs`、`regeneration_count` → `localStorage` (`zustand/persist`)
- `bible_draft` 不持久化（体积大，且生成态本就需要重新流式；刷新后清空，由用户决定是否重摆）
- `status`、`error` 不持久化

---

## 6. 数据表结构（Prisma 草案）

```prisma
model OnboardingSession {
  id                  String   @id @default(uuid())
  user_id             String?                       // MVP 允许匿名（决策 D-03）
  genre_main          String
  genre_sub           String
  title               String?
  logline             String?
  logline_suggestions Json?                         // string[5]
  questions           Json?                         // Question[]
  answers             Json?                         // Record<string, string | string[]>
  bible_draft         Json?                         // Partial<BibleDraft>，最近一次完整或半完整
  regeneration_count  Int      @default(0)          // 决策 D-04
  status              String   @default("active")   // active | finalized | abandoned
  created_at          DateTime @default(now())
  updated_at          DateTime @updatedAt

  @@index([user_id])
  @@index([status])
}

model Novel {
  id          String   @id @default(uuid())
  user_id     String?
  title       String
  profile     Json                                  // NovelProfile
  session_id  String?                               // 来源 OnboardingSession
  created_at  DateTime @default(now())

  bible       BibleDraft?
}

model BibleDraft {
  id         String   @id @default(uuid())
  novel_id   String   @unique
  novel      Novel    @relation(fields: [novel_id], references: [id])
  content    Json                                   // 完整 BibleDraft schema
  version    Int      @default(1)
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
}
```

> MVP 不引入 `User` 表。`user_id` 字段保留为 `String?`，方便后续接鉴权。

---

## 7. 玄幻验收 Fixture（黄金回归用例）

锁定一组测试输入。Step 3 离线调试、Step 4 联调、Step 6B 联调、Step 10 验收，**全部用同一组 fixture**。

```jsonc
// fixtures/acceptance/xuanhuan.json
{
  "step1_inputs": {
    "title": "",
    "genre_main": "web",
    "genre_sub": "玄幻"
  },
  "step2_logline": "一个被废柴宗门收留的少年，意外觉醒了上古剑魂。",
  "step3_answers": {
    "protagonist_personality": "表面懦弱内心坚韧",
    "sword_spirit_relation": "老者导师（吝啬嘴硬心软）",
    "opening_pace": "开局被逐出宗门",
    "sweet_spots": ["扮猪吃虎", "打脸报仇"]
  }
}
```

**预期 Bible 输出特征**（人工质检 checklist，每条都需通过）：

- [ ] `meta.suggested_title` 包含「剑」「魂」「逆」之一
- [ ] `characters` 含 `role=protagonist` × 1、`role=mentor` × 1（剑魂）、`role=antagonist` × 1
- [ ] `world.factions` ≥ 2 个，且至少 1 个对应主角宗门
- [ ] `outline.volume_1.chapters` 长度 ∈ [8, 12]
- [ ] 第 1 章为日常引入（不是高潮直入）
- [ ] `first_chapter_beats` 含「剑魂首次显现」类节拍
- [ ] 主角动机能回到 logline 的「被废柴宗门收留」+「觉醒剑魂」闭环

---

## 8. Prompt 5.3 硬规则（与 README §5 对齐）

Bible 生成 Prompt 必须完整包含以下 6 条硬规则。**任何 Prompt 修改都要回归这 6 条**。

1. 主角动机必须与 logline 冲突闭环
2. 反派的动机必须合理，避免「为坏而坏」
3. 首卷大纲至少含 1 个小高潮
4. 首卷大纲至少含 1 个伏笔
5. `outline.volume_1.chapters` 长度严格 8–12
6. 避免裸露 / 色情 / 违反中国法律的内容

Prompt 5.1（logline 推荐）与 Prompt 5.2（反向追问）的硬规则见 `docs/archive/Onboarding向导原型设计 v0.1.md` §5.1 / §5.2，本文档不重复（变化频率较低）。

---

## 9. 日志格式

每次 LLM 调用结束后，由 `lib/llm/client.ts` **统一**输出，禁止业务代码自行 `console.log` token：

```
[LLM] route=<api-path> model=deepseek-chat token_in=<n> token_out=<n> cost_cny=<n.nnnn> took_ms=<n> status=<ok|err> err_code=<optional>
```

字段约定：

- `cost_cny`：用 DeepSeek-V3 当前定价计算（输入 ¥0.001/1k tokens，输出 ¥0.002/1k tokens；如调价更新此处）
- `took_ms`：从发起请求到收到 `done`/`error` 的总耗时
- 流式调用 `token_out` 取最终累积值

---

## 10. 变更流程

本契约冻结后，修改必须：

1. 在 §1 Decision Log **追加一行**（不删旧行；旧决策标 `superseded by D-XX`）
2. PR 描述中注明影响哪些 Step 与文件
3. 同步更新 `README.md` §5、`docs/STATUS.md` 待处理表（旧的 `MVP任务规划表.md` / `Implementation Breakdown.md` 已归档至 `docs/archive/`，仅作历史参考）
4. 如影响已实现代码，PR 必须包含回归测试

---

## 附录 A：与现有文档的差异

本契约相对原型设计 v0.1 的主要修订：

| 项 | 原型 v0.1 | 本契约 | 原因 |
| --- | --- | --- | --- |
| Bible JSON `口头禅` | 中文 key | `catchphrase`（D-02） | 避免中英混用 |
| `genreMain` / `genreSub` | camelCase | `genre_main` / `genre_sub` | 全字段统一 snake_case |
| 首字延迟 | 流式首字 < 2s | P95 < 3s（D-06） | 与 README 8s 验收对齐口径 |
| 重摆计数 | 仅前端 store | 服务端 `regeneration_count`（D-04） | 防绕过 |
| Step 2 跳过 logline 走 Prompt 5.3 | 直接走 5.3 无 logline 分支 | 先内部走 5.1 取首条作为默认 logline（D-08） | 简化 5.3 入参 |


## 2026-10-01 补充：章节写入与自动生成

章节 PATCH 和历史版本恢复 POST 均要求 `expected_version` 为非负整数。数据库写入条件包含该版本；冲突返回 HTTP 409 `CHAPTER_VERSION_CONFLICT`，客户端需重新加载或处理冲突。恢复会递增版本、保存回滚快照，并使摘要和索引失效。

自动生成启动请求支持 `total_chapters`（1–80，默认 40）、`revision_rounds`（0–4，默认 2）、`quality_floor`（0–100，默认 85）、正数 `cost_cap_cny` 和 `checkpoint_mode`（`none` / `per_volume` / `on_fail`，默认 `on_fail`）。`checkpoint_mode` 写入任务专用字段；零轮修订仍执行审校。`model` 可选，仅覆盖逐章生成模型。

启动和恢复在作品级数据库锁内检查状态并创建任务。已存在正文不会被自动覆盖；从连续已完成章节之后开始。恢复时，下一章非空草稿需人工复核并标记完成，或清空后重新生成；人工定稿时还需确认对应故事状态。费用达到上限时拒绝恢复。

审校无法解析、严重或重要冲突，以及状态变更校验失败，均不能把章节自动标记为 `done`。未通过的生成正文保留为草稿。`none` 允许继续推进并留下未通过的草稿；其任务 `completed` 仅表示生成目标已遍历，不表示所有章节已经定稿。`per_volume` 在卷末暂停，`on_fail` 遇到未通过章节停止推进。

成本为按模型报价及 token 用量计算的估计值；调用前检查已发生费用，单次调用和后处理可能超额。Web 与数据库 CLI 共用启动/恢复服务；本地文件 CLI 共用章节管线、质量门及状态校验，待复核正文保存在 `notes.json`，人工处理后将 `progress.json.status` 设为 `paused` 再恢复。
# 持续连载契约（2026-10-01）

自动生成支持 `continuous: true`，不预设完结章数。`total_chapters` 在此模式表示当前批次的规划终点；`planning_window` 为 1–20，默认 10。每批写完后进入 `planning`，结合最新剧情再规划下一批。开启持续连载必须设置正数 `cost_cap_cny` 或显式 `unlimited_budget:true`（两者互斥），且检查点不能为 `none`。费用上限是下一次调用前的停止阈值，单次调用及后处理可能造成超出，不能当作供应商硬限额。

启动接口只持久化 run 和 `plan_outline` job，返回 `planning`。规划结果、状态切换及后续 job 在同一个事务提交。暂停/失败后恢复时重新检查大纲覆盖范围，选择规划或续写；已有非空正文必须先审核，自动生成不覆盖。预算达到上限后可通过 PATCH `{action:"budget", cost_cap_cny:N}` 提高当前任务的累计预算，再显式恢复。

章节 index 为 PostgreSQL 正整数范围，不再限制为 1000；附加卷不再限制为 20 卷。首卷仍最多 80 章，滚动规划的新卷每卷最多 80 章，兼容旧数据中最多 200 章的附加卷。提示只注入最近 20 条大纲与有界剧情状态。后台 worker 定期修复缺失的后续 job，耗尽重试则标记 run 失败；数据库异常采用退避重试。
# 长期记忆与卷规划契约（2026-10-01）

新增 `StoryMemoryCheckpoint`、`StoryMemoryRecord`、`NovelOutlineChapter` 和 `NovelVolumePlan`。Bible JSON 保留兼容；独立表用于按章节读取事实、保留历史变更与查询大纲。旧作品按需回填或使用回填脚本。回填只能记录现存快照，不能恢复已经被旧 JSON 丢弃的时间线；早于快照的状态不得当成已知历史事实。

记忆版本使用 `[valid_from_chapter, valid_to_chapter)`，当前版本的结束章为 NULL，同一作品/类别/事实键最多一个当前版本。记录来源 Bible 时间、章节 ID 与章节版本；生成正文、Bible、记忆和后续任务同一事务提交。自动更新不删除被最近窗口裁掉的旧事件；人工编辑后的快照可以使旧事实失效。读取为有界窗口，卷计划引用的线索与伏笔必须额外召回，不能被普通窗口丢掉。

卷计划单独持久化目标、核心冲突、人物变化、高潮、阶段结果、下一卷钩子、避免重复的模式及线索目标。现有已写正文优先于计划。计划中的回收目标只能引用已知未解决线索，期限位于本卷且晚于已经完成的章节；计划注入规划、起草、审校和修订。到期未回收的目标保存为待审草稿，不推进任务。旧数据与本地文件 CLI 无计划时沿用原逻辑。

`GET /api/novels/:id/story-memory?chapter_index=N` 为所有者读取第 N 章后的有界状态、事实来源、记忆覆盖范围与下一章所在卷计划。无 N 时以最后一章已完成正文为准。没有历史快照时返回 `historical_available:false`，不注入未来状态。

## 2026-10-02 补充：资源等待与提醒

`daily_cost_cap_cny` 为可选正数，按北京时间零点重置；`stop_after_chapter` 为可选正整数，仅指定本次任务结束位置。费用更新在 run 行锁内先累计，再重置/增加当日费用，迟到的旧日记录不能重置新日计数。

日预算及账户日/月费用或调用数不足属于资源等待。run 保存暂停原因和到期时间；job 保存 `available_at`，不增加 `attempts`。累计预算没有自动恢复时间。worker 只恢复到期的资源暂停；遇到已有非空草稿转入复核，不自动覆盖。恢复使用更新版本及暂停原因/时间作为条件，保护并发人工操作。PATCH `{action:"daily_budget",daily_cost_cap_cny:N|null}` 仅允许暂停/复核/失败任务，保存后需要显式恢复；null 关闭每日上限。

`GET /api/generation-alerts` 返回本人未删除作品的未读、未解决提醒；`PATCH` 接受最多 50 个 UUID，只确认本人的提醒。确认不会恢复生成。提醒按 run/kind 唯一；同一消息的重复扫描保留确认状态；任务恢复解决旧提醒。指标 `ai_novel_generation_alerts{kind}` 仅包含种类，无用户或作品 ID。
