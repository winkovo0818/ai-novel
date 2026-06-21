# 项目全面评估报告 — 墨境 AI Novel Studio

> 评估时间:2026-06-10
> 评估范围:main 分支全部源码 + prisma schema + docs/ + 测试与 eval 体系
> 评估方法:关键源码阅读(agent 管线 / jobs / 检索 / 安全 / 校验层)+ 项目自有文档交叉验证(STATUS / HEALTH / PROJECT_REVIEW_REPORT / evals)
> 配套文档:连贯性专项方案见 `docs/DESIGN_LONGFORM_COHERENCE.md`

---

## 1. 总体结论

**这是一个工程素养显著高于同类开源项目的代码库,架构方向正确,但存在"工程完成度高、AI 效果验证尺度不足"的不对称。** 主要风险不在代码质量,而在三处:① AI 管线中少数 fail-open 路径与质量目标冲突;② 连贯性机制只在 12 章尺度验证过;③ 单机单 worker 的任务模型限制了自动生成的可靠性上限。

分级统计:**P0 问题 3 个,P1 问题 6 个,P2 优化项 8 个**。无安全类 P0。

| 维度 | 评分(10) | 一句话判断 |
|---|---:|---|
| 架构设计 | 8.5 | 无框架依赖的显式编排,边界清晰,契约完整 |
| AI 管线 | 7 | 机制齐全,但 fail-open 断点与验证尺度拖后腿 |
| 数据模型 | 8 | 规范,迁移纪律好;Bible 缺乏乐观锁是例外 |
| API 设计 | 8.5 | 统一响应封装、错误码体系、ownership 校验一致 |
| 前端 | 7.5 | hook 拆分到位;两个超大组件待治理 |
| 测试 | 8 | 987 单测 + 8 E2E + coverage 门禁;E2E 广度不足 |
| 安全 | 8.5 | CSP nonce / SSRF 防护 / prompt 注入防护 / 密钥加密,同类项目罕见 |
| 性能与扩展性 | 6.5 | 单 worker、无并发生成、HNSW 已有但检索全表竞争 |
| 文档 | 9 | STATUS/HEALTH/设计文档/eval 归档纪律极好,且有 docs-check 防漂移 |

---

## 2. 突出优点(值得保持的)

1. **零类型逃逸纪律**:全仓无 `any` / `@ts-ignore` / `eslint-disable`,strict TS 17K+ LoC 一处不松,这在 AI 辅助开发的项目里极罕见。
2. **失败路径显式化**:`MODERATION_FAILURE_MODE` / `QUOTA_FAILURE_MODE` 生产默认 block;SSE 首 delta 后拒绝重试防拼接错位;索引失败保留旧 chunks 可查询(`chunking.ts` 先 embed 成功再 delete)。
3. **评估基础设施**:eval 脚本 6 个、baseline 冻结入 CI(`eval:check`)、`docs-check.ts` 防文档数字漂移——大多数项目连第一步都没有。
4. **prompt 安全**:`promptSafety.ts` 的 wrap/sanitize + "标签内是数据不是指令"前导,7 个 prompt 全接入,且有注入攻击场景测试。
5. **决策可追溯**:注释解释"为什么"并引用决策记录(如 critic 上下文对称性修复、revise 超时调参的事故注释),HEALTH.md 逐日变更摘要。

---

## 3. P0 问题(直接威胁核心价值,建议立即修)

### P0-A Critic 解析失败 = 静默放行

`lib/agent/chapterPipeline.ts` 的 `parseCriticResult` 解析失败返回 `{consistent:false, issues:[]}`,循环条件 `critic.consistent || !hasBlockingIssue(issues)` 对空 issues 判 true → **未经审校的章节直接通过,且绕过 qualityGate 的 critic floor**。spike 实测 state_diff 有 ~25% JSON 解析失败率,critic 同为 JSON 输出,失败率不会是零。
**修复**:fail-closed + 重试一次,详见 DESIGN_LONGFORM_COHERENCE M0.1。

### P0-B state_diff 无校验合并 + Bible 无乐观锁

自动生成模式下 LLM 输出的 diff 解析成功即合并进 Bible(`generateChapterHandler.ts`),无实体存在性/状态机合法性校验;`BibleDraft` 无 version 字段,后台 job 与用户 UI 编辑之间存在丢失更新竞态(对比 `ChapterDraft.version` 的成熟实现,这是明显的不一致)。错误状态会被后续所有章节继承放大,是自动生成质量的单点故障。
**修复**:见 DESIGN_LONGFORM_COHERENCE M0.2/M0.3。

### P0-C 连贯性验证尺度与产品目标不匹配

长篇基线仅 12 章(此时"最近 5 章摘要"几乎覆盖全书,分层摘要与远程检索的真实压力未被测到);检索 eval 4 case、critic eval 3 章无统计意义;`foreshadowing` schema 已定义但全链路悬空(StateDiff 不抽取、Writer/Critic 不可见,唯一写入是 `stateDiffMerge.ts:310` 的正则匹配)。
**修复**:伏笔生命周期 + 强制注入 + 50 章长跑,见 DESIGN_LONGFORM_COHERENCE M1/M2/M4。

---

## 4. P1 问题(影响可靠性/可扩展性,建议近期排期)

### P1-1 任务模型是"内联排空 + 可选 worker",自动生成依赖运行环境长寿命

`enqueueJob` 后靠 `runPendingJobsForNovel` fire-and-forget 内联排空,Serverless 函数被杀即中断;`sweepStaleRunningJobs` 能复位僵尸 job,但 `generate_chapter` 单章 240s×2 + critic 120s 的管线在 Vercel 上(`maxDuration` 仅 auto-generate route 声明 120s)基本必然依赖 `jobs:worker` 长驻进程。**文档应明确:自动整本生成在 Serverless 部署形态下不可用,必须跑 worker**;或在 run 启动时检测 worker 心跳,没有就直接拒绝并提示,而非让用户的 40 章 run 静默卡死。

### P1-2 E2E_AUTH_BYPASS 缺生产环境硬保险

`lib/auth/session.ts` / `middleware.ts` 仅检查 `E2E_AUTH_BYPASS === "1"`,无 `NODE_ENV === "production"` 时强制忽略的双保险。生产环境误配置该 env(CI/CD 变量泄漏到生产配置是常见事故)即等于无认证。一行代码的修复,收益/成本比极高。

### P1-3 嵌入维度硬编码 1024

`vector(1024)` 写死在 schema 与 `chunking.ts`(`embedding.length !== 1024` 即跳过)。`EmbeddingModel` 表支持换模型,但换一个非 1024 维的模型会导致**所有新 chunk 静默跳过插入**(continue 而非报错),旧索引也全部失效。至少应:维度不匹配时抛错而非静默 continue;EmbeddingModel 表记录维度并在切换时校验。

### P1-4 chunk 插入逐条循环 + 删除/插入非事务

`chunking.ts` 先 `deleteMany` 再逐条 `$executeRawUnsafe` INSERT。中途失败(已有 MemoryChunkIndexError 定位)会留下**部分索引状态**:旧 chunks 已删、新 chunks 只插了一半,直到重试成功前检索质量是降级的且不可见。建议:单事务包裹 delete+insert,或先插临时 source_kind 再原子切换。逐条插入对 50 章 × 每章几十 chunk 也是不必要的慢。

### P1-5 检索无 chunk_type 加权与配额

六类 chunk(scene/dialogue/character_fact/world_rule/plot_thread/summary)在检索中同池竞争纯相似度。场景描写类 chunk 数量天然占优,会稀释 top-5 中 character_fact / plot_thread 的占比——而后两类对连贯性价值最高。建议按 type 设最低配额或加权(与 DESIGN_LONGFORM_COHERENCE M2 的强制注入互补)。

### P1-6 importance 字段是死值

`MemoryChunk.importance` 默认 1.0,`estimateChunkImportance` 写入后无任何更新路径;检索公式 `score × decay × importance × fbFactor` 中它几乎恒为常数。要么接入真实信号(被检索次数 `last_used_at` 已记录、用户 feedback 已有表),要么从公式中移除以减少认知负担。

---

## 5. P2 优化项(改善可维护性/体验)

1. **`app/(app)/new/page.tsx` 1452 行**:onboarding wizard 主组件远超全仓其他文件,违反自家 CLAUDE.md 的"超长函数/组件"规范,建议按 step 拆分(Step5Review 已拆出是好例子,其余 step 同理)。
2. **`CandidatePanel.tsx` 745 行**:同上,diff 视图 / 候选操作 / critic 展示可拆三块。
3. **timeline 无限增长**:`stateDiffMerge.ts` 对 timeline 只 push 不裁剪,prompt 侧靠 `slice(-10)` 兜底,但 Bible JSON 体积随章节线性膨胀(每次读写整个 content Json)。建议合并到卷级摘要或设上限归档。
4. **critic/writer 多次全文传输**:revise 循环每轮把全章正文(最多 3000 字)往返 3 次,可考虑 critic 只输出 issue 定位(段落号),revise 只重写受影响段落——成本与速度都受益,但需评估局部重写的衔接质量,建议 spike。
5. **`auto-generate` GET 轮询**:前端轮询 run 状态,已有 SSE 基础设施(draft 路由),run 进度可升级为 SSE 推送,减少请求量并改善体验。
6. **缺生产部署 runbook**:STATUS 提到 `prisma migrate deploy` / `AUTH_SECRET` / worker 启动,但散落各处;建议合并一页 `docs/DEPLOY.md`(checklist 形式:env 清单、worker、cron、backup:check、healthz)。
7. **覆盖率门禁 lines 68% 偏低**:functions 93 / branches 83 很好,lines 68 说明存在整文件未覆盖区(大概率是 RSC page 组件)。不必强推数字,但建议把 `lib/` 业务逻辑目录单独设更高阈值,防止新逻辑滑入低覆盖区。
8. **评估的"金标准"校准缺失**:novelQuality 启发式与人工判断的相关性只有 goldenCorrelation 一个机制,golden 样本量未知(docs/evals/golden 目录存在)。建议定期(每个大 prompt 变更后)抽 3-5 章人工盲评,校准启发式权重,否则优化可能朝着"讨好启发式"而非"讨好读者"走。

---

## 6. 风险矩阵(按"发生概率 × 影响"排序)

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 长篇(>50章)连贯性衰减,产品核心价值不成立 | 中-高 | 致命 | P0-C → 专项方案 M1/M2/M4 |
| critic 解析失败章节混入成书 | 中 | 高 | P0-A,2-3 小时可修 |
| 自动生成 run 因部署形态静默卡死 | 中 | 高 | P1-1,文档 + 心跳检测 |
| Bible 状态污染累积 | 中 | 高 | P0-B |
| 换 embedding 模型导致索引静默失效 | 低 | 高 | P1-3 |
| E2E bypass 误配生产 | 低 | 致命 | P1-2,一行修复 |
| chunk 部分索引降级检索 | 中 | 中 | P1-4 |

---

## 7. 建议的执行顺序

1. **本周**:P0-A(小时级)、P1-2(分钟级)、P0-B 的 M0.2/M0.3(2-3 天)——全部是确定性修复,不依赖 LLM 调参。
2. **下一迭代**:连贯性专项 Phase 2/3(伏笔生命周期 + 强制注入,约 1 周),同时启动 50 章长跑基线(M4.1,可并行挂机跑)。
3. **再下一迭代**:P1-1 worker 心跳、P1-4 索引事务化、P1-5 检索配额;按长跑结果决定是否需要 arc_audit(M4.3)。
4. **持续**:P2 组件拆分与部署 runbook 见缝插针;每次 prompt 大改后做一次人工盲评校准(P2-8)。

---

## 8. 评估方法说明与局限

- 本报告基于静态源码阅读与项目自有文档/eval 归档交叉验证,**未实际运行** `npm run verify` / E2E(沙箱无 PostgreSQL+pgvector 环境),测试通过数引自 HEALTH.md 实测基线(124 files / 987 tests,与 STATUS.md 一致)。
- 性能维度未做压测,判断基于代码路径分析(逐条 INSERT、轮询、全文往返)。
- 安全维度未做渗透测试,基于代码审计(CSP/SSRF/注入防护/密钥加密均有测试覆盖)。
