# 小说质量体系优化技术方案

> 日期：2026-06-05
> 范围：去 AI 味 + 逻辑冲突 + 质量评分 + 门控 的整体优化（5 项改进）
> 涉及模块：`lib/llm/writerOutputCleanup.ts`、`lib/llm/prompts/humanStyle.ts`、`lib/evals/novelQuality.ts`、`lib/agent/qualityGate.ts`、`lib/agent/chapterPipeline.ts`、`lib/jobs/generateChapterHandler.ts`、`scripts/eval-*.ts`
> 性质：纯设计文档，不含代码实现；落地顺序见第七章

---

## 背景与现状

当前质量保障是**四层结构**，职责清晰、已踩坑迭代，整体合理：

| 层 | 文件 | 机制 | 作用 |
|----|------|------|------|
| 1. 提示治理 | `humanStyle.ts` | `HUMAN_STYLE_DIRECTIVE`（13 条）+ `WRITER_SELF_REVISION_DIRECTIVE`（8 条）注入 writer system prompt | 从源头减少 AI 痕迹 |
| 2. 规则清洗 | `writerOutputCleanup.ts` | ~30 条正则，含格式净化 + **词汇硬替换** | 草稿出来后的最后兜底 |
| 3. LLM Critic | `critic.ts` | 7 维语义审校，双尺度判定，major/critical 触发重写 | 逻辑冲突主力 |
| 4. 启发式门控 | `novelQuality.ts` + `qualityGate.ts` | 7 维各 10 分纯规则评分；总分 ≥85% 且 `ai_voice≥6`/`logic≥7` 硬门 | 自动生成把关 |

管线串联在 `chapterPipeline.ts`：`draft → cleanup → (critic → revise) ×N → cleanup`；门控在 `generateChapterHandler.ts` 的 `finalizeRun` 里用末 3 章滑窗调用。

本方案针对评估中发现的 5 个可优化点，按性价比从高到低排列。**前两项（P0）解决正确性隐患，建议优先落地；后三项（P1/P2）提升评分可信度与系统协调性。**

### 已识别的 5 个问题

1. **规则清洗的词汇硬替换会误伤语义**（P0，正确性）—— `似乎→像是`、`慢慢→删除`、`不是X而是Y→并非X。Y` 这类全局替换无法判断语境，会改变角色语气和作者修辞。
2. **AI 味检测全靠固定词表 + 硬编码专有名词**（P0，正确性 + 过拟合）—— `AI_VOCAB_TRACE_RE` 写死词表；`repeatedSentenceStartCount` / `evaluateProseReadability` 内嵌了"沈言/孙奉/木牌/裂井/剑魂"等单部小说的专名，换书即失效或误判。
3. **启发式评分与 LLM Critic 判断未交叉校验**（P1，把关完整性）—— `logic` 启发式分与 critic 的 `logic_chain` 可能打架，但门控只用启发式分，critic 的 major/critical 未纳入。
4. **缺人工标注黄金集，评分器本身未被验证**（P1，可信度）—— `eval:check` 只防数字漂移，无法回答"91.3 分人类是否认可"。
5. **去 AI 味与逻辑严密在长篇里互相对抗**（P2，目标协调）—— 去 AI 味鼓励省略/留白/少连接词，逻辑门控要求因果连接词密度，两个硬门可能把模型逼向中庸安全区。

---

## 一、拆分规则清洗：格式净化与词汇替换分离（P0）

### 问题

`writerOutputCleanup.ts` 的 `CLEANUP_RULES` 把两类性质完全不同的规则混在 `ai_signature` 类别里：

- **格式类**（安全）：`bold_markdown`、`heading`、`list_marker`、`emoji`、`punct_*`、`ws_*` —— 这些是确定性的格式残留，删除几乎不会误伤语义。
- **词汇/句式类**（危险）：`vocab_seem`（似乎→像是）、`vocab_slowly`（慢慢→删除）、`antithesis`（不是X而是Y→并非X。Y）、`hearsay`（据说→门里人说）、`this_moment`（这一刻→这时）等 —— 这些做的是**无语境的全局字符串替换**，问题在于：
  - "似乎"可能是角色真实的不确定判断，替换成"像是"或删除会改变叙事语气；
  - "不是…而是…"可能是作者刻意的强调修辞，机械改写成"并非…。…"会破坏句子节奏甚至语义；
  - "据说→门里人说"凭空编造了信息来源，可能与剧情不符（谁说的？）。

矛盾点在于：`humanStyle.ts` 的提示层其实写得很对（"每个词必须有画面价值""保留角色不确定性，但别连环套"），它要的是**有语境判断的改写**；而 `writerOutputCleanup` 的正则做的是**无语境的强制替换**，两者目标不一致。代码注释自己也承认这是 "band-aid"，且 `novelQuality.ts` 第 540-559 行已经把"清洗前 raw 命中高"解读为"应从提示侧治理而非依赖清洗"——说明设计者已意识到清洗层不该承担词汇治理。

### 方案

把 `CleanupCategory` 从 `"ai_signature" | "hygiene"` 细化为三类，让清洗层只做"绝对安全"的事：

```
type CleanupCategory =
  | "format"   // 格式净化：Markdown/emoji/标题/列表 —— 确定性，保留
  | "hygiene"  // 标点空白归一化 —— 确定性，保留
  | "vocab";   // 词汇/句式替换 —— 有语义风险，默认关闭
```

规则迁移：

| 现规则 id | 现类别 | 新类别 | 处置 |
|-----------|--------|--------|------|
| `bold_markdown` / `heading` / `list_marker` / emoji | ai_signature | **format** | 保留，默认开 |
| `dash_overuse`（破折号→句号）| ai_signature | **format** | 保留但**降级**：破折号转句号会改变停顿语义，建议改为"仅在旁白连续 `——` 时归一为单个，不强制转句号"；或移到 vocab |
| `signposting`（接下来/下面是→删）| ai_signature | **format** | 保留（这些在小说正文里基本是纯 AI 残留）|
| `vocab_*`（似乎/慢慢/仿佛/缓缓…）| ai_signature | **vocab** | **默认关闭**，仅统计命中数 |
| `hearsay` / `this_moment` / `antithesis` | ai_signature | **vocab** | **默认关闭**，仅统计命中数 |
| `punct_*` / `ws_*` | hygiene | **hygiene** | 保留，默认开 |

行为变化：

- `cleanupWriterOutput(text)` 默认只应用 `format` + `hygiene` 规则，**不再做词汇替换**。词汇问题完全交给提示层（治本）和 critic 的 `prose_quality`（语义判断）。
- 新增可选参数控制是否启用 vocab 替换，保持向后兼容与可配置：

```
interface CleanupOptions {
  applyVocab?: boolean;  // 默认 false
}
cleanupWriterOutput(text: string, options?: CleanupOptions): string
cleanupWriterOutputWithReport(text: string, options?: CleanupOptions): CleanupResult
```

- **关键：词汇命中仍然全部统计并返回 `hits`**（即使不替换）。这样 `novelQuality.ts` 的 `rawCleanupHits` 信号、`evaluateAiVoice` 的"清洗前命中"评分逻辑完全不受影响——它读的是 `category === "ai_signature"` 的 hits，迁移后改读 `category === "vocab"` 即可。评分照常感知 AI 味，但不再靠破坏性替换"假装"干净。

### 改动文件

- `lib/llm/writerOutputCleanup.ts`：重构 `CleanupCategory`、`CLEANUP_RULES` 分类、`applyRules` 接受 options、四个导出函数签名加可选 options。
- `lib/agent/chapterPipeline.ts`：第 119、156 行调用处显式传 `{ applyVocab: false }`（或依赖默认值）。
- `lib/evals/novelQuality.ts`：`aggregateAiSignatureHits` 与 `evaluateAiVoice` 里的 `category === "ai_signature"` 过滤改为 `category === "vocab"`（或新增常量集合 `AI_SIGNATURE_CATEGORIES = ["vocab"]`，避免散落字符串）。
- `lib/llm/prompts/humanStyle.ts`：无需改，提示层本就是治本侧，强化即可（见第五章张力协调）。

### 测试

- `writerOutputCleanup.test.ts`：新增用例断言——默认调用下"似乎/慢慢/不是X而是Y"**保持原文**，但 `hits` 仍记录命中次数；`applyVocab:true` 时才替换；格式类（Markdown/emoji）始终被清除。
- `novelQuality.test.ts` / `qualityGate.test.ts`：确认 `ai_voice` 评分在迁移后对同一输入打分不变（用 fixture 回归）。
- 跑 `npm run eval:check` 确认 baseline 容差内（tolerance 5）。

### 风险

- **评分基线可能漂移**：若历史 baseline 是在"词汇已被替换的干净文本"上评的，迁移后评分文本含更多原始词汇，`ai_voice` 分可能略降。处置：迁移后重新生成一次 baseline fixture，或确认漂移在 tolerance 5 内。
- 破折号转句号降级需谨慎：若产品上明确不要旁白破折号，可保留在 format；本方案倾向移到 vocab，由提示层处理。这一条可单独决策。

---

## 二、AI 味检测去过拟合：动态白名单 + 统计特征（P0）

### 问题

两处硬编码导致检测器与单部小说耦合，换书即失效：

1. **`novelQuality.ts` 第 776-794 行 `repeatedSentenceStartCount` 的 `ignoredStarts`** 写死了"沈言/孙奉/蒋阶/剑魂/柴饦/赵家/那人/门外/雨水…"——这些是某部小说的专名和高频句首。换一部小说，这些豁免词不仅失效，还会把新小说的正常句首误判为"重复"。
2. **`evaluateProseReadability` 第 589 行 `vividNouns` 正则** 写死"火房|木牌|裂井|剑鸣|旧疤|冷雨|柴烟|尸检|黑箱|冷却|录像|档案"，`hasVerifiableStateChange`、`evaluateContinuity` 的 `hasBridge`（第 259 行 `那枚|木牌|裂井|考核|旧案|剑魂|昨夜`）同样内嵌专名。
3. **`AI_VOCAB_TRACE_RE`（固定词表）** 是题材/模型相关的：网文与严肃文学的 AI 腔不是同一批词；模型换近义词即可绕过。

### 方案

分两部分：**专名白名单动态化** + **引入题材无关的统计特征**。

#### 2.1 专名从 Bible 动态生成

`buildTokenStats(bible)` 已经在做这件事（提取 people/places/objects/plotTerms）。把所有硬编码专名替换为从 `tokenStats` 派生：

- `repeatedSentenceStartCount` 的 `ignoredStarts`：改为接收 `tokenStats.people`（角色名）+ 常见中文代词（他/她/它，可保留为题材无关的小常量集），不再写死具体人名。
- `hasBridge` 的承接词正则：拆成两部分——**通用承接词**（前一/刚才/方才/昨夜/三日，题材无关，保留）+ **本书专名**（从 `tokenStats.objects` + `tokenStats.places` 动态生成正则）。
- `vividNouns`：改为"正文中出现的、且在 `tokenStats.objects` 里的具体物象数量" + 通用的感官名词小词典（手/汗/泥/水/火/血，题材无关）。

签名调整示意：

```
// 现在
function repeatedSentenceStartCount(text: string): number
// 改为
function repeatedSentenceStartCount(text: string, knownNames: string[]): number
```

把 `tokenStats` 透传进这些子函数（它们目前在 `evaluate*` 内被调用，`tokenStats` 已在作用域内或可加参数）。

#### 2.2 引入统计特征，降低对固定词表的依赖

固定词表保留（作为快速信号），但**新增题材无关的分布特征**作为 `ai_voice` 的补充维度，权重并入现有 10 分：

| 特征 | 计算 | AI 味信号 |
|------|------|-----------|
| 句长分布熵 / 变异系数 | 已有 `coefficientOfVariation`，扩展到句长 | 过低 = 句式工整 = AI 味（已部分实现 `paragraphCv`，补句长维度）|
| 词汇丰富度（type-token ratio）| 去重 token 数 / 总 token 数，按窗口 | 过低 = 用词重复单调 |
| 高频 2-gram/3-gram 集中度 | 复用 `extractTerms` 的 n-gram，统计 top-k 占比 | 过高 = 套路化表达 |
| 标点节奏方差 | 句间标点间隔的方差 | 过低 = 节奏机械 |

这些特征对题材和模型都不敏感（衡量的是"文本统计形态"而非"具体用词"），能在词表失效时兜底。**词表命中仍保留**，两者取并集判断。

> 说明：本方案不引入真正的 perplexity（需额外模型或 logprobs，成本与依赖都重），而是用上述轻量统计量近似"文本是否过于规整"。若后续接入了能返回 token logprobs 的模型，可把 perplexity 作为更强信号补入。

### 改动文件

- `lib/evals/novelQuality.ts`：
  - `repeatedSentenceStartCount`、`hasBridge`、`vividNouns`、`hasVerifiableStateChange` 改为接收 `tokenStats` 或派生白名单参数；删除硬编码专名。
  - `evaluateAiVoice` 新增 2-3 个统计特征子计算，并入现有扣分逻辑（保持满分 10 不变，重新分配各信号权重）。
  - 抽出题材无关常量：`GENERIC_PRONOUNS`、`GENERIC_SENSORY_NOUNS`、`GENERIC_BRIDGE_CUES`，与"本书动态专名"分离。
- 无新增外部依赖。

### 测试

- 新增 `novelQuality.test.ts` 用例：用**两套不同题材的 fixture**（现有玄幻 + 一套新题材，如都市），断言换 bible 后专名白名单随之变化、不再误判新题材的正常句首/物象。这是验证"去过拟合"的关键。
- 断言统计特征对"机械工整文本"与"自然错落文本"能区分（构造两段对照 fixture）。

### 风险

- 统计特征阈值需要校准，初期可能误判。处置：先以"仅记录、不扣分"模式上线（shadow），用第四章的黄金集校准阈值后再启用扣分。
- 与第一章解耦：本章不依赖第一章，可独立落地，但两者都动 `evaluateAiVoice`，建议同一 PR 或注意合并顺序。

---

## 三、Critic 结果纳入门控：语义与启发式交叉校验（P1）

### 问题

系统有两套对"逻辑"的判断，但门控只信其一：

- **启发式 `logic`**（`novelQuality.ts` `evaluateLogic`）：靠"因果连接词密度""目标-行动-结果链"等**表层信号**打分，进入门控（`qualityGate.ts` 硬门 `logic≥7`）。
- **LLM Critic `logic_chain` / `prose_quality`**（`critic.ts`）：靠**语义理解**判断，结果在 `chapterPipeline` 里只用于触发 revise，`revisedRounds` 跑完后 `criticIssues` 就**仅作为返回值记录，不进门控**（见 `generateChapterHandler.ts` 第 197 行 `evaluateChapterGate` 只传了 window + bible + qualityFloor）。

后果：一章可能堆满"因为/所以"让启发式 `logic` 拿高分通过门控，但 critic 实际识别出 `logic_chain` 是 major（事件堆叠、读不出主链）。语义判断被丢弃，门控放行了语义上有问题的章节。反之，启发式因连接词少误判低分、而 critic 认为逻辑通顺的情况也存在（正是第五章的张力）。

### 方案

把 critic 的最终结果（`ChapterPipelineResult.criticIssues`，已存在）作为门控的**第三类硬门**，与启发式总分门、维度硬门并列：

```
// qualityGate.ts 扩展
interface QualityGateOptions {
  qualityFloor?: number;
  dimensionFloors?: Partial<Record<MetricResult["key"], number>>;
  fixtureId?: string;
  // 新增
  criticIssues?: CriticIssue[];      // 来自本章最终 critic pass
  criticFloor?: {                    // 默认：critical>0 失败；major 不直接失败但计入
    failOnCritical?: boolean;        // 默认 true
    maxMajor?: number;               // 默认不限制（避免与现有行为冲突），可配
  };
}
```

判定逻辑（叠加到现有 `pass` 上）：

- 若 `criticIssues` 含 `severity === "critical"` 且 `failOnCritical`（默认 true）→ 门控失败，reason 注明"critic 标记 critical：{description}"。
- 若 major 数量 > `maxMajor`（默认不设限，保持向后兼容）→ 失败。
- minor 不影响门控（与 pipeline 现有"minor 不触发重写"一致）。

数据流（关键，需打通）：`chapterPipeline` 已返回 `criticIssues` → `generateChapterHandler.finalizeRun` 已持有 `result: ChapterPipelineResult` → 第 197 行调用 `evaluateChapterGate` 时把 `result.criticIssues` 透传进 options 即可。**无需新增 LLM 调用，零额外成本**——critic 本来就跑了，只是结果之前没进门控。

### 为什么这是"交叉校验"而非"重复"

启发式（看表层信号、零 token、稳定）和 critic（看语义、有 token、波动）**互为补充**：启发式抓"机械文本"（连接词缺失、重复），critic 抓"语义矛盾"（事件堆叠但有连接词的伪逻辑）。两道门取交集 = 两者都认可才放行，把"启发式漏报的语义问题"和"critic 漏报的机械问题"互相补上。

### 改动文件

- `lib/agent/qualityGate.ts`：`QualityGateOptions` 加 `criticIssues` / `criticFloor`；`evaluateChapterGate` 增加 critic 硬门判定，`reason` 拼接。
- `lib/jobs/generateChapterHandler.ts`：`finalizeRun` 第 197 行调用处传 `criticIssues: result.criticIssues`。
- `QualityGateResult` 可加 `criticBlocked: CriticIssue[]` 字段供 UI/日志展示。

### 测试

- `qualityGate.test.ts`：构造"启发式分达标但 critic 含 critical"的输入，断言门控失败；"critic 仅 minor"时不影响；`failOnCritical:false` 时退回旧行为。
- `generateChapterHandler.test.ts`：断言 critical issue 触发 `markNeedsReview`。

### 风险

- **可能提高挂起率**：之前放行的章节现在可能被 critic critical 拦下。这是预期的（拦的是真问题），但需告知用户/调参。处置：`criticFloor` 全可配，`checkpoint_mode === "none"` 时仍只记录不止链（沿用现有逻辑）。
- critic 的 JSON 偶有解析失败（`parseCriticResult` 失败时返回 `consistent:false, issues:[]`）→ 不会有 critical issue → 不会误杀，安全降级。

---

## 四、人工标注黄金集：验证评分器本身（P1）

### 问题

`eval:check`（`eval-novel-quality-matrix.ts --baseline ... --tolerance 5`）只能保证"评分函数的输出相对历史基线没漂移"，**无法回答评分是否准确**：一个 91.3 分的章节，人类读者是否真觉得 AI 味轻、逻辑通？目前整套评分维度的权重和阈值都是凭经验设定，没有外部锚点验证。这是从"看起来合理"到"被验证合理"的唯一缺口。

### 方案

建立一个小规模**人工标注黄金集**，定期计算自动分与人工分的相关性，用相关性指导评分维度调参。

#### 4.1 数据集结构

新增 `docs/evals/golden/` 目录，存放人工标注样本：

```
docs/evals/golden/
  manifest.json          # 样本索引：id、题材、章节范围、标注人、标注日期
  samples/
    {id}.chapters.json   # 章节正文（脱敏，或用已生成的公开样本）
    {id}.labels.json     # 人工标注
```

`labels.json` 结构（人工对每章/每滑窗打分，1-5 或 0-10，维度对齐评分器）：

```
{
  "sampleId": "urban-suspense-ch10-12",
  "window": [10, 11, 12],
  "humanScores": {
    "ai_voice": 7,            // 人工：AI 味轻重（越高越像人）
    "logic": 8,               // 人工：逻辑是否通顺
    "continuity": 9,
    "overall": 8,
    "readable": 8             // 人工：是否愿意读下去（综合体感）
  },
  "annotator": "...",
  "notes": "第11章中段有一处动机跳转"
}
```

规模建议：**起步 20-30 个滑窗样本**，覆盖至少 2-3 个题材（玄幻 / 都市悬疑 / 其他）。已有 `docs/evals/baselines/` 里的 real-llm 样本可直接拿来人工补标，降低冷启动成本。

#### 4.2 相关性校验脚本

新增 `scripts/eval-golden-correlation.ts`：

- 对每个黄金集样本跑 `evaluateNovelQuality`，得到自动分。
- 与 `humanScores` 按维度计算相关性：**Spearman 秩相关**（关注排序一致性，比 Pearson 更鲁棒，不要求线性）+ 平均绝对误差（MAE）。
- 输出报告：每个维度的相关系数、整体 overall 相关性、明显偏离的样本列表（自动分与人工分差异最大的，供 review）。
- 设阈值（如 `ai_voice` / `logic` Spearman ≥ 0.5 算可用），低于阈值在输出里标红，提示该维度评分逻辑需调整。

加入 `package.json`：`"eval:golden": "tsx scripts/eval-golden-correlation.ts"`，并考虑纳入 `verify` 链（非阻塞模式，仅报告）。

#### 4.3 用相关性驱动调参

这是黄金集的真正价值：当第二章的统计特征、第一章的清洗变更、或任何评分维度调整后，跑 `eval:golden` 看相关性升降——**相关性升 = 改对了，降 = 改错了**。它给所有评分改动提供了客观裁判，而不是只看 baseline 没漂移。

### 改动文件

- 新增 `docs/evals/golden/`（数据）、`scripts/eval-golden-correlation.ts`（脚本）。
- `package.json` 加 `eval:golden` script。
- 不改评分器本身——本章是"验证设施"，为前三章的改动提供裁判。

### 测试

- `scripts/eval-golden-correlation.ts` 自身的单测：用构造的"自动分与人工分完全一致 / 完全相反"数据，断言相关系数计算正确（≈1 / ≈-1）。

### 风险

- **人工标注成本**：20-30 样本的标注需要人力，且标注者主观性会引入噪声。处置：起步小、单标注者即可建立趋势；后续可双标注算一致性（Cohen's kappa）。
- 标注样本若用真实生成内容，注意脱敏与版权（开源仓库公开）。建议用 `LLM_MOCK` 或专门为评测生成的样本。

---

## 五、协调"去 AI 味"与"逻辑严密"的内在张力（P2）

### 问题

两个目标在句子层面互相拉扯：

- **去 AI 味**（`humanStyle.ts` 第 5 条"承接句可省主语"、第 9 条"旁白禁止破折号"、整体鼓励留白/断句/不解释）→ 减少连接词和解释。
- **逻辑门控**（`evaluateLogic` 看"因果/转折提示密度 ≥0.16"、`hasCausalHook` 要求因果连接词）→ 要求更多连接词。

结果：写得越像人（省略、留白），启发式 `logic` 的连接词密度越低、分越低；为了过 `logic` 门又会写得更"工整解释"，AI 味回升。`ai_voice≥6` 和 `logic≥7` 两个硬门可能把模型逼向"既不够像人、也不够省略"的中庸安全区。critic 提示里已隐约意识到（让 critic 对主观类克制），但**启发式评分层没有这个协调**。

### 方案

不追求"消除"张力（它本质是真实写作的权衡），而是**让评分层识别并允许"高质量的省略"**，避免把"好的留白"误判为"逻辑缺失"。

#### 5.1 logic 评分：从"连接词密度"转向"因果可达性"

现状 `evaluateLogic` 过度依赖**显式连接词计数**（`LOGIC_CUES` 密度）。优秀的中文小说常用**隐含因果**（动作并置即表因果，无需"因为")。改进方向：

- 降低"连接词密度"这一项的权重（现 +2/+1），提高"目标-行动-结果链"`hasGoalActionResultChain` 的权重（现 +2）——后者看的是语义结构而非表面词，对省略更友好。
- 把"显式连接词缺失"从**扣分项**改为**中性项**：缺连接词不一定是问题，只有"既无连接词、又无可识别的目标-结果链"才扣分。即从"罚省略"改为"罚断裂"。

#### 5.2 让 critic 承担"省略是否合理"的语义判断

连接词密度这类表层信号本就不该由启发式当硬门。方案：

- 启发式 `logic` 门**下调或软化**（如 `logic≥7` → `logic≥6`，或对省略友好的题材放宽），把"逻辑是否真的断裂"的最终裁量权交给 critic 的 `logic_chain`（已在第三章纳入门控）。
- 这样形成分工：**启发式抓"机械/重复"（它擅长），critic 抓"逻辑断裂/省略是否过度"（它擅长）**，不再用表层连接词密度这一项硬卡省略。

#### 5.3 提示层显式声明权衡

在 `HUMAN_STYLE_DIRECTIVE` 已有的第 10-11 条（"动作可断、话可没说完，但因果必须清楚""至少留两处因果/代价句"）基础上，明确"省略主语和减少连接词时，必须保留可推断的因果"——即**允许省略形式，但不允许省略逻辑**。这一条已部分存在，强化措辞即可，让模型理解"去 AI 味 ≠ 砍掉因果"。

### 改动文件

- `lib/evals/novelQuality.ts`：`evaluateLogic` 权重再分配（连接词密度降权、目标-行动-结果链升权、"断裂"才扣分）。
- `lib/agent/qualityGate.ts`：`DEFAULT_DIMENSION_FLOORS` 的 `logic` 阈值可下调（依赖第四章黄金集验证后再定值，不要拍脑袋）。
- `lib/llm/prompts/humanStyle.ts`：第 10-11 条措辞强化。

### 测试 & 验证

- **必须依赖第四章黄金集**：本章所有阈值/权重调整都应以"`eval:golden` 相关性是否提升"为验收标准，否则只是换一组拍脑袋的参数。
- `novelQuality.test.ts`：构造"省略主语但因果可推断"的样本，断言新 `evaluateLogic` 不再误判为低分；"事件堆叠无因果"样本仍低分。

### 风险

- 这是最主观、最易反复的一项，**强烈建议放在第四章之后**，用数据驱动而非直觉。无黄金集时不要动这块，否则可能越调越偏。

---

## 六、改动文件总览

| 文件 | 一 拆分清洗 | 二 去过拟合 | 三 critic 进门控 | 四 黄金集 | 五 张力协调 |
|------|:---:|:---:|:---:|:---:|:---:|
| `lib/llm/writerOutputCleanup.ts` | ✅ 重构 | | | | |
| `lib/evals/novelQuality.ts` | 改过滤常量 | ✅ 去专名+统计特征 | | | ✅ logic 权重 |
| `lib/agent/qualityGate.ts` | | | ✅ critic 硬门 | | 调 logic 阈值 |
| `lib/agent/chapterPipeline.ts` | 调用传 options | | | | |
| `lib/jobs/generateChapterHandler.ts` | | | ✅ 透传 criticIssues | | |
| `lib/llm/prompts/humanStyle.ts` | | | | | ✅ 措辞强化 |
| `scripts/eval-golden-correlation.ts` | | | | ✅ 新增 | |
| `docs/evals/golden/` | | | | ✅ 新增数据 | |
| `package.json` | | | | ✅ eval:golden | |

---

## 七、落地顺序与依赖

```
P0（正确性，先做，互相独立）
 ├─ 第一章 拆分规则清洗 ──┐
 └─ 第二章 去过拟合 ──────┤（两者都动 evaluateAiVoice，建议同 PR 或注意顺序）
                          │
P1（把关与验证）           ▼
 ├─ 第三章 critic 进门控（独立，零成本，可随时做）
 └─ 第四章 黄金集 ◀────── 为第二/五章的阈值提供裁判，越早建越好
                          │
P2（最后，数据驱动）        ▼
 └─ 第五章 张力协调 ◀──── 依赖第四章黄金集，无数据不要动
```

推荐顺序：**第四章（先建裁判）→ 第三章（零成本快赢）→ 第一章 + 第二章（P0 正确性）→ 第五章（用裁判调参）**。

> 注意：虽然第一/二章是 P0，但第四章黄金集是它们的验收裁判，所以黄金集应**最先启动**（标注可并行进行），代码改动再跟上。

---

## 八、整体风险与回滚

- **评分基线漂移**：第一、二、五章都可能改变 `evaluateNovelQuality` 输出。每次改动后跑 `npm run eval:check`，超出 tolerance 5 则重新生成 baseline fixture 并在 PR 说明。
- **挂起率变化**：第三章会提高挂起率（拦真问题）。通过 `criticFloor` 配置和 `checkpoint_mode` 控制，可灰度。
- **向后兼容**：所有新参数（`CleanupOptions.applyVocab`、`QualityGateOptions.criticIssues/criticFloor`）默认值都保持旧行为或安全降级，老调用方不受影响。
- **回滚**：每章改动独立、可单独 revert；黄金集和脚本是纯增量，无回滚风险。

## 九、验收标准

- 第一章：默认清洗不再替换词汇（测试断言），格式净化照常；`eval:check` 通过。
- 第二章：换题材 fixture 不再误判专名（测试断言）；统计特征能区分机械/自然文本。
- 第三章：critic critical 能拦下启发式放行的章节（测试断言）；零额外 LLM 调用。
- 第四章：`eval:golden` 可跑、输出各维度 Spearman 相关性；建立 ≥20 样本黄金集。
- 第五章：调参后 `eval:golden` 相关性不低于调参前（数据驱动验收）。
- 全程：`npm run verify` 通过。

