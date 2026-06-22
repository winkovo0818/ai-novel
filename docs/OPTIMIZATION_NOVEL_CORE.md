# 小说生成核心逻辑优化建议

> 创建时间：2026-06-22
> 范围：AI 小说生成核心链路——writer 起草、critic 审校、revise 修订循环、RAG 记忆检索、分层摘要、Story State diff、质量门控。
> 定位：本文是 [`OPTIMIZATION_PLAN.md`](./OPTIMIZATION_PLAN.md) 中 P1（AI 质量迭代体系）与 P3（长篇记忆可信化）的**技术深化**——前者是产品级宏观计划，本文聚焦核心生成逻辑，给到代码行级的具体改法。
> 方法论：所有标注「✅ 已验证」的 Bug 均已逐行读码确认；所有优化项给出现状引用、具体方案、预期效果、代价与验证方式。

---

## 0. 核心原则

1. **改 prompt / 算法后必须用真实 LLM eval 对比**：`npm run eval:novel-quality`（4 个 fixture case）+ `npm run eval:novel-quality:matrix`。禁止「改完感觉更好但 eval 退步」。建议每项优化建立 before/after 的 eval 快照。
2. **启发式评分会被刷分**：凡是基于关键词/正则的评分（continuity/logic/ai_voice），模型都能学会「塞关键词」而非「写真质量」。长期方向是 critic（LLM）承担语义判定。
3. **长篇的天花板在架构**：当前「prompt 拼上下文」的连贯性有结构性上限，40+ 章必然衰减。P3 架构方向是真正突破天花板的投资。

---

## 一、优化项总览

| 梯队 | 编号 | 优化点 | 类型 | 代价 | 质量杠杆 |
|------|------|--------|------|------|----------|
| 🔴 P0 | 1.1 | 物品误存 geography | ✅ Bug | 极低 | 防数据污染 |
| 🔴 P0 | 1.2 | 质量门窗口缺字段 | ✅ Bug | 低 | 评分基线恢复 |
| 🔴 P0 | 1.3 | 破折号清洗误伤对白 | ✅ Bug | 低 | 防语义破坏 |
| 🔴 P0 | 1.4 | 路标词清洗误删正文 | ✅ Bug | 低 | 防语义破坏 |
| 🟡 P1 | 2.1 | Writer prompt 指令去重瘦身 | 优化 | 低 | 高 |
| 🟡 P1 | 2.2 | 加正面文风示例（few-shot） | 优化 | 低 | **最高** |
| 🟡 P1 | 2.3 | 字数指令明确化 | 优化 | 极低 | 中 |
| 🟡 P1 | 2.4 | Critic isRevision 降敏限定范围 | 优化 | 低 | 高 |
| 🟡 P1 | 2.5 | Critic suggestion 具体性约束 | 优化 | 极低 | 中 |
| 🟡 P1 | 2.6 | 循环防退化（bestText） | 优化 | 低 | 高 |
| 🟡 P1 | 2.7 | Story State 膨胀控制 | 优化 | 低 | 中（长篇） |
| 🟡 P1 | 2.8 | 远端卷摘要全注入 | 优化 | 低 | 高（长篇） |
| 🟡 P1 | 2.9 | 前章摘要 fallback 改进 | 优化 | 极低 | 中 |
| 🟢 P2 | 3.1 | RAG 去重改 RRF | 优化 | 低 | 中 |
| 🟢 P2 | 3.2 | 关键词预过滤改 per-query | 优化 | 低 | 中 |
| 🟢 P2 | 3.3 | 加相似度绝对阈值 | 优化 | 极低 | 中 |
| 🟢 P2 | 3.4 | 索引摘要/设定入向量库 | 优化 | 中 | 高（长篇） |
| ⚪ P3 | 4.1 | 活跃约束清单 + critic 校验 | 架构 | 高 | **最高（长程）** |
| ⚪ P3 | 4.2 | 因果链图 | 架构 | 高 | 高（长程） |
| ⚪ P3 | 4.3 | 基于实体的必要性检索 | 架构 | 中 | 高（长程） |

---

## 二、🔴 P0：确定 Bug（立即修，已逐行验证）

### 1.1 物品被错误存入地理数组 ✅

**现状**：`lib/validation/stateDiffMerge.ts:337-348`

```ts
} else if (entity.type === "item") {
  const itemText = `[物品] ${entity.name}`;
  if (!nextBible.world.geography.includes(itemText) && nextBible.world.geography.length < 10) {
    nextBible = { ...nextBible, world: { ...nextBible.world, geography: [...nextBible.world.geography, itemText] } };
  }
}
```

**问题**：`item` 类型实体被 push 进 `world.geography`（schema 定义为地点列表）。而 `:392-399` 的 `location` 才正确存进 `locations`，item 在后续也正确存进 `story_state.items`——所以 geography 里这份是**冗余且语义错误**的副本。后果：
- 物品污染地点列表，`retrieval.ts` 的 `buildQueryKeywords` 会把「[物品] XX」当地点关键词；
- 占用 geography 的 10 条上限，真正的地点被挤掉；
- 每生成一章累积一次，**永久污染 Bible**。

**方案**：删除 `:337-348` 整个 `else if (entity.type === "item")` 分支（item 已在 story_state.items 正确处理）。

**代价**：删 12 行，零风险。
**验证**：`stateDiffMerge.test.ts` 补一个「new_entities 含 item → world.geography 不变、story_state.items 含该 item」的用例。

---

### 1.2 质量门评分基线失真 ✅

**现状**：`lib/jobs/generateChapterHandler.ts:284-288`

```ts
function buildQualityWindow(priorChapters, chapterIndex, result): QualityChapterInput[] {
  const window = priorChapters
    .filter((c) => c.chapter_index < chapterIndex)
    .map((c) => ({ chapterIndex: c.chapter_index, title: c.title ?? "", content: c.content }));  // ← 漏字段
  window.push({ chapterIndex, title: result.title, content: result.content });                    // ← 漏字段
  return window.slice(-3);
}
```

**问题**：`QualityChapterInput`（`novelQuality.ts:9-21`）有可选字段 `outlineSummary` 和 `rawCleanupHits`，但这里都没填：
- `outlineSummary` 缺失 → `evaluateContinuity`（`novelQuality.ts:262`）的「大纲关键词重合」子项 `extractTerms("")` 为空，overlapCount 永远 0，**continuity 维度最多 10 分里有 2 分被锁死在 0**；
- `rawCleanupHits` 缺失 → `evaluateAiVoice`（`:565-566`）的 `rawChapters` 为空，**raw cleanup pressure 检查完全跳过**，模型原始 AI 味无法被门控感知。

结果是质量门按**系统性偏低、维度残缺**的分数做判定，阈值（85 分 / ai_voice≥6）的校准前提就不成立。

**方案**：

```ts
function buildQualityWindow(priorChapters, chapterIndex, result, bible, rawCleanupHits): QualityChapterInput[] {
  const outlineSummary = getChapterOutlineSummary(bible, chapterIndex); // 从 bible.outline 取本章大纲
  const window = priorChapters
    .filter((c) => c.chapter_index < chapterIndex)
    .map((c) => ({ chapterIndex: c.chapter_index, title: c.title ?? "", content: c.content, outlineSummary }));
  window.push({ chapterIndex, title: result.title, content: result.content, outlineSummary, rawCleanupHits });
  return window.slice(-3);
}
```

其中 `rawCleanupHits` 从 `result.cleanupReport.hits`（chapterPipeline 已调用 `cleanupWriterOutputWithReport`）取；`outlineSummary` 从 `getAllChapters(bible).find(c => c.index === chapterIndex)?.summary` 取。

**注意**：补字段后评分会变化（continuity 普遍回升、ai_voice 可能变化），**需重新跑 eval 校准阈值**，必要时调整 `qualityGate.ts:10,13-16` 的门控线。

**代价**：低（补字段 + 可能校准阈值）。
**验证**：跑 40 章 auto-pilot，对比补字段前后的 continuity/ai_voice 分布，确认无异常偏移。

---

### 1.3 破折号清洗误伤对白 ✅

**现状**：`lib/llm/writerOutputCleanup.ts:57`

```ts
{ id: "dash_overuse", label: "旁白破折号", category: "format",
  pattern: /[—–]+|--+/g, replacement: "。" },
```

**问题**：`format` 类规则默认无条件执行，把**所有**破折号替换成句号，包括对白中角色被打断的合法用法：`"等一——"` → `"等一。"`。这直接改变语义，且与 `humanStyle.ts:292` 自己定的「对白里最多保留 1 处破折号」矛盾。清洗是静默执行的，用户无法察觉。

**方案**：只清洗引号外的破折号。最简洁的实现——按引号分段，只对非对白段应用规则：

```ts
function cleanNarrationDashes(text: string): string {
  // 按中文引号分割，只清洗奇数段（引号外=旁白）
  return text.split(/([“”"])/).reduce((acc, part, i) => {
    const insideQuote = /* 跟踪是否在引号内 */;
    return acc + (insideQuote ? part : part.replace(/[—–]+|--+/g, "。"));
  }, "");
}
```

或更简单的启发式：破折号紧邻引号边缘（`—"` / `"—` / `——」`）时跳过。

**代价**：低。
**验证**：`writerOutputCleanup.test.ts` 补「对白内破折号保留 / 旁白破折号清洗」两类用例。

---

### 1.4 路标词清洗误删正文 ✅

**现状**：`lib/llm/writerOutputCleanup.ts:58`

```ts
{ id: "signposting", label: "教程路标", category: "format",
  pattern: /接下来(?:我们)?|下面是|以下是|让我们/g, replacement: "" },
```

**问题**：不限位置地删除「接下来」，正文里角色台词「接下来怎么办？」会被清洗成「怎么办？」。「下面是」「以下是」同理（小说里可能写「以下是他随身的三样东西」）。

**方案**：限定为段首/行首匹配：

```ts
pattern: /^\s*(接下来(?:我们)?|下面是|以下是|让我们)/gm, replacement: "",
```

非段首的「接下来」极大概率是正文合法用语，不应清洗。

**代价**：极低（改正则）。
**验证**：补「段首路标删除 / 正文『接下来』保留」用例。

---

## 三、🟡 P1：高杠杆 Prompt / 算法优化

### 2.1 Writer prompt 指令去重瘦身

**现状**：`lib/llm/prompts/chapter.ts:146-165` 的 system prompt 堆叠了：
- `HUMAN_STYLE_DIRECTIVE`（约 1500 字，13 条执行标准 + 29 种痕迹全清单，`humanStyle.ts:279-296`）
- `WRITER_SELF_REVISION_DIRECTIVE`（8 条自检，`humanStyle.ts:298-306`）—— 与前者 4 处内容重叠（破折号、AI 高频词、Markdown、因果钩各重复一遍）
- 硬规则 8 条（`:154-162`），其中 `:161` 又重复了一遍 humanizer 29 种痕迹自查

system 消息超过 3000 字纯规则，触发「lost in the middle」效应——模型对每条规则的遵从率下降，这也是 `writerOutputCleanup` 仍需兜底的根因。

**方案**：
1. 合并 `HUMAN_STYLE_DIRECTIVE` + `WRITER_SELF_REVISION_DIRECTIVE`，去重 4 处；
2. **把 29 种痕迹的完整清单从 writer prompt 移出**，只留 5-6 条核心准则（如「旁白禁破折号」「不写三连排比」「AI 高频词全文 ≤3」「每 500 字一个感官细节」「对话要有打断/改口」「结尾落具体物」）；
3. 完整清单留给 critic 的 prose_quality 判定参考（critic 需要可计数清单，writer 不需要）。

**预期**：writer 注意力集中于剧情和文风，prose_quality 命中率下降 30-50%。
**代价**：低（改 2 个 prompt 文件）。
**验证**：eval 的 ai_voice 维度对比。
**风险**：规则变少后短期内 writer 可能「放飞」，需 eval 确认 critic 能兜住。

---

### 2.2 加正面文风示例（few-shot）⭐ 最高杠杆

**现状**：writer 唯一的「示例」是 `chapter.ts:65-66` 的两个因果钩单句。没有任何「好段落长什么样」的参照。中文 LLM 写小说最大的问题不是不懂规则，而是没有具体的文风靶子去模仿。

**方案**：在 user message（`:168` 之后）加一段「风格参照片段」（200-300 字），来源按优先级：
1. `NovelProfile` / Bible 里用户指定的 `style_reference` / `style_sample` 字段（需在 schema 加可选字段）；
2. 或从已生成且评分高的章节中自动取最佳段落（`qualityTrend` 已有评分数据，取 top-1）；
3. 兜底：按题材内置 1-2 个高质量范文片段。

**预期**：质量提升最直接的一条——模型从 1 个好例学到的文风，远超 30 条抽象规则。
**代价**：低-中（加字段 + 选片逻辑 + prompt 拼接）。
**验证**：A/B eval，有无文风示例的 prose_readability / ai_voice 对比。
**注意**：文风示例要标注「只学文风，不要照抄情节/角色名」，避免模型抄写。

---

### 2.3 字数指令明确化

**现状**：`chapter.ts:164` `目标字数接近 ${policy.targetWordCount} 字；MVP 可先输出较短但完整的开篇片段。`

**问题**：「MVP 可先输出较短」等于暗示模型可以偷懒；「接近」无下限，模型容易写 1500 字交差。

**方案**：

```ts
- 目标字数 ${policy.targetWordCount} 字（不少于 ${Math.floor(policy.targetWordCount * 0.85)} 字，不超过 ${Math.ceil(policy.targetWordCount * 1.15)} 字）。
```

给出明确下限，模型才有动力写满。同时 `chapterPipeline.ts:131` 的 `MAX_TARGET_WORDS = 3000` 上限应在 prompt 里直接告知，避免模型写超后被截断。

**代价**：极低（改 1 行）。
**验证**：统计 auto-pilot 各章字数分布，确认达标率提升。

---

### 2.4 Critic isRevision 降敏限定范围

**现状**：`lib/llm/prompts/critic.ts:116-118`

```
特别说明：本章节已经按审校意见修订过一次。请大幅降低敏感度——只有 truly critical 或 genuinely major 的**新**事实矛盾才应标记……直接输出 {"consistent": true}
```

**问题**：「大幅降低敏感度」没区分维度，模型容易在第二轮全面降敏，包括 `prose_quality`——而修订轮恰恰是改善文笔的黄金机会。这与 `:104`「prose/logic 不受少报原则约束」自相矛盾（模型读到 `:116` 的「大幅降低」会覆盖 `:104`）。

**方案**：明确限定降敏范围只针对主观一致性类：

```
特别说明：本章节已经按审校意见修订过一次。
- **主观一致性类**（character/world_rule/plot_thread/timeline/tone）：大幅降低敏感度，只有 truly critical 或 genuinely major 的**新**事实矛盾才标记。
- **可计数客观类**（logic_chain / prose_quality）：**不降敏**——如果修订稿仍命中句首重复/三连排比/套话，照常报。
若修订稿解决了主观类问题、且客观类无新信号，直接输出 {"consistent": true}。
```

**预期**：第二轮 revise 真正改善文笔而非流于形式。
**代价**：极低（改 prompt 文字）。
**验证**：eval 对比修订前后 ai_voice 改善幅度。

---

### 2.5 Critic suggestion 具体性约束

**现状**：`critic.ts:122` 的 JSON schema 要求 `suggestion: "修改建议"`，但无具体性指导。critic 写「改善文风」「增加细节」时，revise 无从下手。

**方案**：在 critic system prompt 加约束：

```
suggestion 必须指向具体段落或具体修改动作，例如「第 4-6 段连续以"他"开头，打散为不同主语或省略主语」或「结尾"命运的齿轮开始转动"改为具体的门闩/灯火变化」。禁止笼统的「改善文风/增加细节/调整节奏」类建议。
```

**代价**：极低。
**验证**：抽样人工检查 critic suggestion 的可操作性。

---

### 2.6 循环防退化（bestText）

**现状**：`lib/agent/chapterPipeline.ts:195-206`，循环无条件 `text = revised.text`，即使最后一版比上一版差。

**问题**：无「修订是否变好」的检测，存在越改越差风险（如为修 logic_chain 加了大段解释，引入新 prose 问题，但 `isRevision` 降敏后 critic 不报）。

**方案**：用已有的 `aiSignatureHitTotal`（`writerOutputCleanup.ts:133`，零额外 LLM 成本）做修订前后对比，维护 bestText：

```ts
let bestText = text;
let bestScore = aiSignatureHitTotal(cleanupReport);  // 越低越好
// 每轮 revise 后：
const revisedScore = aiSignatureHitTotal(revised.cleanupReport);
if (revisedScore <= bestScore) { bestText = revised.text; bestScore = revisedScore; }
// 循环结束返回 bestText 而非 text
```

进一步可叠加 `novelQuality.ts` 的 `typeTokenRatio`（TTR，词汇丰富度）——修订后 TTR 下降说明用词变单调，记 warning。

**预期**：消除越改越差的尾部风险，保证交付循环中最优版本。
**代价**：低。
**验证**：auto-pilot 对比有无 bestText 的最终章 ai_voice 分布。

---

### 2.7 Story State 膨胀控制

**现状**：`lib/validation/stateDiffMerge.ts:366-390`，timeline / plot_threads / foreshadowing 全部只追加不清理。

**问题**：40 章后 timeline 可达 40-120 条事件。`chapter.ts:40` 的 `buildStoryStateSection` 只注入最后 1 条 timeline，大量旧状态对写作无用；但 `stateDiff.ts:16-18` 每次 state-diff LLM 调用要序列化**全量** story_state 进 prompt，token 成本随章数线性增长，模型在一堆旧状态里找当前状态更易出错。

**方案**：
1. `applyStateDiff` 后对 story_state 做截断：timeline 只保留最近 N 条（如 20）；plot_threads 只保留非 `resolved`；characters.known_secrets 做上限（如每角色 ≤10）。
2. 截断前把被丢弃的旧事件「归档」进卷摘要（交给 `tieredSummary`），信息不丢但不再进每章 prompt。

**预期**：控制 token 成本 + 降低模型混乱。
**代价**：低。
**验证**：auto-pilot 40 章后 story_state 的 token 占用对比；continuity 评分不下降。
**风险**：截断阈值需校准，太激进会丢关键远端信息（配合 2.8 一起做）。

---

### 2.8 远端卷摘要全注入（长篇防失锚）⭐

**现状**：`chapterContextAssembly.ts:26-43` 的 `findVolumeSummary` 只返回**当前章所在卷**的摘要；`chapterContext.ts:54` 只注入近 5 章摘要 + 当前卷摘要 + 150-300 字全书梗概。**之前各卷的卷摘要不进入上下文**。

**问题**：写到第 35 章时，第 1 卷建立的伏笔、角色关系、世界规则细节，只剩全书梗概里一句话概括——这是长程连贯性的结构性短板，也是「12 章真实 LLM 验证通过、但 40 章衰减」的根因之一。

**方案**：把**已完成的各卷摘要**全部注入 writer/critic 上下文。卷摘要每卷 200-400 字，5 卷也才 2000 字，token 可承受：

```ts
// chapterContextAssembly: 收集所有 volumeSummaries（非空），按卷序拼接
const allVolumeSummaries = volumeSummaries
  ?.filter(v => v.summary)
  .sort((a, b) => a.volume_index - b.volume_index)
  .map(v => `【卷${v.volume_index}】${v.summary}`)
  .join("\n\n") ?? "";
// chapter.ts: 同时注入 allVolumeSummaries（标注「已完成各卷摘要」）和当前卷高亮
```

**预期**：长篇（40+ 章）远端不失锚，是当前架构内连贯性的最大提升点之一。
**代价**：低-中（token 增长，但可承受；需监控 prompt 总长不超模型上下文窗口）。
**验证**：auto-pilot 40 章的 continuity 评分衰减曲线对比。
**配合**：与 2.7 的 story_state 截断配套——远端细节靠卷摘要，近端细节靠 story_state，分工明确。

---

### 2.9 前章摘要 fallback 改进

**现状**：`lib/agent/chapterContext.ts:82-95`，某章缺摘要时取正文**前 900 字**充当。

**问题**：一章的前 900 字是铺垫/开场，不是核心结果。writer 拿到的「前章摘要」可能完全没提上一章结尾的关键转折，连续性断裂。

**方案**：改为取**结尾段**（承接更关心「上一章的结果」），或开头 300 字 + 结尾 600 字拼接。更彻底的方案：检测某章缺摘要时在 pipeline 开头触发一次 `summarize`（`lib/agent/summaries.ts` 已有能力），但增加 LLM 调用成本。

**代价**：极低（改 fallback 逻辑）。
**验证**：构造「缺摘要」场景的 continuity 评分对比。

---

## 四、🟢 P2：RAG 检索优化

### 3.1 去重改 RRF（防泛泛内容排名虚高）

**现状**：`lib/agent/retrieval.ts:246-266`，3 路查询命中间一 chunk 时 `existing.score += hit.score`（分数相加）。

**问题**：「什么查询都沾边」的泛泛内容（如主角名高频出现的早期场景）会被 3 路都命中、分数加 3 次，排名虚高；而只被 1 路命中的高相关 chunk 被压低。rank 信号失真。

**方案**：合并时取 `max(similarity)`，或用 RRF（Reciprocal Rank Fusion）：`score = Σ 1/(60 + rank_in_each_query)`。RRF 对多路融合更鲁棒，是标准做法。

**代价**：低。

---

### 3.2 关键词预过滤改 per-query

**现状**：`retrieval.ts:274-281`，预过滤是 OR 逻辑——`buildQueryKeywords`（`:31-47`）把所有角色名/地名/势力名都推入 keywords，正文 chunk 几乎必含某个 → 预过滤实际是空操作。

**方案**：每路查询配自己的关键词（主题路用主题词、角色路用角色名），候选需命中**该路**关键词才保留；或额外要求命中「本章大纲特有词」。

**代价**：低。

---

### 3.3 加相似度绝对阈值

**现状**：`retrieval.ts` 的 `singleSearch` 按余弦距离排序取 top-15，无下限。

**问题**：整本书没有真正相关的 chunk 时（如新书前几章、偏离主线的章节），仍返回 top-5「最不相关中最不差的」，污染上下文。

**方案**：加 `similarity < 0.3`（bge-m3 余弦需校准）的硬丢弃阈值。

**代价**：极低。

---

### 3.4 索引摘要/设定入向量库（长程信息不丢）

**现状**：`lib/agent/chunking.ts:146-199` 的 `indexChapter` 只索引 `chapter.content` 正文。章摘要、bible world rules、story_state 没进向量库（`MemoryChunk.source_kind` 字段已预留但未用）。

**问题**：检索只能找到「正文里写过的事实」，找不到「已被摘要压缩但正文未保留」的信息——长篇后段早期细节被摘要丢弃后，RAG 也找不到了。

**方案**：把章摘要（`source_kind: "chapter_summary"`）、bible 设定（`source_kind: "bible"`）也索引进 MemoryChunk。

**代价**：中（需改 indexChapter 调用点 + 区分 source 权重）。
**预期**：覆盖摘要压缩后的信息丢失，与 2.8 配合构成完整的长程记忆。

---

## 五、⚪ P3：架构方向（长程连贯性天花板）

当前架构靠「prompt 拼上下文」实现连贯，有三个结构性天花板。突破需 schema 扩展 + 新 agent，投入最大，但这是 40+ 章不衰减的根本手段。**建议在 P1/P2 落地、用 eval 确认仍不满足长篇目标后再启动。**

### 4.1 活跃约束清单（Active Constraints）⭐ 长程最高杠杆

**问题**：story_state 记「状态快照」（角色在哪/目标是什么），不记「硬约束」（「角色 A 不能知道秘密 B，因为 B 只在 C、D 间传递」）。critic 只能靠语义判断矛盾，第 30 章违背第 5 章设定时无结构化校验。

**方案**：在 story_state 维护结构化断言清单：

```ts
interface ActiveConstraint {
  fact: string;            // 「林砚知道密信内容」
  established_in: number;  // 第 5 章
  validity: "permanent" | "until_revealed" | "until_chapter_N";
}
```

每章注入 writer prompt（作为「必须遵守的既定事实」），并由 critic 校验本章是否违反。critic 违反约束 → critical issue。

**预期**：从根本上补长程盲区，是「第 30 章不违背第 5 章」的关键。
**代价**：高（schema 扩展 + state-diff agent 产出约束 + critic 校验逻辑）。

---

### 4.2 因果链图

**问题**：timeline 是扁平 `{chapter_index, event, impact}` 列表，无事件间因果关系、时序约束、前提条件。无法校验「为什么角色现在知道 X」。

**方案**：timeline 升级为有向图，记录 `event -> causes -> event`，critic 可做时序/因果校验。

**代价**：高。

---

### 4.3 基于实体的必要性检索

**问题**：RAG 是「相似度检索」，找语义接近的 chunk。但连贯性需要「本章必须知道的前文事实」——这是因果/依赖驱动，不是语义相似。例如第 30 章用第 5 章的道具 X，语义不一定相似，相似度检索可能捞不到。

**方案**：除相似度检索外，额外从 story_state 提取「本章涉及的角色/物品/线索」，按实体 ID 强制检索其首次出现和最近状态的 chunk（实体驱动而非语义驱动）。

**代价**：中。

---

## 六、推进路线图

```
第 1 步（立即，半天）—— P0 四个确定 Bug
  1.1 删 item→geography ｜ 1.2 补质量门字段 ｜ 1.3/1.4 修清洗误伤
  → 跑全量 test + eval 确认不回归（1.2 后需校准质量门阈值）
       ↓
第 2 步（本周）—— P1 Writer/Critic 侧（质量提升最直接）
  2.1 prompt 瘦身 ｜ 2.2 正面文风示例 ｜ 2.3 字数明确 ｜ 2.4 isRevision 降敏 ｜ 2.5 suggestion 约束
  → 每项独立 eval 快照对比，确认 ai_voice / prose_readability 提升
       ↓
第 3 步（本周-下周）—— P1 循环与状态
  2.6 bestText 防退化 ｜ 2.7 story_state 膨胀控制 ｜ 2.8 远端卷摘要注入 ｜ 2.9 摘要 fallback
  → 40 章 auto-pilot 实测，重点看 continuity 衰减曲线
       ↓
第 4 步（下周）—— P2 RAG
  3.1 RRF ｜ 3.2 per-query 关键词 ｜ 3.3 相似度阈值 ｜ 3.4 索引摘要
  → 检索质量 eval（retrieval 命中率 / 噪声率）
       ↓
第 5 步（评估后再定）—— P3 架构
  先用 eval 确认 P1+P2 后的长篇表现；若仍不满足 40+ 章目标，
  按 4.1 → 4.3 → 4.2 顺序投入（活跃约束清单优先，杠杆最高）
```

---

## 七、验证策略

| 改动类型 | 验证手段 | 通过标准 |
|----------|----------|----------|
| Bug 修复（P0） | 单测 + 全量 test + eval 基线 | test 不回归；eval 分数不下降 |
| Prompt 优化（P1） | `eval:novel-quality` + `eval:novel-quality:matrix` before/after | 目标维度分数提升，其余不退步超 tolerance(5pt) |
| 算法优化（P1/P2） | eval + 40 章 auto-pilot 实测 | continuity 衰减改善 / ai_voice 分布改善 |
| 架构升级（P3） | 黄金集（`evals/golden`）+ 人工评审 + 长篇实测 | 跨章矛盾率下降、人工连贯性评分提升 |

关键命令：
```bash
npm run eval:novel-quality          # 4 fixture case 快速对比
npm run eval:novel-quality:matrix   # 矩阵 baseline 对比（tolerance 5pt）
npm run eval:critic-revise          # critic→revise 收敛性
npm run eval:retrieval              # 检索质量
npm run eval:golden                 # 黄金集相关性（评估「评分」与「人工判断」的一致性）
```

### ⚠️ 实测发现：4 章单跑 eval 波动过大，prompt 微调必须先升级评估方法

2026-06-22 真实 LLM（deepseek-v4-flash）实测暴露一个**决定性问题**——`eval:novel-quality` 的 4 章单次跑**随机波动远超 prompt 改动的预期信号**：

| 跑次 | prompt | 总分 | ai_voice |
|------|--------|------|----------|
| 基线 #1 | P0 后 | 65/70 (92.9%) | 7/10（命中 12）|
| 基线 #2 | **同一 prompt 重跑** | 66/70 (94.3%) | — |
| 移除清单版 | -78 行清单 | 58/70 (82.9%) | 0/10（命中 34）|
| 保留+增量版 | +换主语+范围句 | 61/70 (87.1%) | 3/10（命中 21）|

关键观察：
- **同一 prompt 两次跑差 1 分**（65 vs 66），属正常 LLM 随机性；
- 但不同 prompt 单次跑差 3-7 分（58-66），**prompt 改动的信号被生成随机性淹没**；
- ai_voice 维度尤其不稳：同 prompt 下命中数可从 12 摆到 21+。

**结论：4 章单跑无法可靠判定 prompt 微调（如"换主语""范围句"）的效果。** 在升级评估方法前，所有 P1 prompt 微调都是盲改——改了无法证明改善，不改也无法证明无需改。

**前置条件（做 P1 prompt 优化前必须先做）**：
1. **多次跑取均值**：同一 prompt 跑 ≥3 次取 ai_voice/总分均值，降低单次随机性；
2. **或用 matrix**（4 fixture 平均）替代单 fixture，样本更多更稳；
3. **或固定生成随机性**（设定 seed / temperature=0 对照），隔离 prompt 变量；
4. ai_voice 评分算法本身的稳定性也需校准（humanizer 命中数的方差）。

> 本次据此**回退了所有 prompt 微调**（换主语/范围句/文风示例），只保留已用单测/逻辑验证的逻辑类成果（P0 四 bug + 2.6/2.7/2.8/2.9）。P1 prompt 优化待评估方法升级后再推进。

### ✅ 评估方法已升级：multi 模式（2026-06-22 落地）

前置条件 1 已实现。`eval:novel-quality` 新增 `EVAL_NOVEL_QUALITY_RUNS=N`（便捷命令 `npm run eval:novel-quality:runs`，默认 N=3），跑 N 次取**均值 ± 标准差**，输出 `docs/evals/novel-quality-multi-latest.md`。各维度标准差直接揭示噪声来源：

| 维度 | 均值% | 标准差 | 可信度 |
|------|------|--------|--------|
| 连续性 / 因果逻辑 / 剧情推进 / 正文可读性 | 90-100 | **0** | 稳定，单次跑即可信 |
| 人物一致性 / 世界规则 | 83-93 | 9.4 | 中等，需 ≥3 跑 |
| **AI 味控制** | **53.3** | **23.6** | **极不稳，单次跑完全不可信** |
| humanizer 命中合计 | 16.0 | 4.5 | 比 ai_voice 分数稳，是更好的观察指标 |
| 清洗前 AI 签名合计 | 21.0 | 4.2 | 同上 |

（数据：P0 后基线 xuanhuan-seed × 3 跑，归档于 `docs/evals/novel-quality-multi-baseline-p0-2026-06-22.md`）

**关键洞察**：AI 味控制维度标准差 23.6（满分 100），这正是单次跑无法判定 prompt 微调的根因。**做 prompt 优化时**：
- 评估连续性/逻辑/推进等稳定维度：跑 1-3 次即可判定；
- 评估 ai_voice：必须跑 ≥3 次看均值，且优先看 **humanizer 命中均值**（std 4.5）而非 ai_voice 分数（std 23.6）；改动后均值需落在基线 ±1 std 外才算显著。

---

## 八、风险与回滚原则

1. **Prompt 改动易回归**：每项独立提交 + eval 快照，发现退步单独回滚，不批量改。
2. **质量门阈值敏感**：1.2 补字段后评分基线变化，需重新校准 `qualityGate.ts` 阈值，否则可能误挂或漏放。
3. **截断/注入有 token 风险**：2.7/2.8 改变了 prompt 体积，监控总 token 不超模型上下文窗口（DeepSeek 64K，但越长越贵越慢）。
4. **架构升级不可逆性高**：P3 涉及 schema 迁移，需设计兼容路径（新旧 story_state 共存期）。
5. **真实 LLM 验证不可省**：所有 P1+ 改动最终以 `eval:novel-quality` 和 auto-pilot 实测为准，不以「代码看起来更好」为准。

---

## 附：本次审查涉及的文件清单

- `lib/agent/chapterPipeline.ts` — writer→critic→revise 主循环
- `lib/agent/chapterContextAssembly.ts` — 上下文组装（卷摘要/检索）
- `lib/agent/chapterContext.ts` — 近章摘要拼接 + fallback
- `lib/agent/retrieval.ts` — RAG 检索（去重/预过滤/重排）
- `lib/agent/summaries.ts` / `chunking.ts` / `qualityGate.ts`
- `lib/llm/prompts/chapter.ts` — writer prompt
- `lib/llm/prompts/critic.ts` — critic prompt
- `lib/llm/prompts/humanStyle.ts` — 文风指令（HUMAN_STYLE_DIRECTIVE 等）
- `lib/llm/writerOutputCleanup.ts` — 输出清洗规则
- `lib/validation/stateDiffMerge.ts` — Story State 合并
- `lib/jobs/generateChapterHandler.ts` — auto-pilot 章节生成 + 质量门调用
- `lib/evals/novelQuality.ts` — 启发式评分算法
- `prisma/schema.prisma` — MemoryChunk / 分层摘要 / story_state 结构
