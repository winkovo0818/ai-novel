# 都市悬疑题材修订失败诊断

> 日期：2026-05-29
> 数据来源：`docs/evals/novel-quality-matrix-latest.json`（2026-05-28 real_llm 模式跑出的 historical baseline，已恢复到 `/tmp/matrix-real-llm-historical.json`）
> 评估对象：`scripts/fixtures/eval-novels/urban-suspense.json`（fixture id：urban-suspense；模型：mimo-v2.5-pro）

---

## 一、症状

| 指标 | 数值 |
|---|---|
| `criticIssues` | **0**（critic 没报任何问题） |
| `changedChapters` | **0**（修订环节没改一个字） |
| draft `overallScore` | 65 / 70（92.9%）|
| revised `overallScore` | 65 / 70（与 draft 完全相同） |
| 玄幻题材对比 | criticIssues 0，但 overallScore 69/70（98.6%） |

修订环节实际等价于"critic 通过 → 跳过 revise → 直接走 cleanup"。即"修订轮"对都市悬疑零干预。

## 二、Eval algorithm 检测到的 2 个低分项

| 维度 | 分数 | Warning |
|---|---:|---|
| 因果逻辑 | 7 / 10 | "仅 1/3 章能读出'目标 → 行动 → 结果'的明确链条" |
| AI 味控制 | 8 / 10 | "句首重复模式 5 次，扣 2 分" |

另外检测到 `aiTraceHits`：

| ID | 类别 | 命中数 | 示例 |
|---|---|---:|---|
| rule_of_three | language | 2 | "你的储物柜、办公室、家里" / "姓名、性别、出生日期" |
| copula_avoidance | language | 1 | "构成了" |
| chatbot_artifact | communication | 1 | "如果你愿意" |

也就是说，eval 算法 **已经发现了具体问题**，但这些问题完全没有反映到 critic 报告里。

## 三、根因分析（按"critic 没识别 / 识别了没修 / 修订没修对位"分类）

### 100% 落在 "**critic 没识别**" 分类

证据如下。

#### 根因 1：Critic 的检查维度根本不覆盖 logic_chain 和 prose_quality

`lib/llm/prompts/critic.ts:82-91` 定义的 5 个检查维度：

```
1. 角色行为：与性格/动机/状态矛盾
2. 世界规则：违反 Bible 规则
3. 线索推进：plot_thread 状态
4. 时间线：事件顺序矛盾
5. 基调：偏离设定基调
```

对比 eval algorithm 的 7 维：连续性 / **因果逻辑** / 人物一致性 / 剧情推进 / 世界规则 / **AI 味** / 正文可读性。

→ **逻辑链 + AI 味** 两个维度，**critic 完全没在看**。Logic 7/10 警告（"目标→行动→结果"链缺失）和句首重复 5 次都属于这两个盲区。

#### 根因 2：Critic prompt 被刻意调成宽松（防 revision churn）

`critic.ts:93-97` 写得很明确：

```
判定原则（重要）：
- 不要因为"本章没再复述一遍铺垫"就判为突兀
- 主观判断类问题（"显得突兀""略显鲁莽""可以更细腻"）一律降为 minor 或不报
- critical / major 只留给真正能在前文/Bible/状态里找到事实矛盾的情况
- 找不到事实矛盾就输出 consistent:true。不要为了凑数硬挑问题
```

这是 M3.x 阶段修复 revision churn（critic 和 writer 反复刷同一警告）的副作用：critic 对"非硬矛盾"全部闭眼。

→ **即使将来给 critic 加 logic_chain 检查，如果不把它划进 "事实级" 矛盾，critic 也会按原则降为 minor 或不报**。需要在 prompt 里同时调整严重度判定。

#### 根因 3：Revise prompt 是"按 critic 修订"，零 issues = 零修订

`chapterRevision.ts:55-58` 设计就是 "审校意见 → 修订"：

```
- 优先修复审校意见中的 major / critical 问题
- 保留原候选稿中可用的剧情、语气和细节
- 修订必须彻底
```

→ Critic 返回 `consistent: true` 时，revise 路径不会执行（matrix 脚本 `reviseSeries` 在 `critic.consistent && critic.issues.length === 0` 分支只跑 cleanup）。这条链路是 by design 的。**critic 是唯一的 gate**。

#### 根因 4：fixture 出来的章节确实开篇缺少明确"目标→行动→结果"链

读 3 章 excerpt：

| 章 | 标题 | 开篇 | 评判 |
|---|---|---|---|
| 1 | 尸检台 | "消毒水的气味淡了..."→大段氛围 | 标题就是地点，没有清晰目标 |
| 2 | 停职令 | "停电持续了四秒..."→事件触发 | 较好，有明确触发→反应 |
| 3 | 白塔档案 | "车门关上的声音很轻..."→等待场景 | 较弱，靠周棠去找督查科推动 |

第 1 章和第 3 章符合 "仅 1/3 章能读出明确链条" 的描述。问题是真实存在的，不是误报。

## 四、Day 3 处方（落地方向）

### A. Critic prompt 扩 2 个新维度（minor 起，防 churn）

| 维度 | 触发条件 | 建议 severity |
|---|---|---|
| `logic_chain` | 章内无法识别"目标 → 阻碍 → 行动 → 结果"主链 | minor / major（连续 2 章触发升 major） |
| `prose_quality` | 句首重复 ≥4、三连排比 ≥3、聊天机器人套话 ≥1 | minor |

`critic.ts` 第 86 行的检查维度列表 + 第 99 行严重度定义需要同步更新。`CriticIssue` 类型已经支持新 type 字段（`character | world_rule | plot_thread | timeline | tone`），需要扩 union 添加 `logic_chain | prose_quality`。

### B. 悬疑/推理子题材 专属检查规则

在 critic prompt 里识别 `bible.profile.genre_sub` 包含"悬疑"/"推理"后，**额外**追加：

- 线索回收：本章新引入的线索是否标注成 plot_thread？
- 误导/揭示节奏：是否有过早/过晚揭示
- 主角是否反复想同一线索（presence_penalty 信号但 critic 也应抓）

### C. Chapter prompt 悬疑模式 — "伏笔→线索→误导→揭示"细化

`lib/llm/prompts/chapter.ts` 当前的"目标 → 阻碍 → 行动 → 结果"在悬疑题材应该映射为：

- 目标：主角本章想查清的事
- 阻碍：信息缺口或对抗
- 行动：调查 / 试探 / 取证
- 结果：新线索 / 新疑点 / 误导确立

### D. GenerationPolicy 悬疑专属

| 参数 | 默认 | 悬疑建议 | 理由 |
|---|---:|---:|---|
| temperature | 当前由 ai_freedom 决定 | -0.05 ~ -0.1 | 避免线索失控 |
| frequency_penalty | 当前固定 | +0.1 ~ +0.15 | 避免线索重复表述 |
| presence_penalty | 当前固定 | +0.05 ~ +0.1 | 减少同一道具反复出现 |

## 五、达标路径预测

| 改动 | 预期 urban-suspense 影响 |
|---|---|
| A 扩 critic 维度 | criticIssues 0 → 2-3，至少 1 个对应 logic_chain |
| A + B 悬疑专属规则 | criticIssues 3-5，命中 plot_thread 类 |
| A + B + revise 修对位 | changedChapters 0 → 1-3，revised score 提升 2-5 分 |
| A + B + C + D 全套 | draft 65/70 → 68-69/70，**修订后 ≥ 90/100**（达标）|

→ 单改 critic 不够，需要 A+B+C+D 联动。

## 六、风险

| 风险 | 缓解 |
|---|---|
| 加 logic_chain 后玄幻题材也开始报问题 | 玄幻 logic 已是 9/10，影响极小；如果回退也只是 minor，不阻塞修订 |
| 题材识别错（genre_sub 字段不规范） | 用 `includes("悬疑") || includes("推理")` 宽松匹配，匹配不到就退回通用规则 |
| critic churn 复现（同一问题反复报） | `isRevision=true` 分支已经在降敏；新维度沿用同一降敏机制 |

## 七、下一步

进入 Day 3（处方），按上面 A/B/C/D 顺序改 4 个文件 + 配套 prompt unit test。Day 4 跑真实 LLM matrix 验证。

