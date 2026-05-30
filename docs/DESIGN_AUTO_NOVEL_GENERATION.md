# 设计方案：全自动整本小说生成（Auto-Pilot）

> 状态：M1-M2 已实现并真机验证、M3（质量门 + needs_review + 成本兜底）代码完成且测试绿；实现进度与任务清单见 `docs/IMPL_AUTO_NOVEL_GENERATION_M1-M3.md`。本文为原始设计草案。
> 日期：2026-05-29
> 目标读者：项目owner（自用）
> 关联：`docs/SPRINT_AI_QUALITY_2026-05-29.md`（本方案的前置质量护栏）

---

## 一、目标与范围

**一句话**：用户只确定主题/题材/基调等关键信息 → 系统**无人值守**生成整本小说（规划大纲 → 逐章起草 → 自评 → 自修 → 质量门 → 落库），全程不需要手工点"接受/继续"。

**本期目标（MVP）**：
- 一次配置，后台把一本 N 章（先支持 20-40 章，逐步放到 80）的小说从头跑到尾，自动落库。
- 每章经过 critic → revise 自修与质量阈值门；低于阈值自动重修，重修仍不达标才**挂起待人工**（可配置）。
- 可暂停 / 恢复 / 取消；进程被杀也能断点续跑。
- 有成本上限与进度可见。

**明确不做（本期）**：
- 实时流式给前端看每个字（自动模式是后台任务，不是编辑器 SSE）。
- 多本并行批量生产。
- 角色立绘 / 配图 / 多模型投票。

---

## 二、现状与差距（基于真实代码）

### 已经具备
| 能力 | 位置 | 说明 |
|---|---|---|
| 完整 agent 链 | `lib/llm/prompts/*` + 各 route | Writer / Critic / Reviser / StateUpdater / Retrieval |
| **无人循环原型** | `scripts/eval-novel-quality.ts` `generateSeries` / matrix `reviseSeries` | 已跑通"逐章：起草→critic→revise→state-diff→下一章"，只是没落库 |
| 后台任务系统 | `lib/jobs/queue.ts` + `scripts/jobs-worker.ts` | 长驻 worker（poll 2s / sweep 60s），原子认领、超时、重试、stale 回收 |
| **自动质量度量** | `lib/evals/novelQuality.ts` | 7 维评分 + 阈值，是无人值守的安全网（本次 sprint 产物）|
| 章节后处理 | `lib/jobs/handlers.ts` | `summarize_chapter` / `index_chapter` 已可在落库后异步跑 |
| 状态演进 | `buildStateDiffPrompt` + `applyStateDiff` | 每章后更新 bible 的 story_state |
| 检索 | `retrieveMemories(novelId, bible, idx, k)` | RAG v2 + MemoryFeedback |
| 审核 / 配额 | `moderateContent` / `checkQuota` | 输入输出审核、成本配额 |

### 关键差距
1. **生成与落库是分离的**：`draft` route 只**流式 + 写 DraftSession 缓冲**，章节正文落到 `ChapterDraft` 表是**前端"接受"后**才发生的。自动模式必须由编排层**自己落库**。
2. **没有生成类 job**：`JobType` 只有 `summarize_chapter / index_chapter / refresh_summaries`，没有 draft/generate。章节生成现在绑在 HTTP SSE 请求里（120s LLM 超时）。
3. **没有整本编排**：没有"规划大纲 → 逐章循环 → 质量门 → 断点续跑"的驱动器。
4. **大纲覆盖有限**：`bible.outline.volume_1.chapters` 只到种子规划的章数（如 8）；整本需要前置全大纲或分卷规划。
5. **没有无人失败策略**：超时 / 审核拦截 / 限流 / JSON 解析失败目前靠人看着重试。

---

## 三、架构总览

### 核心决策：自链式"每章一个 job"

worker 对每个 job 有超时上限（`getJobTypeConfig`，默认 120s、最大 ~180s）。**整本不能塞进一个 job**（会被超时杀掉，且一处失败毁全程）。

→ 采用**自链式**：`generate_chapter` job 只处理**一章**（起草→critic→revise→质量门→落库→排后处理 job），完成后**入队下一章的 job**，直到最后一章。

好处：
- 每个 job 时长可控（一章 ≈ 1-3 分钟，落在超时内）。
- **天然断点续跑**：每章是独立 job，失败按 job `attempts` 重试；worker 被杀，`sweepStaleRunningJobs` 回收；恢复时从 `current_chapter` 续。
- 复用现有 worker / 认领 / 重试 / stale 回收，**几乎不改 job 基础设施**。

```
[用户配置] → POST /auto-generate
    │
    ├─ 创建 NovelGenerationRun(status=planning)
    ├─ plan_outline job  ← 生成/补全全大纲到 bible
    │       └─ 完成后入队 generate_chapter(1)
    │
    └─ generate_chapter(N)  ←─────────────┐
          1. 读 run；若 paused/cancelled → 停
          2. 起草（buildChapterContext+Prompt+stream/chat）
          3. critic → revise（≤R 轮）
          4. 质量门（evaluateNovelQuality 滑窗）
          5. 落库 ChapterDraft(N, status=done)
          6. state-diff 更新 bible
          7. 入队 summarize_chapter(N) + index_chapter(N)
          8. 更新 run 进度 / 成本
          9. 达标 & N<total → 入队 generate_chapter(N+1) ──┘
             不达标且策略=pause → run.status=needs_review，停
             N==total → run.status=completed
```

### 复用清单（尽量不重写）
- **生成逻辑**：把 `scripts/eval-novel-quality.ts` 的 `generateSeries` / `reviseSeries` 提炼为共享模块 `lib/agent/chapterPipeline.ts`（headless 版：传 bible/chapters/idx → 返回 {content, critic, revised, stateDiff, qualityReport}），eval 脚本和自动 job **共用同一套**。这样 eval 测的就是线上真正跑的代码。
- **落库**：复用 `ChapterDraft` 表（`@@unique([novel_id, chapter_index])` 保证幂等 upsert）+ 现有 summarize/index job。
- **质量门**：`evaluateNovelQuality`，阈值取自 `docs/evals/baselines/`。
- **审核/配额/检索/state-diff**：原样复用。

---

## 四、数据模型

新增一张运行跟踪表（迁移）：

```prisma
model NovelGenerationRun {
  id              String   @id @default(uuid())
  novel_id        String
  user_id         String
  status          String   @default("planning")
  // planning | running | paused | needs_review | completed | failed | cancelled
  total_chapters  Int
  current_chapter Int      @default(0)   // 已完成到第几章
  revision_rounds Int      @default(1)   // 每章最多自修轮数
  quality_floor   Float    @default(85)  // 折百阈值，低于则判失败/挂起
  checkpoint_mode String   @default("on_fail") // none | per_volume | on_fail
  cost_cny_spent  Float    @default(0)
  cost_cap_cny    Float?                  // 成本硬上限，超则暂停
  config          Json                    // { model, target_words, ... }
  last_error      String?
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  @@index([novel_id])
  @@index([status])
}
```

新增 `JobType`：`"plan_outline" | "generate_chapter"`（在 `lib/jobs/queue.ts` 的 union、`JOB_TYPES`、`JOB_TYPE_CONFIG` 各加一项；`generate_chapter` 给更长 timeout，如 240s、`maxConcurrent: 1`，避免同本并发写 bible 竞争）。

job payload：`{ runId, novelId, chapterIndex }`。

> **轻量替代方案（可选）**：不建 `NovelGenerationRun` 表，把进度塞进一个 `generate_chapter` 链 + 用 `ChapterDraft.status`（planned/generating/done/needs_review）推断进度。省一张表，但暂停/成本/阈值等运行级状态没地方放。**建议建表**，自用也值。

---

## 五、核心子系统设计

### 5.1 大纲规划（plan_outline）
整本前置生成全局结构，保证长程一致：
- 新 prompt `buildOutlinePlanPrompt`：输入 profile + 现有 bible（meta/characters/world）+ 目标章数/卷数 → 输出每卷 arc + 每章 `{index, title, summary}`，写回 `bible.outline`。
- 章节级 beat sheet **不**全量预生成（太贵），改为 `generate_chapter` 内**即时**生成本章节拍（复用现有 beatSheet prompt）。
- 失败降级：大纲生成失败 → run.failed + last_error，不进入逐章。

### 5.2 单章流水线（headless `chapterPipeline`）
```
draft   = writer(buildChapterContext + buildChapterPrompt, policy)   // 复用 draft route 的上下文装配
clean   = cleanupWriterOutputWithReport(draft)                       // 记录清洗前 AI 签名命中
for r in 1..R:
    critic = runCritic(context, clean.text, isRevision=r>1, isMystery)
    if critic.consistent && no major/critical: break
    clean = cleanupWriterOutputWithReport(runRevision(context, clean.text, critic.issues))
quality = evaluateNovelQuality(滑窗[max(1,N-2)..N], bible, {rawCleanupHits})
```
- **审核**：复用 `moderateContent`（输出全文）；命中 → run 挂起 needs_review（不落库违规正文）。
- **沿用本次 sprint 成果**：critic 现在能抓 prose/logic（recall 100%），revise 命中 100%，所以无人自修是有效的，不是空转。

### 5.3 质量门（决定继续 / 重修 / 挂起）
```
if quality.折百 >= run.quality_floor:        → 落库，继续下一章
elif 已用满 R 轮自修:
     checkpoint_mode == "on_fail"|"per_volume" → run.needs_review（挂起，等人工）
     checkpoint_mode == "none"                 → 仍落库 + 标记 low_quality，继续（全自动激进档）
```
- 阈值来源：`docs/evals/baselines/` 的折百分（当前 fixture 87.5 / 真实玄幻 96）。建议 `quality_floor` 默认 85，可调。
- 也可加**维度级**硬门（如 `ai_voice < 6` 或 `logic < 7` 直接判不达标），比单看总分更敏感。

### 5.4 落库与后处理（幂等）
- `prisma.chapterDraft.upsert({ where: { novel_id_chapter_index }, ... status: "done" })` —— 幂等，重跑同一章覆盖而非重复。
- bible 经 `applyStateDiff` 更新后整体写回 `BibleDraft`。
- 入队现有 `summarize_chapter` + `index_chapter`（让 RAG / 摘要异步跟上，不阻塞下一章）。

### 5.5 断点续跑与失败策略
| 场景 | 处理 |
|---|---|
| worker 被杀（job 卡 running） | 现成 `sweepStaleRunningJobs`（5min TTL）回收为 pending，重跑该章 |
| 单章 LLM 超时/网络 | job `attempts` 自动重试（maxAttempts），用满 → run.failed + last_error |
| JSON 解析失败 | 复用本次 sprint 的 `extractFirstJsonObject` + state-diff 容错（保留旧 bible 继续）|
| 审核拦截 | run.needs_review，记录章节，等人工改提示或跳过 |
| 限流（429） | 章间 pacing（可配 `JOBS_WORKER_POLL_MS` / 章间 sleep）；client 已有 retry wrapper |
| 成本超 `cost_cap_cny` | run.paused，等人工确认加预算 |

### 5.6 成本与节流
- 开跑前用 `estimateLlmMessagesCostCny` × 章数 × (1+R+state-diff) 给**预估总成本**，让用户确认。
- 每章累加实际 `cost_cny` 到 run；超 `cost_cap_cny` 自动暂停。
- `generate_chapter` `maxConcurrent: 1`（同本串行，避免 bible 写竞争 + 控速）。

---

## 六、API 与 UI 接触面

**API**（新增 route，复用 ownership/rateLimit/quota 中间件）：
- `POST /api/novels/:id/auto-generate` → 校验 + 创建 run + 入队 `plan_outline` → 返回 runId。
- `POST /api/novels/:id/auto-generate/:action`（pause / resume / cancel）。
- `GET  /api/novels/:id/auto-generate` → run 状态、进度（current/total）、成本、needs_review 原因。

**UI**：
- "新建小说"向导末尾加开关：**「全自动生成整本」**（选章数、每章字数、自修轮数、质量阈值、成本上限、人工检查点模式）。
- 小说详情页加**生成进度面板**：进度条（N/total）、当前状态、累计成本、暂停/恢复/取消、needs_review 时列出待人工章节。
- 轮询 `GET /auto-generate`（worker 是后台进程，进度走 DB 轮询即可，不需要 SSE）。

---

## 七、人工检查点（从"半自动"渐进到"零干预"）

`checkpoint_mode` 三档，建议**初期 `on_fail`**，验证后转 `none`：
- `on_fail`（默认）：只在质量门连续不达标 / 审核拦截 / 成本超限时挂起，其余全自动。
- `per_volume`：每写完一卷暂停，等用户扫一眼再继续（适合长篇前期建立信心）。
- `none`：完全无人值守（验证充分后启用）。

---

## 八、分阶段交付（建议里程碑）

| 里程碑 | 内容 | 验收 |
|---|---|---|
| **M1** | 提炼 headless `chapterPipeline`（eval 脚本改用它，行为不变）；新增 `generate_chapter` job 跑**单章并落库** | 手动入队一个 job，DB 出现一章 done；eval 全绿 |
| **M2** | 自链式多章循环 + `NovelGenerationRun` + 断点续跑 | 配置 5 章，后台跑完落库；中途杀 worker 能续 |
| **M3** | 质量门 + 自修轮数 + needs_review 挂起 | 故意塞坏章节，门拦截并挂起 |
| **M4** | `plan_outline` 全大纲规划 | 只给主题，自动出 20 章大纲再逐章 |
| **M5** | API + 向导开关 + 进度面板 + 成本上限 | UI 一键起跑/暂停/恢复，成本可见 |
| **M6** | **全自动跑完整本** + long-form eval 调优 | 一本 20-40 章无人跑完，long-form 评分 ≥ 阈值 |

每个里程碑都配单测（job handler / pipeline / 质量门），并把 `chapterPipeline` 纳入现有 eval 回归门。

---

## 九、风险与缓解

| 风险 | 级别 | 缓解 |
|---|---|---|
| **长程一致性**（40-80 章漂移/重复/线索烂尾）| **高** | 全大纲规划 + state-diff + 分层摘要 + retrieval；long-form eval 量化；初期 `per_volume` 检查点；维度级硬门 |
| 成本失控 | 中 | 预估 + 硬上限 + 串行 |
| 审核反复挂起 | 中 | needs_review 聚合展示，支持"跳过本章/改提示重试" |
| bible 写竞争 | 低 | `generate_chapter` maxConcurrent=1（同本串行）|
| 自修与去 AI 味张力（Day 9 已发现：补因果会增 AI 味）| 低 | 质量门用滑窗综合分；必要时自修后再过一遍 cleanup |

---

## 十、待你拍板的决策点

1. **目标章数**：先支持到多少？（建议 MVP 20-40，跑稳再到 80）
2. **大纲策略**：前置全大纲（更稳，推荐）vs 分卷即时规划（更省 token）？
3. **人工检查点默认档**：`on_fail`（推荐）/ `per_volume` / `none`？
4. **质量阈值**：`quality_floor` 默认 85 折百？是否加维度级硬门（如 ai_voice≥6 / logic≥7）？
5. **运行表**：建 `NovelGenerationRun`（推荐）还是走轻量替代（复用 ChapterDraft.status）？
6. **范围确认**：先做 M1-M3（能后台跑完并落库 + 质量门）这一刀，还是一路做到 M6（含 UI）？

> 我的建议：先砍 **M1-M3** 一刀（纯后端：headless pipeline + 自链 job + 质量门 + 断点续跑），用脚本触发验证长程一致性是否成立——这是最大未知。M4-M6（大纲规划 + UI）等 M3 验证通过再做。
