# AI Novel — 项目审阅报告

> 创建时间：2026-05-12
> 审阅范围：当前 main 分支（commit `44161d3` 之前的全部代码 + `docs/`）
> 审阅依据：实测 `npm run test`（68 files / 489 tests / 9.12s 全绿）+ 全部 docs/ 文档 + 关键源码阅读
> 评判标准：**真实可用的产品**（非 Demo）。重点考察四个维度：
>   1. 主流程是否闭环
>   2. AI 功能是否可控
>   3. 错误场景是否处理
>   4. 测试是否足够支撑后续迭代
> 文档角色：**一次性审阅快照**。后续每条修复完成后应回写到 `docs/HEALTH.md` 而非本文档。

---

## 1. 项目当前状态

### 1.1 项目定位

AI 协同写小说的**单人创作工作台**（中文场景），目标是真实可用产品而非演示。完整链路：

```
Onboarding 5 步生成 Bible 草稿
  → 项目层信息架构（角色 / 世界观 / 大纲 / 章节 / 关系图 / 历史 / 导出）
  → 多章节编辑器（候选稿 + Critic + 版本恢复 + diff + 4 格式导出 + retrieval 可视化 + SSE 续传）
  → 长篇可靠性（分层摘要 + pgvector RAG + state diff + dirty 标脏 + 乐观锁）
```

明确暂缓：多人协作 / 分支创作 / 平台直发 / 角色关系图复杂版 / Prompt Cache 多模型 Router / 计费支付。

### 1.2 技术栈

| 层 | 选型 |
|---|---|
| Framework | Next.js 15 + App Router + React 19 + TypeScript strict |
| UI | Tailwind v4 + 自写 `components/ui/` 9 个原语 |
| 状态 | Zustand（仅 Onboarding）+ useState（编辑器 hook） |
| 数据库 | PostgreSQL 16 + Prisma 6 + pgvector 1024 维 |
| LLM | DeepSeek-V3，`LlmModel` 表配置 + env fallback |
| Embedding | EdgeFn bge-m3 1024 维，`EmbeddingModel` 表配置 + env fallback |
| Auth | Supabase Auth + SSR cookies + service role 单独 client |
| 校验 | Zod 全链路单一来源 |
| 测试 | Vitest（node env）+ Playwright |
| CI | GitHub Actions：verify + e2e 双 job；coverage 阈值 68/68/93/83 |
| 部署 | Docker `output: standalone`（Vercel 友好） |

### 1.3 规模

- 业务源码 17,500+ LoC（136 ts/tsx）
- 测试代码 7,200+ LoC（68 个 .test.ts，489 个单测）
- 36 个 API route + 19 个 page.tsx
- 21 条 Prisma migration，14 张主表（含 pgvector）

### 1.4 四维度评估（核心结论）

#### A. 主流程是否闭环

| 流程 | 闭环状态 | 关键缺口 |
|---|---|---|
| Onboarding → Bible → 编辑器 | ✅ 闭环 | step 4 SSE 中刷新页面无法恢复 |
| AI 候选稿 → Accept/Discard → Persist | ✅ 闭环 | — |
| SSE 起草断网 → 切回章节恢复 | 🟡 半闭环 | **DraftSession 进入 `streaming` 后若 Vercel 函数超时被杀，状态永远卡在 `streaming`**（resume 端点永远返回部分 buffer，状态永不转为 completed/failed） |
| Mark chapter done → 自动 state diff → 用户审核 → 写回 Bible | 🟡 半闭环 | **state diff 自动生成失败时 `useChapterEditor.ts:165` 是 `catch {}` 空 handler，用户完全不知道**（silent fail） |
| Critic 检测 → 用户决策 → 处理候选稿 | ✅ 闭环 | — |
| 版本恢复 + diff | ✅ 闭环 | — |
| 4 格式导出 | ✅ 闭环 | range / include_bible 参数未做（长篇用户没法只导一卷） |
| Job 失败 → JobsBadge 重试 | 🟡 半闭环 | **无 cron / 长驻 drainer；Serverless 重启后 in-flight job 永远 `running`，用户看不到、也无法 retry**（drainer 只看 `pending`） |
| 长篇 dirty 标脏 → 批量刷新 | ✅ 闭环 | — |
| 双端冲突 → 409 → 加载最新 | 🟡 半闭环 | **`expected_version: z.number().optional()`，不传则完全绕过乐观锁**；冲突横幅"暂不处理"后再保存会无限 409（hook 没更新 `chapterVersion`） |
| 内容审核 → 阻断违规 | 🟡 半闭环 | **Bible PATCH 路径未走 moderation**；output moderation 在 SSE 全部 delta 发送后才做，违规已到客户端 |
| 配额超限 → 429 | ✅ 闭环 | — |

**判定**：12 条主流程，**7 条完全闭环 / 5 条半闭环**。半闭环的 5 条全部是"看起来完成但失败路径裸跑"，对真实产品而言是**生产事故源**。

#### B. AI 功能是否可控

| 控制维度 | 状态 | 证据 |
|---|---|---|
| 输出不直接覆盖正文 | ✅ | M1.3 候选稿模式 |
| 成本可控（每用户日 / 月限额）| ✅ | `lib/llm/usage.ts` + `DAILY_COST_LIMIT_CNY` 等 4 个 env |
| 配额超限策略可调 | ✅ | `QUOTA_FAILURE_MODE` allow/block |
| 重试不会拼接错位 | ✅ | `client.ts:340` 首 delta 后拒绝重试 |
| 超时可控 | ✅ | 15s default / 60s draft |
| Retrieval 命中可见 | ✅ | M3.4 candidate panel 显示 source/score/reason |
| Critic 严重性分级 + 强制确认 | ✅ | `CandidatePanel.tsx:62` `hasBlockingIssue` |
| State diff 写回需用户审核 | ✅ | StateDiffPanel 必须手动 apply |
| Beat Sheet 可编辑后再起草 | ✅ | M2.2 |
| Temperature 按 `ai_freedom` 分级 | ✅ | `lib/llm/generationPolicy.ts` |
| 用量历史可查 | ✅ | `/novels/:id/history` |
| **失败可见性** | 🟡 | retrieval 失败可见；**critic 失败仅在 panel 内，关闭后丢失**；**state diff 自动失败完全 silent**；summarize/index 失败仅 JobsBadge 可见 |
| **每次调用成本即时可见** | ❌ | 月度聚合在 dashboard；单次成本只在 history 页（用户起草时看不到本次烧了多少）|
| **Critic / State Diff / Summarize 的 cost 显式归属** | ❌ | 都计入 `LlmUsage` 但 UI 不分 agent 汇总 |
| **模型 / Prompt 可见性** | ❌ | Prompt 服务端写死，用户无法看 / 改；模型只有 admin 切（用户视角不可控）|
| **Prompt 注入防护** | ❌ | Bible 字段直接拼进 chapter prompt，无 sanitization（用户在角色 personality 写 "Ignore previous instructions" 会生效）|
| **"重新生成 + 反馈"机制** | ❌ | 候选稿只能丢弃后整体重起草；不能基于上次结果 + 用户 prompt 微调 |
| **段落级 output moderation** | ❌ | 全文流式完成后整体审核，违规已在客户端显示 |

**判定**：基础可控性扎实（成本 / 配额 / 重试 / 超时 / 用户审核 gate 全部到位），但**面向真实写作场景的"失败可见 + 成本透明 + 注入防护 + 模型选择 + 反馈环"5 个维度都缺**。这不是 demo 问题，是真实用户长期使用必然碰到的痛点。

#### C. 错误场景是否处理

按错误类型审计：

| 错误类型 | 处理状态 | 关键证据 |
|---|---|---|
| 网络超时 / abort | ✅ | `AbortController` + `LLM_TIMEOUT` |
| LLM 4xx/5xx | ✅ | `HTTP_${status}` errCode |
| LLM 部分 JSON | ✅ | `partial-json` + 全文后 retry once |
| Moderation 服务自身失败 | ✅ | `MODERATION_FAILURE_MODE` 三态 |
| 配额超限 | ✅ | 429 `QUOTA_EXCEEDED` |
| 速率限制 | ✅ | 429 `RATE_LIMITED`（内存 + Upstash） |
| 鉴权失败 | ✅ | 401 |
| 资源不存在 / 非 owner | ✅ | 404（隐藏存在性）|
| 校验失败 | ✅ | 400 `INVALID_INPUT` |
| 乐观锁冲突 | ✅ | 409 + 横幅；但 `expected_version` 可选所以可绕过 |
| 章节版本 hash 重复 | ✅ | 同 hash 跳过创建版本 |
| 章节内容上限 80,000 char | 🟡 | Schema 约束但无 UI 提醒 |
| DB 不可达 | ✅ | DB→env fallback（admin/llm/embedding 三处） |
| pgvector 缺失 | ✅ | healthz 探测 + 503 |
| Supabase 配置缺失 | ✅ | healthz 探测 + 503 |
| **State diff 自动生成失败** | ❌ | `useChapterEditor.ts:165` `catch {}` 空 handler |
| **SSE 流被 Vercel 函数超时杀掉** | ❌ | DraftSession 永远 `streaming`，resume 永远返回部分 buffer |
| **Job in-flight 时 Serverless 重启** | ❌ | 卡死 `running`，drainer 看不到 |
| **DraftSession 孤儿行** | ❌ | 用户切走不回来 → 行永久残留，无 TTL / cleanup |
| **MemoryChunk 索引失败 silent** | 🟡 | job 表会留痕但用户层无具体哪一段失败的可见性 |
| **两端同章节同时起草** | ❌ | 第二个 `upsert` 重置第一个的 row，第一个 flusher 写到被重置的 row（数据混乱低概率但真实） |
| **Critic 失败被关闭后丢失** | 🟡 | 错误只在 panel 内显示 |
| **Onboarding step 4 SSE 中刷新** | ❌ | state 丢失回 step 1 |
| **Output moderation 滞后于 deltas** | ❌ | 违规已显示 |
| **JSON.parse(moderation result)** | 🟡 | `moderate.ts:74` 没 try/catch；非 JSON 抛错走外层 catch 进 failure-mode 分支 — 行为正确但路径隐式 |
| **prisma `$queryRawUnsafe` retrieval** | ✅ | 参数化 prepared statement，无 SQL 注入 |

**判定**：基础错误处理（HTTP / Zod / DB 不可达 / LLM 异常）做得非常细。但**长生命周期的失败模式**（SSE 流被杀 / Job stuck running / DraftSession 孤儿）一律未处理 — 这些不是开发期错误，是**生产期才会暴露的错误**。

#### D. 测试是否足够支撑后续迭代

| 维度 | 状态 |
|---|---|
| 单测总量 | ✅ 489 个，9 秒跑完 |
| LLM Prompt 各 Agent 单测 | ✅ 10 个 prompt 文件各有专测 |
| API route 单测 | ✅ 30 个 route 单测覆盖正向 + 401 + 404 + INVALID_INPUT |
| Zod schema 单测 | ✅ |
| 加密 / SSRF / fallback | ✅ |
| Coverage 阈值入 CI | ✅ 68/68/93/83 |
| **`useChapterEditor.ts` 测试** | ❌ **896 行 0% 覆盖**（编辑器最复杂状态机：drafting/candidate/version/conflict/resume/beats 全混在一起，任何修改靠人工试）|
| **`app/(app)/**/page.tsx` RSC 测试** | ❌ vitest config 排除 page.tsx（合理但意味着 SSR 链路零回归保护）|
| **E2E 测试** | ❌ **5 个 spec 全部按钮文案与 UI 不符**（onboarding 找 "AI 起草第 1 章" / 候选稿找 "全文续写"，实际按钮是 "全文起草"），STATUS / HEALTH 都标"已进 CI"但实际全跑不过 |
| **集成测试（真 DB）** | ❌ route.test.ts 都 mock prisma，无真 DB 起的端到端 |
| **Migration 测试** | ❌ 无 reversibility / forward-compat 检查 |
| **性能回归（SSE 延迟 / 向量检索 p95）** | ❌ 无 benchmark suite |
| **并发场景（两 tab / 两 runner / Job race）** | ❌ Job claim 的 race 路径未测；多 tab 乐观锁只测 API 路径，未测 hook 状态机 |
| **Snapshot 测试** | 🟡 chapterStatus 有，其他无 |

**判定**：单测扎实但**对真实产品迭代而言三个致命缺口**：
1. 主状态机（`useChapterEditor.ts`）0 覆盖，**任何改动都没护栏**；
2. **E2E 全部失效** — 整个项目说"CI 跑得过"实际上等于没 E2E；
3. **没有真实端到端集成测试** — mock prisma 的 route 测能测正向逻辑，测不出"prisma 行为变化"、"事务隔离级别"、"并发"。

---

## 2. 已完成功能

### 2.1 主流程

| 模块 | 完成度 | 关键依据 |
|---|---:|---|
| Onboarding 5 步开书 | 80-88% | `app/(app)/new/page.tsx` 347 行 + `app/api/onboarding/sessions/**` 5 个 endpoint |
| 多章节编辑器 | 85-90% | `useChapterEditor.ts:896` + `EditorClient.tsx:424` + 11 个子面板 |
| 项目层 8 个独立页 | 已完成 | `novels/[id]/{page,characters,world,outline,chapters,relationships,history,export}` |
| 工作台 Dashboard | 部分完成 | `dashboard/page.tsx:358`；"系统可用性 24 段绿条"是装饰渲染（line 308-318） |
| 4 格式导出（md/txt/docx/epub） | 90% | `lib/export/formatNovel.ts` + 独立导出中心页 |

### 2.2 基础设施

| 模块 | 完成度 | 关键依据 |
|---|---:|---|
| LLM 客户端（SSE / 用量 / 配额 / AES / SSRF / DB-env fallback） | 78-85% | `lib/llm/client.ts:459` |
| Embedding 客户端 + 严格 1024 维 | 80-85% | `lib/llm/embeddings.ts` |
| pgvector RAG + HNSW + 混合检索 + 命中可视化 | 65-75% | `lib/agent/retrieval.ts:138` |
| 分层摘要 + dirty 标脏 + 批刷端点 | 75-82% | `lib/agent/summaries.ts:155` |
| 后台 Job queue + JobsBadge + 单 job retry | 基本完成 | `lib/jobs/queue.ts:144` |
| DB-驱动 admin 权限 + env 永久兜底 | 80-85% | `lib/auth/admin.ts:88` + `UserRole` 表 |
| 内容审核（关键词 + LLM + failure mode） | 70-78% | `lib/moderation/moderate.ts` |
| 章节乐观锁 + 409 + 横幅 | 半闭环 | `expected_version` 仍 `.optional()` |
| SSE 中断续传 | 半闭环 | `lib/agent/draftSession.ts:240`，无 stale-streaming 超时 |
| Prometheus metrics 端点 | 已完成 | `app/api/metrics/route.ts` |
| 生产 security headers baseline | 已完成 | `next.config.ts`（CSP 暂缺） |

### 2.3 工程品质

- 零 `any` / `@ts-ignore` / `eslint-disable`（实测 0 命中）
- 零 TODO / FIXME / HACK（实测 0 命中）
- Zod 单一来源（`lib/validation/schemas.ts:338`）
- 事务化关键写入：章节 PATCH + version + pruning + 自增；version restore；finalize
- 统一响应：`jsonOk` / `jsonError` 全仓 35 route 一致
- DB-then-env fallback 三处统一（admin / LLM / Embedding），500ms 超时
- SSE 重试谨慎：首 delta 后拒绝重试
- failure-mode 显式化（生产默认 block）

---

## 3. 未完成任务

按四维度归类，每条都注明"为什么对真实产品而言必须做"：

### 3.1 闭环缺口（主流程半闭环）

| 项 | 闭环缺口 | 为什么真实产品必须 |
|---|---|---|
| **DraftSession 状态机不完整** | 函数超时被杀 → 永远 `streaming` | 长篇用户 5K-10K 字章节 SSE > 60s 是常见的；目前每次超时都留垃圾行 + 误导用户 resume |
| **state diff 自动生成 silent fail** | `useChapterEditor.ts:165` 空 catch | 标完成后用户不知道 Bible 状态有没有更新；下一章读到的 Bible 可能过期 |
| **Job in-flight Serverless 重启** | 卡死 `running` | Vercel 函数定期重启 + 长摘要任务 = 失败率不低；用户 JobsBadge 看不到 stuck 任务 |
| **expected_version 可选** | 不传绕过乐观锁 | 任何脚本 / curl / 旧版前端写入都不检测冲突；多端写作直接覆盖 |
| **Bible PATCH 无 moderation** | 绕过审核 | 角色 / 世界观 / 大纲都会拼进 chapter prompt，违规内容会直接污染下游 |
| **Output moderation 滞后** | 违规已显示在客户端 | 真实场景 = 合规事故 |
| **冲突"暂不处理"无限 409** | hook 不更新 `chapterVersion` | 用户被迫强制刷新页面 |
| **Onboarding step 4 刷新丢失** | state 回 step 1 | 真实用户刷新 / 切 tab 概率高 |

### 3.2 可控性缺口（AI 功能不够透明 / 不够可干预）

| 项 | 缺口 | 为什么真实产品必须 |
|---|---|---|
| Critic 失败被关闭后丢失 | 只在 panel 内 | 写作者关掉 panel 就忘了有警告 |
| 每次调用成本不即时可见 | 月度聚合在 dashboard | 写作者无法 budget 每章 AI 投入 |
| Critic / State Diff / Summarize cost 不分 agent | 全部混在 LlmUsage 总和 | 用户无法判断哪个 agent 在烧钱 |
| 用户无法选模型 / 看 prompt | admin-only 配置 | 真实 power user 会要 deepseek-r1 / 看到 prompt 调微调；不给则停留 demo 感 |
| Prompt 注入无防护 | Bible 字段直接拼 prompt | 攻击 / 误操作可改 AI 行为；产品上线必须有 |
| 无"反馈微调"机制 | 只能整体丢弃重起草 | 真实写作场景：写者会说"再保守点" / "把张三的口吻改严肃"；当前只能整体重来 |

### 3.3 错误处理缺口（生产期失败模式）

| 项 | 缺口 | 为什么真实产品必须 |
|---|---|---|
| **stale-streaming 超时** | DraftSession 无 TTL | 见 §3.1 |
| **stale-running Job 超时** | Job 无 max-running 限制 | 见 §3.1 |
| **DraftSession 孤儿行** | 切走不回来永远残留 | DB 体积无限增长 |
| **两端同章同时起草** | upsert 互斥 race | 数据 mix 概率低但真实 |
| **MemoryChunk 索引失败哪一段** | Job 表只留笼统错误 | 长篇用户必须能定位失败章 |
| **`ChapterDraft.content` 80,000 上限无 UI 提醒** | 用户写到上限被 schema 直接拒 | 体验断崖 |
| **`/api/metrics` 无限流** | bearer token 泄漏后无防护 | 已是 admin 攻击面 |
| **`/draft/resume` 无限流** | 客户端可无限 poll | DDoS 攻击面 |

### 3.4 测试缺口（无法支撑后续迭代）

| 项 | 缺口 | 为什么真实产品必须 |
|---|---|---|
| **E2E 5 spec 全失效** | 按钮文案不匹配 | 主链路零回归保护；声称"已 CI"等于撒谎 |
| **`useChapterEditor.ts` 0 覆盖** | 896 行单 hook | 编辑器是日均写入最多的代码，任何改都需要护栏 |
| **无真实 DB 集成测试** | route.test.ts 全 mock prisma | prisma 行为 / 事务 / 并发都没回归 |
| **无 Migration 测试** | 无 reversibility | 部署前一次性人工验证；上线频繁后必出事故 |
| **无 Job race / 多 runner 测试** | claim 路径未测 | 加 cron 后会立刻出问题 |
| **无 SSE 流端到端测试** | start → delta → drop → resume 链路 | 是产品最核心的体验，0 自动化 |
| **无性能回归** | SSE p95 / 向量检索 p95 | 长篇用户成本敏感，慢就是失败 |

### 3.5 文档与代码不一致（影响接手判断）

| 项 | 文档 | 实际 |
|---|---|---|
| E2E 已进 CI | STATUS / HEALTH ✅ | 5 spec 全部按钮文案与 UI 不符 |
| 测试数 | HEALTH 称 394，STATUS 称 489，README 称 299 | 实测 489 |
| 乐观锁 | "已完成" | `expected_version` 可选 |
| i18n 技术栈 | README 写 next-intl | 已拆除 |
| UX3 SSE 续传 | HEALTH §三 列遗留 | 已实现 |
| `useChapterEditor` 行数 | HEALTH 称 799/828 | 实测 896 |
| 动态路由数 | STATUS 称 31 | 实际 36 |
| `LlmGeneration` 新表 | IMPLEMENTATION_TASKS 计划 | 没建（复用 LlmUsage） |

---

## 4. 代码质量问题

### 4.1 主流程闭环问题

| 严重度 | 问题 | 位置 | 影响 |
|---|---|---|---|
| **Critical** | DraftSession 无 stale-streaming TTL | `lib/agent/draftSession.ts` + `chapters/draft/route.ts` | SSE 函数超时被杀后状态永久 streaming |
| **Critical** | Job 无 stale-running 超时 | `lib/jobs/queue.ts:127` | in-flight job Serverless 重启后永远 running |
| **High** | State diff 自动生成 silent fail | `useChapterEditor.ts:165` | 用户不知道 Bible 是否过期 |
| **High** | `expected_version` 可选绕过乐观锁 | `lib/validation/schemas.ts:305` | 多端写作覆盖 |
| **High** | Bible PATCH 无 moderation | `app/api/novels/[id]/bible/route.ts` | 违规内容污染下游 prompt |
| **High** | Output moderation 滞后于 SSE 发送 | `chapters/draft/route.ts:204` | 违规 deltas 已到客户端 |
| **High** | 冲突"暂不处理"再保存无限 409 | `useChapterEditor.ts:713-715` | 用户被迫刷新 |
| **Medium** | DraftSession 两端同章 race | `draftSession.ts:34-61` upsert | 数据 mix（低概率） |
| **Medium** | Onboarding step 4 刷新丢失 | `app/(app)/new/page.tsx` | UX 断裂 |

### 4.2 AI 可控性问题

| 严重度 | 问题 | 位置 | 影响 |
|---|---|---|---|
| **High** | Prompt 注入无防护 | `lib/llm/prompts/chapter.ts` 拼 Bible 字段 | Bible 字段可改 AI 行为 |
| **Medium** | Critic 失败被关闭后丢失 | `CandidatePanel.tsx` 错误只在 panel | 警告丢失 |
| **Medium** | 每次调用成本不即时可见 | 编辑器顶栏只显示草稿状态 | 写者无法 budget |
| **Medium** | Critic / State Diff / Summarize cost 不分 agent 汇总 | `LlmUsage` aggregate 在 dashboard | 烧钱不透明 |
| **Medium** | 无"反馈微调"机制 | 候选稿只能丢弃 | 与真实写作流脱节 |
| **Low** | 用户不可选模型 / 不可见 prompt | admin-only | power user 受限 |

### 4.3 错误处理问题

| 严重度 | 问题 | 位置 | 影响 |
|---|---|---|---|
| **High** | `/api/metrics` 无限流 | `app/api/metrics/route.ts` | token 泄漏后无防护 |
| **High** | `/draft/resume` GET 无限流 | `chapters/draft/resume/route.ts:30` | 无限 poll 拖 DB |
| **Medium** | MemoryChunk 索引失败具体段落不可见 | `lib/jobs/handlers.ts` + UI | 长篇用户无法定位 |
| **Medium** | 章节 80K 字上限无 UI 提醒 | `EditorClient.tsx` | 断崖体验 |
| **Medium** | Draft route input moderation 在 quota 之后 | `chapters/draft/route.ts:73-98` | 违规请求烧 token |
| **Low** | Dashboard "100% Online" 硬编码 | `dashboard/page.tsx:308-318` | 误导（与错误处理无关但损害"真实感"）|

### 4.4 测试问题

| 严重度 | 问题 | 位置 | 影响 |
|---|---|---|---|
| **Critical** | E2E 5 spec 按钮文案全失效 | `tests/e2e/**` | 主链路回归零保护 |
| **Critical** | `useChapterEditor.ts` 896 行 0% 覆盖 | 编辑器主 hook | 编辑器任何改动无护栏 |
| **High** | 无真 DB 集成测试 | 全部 route.test.ts mock prisma | prisma 行为变化不可见 |
| **High** | 无 Job race / cron 测试 | `lib/jobs/queue.ts` | 加 drainer 必出问题 |
| **High** | 无 SSE 流端到端测试 | draft / bible / resume 链路 | 最核心体验 0 自动化 |
| **Medium** | 无 Migration reversibility | `prisma/migrations/` | 部署事故源 |
| **Medium** | 无性能回归 | benchmark 缺失 | SSE 延迟回归不可见 |

### 4.5 文档与组织问题

| 严重度 | 问题 | 影响 |
|---|---|---|
| **High** | 三份文档（STATUS / HEALTH / README）数字 / 状态不一致 | 接手判断错乱 |
| **Medium** | `useChapterEditor.ts` 单文件 896 行 | 维护风险 |
| **Medium** | `dashboard/page.tsx` 单文件 358 行 + 内联 SVG | 维护困难 |
| **Low** | `BibleEditorPanel` 双入口 | 一份逻辑两处维护 |
| **Low** | inline SVG path 重复 | 改图标 grep |
| **Low** | `console.warn` 无结构化 | 生产检索不便 |

### 4.6 优点（保留）

- 零类型逃逸（实测）
- 零 TODO / FIXME / HACK（实测）
- Zod 全链路单一来源
- 事务化关键写入
- 统一响应封装
- DB-then-env fallback 三处统一
- SSE 重试谨慎
- failure-mode 显式化
- AES + SSRF 严谨

---

## 5. 上线风险

按"真实产品"标准重新评级。降级了若干 "Demo 风险但产品 OK" 的项目，升级了"长生命周期"风险。

### 5.1 主流程闭环风险

| 风险 | 严重 | 触发 | 处理 |
|---|---|---|---|
| DraftSession 永久 streaming | **High** | SSE 函数超时被杀 | TTL + 启动时扫 stale 转 failed |
| Job 永久 running | **High** | Serverless 重启 | started_at > 5min 自动 reset 到 pending |
| State diff silent fail | **High** | 标完成时 LLM 失败 | 加 banner + retry |
| 乐观锁绕过 | **High** | 不传 expected_version | 强制必传 |
| Bible 违规内容 | **High** | 直接 PATCH | 加 moderation |
| Output moderation 滞后 | **High** | 模型输出违规 | 段落级实时 + 关键词预筛 |
| 冲突无限循环 | **Medium** | 暂不处理后再保存 | hook 接受 409 时更新 chapterVersion |

### 5.2 AI 可控性风险

| 风险 | 严重 | 触发 | 处理 |
|---|---|---|---|
| Prompt 注入 | **Medium** | 用户 Bible 写指令 | sanitize / 角色 / 分隔符策略 |
| 成本失控 | **Medium** | 用户不知道单次开销 | 编辑器顶栏即时显示本章累计 |
| 失败被吞 | **Medium** | critic / state diff 静默 | 持久化错误展示 |

### 5.3 错误场景风险

| 风险 | 严重 | 触发 | 处理 |
|---|---|---|---|
| `/api/metrics` 滥用 | **High** | token 泄漏 | IP 限流 |
| `/draft/resume` 滥用 | **Medium** | 轮询 | 限流 |
| RLS 禁用 | **Medium** | 任何 route 漏调 ownership | grep / ESLint 自写 rule |
| pgvector 1024 维硬绑 | **Medium** | 换模型 | 单独迁移脚本（已记决策） |
| 章节 80K 字上限 | **Low** | 长章节触顶 | UI 提醒 |

### 5.4 数据风险

| 风险 | 严重 | 触发 | 处理 |
|---|---|---|---|
| DraftSession 孤儿堆积 | **Medium** | 用户切走不回 | 30 天 TTL cron |
| MemoryChunk 失败索引隐性 | **Medium** | EdgeFn 不稳 | failed 状态 + 具体段落定位 |

### 5.5 测试风险（影响后续迭代）

| 风险 | 严重 | 触发 | 处理 |
|---|---|---|---|
| E2E 全失效 | **Critical** | 任何 PR | 修文案 + nightly 跑 |
| 编辑器 hook 0 覆盖 | **Critical** | 任何编辑器改动 | 拆 + jsdom + RTL |
| 无真 DB 集成 | **High** | prisma 升级 / 事务隔离改 | testcontainers + 真 pgvector |
| 无 SSE 端到端 | **High** | draft 链路改 | playwright 跑 mock SSE 全链路 |

### 5.6 部署风险

| 风险 | 严重 | 触发 | 处理 |
|---|---|---|---|
| CSP 未启用 | **Medium** | XSS 仍可注入 | Nonce middleware |
| Vercel 函数超时 60s | **Medium** | 长章节 SSE | 用 streaming response + Edge Runtime 评估 |
| 无 Sentry / 告警 | **Medium** | 错误不可观测 | Sentry 接入 + Grafana alert |

---

## 6. P0 / P1 / P2 / P3 任务列表

> 重新按"真实可用产品"标准排序。**P0 = 不修则失败路径裸跑 / CI 不可信 / 主流程半闭环；P1 = 影响真实长期使用；P2 = 完善体验和工程；P3 = 锦上添花**

### P0（必做，**1-2 周**）— 关闭半闭环 + 让 CI 可信

| # | 任务 | 维度 | 模块 | 复杂度 |
|---|---|---|---|---|
| P0-1 | 修 5 个 E2E spec 按钮文案 + 候选稿断言，跑通后 nightly | 测试 | tests/e2e | S |
| P0-2 | STATUS / HEALTH / README 三方文档对账，建 `scripts/docs-check.ts` 入 verify hook | 文档 | docs | S |
| P0-3 | `expected_version` 强制必传（去 `.optional()`） | 闭环 | schema + hook | S |
| P0-4 | Bible PATCH 加 `moderateContent`（与章节路径一致） | 闭环 | bible route | S |
| P0-5 | **DraftSession 加 stale-streaming TTL**（启动扫 + 单条写入时检测 5 分钟前 streaming → 转 failed） | 闭环 + 错误 | draft + resume route | M |
| P0-6 | **Job 加 stale-running 超时**（started_at > 5min 自动 reset，supplant 单 job retry API） | 闭环 + 错误 | jobs queue | M |
| P0-7 | **State diff 自动生成失败可见** + 手动重试 | 闭环 + AI 可控 | useChapterEditor | S |
| P0-8 | Output moderation 改段落级 / 关键词预筛先行 | 闭环 + AI 可控 | draft route | M |
| P0-9 | 冲突"暂不处理"再保存修正（接受 409 时刷新 chapterVersion） | 闭环 | useChapterEditor | S |
| P0-10 | Draft input moderation 移到 quota check 之前 | 错误 | draft route | S |
| P0-11 | `/draft/resume` 加 rate limit | 错误 | resume route | S |

### P1（核心，**2-4 周**）— 长期使用支撑

| # | 任务 | 维度 | 模块 | 复杂度 |
|---|---|---|---|---|
| P1-1 | `useChapterEditor.ts` 拆 4 子 hook（save / draft / version / conflict）+ jsdom + RTL 行为级测试 | 测试 + 闭环 | editor | L |
| P1-2 | 补 4 个 E2E：`version-restore` / `draft-resume` / `beat-to-draft` / `multi-tab-conflict` | 测试 | tests/e2e | M |
| P1-3 | SSE 流端到端集成测试（mock LLM + 真 DB testcontainers） | 测试 | tests/integration | L |
| P1-4 | Prompt 注入防护（Bible 字段加 sanitize / 分隔符策略） | AI 可控 | prompts/chapter | M |
| P1-5 | 编辑器顶栏即时显示本章 AI 累计 cost（含 critic / state diff / summarize） | AI 可控 | editor + dashboard | M |
| P1-6 | Critic 失败持久化 + 重试 | AI 可控 | useChapterEditor | S |
| P1-7 | Onboarding step 4 中断恢复（localStorage + session 状态） | 闭环 | onboarding | M |
| P1-8 | `/api/metrics` 加 IP 限流 | 错误 | metrics route | S |
| P1-9 | DraftSession 30 天 TTL cron | 错误 + 数据 | jobs | S |
| P1-10 | MemoryChunk 索引失败精确到段落 + UI 定位 | 错误 + AI 可控 | jobs/handlers + chapters page | M |
| P1-11 | 章节 80K 字上限 UI 提醒（接近 95% 时 banner） | 错误 | editor | S |
| P1-12 | Dashboard 24 段绿条接 healthz 或删 | 错误 + 文档诚实 | dashboard | S |
| P1-13 | Sentry / Grafana alert 接入 | 错误 + 可观测 | observability | M |

### P2（重要优化，**1-2 个月**）

| # | 任务 | 维度 | 复杂度 |
|---|---|---|---|
| P2-1 | CSP with nonce middleware | 部署 | M |
| P2-2 | "反馈微调"机制：候选稿 + 用户 prompt 微调而非整体重起草 | AI 可控 | L |
| P2-3 | 候选稿 vs 正文 diff 入正式 E2E（功能已实现） | 测试 | S |
| P2-4 | 导出 range / include_bible 参数 + ExportMenu 跳导出中心 | 闭环 | M |
| P2-5 | retrieval 召回评估 fixture + 跑分脚本 + 阈值 | AI 可控 + 测试 | L |
| P2-6 | 性能回归 baseline（SSE p95 / 向量检索 p95） | 测试 | M |
| P2-7 | Migration reversibility 检查 | 测试 | M |
| P2-8 | Dashboard / detail page 抽组件 + icons 抽公共 | 组织 | S |
| P2-9 | 结构化 logger（替代裸 console.warn） | 可观测 | M |
| P2-10 | Job race / 并发 claim 测试 | 测试 | M |
| P2-11 | `BibleEditorPanel` 定义只读快速查看 or 移除 | 组织 | S |

### P3（后续）

| # | 任务 | 维度 | 复杂度 |
|---|---|---|---|
| P3-1 | i18n 决策：彻底锁中文 or 真做多语言 | 全局 | XL |
| P3-2 | 用户可选模型 / 可见 prompt（power user） | AI 可控 | L |
| P3-3 | Job 审计 / role_changes 审计（多人前置） | 合规 | M |
| P3-4 | OpenTelemetry 接入 | 可观测 | L |
| P3-5 | 候选稿误丢弃 30s "撤销" toast | UX | S |

---

## 7. 下一阶段开发计划

### 第一阶段：关闭半闭环 + CI 信号可信（1-2 周）

目标：**让"已完成"的承诺真实，让 CI 信号可信，让长生命周期失败可恢复**。

| 任务组 | 目标 | 验收 |
|---|---|---|
| P0-1, P0-2 | CI + 文档诚实 | E2E 5 spec 全绿；STATUS/HEALTH/README 数字一致 |
| P0-3, P0-4, P0-7, P0-9 | 主流程闭环收敛 | 多端冲突闭环 / Bible 审核 / state diff 可见 |
| P0-5, P0-6 | 长生命周期失败回收 | DraftSession + Job 5min 后自动转 failed/pending |
| P0-8, P0-10, P0-11 | 关键错误路径收口 | output moderation 段落级；input moderation 提前；resume 限流 |

### 第二阶段：测试盲区消除 + AI 真实可控（2-4 周）

目标：**编辑器主状态机有护栏，AI 输出在长期使用中不会失控**。

| 任务组 | 目标 | 验收 |
|---|---|---|
| P1-1 | 编辑器 hook 拆 + jsdom + RTL | 单测覆盖 ≥ 70%；单文件 ≤ 300 行 |
| P1-2, P1-3 | E2E 补全 + 真 DB 集成 | 4 个新 E2E 全绿；testcontainers 跑通 |
| P1-4, P1-6 | AI 可控性收紧 | Prompt 注入防护 + critic 错误持久化 |
| P1-5 | 成本透明 | 编辑器顶栏即时显示本章 cost |
| P1-7 | Onboarding 中断恢复 | step 4 刷新可恢复 |
| P1-8, P1-9, P1-10, P1-11 | 长尾错误处理 | 限流 / TTL / 索引失败定位 / 上限提醒 |
| P1-12, P1-13 | 监控可观测可告警 | dashboard 真实；Sentry 接入 |

### 第三阶段：体验完善 + 工程化收尾（1-2 个月）

目标：**进入真实可对外发布水平**。

| 任务组 | 目标 | 验收 |
|---|---|---|
| P2-1 | CSP enforced | 无 unsafe-inline |
| P2-2 | 反馈微调机制 | 候选稿可在用户 prompt 引导下迭代 |
| P2-3, P2-4 | 已完成功能补回归 | E2E 覆盖 diff / export range |
| P2-5, P2-6, P2-7 | 质量回归 baseline | retrieval 跑分 + SSE p95 + migration check |
| P2-8 ~ P2-11 | 工程化收尾 | 组件拆分 / logger / Job race 测 / 死代码清理 |

---

## 8. 验收标准

### 8.1 第一阶段验收（"CI 可信 + 主流程闭环"）

闭环：
- [ ] `expected_version` 不传时 PATCH 返回 400 INVALID_INPUT
- [ ] Bible PATCH 违规内容返回 400 MODERATION_BLOCKED（与章节路径一致的错误码）
- [ ] DraftSession `streaming` 状态超过 5 分钟无 update 时被自动转为 failed（单测覆盖）
- [ ] Job `running` 状态 started_at > 5min 时被自动 reset 到 pending（单测覆盖）
- [ ] state diff 自动生成失败时编辑器顶栏显示提示 + 手动重试按钮
- [ ] Output moderation 在违规段落到达客户端**之前**触发（段落级或关键词预筛单测覆盖）
- [ ] 收到 409 后再次保存：hook 已用新 version，要么 409 重复要么直接成功，**不会无限 409**

错误：
- [ ] draft route 违规 input 不进 LLM（quota 之前 reject 单测）
- [ ] `/draft/resume` GET 命中 RATE_LIMITED 单测覆盖

测试 + 文档：
- [ ] `LLM_MOCK=1 npx playwright test` 5 spec 全绿（fix 后）
- [ ] STATUS / HEALTH / README 实测数字一致；README 删 i18n；HEALTH §三删 "UX3 续传"
- [ ] `scripts/docs-check.ts` 接入 verify hook，文档漂移自动报错

### 8.2 第二阶段验收（"编辑器有护栏 + AI 真实可控"）

测试：
- [ ] `useChapterEditor.ts` 拆分后单文件 ≤ 300 行
- [ ] 编辑器主路径（save / draft / version / conflict / resume）单测覆盖率 ≥ 70%
- [ ] `version-restore` / `draft-resume` / `beat-to-draft` / `multi-tab-conflict` E2E 全绿
- [ ] testcontainers 真 PG + pgvector 跑通至少 5 个集成测试

AI 可控：
- [ ] Bible 字段中插入 `"Ignore previous instructions"` 时被 sanitize（单测验证不影响生成）
- [ ] 编辑器顶栏显示本章累计 cost（含所有 agent）
- [ ] critic 失败错误持久化到 ChapterDraft 或独立表，关闭 panel 后再开仍可见 + 手动重试

闭环 + UX：
- [ ] Onboarding step 4 SSE 中刷新可恢复到 step 4（不回 step 1）
- [ ] 章节字数到 76,000（95%）时编辑器顶栏出现 banner
- [ ] MemoryChunk 索引失败时 chapters 管理页能定位到具体章节

错误 + 监控：
- [ ] `/api/metrics` 命中 IP RATE_LIMITED 单测覆盖
- [ ] DraftSession 30 天前残留行被 cron 清理（单测覆盖）
- [ ] Sentry 接入并捕获至少一次真实异常
- [ ] Grafana alert 在 quota 接近 / fail rate > 5% / SSE p95 > 8s 时触发

### 8.3 第三阶段验收（"准备发布"）

- [ ] CSP enforced（无 unsafe-inline，hydration 正常）
- [ ] "反馈微调"机制可用：用户在候选稿基础上输入文字反馈 → 重新生成（保留对话）
- [ ] 导出中心支持 `range=1-10` 与 `include_bible=true`
- [ ] retrieval 黄金 fixture 跑分脚本独立可跑且接入 CI 警报
- [ ] SSE p95 < 8s baseline，回归 > 15% 时 CI fail
- [ ] Migration reversibility 检查脚本入 CI
- [ ] dashboard / detail page 各 ≤ 200 行
- [ ] `npm run lint` 全绿 + 全仓裸 `console.*` ≤ 5 处

---

## 9. 给开发者的执行建议

### 9.1 评判尺度

把"真实可用产品"翻译为 4 个可观察的硬指标：

1. **主流程任何节点失败用户都能感知** — 没有 `catch {}` 空 handler；长生命周期状态有 TTL 兜底
2. **AI 每次行为用户都能复盘** — 成本即时可见；失败持久化；输入 / 输出可追溯
3. **生产期错误能自愈** — Serverless 重启 / 函数超时 / DB 短暂不可达不会留垃圾状态
4. **任何修改都能被测试捕获** — 编辑器主 hook 有护栏；E2E 真的跑过；关键并发场景有覆盖

P0 全部围绕这 4 条。P1 把"长期使用"的隐性问题补上。P2 才进体验 / 工程化。

### 9.2 执行顺序（强制）

**不要并行 P0**。按顺序：

1. **Day 1**：跑 `LLM_MOCK=1 npx playwright test`，亲眼看到 5 个 spec 跑不过。修文案 + 候选稿断言，全部转绿。这是最便宜也最高 ROI 的动作 — 让 CI 不再撒谎。
2. **Day 2-3**：STATUS / HEALTH / README 三方对账 + `scripts/docs-check.ts` 入 verify hook。一次性把"已完成"的承诺校准到真实。
3. **Day 4-5**：P0-3 / P0-4 / P0-9 / P0-10 / P0-11 — 都是 S 复杂度的硬补丁，一起一个 phase 发出。
4. **Week 2**：P0-5 / P0-6 / P0-7 / P0-8 — 长生命周期状态收口（DraftSession TTL / Job stale-running / state diff 可见 / output moderation 段落级）。这是 4 个 M 复杂度任务，但都是闭环类，**做完 P0 = 主流程真的闭环了**。

**Week 2 后才能动 P1**。

### 9.3 不要做的事

- **不要在 P0 没扫光时碰任何 P1 / P2**。零散补丁会让债务更难还。
- **不要在 `useChapterEditor.ts` 上做小修小补**。要么不动，要么按 P1-1 整体拆分。
- **不要试图给 Dashboard "100% Online" 编一个数据源**。直接接 healthz 或删。
- **不要再写 inline 测试数 / 路由数到 README**。已经被坑过 3 次。
- **不要先做 i18n / 多人协作 / 计费**。STATUS 已显式暂缓，立场不变。
- **不要把 prompt 注入防护推到 "after 多人协作"**。Bible 字段直接拼 prompt，单人产品也会被滥用。

### 9.4 用现有 GSD 工具的建议

- **P0 任务**：除 P0-5 / P0-6 / P0-8 之外都 S，可用 `/gsd-fast` 或 `/gsd-quick`
- **P0-5 / P0-6（长生命周期 TTL）**：必走 `/gsd-plan-phase`（涉及 schema / cron / 部署）
- **P0-8（output moderation 段落级）**：必走 `/gsd-plan-phase`（涉及 SSE 协议 + moderation 时序）
- **P1-1（编辑器拆分）**：走 `/gsd-plan-phase`，单独 phase
- **P1-3（真 DB 集成测试）**：走 `/gsd-plan-phase`，testcontainers 配置一次到位
- **P1-4（Prompt 注入防护）**：走 `/gsd-plan-phase` + 加 `/gsd-secure-phase` 复审

### 9.5 总体判断

底层工程素养在 MVP 级项目里极其稀缺：零 any / 强 Zod / SSRF / AES / fallback / 事务化都到位。

但**评判尺度从 demo 切到真实产品后，3 类问题立刻浮现**：

1. **半闭环路径**（state diff silent / DraftSession 永久 streaming / Job 永久 running / 冲突无限 409 / output moderation 滞后）— 都是 demo 跑不到的失败模式，生产期会持续暴露
2. **AI 可控性的"长期使用"缺口**（成本不即时 / 失败被吞 / Prompt 注入 / 无反馈微调）— 短期 demo 看不出，写者用一周就感受到
3. **测试盲区**（编辑器 hook 0 覆盖 + E2E 全失效 + 无真 DB 集成）— 不修则**任何后续迭代都在裸奔**

P0 全部围绕这三类。**不需要重新设计、不需要补底层、不需要换技术栈** — 只需要把"已完成"的承诺真实补完。1-2 周能扫光 P0，2-4 周完成 P1，之后这个项目可以认真考虑发布。

---

## 附录：审阅时实测数据

```
$ npm run test
Test Files  68 passed (68)
     Tests  489 passed (489)
   Duration 9.12s

$ wc -l app/(app)/editor/[novelId]/useChapterEditor.ts
896

$ grep -rn "全文起草\|全文续写" app/ tests/
app/(app)/editor/[novelId]/AIPanel.tsx:99: label="全文起草"
tests/e2e/editor-candidate.spec.ts:46/63/83: "全文续写"
tests/e2e/editor-failure.spec.ts:20: "全文续写"

$ grep -rn "any\b\|@ts-ignore\|TODO\|FIXME" app/ lib/ components/ | grep -v test.ts
# 0 命中

$ grep -n "catch {" app/(app)/editor/[novelId]/useChapterEditor.ts
165: } catch {  # state diff auto-generation silent fail

$ grep -n "optional" lib/validation/schemas.ts | grep expected_version
305: expected_version: z.number().int().min(0).optional(),
```

```
git log --oneline -3
44161d3 feat(editor): UX3 resumable SSE chapter drafts
f17337d feat(bible): F-04 relationship graph edit mode
b51bf97 feat(bible): F-04 read-only character relationship graph
```
