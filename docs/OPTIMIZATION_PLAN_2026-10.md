# 墨境 AI Novel — 2026-10 优化周期技术实现方案

> 创建时间：2026-10-02
> 前置结论：项目「机制建设」已超前于「证据收集」。本周期目标不是新增机制，而是**打通真实长篇验证闭环，并让验证产物驱动质量门升级与架构债清理**。
> 范围：保护现场 → 真实连载验证 → LLM Judge 质量门 → 安全维护 → 中期架构债。
> 与 `docs/OPTIMIZATION_PLAN.md`（2026-05-27）的关系：该计划的功能项大多已交付，本文取代其作为当前周期的执行依据。

---

## 〇、总体判断与原则

**当前状态基线**（2026-10-02 实测）：

| 项 | 状态 |
|----|------|
| Vitest | 145 files / 1287 tests 全绿（6.2s） |
| typecheck / lint | 通过 / 0 errors 6 warnings |
| 真实模型连载验收 | 第 1 章通过；**第 2 章因状态变更 16 条 > 15 条上限停在 `needs_review`** |
| 质量门 | 启发式 7 维度 + Critic 交叉校验；`ai_voice` 实测 std 23.6 已降软信号 |
| 工作区 | 85 modified + 50 untracked（约 2700 行新增）**未提交** |
| 安全 | 4 high 依赖告警；Next.js / Auth.js 各 1 条已知公告未升级；Git 历史含旧库凭据 |

**本周期三原则**：

1. **证据优先于机制**——真实跑批产物（正文、失败原因、人工标注）是后续所有决策的输入。
2. **小改动解锁大验证**——15 条上限是一个常量，但它阻断了整条验证链；先修卡点，再谈其他。
3. **新判定逻辑必须先标定再上线**——LLM Judge 接入前须通过人工标注相关性门槛，避免重蹈 `ai_voice` 不可信维度止链的覆辙。

**明确不做**（本周期）：

- 不新增预算策略 / 提醒类型 / 检查点模式等机制。
- 不做无真实样本驱动的 prompt 盲调（Git 历史已两次证实 few-shot 叠加禁令边际收益为负）。
- 不做 Next/Prisma 大版本迁移（安全补丁除外）。
- 不动 RLS（决策推迟到 P4.4，见条件）。

---

## 一、阶段 P0：保护现场（0.5 天，无代码风险）

### P0.1 提交工作区

工作区代码已实测全绿（typecheck / lint / 1287 tests）。按功能拆分为逻辑提交，禁止一坨 `wip`：

| 序 | 建议提交 | 内容（从未跟踪文件名推断） |
|----|---------|------------------------|
| 1 | `feat(generation): 预算调度与资源唤醒` | `lib/agent/generationBudget*`、`generationWake*`、`generationScheduling*`、对应迁移与测试 |
| 2 | `feat(generation): 站内运行提醒` | `lib/agent/generationAlerts*`、`app/api/generation-alerts/`、`components/GenerationAlerts.tsx` |
| 3 | `feat(novels): 剧情进度面板与记忆查询` | `StoryProgressPanel.tsx`、`app/api/novels/[id]/story-memory/`、`loading.tsx` |
| 4 | `test(api): restore 路由测试` | `versions/[versionId]/restore/route.test.ts` |
| 5 | `chore: E2E 夹具与 CI 调整` | `tests/e2e/*` 修改、`.github/workflows/ci.yml`、docs 数字更新 |

提交前逐批跑 `npm run test`；`.playwright-cli/`、`.playwright-mcp/`、`ai-novel-promo/`、`test-results/` 确认是否入 `.gitignore` 而非提交。

**验收**：`git status` 干净（忽略文件除外）；`npm run verify` 在提交后的 HEAD 上通过。

### P0.2 凭据轮换

Git 历史中的旧数据库凭据：**轮换凭据本身（在数据库供应商侧改密码/换实例）即为根治**，不必重写历史。`git filter-repo` 会改写全部 commit hash，对已开源仓库协作代价大，仅在凭据无法轮换时考虑。

**验收**：旧凭据连接测试失败；`.env` / 部署环境使用新凭据且 `npm run db:smoke` 通过。

---

## 二、阶段 P1：打通真实连载验证闭环（4–6 天）

### P1.1 状态变更上限可配置化（1 天）

**问题**：`lib/validation/stateDiffMerge.ts:218` 的 `const MAX_STATE_DIFF_ITEMS = 15` 是硬编码常量。其防御目的（拦截「模型回灌全量状态」）是正确的，但纯数量阈值过于粗糙——第 2 章 16 条合法变更被拦，整条验收链停止。

**方案**：上限改为 run 级可配置（保留硬上限语义，先不做自适应放行；后者见 P1.4 观察项）。

数据流（全部沿用现有管道，无新表无迁移）：

```
StartRequestSchema (lib/agent/autoGeneration.ts:13, 继承 GenerationPolicySchema)
  └─ GenerationPolicySchema (lib/agent/generationPolicy.ts:3) 增加:
       max_state_changes: z.number().int().min(5).max(40).default(15)
  └─ startGeneration 持久化进 run.config（现有逻辑，无需改）
  └─ generateChapterHandler (lib/jobs/generateChapterHandler.ts:64)
       policy = generationPolicy(run?.config)   // 已存在
       chapterStateDiff(..., maxStateChanges = policy.max_state_changes)  // 新增透传
         └─ validateStateDiff(bible, diff.data, content, { maxStateChanges })  // 签名扩展
```

改动点清单：

| 文件 | 改动 |
|------|------|
| `lib/validation/stateDiffMerge.ts` | `validateStateDiff` 增加第 4 参 `options?: { maxStateChanges?: number }`；`MAX_STATE_DIFF_ITEMS` 保留为默认值导出；错误消息带实际上限值 |
| `lib/agent/generationPolicy.ts` | schema 增加 `max_state_changes`（int 5–40，default 15） |
| `lib/agent/autoGeneration.ts` | 无需改（`StartRequestSchema` 是 `GenerationPolicySchema.extend`，自动继承） |
| `lib/jobs/generateChapterHandler.ts:47` | 从 `policy` 透传 |
| `scripts/cli/generator.ts:80` | 文件 CLI 同样从配置透传 |
| `scripts/eval-serial-agent.ts` | 增加 `--max-state-changes <n>` 选项，注入 `StartRequestSchema.parse` 的 config |
| `app/(app)/novels/[id]/_components/AutoGeneratePanel.tsx` | 可选：高级配置区暴露输入框（默认折叠，不阻塞主线） |

**测试计划**：

- `stateDiffMerge.test.ts`：默认上限 15 拦截 / 自定义 30 时 16–29 条放行 / 超限 reason 文案含实际上限。
- `generationPolicy.test.ts`：默认值、边界（4 拒绝 / 5 / 40 / 41 拒绝）。
- `generateChapterHandler.test.ts`：断言 policy 值透传到 validateStateDiff（mock 注入）。
- auto-generate route 测试：schema 接受新字段、非法值 400。

**验收**：`eval:serial --execute` 下第 2 章 16 条变更场景（用 `--max-state-changes 25` 重放）不再因此挂起；全部现有测试通过。

### P1.2 真实连载验收跑批（2–3 天，含人工通读）

**执行步骤**（基础设施全部现成）：

```bash
# 1. 准备独立本地库（迁移 + 模型配置由脚本从源库复制，不碰远程库）
export SERIAL_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_novel_serial

# 2. 预览（无模型调用）
npm run eval:serial -- --unlimited-budget

# 3. 执行：目标 30 章（100 章成本未知，先用 30 章摸底）
#    按 P1.1 后的新参数放宽状态变更上限
npm run eval:serial -- --execute --unlimited-budget \
  --chapters 30 --max-state-changes 25 --output artifacts/serial-agent/2026-10-real

# 4. 常驻 worker（另一终端；机器休眠会停，注意电源设置）
npm run jobs:worker
```

**预算估算**：按 HEALTH.md 实测第 1–2 章约 0.2 元估算，30 章含修订轮约 3–5 元，预留 10 元日预算足够。成本以 `LlmUsage` 估价为准，跑批后核对。

**监控**：`snapshot()` 已导出 run / usage / jobs / memory_records 全量 JSON；关注三类停链原因——质量门未达标、needs_review 理由分布、重试耗尽。

**人工通读评审**（本阶段核心产出，产出物写入 `docs/evals/serial-real-2026-10.md`）：

| 维度 | 检查点 | 记录方式 |
|------|--------|---------|
| 章际承接 | 开头是否接上一章结尾落点，无断裂 / 重复演 | 每章 1–5 分 + 问题摘录（带章节号） |
| 伏笔 | 卷计划 thread_targets 是否按期回收；悬置清单 | 对照 volume_plans 导出 |
| 称谓/一致性 | 角色称谓漂移、物品属性漂移（近期已修的两类）是否复发 | 问题/十章 计数 |
| 文风趋同 | 连续 5 章以上句式 / 场景模式重复 | 摘录重复段落 |
| 记忆有效性 | 第 20+ 章是否仍正确引用第 1–5 章设定 | 抽查 3 处远端事实 |

**验收**：产出评审文档 + 问题清单（每条含章节定位）；跑批完成 30 章或完整记录停止原因。**通过标准不设「质量及格」——本阶段交付物是问题清单，不是质量结论。**

### P1.3 模型 A/B 对比（1 天，与 P1.2 通读并行）

**问题**：当前瓶颈在模型还是在管线机制未定。验收用 `deepseek-v4-flash`（廉价档），若瓶颈在模型，管线打磨边际收益低。

**方法**：同一 `xuanhuan-seed.json` 固定种子，两个模型各生成前 5 章（`--model <name>` 已支持）：

```bash
npm run eval:serial -- --execute --unlimited-budget --chapters 5 --model <model-a> --output artifacts/serial-agent/ab-a
npm run eval:serial -- --execute --unlimited-budget --chapters 5 --model <model-b> --output artifacts/serial-agent/ab-b
```

- 人工盲评（去标识后按 P1.2 评审表打分）+ 启发式 `eval:novel-quality` 双轨对比。
- 记录单章成本与耗时差。

**决策矩阵**：

| 结果 | 行动 |
|------|------|
| 强模型显著更好 | 后续验收默认用强模型；管线调优优先级降低 |
| 差异小 | 瓶颈在管线，P2 质量门与 P1.2 问题清单驱动修复 |
| 强模型也差 | 重新审视 seed 大纲质量与上下文组装（chapterContextAssembly） |

### P1.4 观察项（不实施，仅记录）

- 15 条上限的**自适应放行**：若 P1.2 显示拦截多发生在「变更全部通过实体存在性校验」的合法场景，可将数量超限改为二次校验（全部条目通过实体校验且与正文重叠 → 放行并告警）。仅当数据显示需要时才排期。
- `eval:serial` 对超 fixture 章数的「失锚」局限（STATUS.md 已记录）：跑批报告中的启发式分数在第 12 章后仅作趋势参考。

---

## 三、阶段 P2：质量门升级——标定 LLM Judge（4–6 天，标注依赖 P1.2 产物）

### P2.1 设计原则

- 启发式门保留为**第一道**（零成本、进 CI 基线、防明显劣化）。
- LLM Judge 为**第二道**，仅在 auto-pilot 落库前执行；复用预算基础设施。
- Judge **先 shadow 后 enforce**：shadow 期只记录不判定，跑满一个真实周期对比分歧后再切换。
- 解析 fail-closed（复用 Critic 的两连失败注入 synthetic critical issue 模式）。

### P2.2 Judge 核心模块（1.5 天）

新增 `lib/evals/llmJudge.ts`（纯函数，与 `novelQuality.ts` 同层；LLM 调用在 handler 侧注入，沿用 `runChapterPipeline` 的依赖注入惯例）：

```ts
import type { ChatMessage } from "@/lib/llm/client";
import type { MetricResult } from "@/lib/evals/novelQuality";
import type { BibleDraft } from "@/lib/validation/schemas";
import type { QualityChapterInput } from "@/lib/evals/novelQuality";

export type JudgeDimension = MetricResult["key"]; // 对齐现有 7 维度

export interface JudgeScore {
  key: JudgeDimension;
  score: number;        // 0–10
  evidence: string;     // 必须引用正文片段，防无据打分
}

export interface JudgeVerdict {
  scores: JudgeScore[];
  summary: string;
  confidence: "high" | "medium" | "low";
}

/** 锚定量表：每个维度给出 2 / 5 / 8 / 10 分的锚点描述（写作前先定稿锚点文案）。 */
export function buildJudgePrompt(input: {
  window: QualityChapterInput[];
  bible: BibleDraft;
}): ChatMessage[];

/** zod safeParse + parseFirstJsonObject；不可解析返回 null（fail-closed）。 */
export function parseJudgeVerdict(raw: string): JudgeVerdict | null;
```

Prompt 约束（写入 `lib/llm/prompts/judge.ts`，接入现有 `promptSafety` 包裹）：

- 锚定评分量表（anchored rubric），每个分数档有明确描述，降低 LLM 打分的中庸聚集。
- 每维度必须引用正文证据；无证据的维度记 0 分并标 `confidence: low`。
- 用户内容一律 `wrap()`（沿用 P1-4 prompt 注入防护）。
- `responseFormat: "json_object"`、`temperature: 0`。

Handler 侧调用点（`generateChapterHandler.ts`，与 `chapterStateDiff` 平行）：

```ts
const judge = policy.judge_mode !== "off"
  ? await runJudge(window, bible, { model: policy.judge_model ?? policy.model })
  : null;
// shadow: logger.info("gate.judge.shadow", {...}) 仅记录
// enforce: judgeVerdict 并入 evaluateChapterGate 选项
```

**测试**：`llmJudge.test.ts` 覆盖 prompt 构造（注入防护、锚点存在）、解析（合法/缺字段/非 JSON 两连失败）、注入 completion 的端到端。

### P2.3 标定流程（2 天，样本来自 P1.2 真实跑批）

复用现有 `eval:golden` 基础设施（`docs/evals/golden/manifest.json` + `lib/evals/goldenCorrelation.ts` 已实现 Spearman/MAE 计算）：

1. 从 P1.2 产物抽取 **10–15 个 3 章窗口**，刻意覆盖：高分通过、低分挂起、软信号告警、挂起后人工改稿四种状态。
2. 人工按锚定 rubric 打分，写入 golden samples（`chaptersFile` / `labelsFile` 格式不变）。
3. 扩展 `scripts/eval-golden-correlation.ts`：`--judge` 开关同时计算 judge 分数与人工分的 Spearman + MAE（核心数学复用 `computeGoldenCorrelation`）。

**接入门槛**（不过则留在 shadow，继续调锚点；两轮仍不过则 judge 永久 shadow）：

- 总体 Spearman ≥ 0.6；
- 任一维度 MAE ≤ 2.0（10 分制）；
- `ai_voice` 维度单独看：若 judge 版稳定性显著优于启发式（std 收敛），才考虑升回硬门，否则维持软信号。

### P2.4 接入质量门（1 天）

`lib/agent/qualityGate.ts` 扩展（模式与 `criticIssues` 完全一致）：

```ts
export interface QualityGateOptions {
  // ...现有字段
  judgeVerdict?: JudgeVerdict;        // 新增：第二道门
  judgeFloor?: { minTotalPct: number; minDimension: number }; // 默认标定后定，占位 70 / 5
}
```

- `GenerationPolicySchema` 增加 `judge_mode: z.enum(["off","shadow","enforce"]).default("shadow")` 与可选 `judge_model`。
- **enforce 期数据落点**：shadow 期仅结构化日志 + `eval:serial` 导出；决定 enforce 后加一条轻量迁移建 `generation_gate_log` 表（run_id / chapter_index / heuristic_pct / judge_scores / verdict / created_at），避免现在就加表。
- 成本：单次 judge 输入约 2–3k token、输出约 300 token，按 flash 价格每章 < 0.01 元，可忽略；仍计入 `LlmUsage` 审计（route `/agent/quality-gate/judge`, agent `judge`）。

**验收**：shadow 跑满 P1.2 的下一轮真实连载；输出「启发式 vs judge 分歧清单」（分歧章节人工仲裁）；标定报告归档 `docs/evals/judge-calibration-2026-10.md`。

---

## 四、阶段 P3：安全维护批（0.5–1 天，可与 P1.2 并行）

| 项 | 动作 | 验证 |
|----|------|------|
| Next.js 公告 GHSA-2xp9-vwfh-vxw4 | 升级到含修复的 15.5.x 最新版（当前锁定 15.5.27） | `npm ls next` 确认 + 全量 verify + E2E 冒烟 |
| Auth.js 公告 GHSA-8fpg-xm3f-6cxw3 | next-auth 升到含修复版本（当前 5.0.0-beta.32） | 登录 / 登出 / 权限 E2E |
| 依赖 audit（4 high / 1 moderate） | 逐条 `npm audit fix`；Prisma/deepmerge-ts 与 Next 内置 PostCSS 链不可修的记录豁免理由 | `npm audit` 剩余项全部有书面豁免 |
| 凭据轮换 | P0.2 未完成则此处完成 | 旧凭据失效 |

**注意**：锁版本升级后必须重跑 `test:e2e`（登录链路对版本敏感，历史上 CSP nonce 出过生产问题）。

---

## 五、阶段 P4：中期架构债（1–2 周，验证跑通后启动）

### P4.1 Bible 投影读取——消除单 JSON 存储增长（4–5 天）

**现状**：生成链路已改读记忆表（`loadStoryMemory` + `mergeRecalledState`），但 `BibleDraft.content` 仍全量 JSON 持续增长，且编辑器 UI（BibleEditorPanel / characters / world / outline 页）直接读该 JSON。

**方案**：读路径切换为从表投影，写路径逐步降频：

1. 新增 `lib/agent/bibleProjection.ts`：`projectBibleFromTables(novelId): Promise<BibleDraft>` —— 从 `StoryMemoryRecord`（按 `valid_to_chapter: null` 取当前版本）+ `NovelOutlineChapter` + `NovelVolumePlan` 组装 BibleDraft 视图。
2. **Round-trip 一致性测试**（本任务的关键闸门）：随机 / 固定 fixture 集上断言 `project(sync(bible)) ≡ bible`（deepEqual，白名单允许的时序字段除外）。不过不切换。
3. 编辑器各读路径切换到投影函数；`BibleDraft.content` 保留兼容写一个版本（双写 + 读新写旧），观察一个周期后降为低频快照（每卷一次）。
4. `memory:backfill` 增加反向校验模式（比对投影与 JSON 的差异报告）。

**风险**：StoryMemoryRecord.value 对 characters/world 结构的还原度依赖 syncStoryMemory 的映射完整度——round-trip 测试就是为此设的闸门；不过则补映射而不是硬切。

### P4.2 Worker 部署固化（1 天）

- `docker-compose.yml` 增加 `worker` 服务：`command: npx tsx scripts/jobs-worker.ts`、`restart: unless-stopped`、依赖 postgres 健康检查。
- 为 `scripts/jobs-worker.ts` 增加 `--healthcheck` 轻量模式（SELECT 1 + 队列深度，输出 JSON），供 compose healthcheck 与 Grafana 抓取。
- README「Auto-Pilot」节补充常驻部署说明（当前「关网页不停、关机器停」的表述对目标用户不够透明）。
- **前置确认**：Dockerfile standalone 产物内 `tsx` 可用（HEALTH.md 称已验证，部署前复测）。

### P4.3 长篇编辑器性能压测（1–2 天）

- 新增 `scripts/perf-long-novel.ts`：向独立库 seed 120 章 × 4k 字 + 完整记忆表数据。
- Playwright 计时用例：章节切换、大纲页首屏、章节管理表渲染、版本列表加载（阈值断言：P95 < 2s，超则记录热点再优化，不在本周期盲目优化）。

### P4.4 RLS 决策（0.5 天，纯决策）

条件触发：若 P1.2 后决定对外开放注册（多租户真实使用），启用 Postgres RLS 并补 `lib/db.ts` 会话级变量设置；若仍单用户/内测，书面记录「应用层所有权检查 + 每资源 404」为当前边界，挂到 SECURITY.md。

---

## 六、里程碑与依赖

```
P0 保护现场 ──┬─→ P1.1 上限可配置 (1d) ─→ P1.2 真实跑批+通读 (2-3d) ─→ P1.3 模型A/B (1d)
              │                              │
              │                              └─→ P2.3 judge 标定 (依赖 P1.2 产出的真实样本窗口)
              │                                    ↓
              └─→ P3 安全维护 (0.5-1d, 并行)    P2.2 judge 模块 (可与 P1.2 并行开发)
                                                   ↓
                                              P2.4 接入质量门 (shadow)
                                                   ↓
                                              P4 架构债 (1-2 周)
```

**总量**：P0–P3 约 1.5–2 周；含 P4 全部约 3–3.5 周（单人估算）。

## 七、成功度量

| 指标 | 目标 |
|------|------|
| 真实连载无人工干预连续通过章数 | ≥ 30（当前 1） |
| 人工通读问题密度 | 建立基线（问题/十章），不设绝对目标 |
| Judge–人工 Spearman | ≥ 0.6（不过不 enforce） |
| 单章真实成本与耗时 | 建立基线并写入 HEALTH.md |
| 安全告警 | 4 high 清零或有书面豁免 |

## 八、风险与回退

| 风险 | 缓解 |
|------|------|
| 放宽状态上限后回灌状态污染 Bible | 上限仍存在（40 硬顶）；`content_hash` + 版本化记忆可回滚；P1.2 通读包含一致性检查 |
| Judge 标定不过 | 永久 shadow，启发式门不受影响（judge 是加法不是替换） |
| 真实跑批成本超预期 | `--cost-cap` 兜底；预算基础设施已支持暂停恢复 |
| Bible 投影 round-trip 不过 | 双写兼容期设计，读路径不切换即零影响 |
| Next/Auth 升级破坏登录 | E2E 全量回归是发布门槛；锁定版本可即时回退 |
