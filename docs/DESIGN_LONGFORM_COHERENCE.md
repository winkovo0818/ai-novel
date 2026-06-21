# DESIGN — 长篇连贯性强化方案（Longform Coherence v2）

> 创建时间:2026-06-10
> 状态:设计稿,待评审
> 前置阅读:`lib/agent/README.md`、`docs/evals/long-form-baseline-2026-05-29.md`、`docs/IMPL_AUTO_NOVEL_GENERATION_M1-M3.md`

---

## 1. 背景与问题定义

当前连贯性体系(分层摘要 + pgvector RAG + story_state + Critic/QualityGate)在 **12 章 / 3.5 万字**尺度上验证有效(总分 93/100),但一部网文是 100~300 章 / 百万字级。现有机制在长尺度下存在五个结构性缺口:

### 缺口 A:伏笔回收没有保障机制(最严重)

- `StoryStateV1Schema` 已定义 `foreshadowing` 字段(`lib/validation/domain.ts`,含 planted/reinforced/revealed/resolved 生命周期),**但全链路没有真正使用它**:
  - `buildStateDiffPrompt`(`lib/llm/prompts/stateDiff.ts`)只抽取 timeline_events / plot_thread_updates,**不抽取伏笔**;
  - 唯一写入路径是 `stateDiffMerge.ts:310` 的正则 `/伏笔|线索|谜团|悬念/` 匹配实体描述——靠运气,不靠设计;
  - `buildChapterPrompt` / `buildCriticPrompt` 均不注入 foreshadowing 列表,Writer 不知道哪些伏笔待回收,Critic 不检查伏笔是否被遗忘或矛盾回收。
- RAG 的时间衰减 `decay = 1/(1+0.1×距离)` 对"邻近事实优先"是对的,但对"第 15 章埋的伏笔在第 200 章回收"是**反作用**:距离 185 章时衰减到 ~5%,几乎不可能进 top-K。

### 缺口 B:摘要链有损压缩不可控

章节摘要→卷摘要→全书摘要逐层压缩,没有机制保证"剧情关键事实"(角色死亡、能力获得、关系反转)在压缩中存活。第 200 章时,第 30 章的关键事实只能靠 RAG 相似度竞争找回。

### 缺口 C:state_diff 自动合并的错误累积

自动生成模式下 `applyChapterStateDiff`(`lib/jobs/generateChapterHandler.ts`)直接把 LLM 输出的 diff 合并进 Bible,失败时仅跳过(spike 实测 ~25% JSON 解析失败)。问题有二:

1. **解析成功但内容错误的 diff 没有任何校验**就被合并,错误状态被后续所有章节继承放大;
2. `BibleDraft` 表没有 version 字段(对比 `ChapterDraft.version`),后台 job 的读-改-写与用户在 UI 编辑 Bible 之间存在**丢失更新竞态**。

### 缺口 D:Critic 解析失败 = 静默放行(已确认 bug)

`chapterPipeline.ts` 的 `parseCriticResult` 在 JSON 解析失败时返回 `{consistent: false, issues: []}`,而循环判断是 `critic.consistent || !hasBlockingIssue(critic.issues)` —— 空 issues 数组使 `hasBlockingIssue` 为 false,**解析失败的章节直接 break 通过,不触发 revise,也不计入质量门的 critic floor**。这与"质量是关键"的目标直接冲突。

### 缺口 E:验证尺度不足

- 检索评估 4 个 case、Critic 命中率评估 3 章、长篇基线 12 章,没有任何 eval 覆盖"跨 30+ 章伏笔回收"和"50 章后连贯性衰减"场景;
- `novelQuality` 启发式(关键词重合、角色名出现频率)抓不住深层不一致(性格弧光违背、动机漂移)。

---

## 2. 方案总览

五个机制,按依赖排序。设计原则:**优先修复已有链路的断点(成本低、确定性高),再补长程机制,最后扩评估**。不引入新依赖、不换框架,全部在现有 agent 管线内演进。

```
M0 修复断点      Critic fail-closed + state_diff 校验 + Bible 乐观锁
M1 伏笔生命周期  StateDiff 抽取 → story_state.foreshadowing → Writer/Critic 注入
M2 强制注入层    开放线索/未回收伏笔/关键事实 绕过相似度竞争直接入上下文
M3 关键事实卡    摘要链旁路:不可压缩的事实清单(canon facts)
M4 长程评估      50-100 章长跑 + 伏笔回收 eval + 周期性弧线审计
```

---

## 3. 机制详细设计

### M0 — 修复现有断点(P0,无 schema 变更)

**M0.1 Critic fail-closed**

`parseCriticResult` 解析失败时返回特殊标记,管线对解析失败采取"重试一次 → 仍失败则视为 major issue 进入 revise 或标记 needs_review",而非静默通过:

```ts
// chapterPipeline.ts
function parseCriticResult(raw: string): CriticResult | null {
  const parsed = parseFirstJsonObject<Partial<CriticResult>>(raw);
  if (!parsed) return null;   // 不再伪装成 "没有问题"
  ...
}
// 循环内:null → 重试一次;再 null → criticIssues 注入
// { type: "logic_chain", severity: "major", description: "critic 输出不可解析,本章未经审校" }
// 该 issue 会被 qualityGate 的 critic floor 看到。
```

**M0.2 state_diff 落地前校验(置信度门)**

合并前做三条廉价校验,不过 LLM:

1. **实体存在性**:diff 中引用的角色名/地点名必须出现在本章正文或 Bible 既有实体中(防幻觉实体);
2. **状态机合法性**:plot_thread 不允许 resolved → progressing 回退;foreshadowing 不允许 revealed → planted;
3. **规模合理性**:单章 diff 改动条目数超过阈值(如 >15 条)视为可疑。

任一失败 → 不合并,写入 `needs_review` 队列(复用 `markNeedsReview` / checkpoint 机制),自动生成 run 在 checkpoint_mode≠none 时暂停待人工确认。**宁可状态滞后,不可状态污染。**

**M0.3 Bible 乐观锁**

`BibleDraft` 增加 `version Int @default(0)`(migration),`applyChapterStateDiff` 改为 `updateMany where version = readVersion` 的 CAS 写入,冲突时重读重放一次,再冲突则进 needs_review。与 `ChapterDraft.version` 的成熟模式对齐。

### M1 — 伏笔生命周期真正落地(P0~P1)

打通已有但悬空的 `foreshadowing` schema:

**M1.1 StateDiff 抽取伏笔**

- `StateDiffSchema` 增加 `foreshadowing_updates` 数组(id/clue/status/payoff_hint);
- `buildStateDiffPrompt` 增加抽取指令:"识别本章新埋设的伏笔(具体物件、未解释的反常、预言性对话)和被强化/揭示/回收的既有伏笔",并把当前 `story_state.foreshadowing` 清单作为输入,让模型做的是**状态更新**而非重新发现;
- `stateDiffMerge.ts` 增加对应合并逻辑,删除 `:310` 的正则兜底(保留作为 fallback 也可,但标注降级)。

**M1.2 Writer 注入待回收清单**

`buildChapterPrompt` 增加段落(放在"活跃线索"旁):

```
## 未回收伏笔(按埋设章节排序)
- [第12章埋设|planted] 黑匣子里的半张照片:payoff_hint=主角身世
- [第18章埋设|reinforced] 师父临终的"别去北境"
规则:本章若触及相关人物/地点,优先自然推进伏笔;大纲指定回收的伏笔必须落地;不得与埋设时的事实矛盾。
```

**M1.3 Critic 检查伏笔一致性**

`buildCriticPrompt` 的检查维度(现有 7 个)增加第 8 个 `foreshadowing`:回收的伏笔是否与埋设时事实一致;是否提前剧透了 payoff_hint;status=revealed 的伏笔是否被当作未揭示重复使用。issue type 枚举(`contracts.ts:233`)同步增加。

**M1.4 大纲层伏笔规划(P2,可选)**

`planOutline` 生成卷大纲时为章节标注 `foreshadowing_ops: [{id, op: plant|reinforce|payoff}]`,使伏笔回收从"涌现"变为"计划"。该项依赖 M1.1-1.3 跑通后再做。

### M2 — 强制注入层(P1,核心增量)

新增 `lib/agent/mandatoryContext.ts`,在 `assembleChapterContext` 中于 RAG 检索**之外**单独构建一个"必带上下文"块,不参与相似度竞争、不受时间衰减影响:

```
必带项(按 token 预算裁剪,优先级从高到低):
1. status=open/progressing 的 plot_threads(已有,保留)
2. status=planted/reinforced 的 foreshadowing(M1 产出)
3. canon facts 关键事实卡(M3 产出)
4. 本章大纲提及实体的最近状态(从 story_state.characters/items/locations 按大纲关键词筛选)
预算:总计 ≤ 1500 字;超出时按 introduced_in 距离当前章节的"悬置时长"降序保留
(悬置越久越优先——与时间衰减相反,这正是强制注入存在的理由)。
```

同时给 RAG 增加一条规则:`chunk_type = plot_thread` 的块**豁免时间衰减**(`retrieval.ts` 的 decay 计算处按 chunkType 分支),理由写入代码注释。

### M3 — 关键事实卡(canon facts,P1~P2)

解决摘要链有损压缩:维护一份**不可压缩**的事实清单,与摘要链并行。

- 存储:`story_state` 增加 `canon_facts: [{fact, chapter_index, category: death|power|relationship|world_rule|identity}]`(schema 演进,向后兼容 optional);
- 写入:StateDiff prompt 增加抽取指令——只收"一旦违背读者立刻发现"的硬事实(角色死亡/复活、能力获得/丧失、身份揭露、关系缔结/破裂、世界规则确立);
- 读取:M2 强制注入层第 3 优先级;Critic 同样可见,违背 canon fact 一律 critical;
- 控制规模:每条 ≤ 50 字,全书预算 200 条,超出时合并同实体条目(人工或 LLM 离线整理,不在生成路径上做)。

### M4 — 长程评估与弧线审计(P1,与 M1-M3 并行启动)

**M4.1 50-100 章长跑基线**

- 扩展 `scripts/eval-novel-quality.ts` 的滑动窗口轨迹分析(`analyzeDecay` 已有),用 xuanhuan-seed 跑 50 章(成本可控:按 12 章基线折算约 ¥X,用 cost_cap 兜底);
- 重点观测:第 30 章后连贯性/因果逻辑分维度是否系统性下滑;story_state 体积增长曲线;检索命中片段的章节距离分布(验证 M2 豁免是否生效)。

**M4.2 伏笔回收 eval(新增 `scripts/eval-foreshadowing.ts`)**

- golden case:在第 N 章人工埋设 3-5 个伏笔(写入 fixture 的 story_state),指定第 N+20/N+40 章大纲要求回收;
- 指标:**回收率**(大纲要求回收的伏笔,正文是否实际落地——关键词 + LLM 判定)、**一致性率**(回收内容与埋设事实是否矛盾——LLM 判定)、**强制注入命中率**(待回收伏笔是否进入了 writer prompt——纯程序断言,零成本);
- 入 `eval:check` 链路的方式:强制注入命中率可入 CI(确定性);回收率/一致性率跑 real_llm 模式,归档 `docs/evals/`。

**M4.3 周期性弧线审计(P2)**

每 10 章触发一次 `arc_audit` 后台 job(新 JobType):输入近 10 章摘要 + story_state + canon facts,LLM 输出跨章矛盾清单(角色行为违背弧光、时间线冲突、悬置过久的线索)。结果不阻塞生成,写入 needs_review 供作者查看。这是对"逐章 Critic 看不见跨章漂移"的补位。

---

## 4. 数据结构变更汇总

| 变更 | 类型 | 兼容性 |
|---|---|---|
| `BibleDraft.version Int @default(0)` | migration | 新字段默认值,无历史数据问题 |
| `StoryStateV1.canon_facts`(optional) | Zod schema | optional 向后兼容 |
| `StateDiffSchema.foreshadowing_updates` | Zod schema | optional 向后兼容 |
| `CriticIssue.type` 增加 `"foreshadowing"` | 类型枚举 | 联合类型扩展,需检查穷举 switch |
| 新 JobType `arc_audit` | 队列枚举 | `JOB_TYPES` 数组追加 |

无新增第三方依赖。无新表(canon_facts 暂存 story_state 内,与现有"短期放 Bible content,后续可拆表"的注释方向一致)。

---

## 5. 实施任务(分四阶段)

### Phase 1 — 断点修复(M0,约 2-3 天)

| # | 任务 | 文件 | 验证 |
|---|---|---|---|
| T1 | Critic 解析失败 fail-closed + 重试 | `lib/agent/chapterPipeline.ts` | 单测:mock 不可解析输出 → 断言注入 major issue / 进 revise;现有 14 例 handler 测试不回归 |
| T2 | state_diff 三条校验 + 不合格进 needs_review | `lib/validation/stateDiffMerge.ts`、`lib/jobs/generateChapterHandler.ts` | 单测:幻觉实体 / 状态回退 / 超规模 diff 各一例 |
| T3 | BibleDraft 乐观锁 | `prisma/schema.prisma` + migration、`generateChapterHandler.ts`、`app/api/novels/[id]/bible/route.ts` | 单测:并发 CAS 冲突重放;E2E 不回归 |

### Phase 2 — 伏笔生命周期(M1,约 3-4 天)

| # | 任务 | 文件 | 验证 |
|---|---|---|---|
| T4 | StateDiff 抽取伏笔 | `lib/llm/prompts/stateDiff.ts`、`lib/validation/domain.ts`、`stateDiffMerge.ts` | prompt 单测(含注入攻击场景,沿用 promptSafety 模式)+ merge 单测 |
| T5 | Writer 注入待回收清单 | `lib/llm/prompts/chapter.ts`、`lib/agent/chapterContext.ts` | prompt 单测:断言含"未回收伏笔"段;空伏笔时不渲染该段 |
| T6 | Critic 伏笔检查维度 | `lib/llm/prompts/critic.ts`、`lib/agent/contracts.ts` | prompt 单测 + 类型穷举检查 |

### Phase 3 — 强制注入 + 关键事实(M2/M3,约 3-4 天)

| # | 任务 | 文件 | 验证 |
|---|---|---|---|
| T7 | mandatoryContext 构建器 + token 预算裁剪 | 新 `lib/agent/mandatoryContext.ts`、`chapterContextAssembly.ts` | 单测:优先级排序、预算裁剪、悬置时长排序 |
| T8 | plot_thread chunk 豁免时间衰减 | `lib/agent/retrieval.ts` | 单测:同分块 plot_thread vs scene 排序差异 |
| T9 | canon_facts 抽取/注入/Critic 可见 | `domain.ts`、`stateDiff.ts`、`mandatoryContext.ts`、`critic.ts` | 单测 + 200 条预算裁剪测试 |

### Phase 4 — 长程评估(M4,约 4-5 天,部分与 Phase 2/3 并行)

| # | 任务 | 文件 | 验证 |
|---|---|---|---|
| T10 | 伏笔回收 eval + golden fixture | 新 `scripts/eval-foreshadowing.ts`、`scripts/fixtures/` | 强制注入命中率断言入 `eval:check`;real_llm 报告归档 |
| T11 | 50 章长跑基线 | `scripts/eval-novel-quality.ts`(扩展) | 归档 `docs/evals/long-form-baseline-50ch-*.md`,对比 12 章基线 |
| T12 | arc_audit 周期审计 job | `lib/jobs/`、`lib/llm/prompts/arcAudit.ts`(新) | handler 单测;needs_review 流转测试 |

### 验收标准(整体)

1. `npm run verify` 全绿,现有 987 测试零回归;
2. 伏笔强制注入命中率 = 100%(程序断言);
3. 50 章长跑:连续性维度无系统性衰减(`analyzeDecay` 判定),伏笔回收率 ≥ 80%、一致性率 ≥ 90%(real_llm,人工抽查校准);
4. state_diff 校验拦截率有观测(logWarn 事件计数),needs_review 队列可在 UI 处理;
5. 文档同步:`STATUS.md`、`HEALTH.md`、本文档状态翻转为"已实施"。

---

## 6. 风险与权衡

- **token 成本上升**:强制注入 ≤1500 字 + canon facts,按 DeepSeek 价格单章成本增加约 3-5%,可接受;用预算裁剪兜底。
- **needs_review 打断自动化**:M0.2 会让部分 diff 进人工队列,降低全自动率。这是有意取舍——错误状态污染的代价远高于偶尔人工确认。checkpoint_mode=none 的用户保持现状(仅记录)。
- **canon_facts 与 story_state 重复**:存在部分信息重叠,短期接受;若膨胀再拆表去重。
- **50 章长跑成本**:real_llm 一次性成本较高,建议先用 cost_cap_cny 限额跑 25 章中点验证,再决定是否跑满。
