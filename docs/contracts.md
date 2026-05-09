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
