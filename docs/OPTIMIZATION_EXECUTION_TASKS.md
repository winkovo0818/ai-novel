# AI Novel 优化执行任务单

> 创建时间：2026-05-27  
> 来源：`docs/OPTIMIZATION_PLAN.md`  
> 用途：把优化计划拆成可以直接开 issue / PR / sprint 的执行任务。  
> 原则：先稳核心写作链路，再做 AI 质量评估，再打磨编辑器和长篇记忆，最后补生产化与商业化。

---

## 一、执行约定

### 任务字段说明

| 字段 | 含义 |
|---|---|
| ID | 稳定任务编号，建议作为 issue / PR 标题前缀 |
| 优先级 | `P0` 最高，必须先做；`P7` 最后做 |
| 类型 | `E2E`、`UT`、`API`、`UI`、`LIB`、`DB`、`DOC`、`OPS` |
| 建议 PR | 推荐把哪些任务放进同一个 PR，避免 PR 过大 |
| 依赖 | 开工前需要先完成的任务 |
| 验收 | 任务完成的客观标准 |

### 通用完成标准

每个代码任务默认需要满足：

- `npm run lint` 通过。
- `npm run typecheck` 通过。
- 相关 `vitest` 或 `playwright` 测试通过。
- API 变更需要同步 Zod schema 和错误响应。
- UI 变更需要覆盖空状态、失败状态、loading 状态。
- 涉及用户正文、Bible、摘要、记忆的变更不能导致已有数据丢失。
- 涉及 AI 的变更必须在 `LLM_MOCK=1` 下可测试。

### 建议推进顺序

| Sprint | 任务范围 | 目标 |
|---|---|---|
| Sprint 0 | P0-01 到 P0-08 | 核心链路体检、阻断问题修复、E2E 加固 |
| Sprint 1 | P1-01 到 P1-08 | AI 质量评估脚手架与第一批评估集 |
| Sprint 2 | P2-01 到 P2-10 | 编辑器局部 AI、候选稿 diff、保存状态 |
| Sprint 3 | P3-01 到 P3-10 | 记忆库、RAG 召回评估、Story State 审阅 |
| Sprint 4 | P4-01 到 P4-08 | 后台任务 worker 化 |
| Sprint 5 | P5-01 到 P5-06 | 信息架构、文案、状态组件统一 |
| Sprint 6 | P6-01 到 P6-12 | 上线安全、数据导出、成本和监控 |
| Later | P7-01 到 P7-08 | 付费、协作、创作资产化 |

### 当前执行状态（2026-05-29）

> **AI 质量可控可迭代 2 周冲刺（10/10 天完成）**：评估护栏 + 短板攻关的完整记录见 `docs/SPRINT_AI_QUALITY_2026-05-29.md`。要点：`eval:check` 入 CI verify（回退自动 fail，baseline `docs/evals/baselines/novel-quality-matrix-fixture-fallback-2026-05-29.json`）；都市悬疑修订后 91.4/100；玄幻 12 章长篇无明显衰减（`docs/evals/long-form-baseline-2026-05-29.md`）；`MemoryFeedback` 真接入 retrieval；critic recall 33%→100% / revise 命中 100%（`docs/evals/critic-revise-hit-rate.md`）；`writerOutputCleanup` 规则集化 + 清洗前 AI 签名命中可追踪。延伸了 P1-09 / P1-13 的评估能力。

| 任务 | 状态 | 本轮说明 | 验证 |
|---|---|---|---|
| P0-01 | 已覆盖 | 现有 `tests/e2e/onboarding.spec.ts` 已覆盖主线 onboarding -> editor smoke，本轮未改。 | 未单独运行 Playwright |
| P0-02 | 已覆盖 | 现有 `tests/e2e/editor-candidate.spec.ts` 已覆盖候选稿丢弃、追加、覆盖、diff 切换，本轮未改。 | 未单独运行 Playwright |
| P0-03 | 已覆盖 | 现有 `tests/e2e/beat-to-draft.spec.ts` 已覆盖节拍生成、编辑、基于节拍起草和接受候选稿，本轮未改。 | 未单独运行 Playwright |
| P0-04 | 已覆盖 | 现有 `tests/e2e/version-restore.spec.ts` 已覆盖版本恢复后持久化，本轮未改。 | 未单独运行 Playwright |
| P0-05 | 已完成 | 修复 finalize 并发重复提交唯一约束竞争；Step5 增加防重入、异常捕获、暂存成功反馈。 | `vitest` finalize 9 tests；`tsc --noEmit`；定向 `eslint` |
| P0-06 | 已完成 | 客户端保留 draft SSE `error` 的 `code/retryable/sessionId`，失败态按服务端语义判断可重试。 | `vitest` chapterUtils 55 tests；draft route/resume 20 tests；`tsc --noEmit`；定向 `eslint` |
| P0-07 | 已完成 | 候选稿空内容禁止应用；SSE 失败可重试/丢弃；检索失败明确降级；记忆预览失败可重新检索或跳过检索生成。 | `vitest` CandidatePanel 4 tests；useChapterHooks 24 tests；`tsc --noEmit`；定向 `eslint` |
| P0-08 | 已完成 | 新增导出中心 E2E，覆盖四种格式下载、range、include_bible、非法 range、审核阻断不下载；保留导出 API 单测覆盖。 | `vitest` export route 17 tests；`playwright` export 2 tests；`tsc --noEmit`；定向 `eslint` |
| P1-01 | 已完成 | 新增 `eval-novels` / `eval-chapters` fixture 目录、玄幻基础样例和评估 README。 | `LLM_MOCK=1 npm run eval:ai`；`tsc --noEmit`；定向 `eslint` |
| P1-02 | 已完成 | 新增 `npm run eval:ai`，可运行 Writer/Critic/StateDiff mock 评估并生成 JSON/Markdown 报告。 | `LLM_MOCK=1 npm run eval:ai` 9 checks passed；相关 `vitest` 22 tests；`tsc --noEmit`；定向 `eslint` |
| P1-03 | 已完成 | Writer Prompt 测试新增关键上下文顺序锁定，覆盖 Bible、摘要、记忆、Story State、beat sheet、已有正文的排列。 | `vitest` chapter prompt 14 tests；`tsc --noEmit`；定向 `eslint` |
| P1-04 | 已完成 | 新增都市悬疑、硬科幻、历史权谋 Bible 评估样例；`eval:ai` 输出 completeness、outline_usability、character_conflict 三类评分。 | `LLM_MOCK=1 npm run eval:ai` 66 checks passed；`vitest` bible prompt 9 tests；`tsc --noEmit`；定向 `eslint` |
| P1-05 | 已完成 | 新增 Critic 负例章节 fixture，固定冲突正文并断言命中 `world_rule` 与 `character` 问题类型。 | `LLM_MOCK=1 npm run eval:ai` 74 checks passed；critic/client route 24 tests；`tsc --noEmit`；定向 `eslint` |
| P1-06 | 已完成 | 新增 StateDiff 正例章节 fixture，断言人物更新、时间线、线索推进和新地点抽取。 | `LLM_MOCK=1 npm run eval:ai` 84 checks passed；state-diff 19 tests；`tsc --noEmit`；定向 `eslint` |
| P1-07 | 已完成 | 新增离线 Retrieval 召回评估脚本与 3 个 retrieval case，输出 recall@3、recall@5、missed@5。 | `npm run eval:retrieval` recall@3=0.889 recall@5=1.000；agent 21 tests；`tsc --noEmit`；定向 `eslint` |
| P1-08 | 已完成 | 新增 `LLM_MOCK_SCENARIO`，覆盖空流、首 delta 前超时、delta 后中断、流式审核命中、慢 token、chat 审核阻断、retrieval error；补充 client/retrieval/draft route 测试与 eval README。 | 定向 `vitest` 39 tests；`LLM_MOCK=1 npm run eval:ai` 84 passed / 0 failed；`npm run eval:retrieval` recall@3=0.889 recall@5=1.000；`tsc --noEmit`；定向 `eslint` |
| P1-09 | 已完成 | 新增连续小说质量测评：按连续性、因果逻辑、人物一致性、剧情推进、世界规则、AI 味和可读性评分，生成 `novel-quality-latest` 报告；当前已支持真实 LLM 连续生成评估。 | `vitest` novelQuality 2 tests；真实 `eval:novel-quality` 56/70；`LLM_MOCK=1 npm run eval:ai` 84 passed / 0 failed；`tsc --noEmit`；定向 `eslint` |
| P1-10 | 已完成 | 接入用户提供的 humanizer skill：将 5 类 29 种 AI 写作痕迹提炼为共享规则，Writer 生成、局部去 AI 味改写、连续小说测评共用同一套规则；报告输出具体命中项。 | `vitest` chapter/chapterRevision/novelQuality 21 tests；`tsc --noEmit`；定向 `eslint`；真实 `eval:novel-quality` 56/70 |
| P1-11 | 已完成 | 按测评建议强化 Writer：生成前内部规划“目标 -> 阻碍 -> 行动 -> 结果”，正文保留因果钩；每章要求可记录状态变化；StateDiff 和测评同步检查并修复真实输出兼容问题。 | `vitest` chapter/stateDiff/novelQuality/stateDiffMerge/schemas 66 tests；`tsc --noEmit`；定向 `eslint`；真实 `eval:novel-quality` 60/70 |
| P1-12 | 已完成 | 二次优化 Writer：正文至少保留两处自然因果/代价句；打断式对白改用省略、短句和动作停顿；新增 Writer 输出清洗层，清掉破折号、Markdown、教程路标和 AI 高频词；连续测评同步导出最新章节。 | `vitest` writer cleanup/chapter/draft route/novelQuality 33 tests；`tsc --noEmit`；定向 `eslint`；真实 `eval:novel-quality` 67/70，复用最新真实章节按新规则重算 66/70 |
| P1-13 | 已完成 | 新增小说质量矩阵测评：支持多题材 fixture、多模型列表、修订轮数配置，并输出草稿 vs 修订后对比报告；已跑真实 LLM 小矩阵。 | `vitest` novelQualityMatrix 2 tests；`npm run eval:novel-quality:matrix` fixture fallback 4 cases；真实 LLM `mimo-v2.5-pro` 玄幻/都市悬疑各 3 章 1 轮修订，修订后均分 95.7/100；`tsc --noEmit`；定向 `eslint` |
| P1-14 | 待开始 | 基于真实矩阵结果优化悬疑题材目标链和修订触发：都市悬疑逻辑 7/10、AI 味 8/10，且 Critic 未触发实质修订。 | 下一步执行；目标是都市悬疑逻辑 >= 8/10、AI 味 >= 9/10，修订轮能处理 AI 痕迹或目标链缺口 |
| P2-01 | 已完成 | 编辑器选区从单点 cursor 升级为 `selectionStart`、`selectionEnd`、`selectedText`；切换章节会清空选区；CandidatePanel 和候选稿插入路径已改用选区状态。 | 定向 `vitest` 96 tests；`tsc --noEmit`；定向 `eslint` |
| P2-02 | 已完成 | 新增局部改写请求 schema：`operation`、`selected_text`、`before_context`、`after_context`、`chapter_index`、`title`；revise route 保留原审校修订路径并接受新请求形态。 | `vitest` revise route + chapterUtils 68 tests；`tsc --noEmit`；定向 `eslint` |
| P2-03 | 已完成 | 新增局部改写 Prompt，覆盖润色、扩写、缩写、改对白、增强冲突、续写六类 operation；revise route 对局部请求已调用新 prompt 并只返回局部正文。 | `vitest` chapterRevision + revise route + chapterUtils 71 tests；`tsc --noEmit`；定向 `eslint` |
| P2-04 | 已完成 | AIPanel 新增局部改写区块；未选中文本时按钮禁用并提示；选中文本后可触发润色/扩写/缩写/对白/冲突/续写，结果进入候选稿面板。 | `vitest` AIPanel/EditorClient/useChapterHooks/chapterUtils 97 tests；`tsc --noEmit`；定向 `eslint` |
| P2-05 | 已完成 | CandidatePanel 新增“替换选区”处理模式；`applyAcceptMode` 支持 `replace_selection`，应用前沿用版本快照，保存 source 为 `ai`。 | `vitest` CandidatePanel/useChapterHooks/chapterUtils 95 tests；`tsc --noEmit`；定向 `eslint` |
| P2-06 | 已完成 | CandidatePanel 已有“候选稿/与正文对比”切换；补充 DiffView 长未变内容折叠测试，并将 components 测试纳入 Vitest include。 | `vitest` DiffView + CandidatePanel 5 tests；`tsc --noEmit`；定向 `eslint` |
| P2-11 | 已完成 | 局部改写新增“去AI味”操作，基于 AI 写作痕迹规则改写选区，保留剧情事实并通过候选稿面板替换选区。 | 定向 `vitest` 139 tests；`LLM_MOCK=1 npm run eval:ai` 84 passed / 0 failed；`tsc --noEmit`；定向 `eslint` |
| P5-01 | 已完成 | Dashboard 将协议/系统类文案收敛为“下一步建议”“继续写作”“失败任务”等日常写作工具表达，并新增文案回归测试。 | `vitest` dashboard page 2 tests；`tsc --noEmit`；定向 `eslint`；静态搜索旧文案无业务残留 |
| P5-02 | 已完成 | New Wizard 将“协议/引擎/矩阵/审计”等表达收敛为作品方向、故事灵感、关键问题、生成设定和核对设定；同步更新 onboarding E2E helper。 | `vitest` new wizard copy + finalize 10 tests；`tsc --noEmit`；定向 `eslint`；静态搜索旧文案无业务残留 |
| P5-03 | 已完成 | 编辑器顶部与助手面板统一为“写作助手/写作操作/一致性检查/状态分析”等表达，StatusTag 默认标签改为更直接的用户状态。 | `vitest` AIPanel/EditorToolbar/EditorClient 18 tests；`tsc --noEmit`；定向 `eslint`；静态搜索旧编辑器文案无业务残留 |
| P5-04 | 已完成 | `EmptyState` 支持 compact/className，并替换 Dashboard 与 Activity 的手写空状态，统一主要页面空状态样式。 | `vitest` StatusStates + dashboard page 3 tests；`tsc --noEmit`；定向 `eslint`；静态检查手写空态已替换 |
| P5-05 | 已完成 | 管理页与模型配置页收敛为后台配置/监控语气，去掉“创作节点/协议/部署节点”等混入创作空间的表达，并补文案回归测试。 | `vitest` admin-copy 1 test；`tsc --noEmit`；定向 `eslint`；静态搜索旧管理页文案无业务残留 |
| P5-06 | 已完成 | 首页定位为未登录用户的写作工作台入口，增加产品界面预览并同步 README 工具型描述，去掉大段营销官网文案。 | `vitest` home-copy 1 test；`tsc --noEmit`；定向 `eslint`；静态搜索旧 Landing 文案无残留 |
| P6-01 | 已完成 | 导出中心新增完整项目 JSON / ZIP，包含作品设定、章节、摘要、Story State 和记忆元数据，并排除 embedding 向量。 | `vitest` formatNovel + export route 39 tests；`tsc --noEmit`；定向 `eslint` |
| P6-02 | 已完成 | Profile 增加“导出我的数据”，新增账户级 JSON 导出 API，聚合当前用户资料和名下所有作品完整快照。 | `vitest` profile export + formatNovel + novel export 42 tests；`tsc --noEmit`；定向 `eslint` |
| P6-03 | 已完成 | `Novel` 增加 `deleted_at`，删除改为软删除，默认列表/详情/导出隐藏已删除作品，并新增恢复 API。 | `vitest` novels route/restore/export/profile export 35 tests；`prisma generate`；`tsc --noEmit`；定向 `eslint` |
| P6-04 | 已完成 | 新增 `AdminAudit` 审计表和 helper，记录角色授予/撤销、模型配置增删改、Embedding 配置增删改和审核复核。 | `vitest` admin audit write paths 43 tests；`prisma generate`；`tsc --noEmit`；定向 `eslint` |
| P6-05 | 已完成 | 撤销 admin 角色前检查 DB admin 数量，阻止移除最后一个数据库 admin，并更新 UI 风险说明。 | `vitest` admin role revoke 6 tests；`tsc --noEmit`；定向 `eslint` |
| P6-06 | 已完成 | 确认 `/api/metrics` 在未配置 `METRICS_TOKEN` 时返回 503，缺失/错误 Bearer token 返回 401，并保留 IP 限流。 | `vitest` metrics route 9 tests；`tsc --noEmit`；定向 `eslint` |
| P6-07 | 已完成 | quota 增加单次请求预算、调用次数、日/月重置时间和结构化 details；高成本 LLM 路由返回统一 quota exceeded 响应。 | `vitest` usage/onboarding 45 tests；受影响 LLM route 37 tests；`tsc --noEmit`；定向 `eslint` |
| P6-08 | 已完成 | `/activity` 改为当前用户的 AI 用量页，展示本月/今日用量、quota、费用趋势、Agent 分布和最近调用；系统日志入口移至 `/admin/ai-calls`。 | `vitest` usage/activity 3 tests；`tsc --noEmit`；定向 `eslint` |
| P6-09 | 已完成 | admin AI 调用页新增按用户、作品、Agent、模型聚合排行；API 返回成本、token、失败率聚合数据。 | `vitest` admin ai-calls 3 tests；`tsc --noEmit`；定向 `eslint` |
| P6-10 | 已完成 | Prometheus 指标新增 LLM 成功率、审核阻断率、导出失败率、draft SSE session 活跃/失败率；导出事件写入 `ExportEvent`。 | `vitest` metrics/export 25 tests；`prisma generate`；`tsc --noEmit`；定向 `eslint` |
| P6-11 | 已完成 | Grafana provisioning 规则扩展到 LLM 成功率、draft SSE 失败/卡住、job backlog、审核异常和导出失败；观测文档补生产排障手册。 | `js-yaml` 解析通过；静态校验 14 条 rule、UID 唯一、关键指标覆盖；`tsc --noEmit` |
| P6-12 | 已完成 | 新增备份检查脚本、环境变量说明和恢复演练模板；脚本可验证 DB 连接、关键表、最近写入和外部备份时间。 | `vitest` backup-check 4 tests；`tsc --noEmit`；定向 `eslint`；本地 `backup:check` 因未应用最新 migration 正确拦截缺失表 |
| P7-08 | 已完成 | 商业化暂缓后，作为核心写作能力提前完成故事时间线页面：按章节串联大纲、正文进度、Story State 事件、伏笔、线索和关系变化。 | `vitest` timeline/project shell 6 tests；`tsc --noEmit`；定向 `eslint` |

---

## 二、P0 核心链路体检与阻断问题修复

目标：确保真实用户能稳定完成“注册 -> 开书 -> 生成 Bible -> 写章 -> AI 起草 -> 保存 -> 导出”。

### P0-01：建立核心链路 E2E 基线

| 字段 | 内容 |
|---|---|
| 类型 | `E2E` |
| 状态 | 已覆盖（2026-05-27 确认已有 E2E，本轮未改） |
| 建议 PR | PR-CORE-01 |
| 主要文件 | `tests/e2e/onboarding.spec.ts`、`tests/e2e/helpers/onboarding.ts` |
| 具体动作 | 扩展 onboarding E2E，覆盖 session 创建、logline 推荐、questions、Bible SSE、Step5 Review、finalize。 |
| 依赖 | 无 |
| 验收 | `LLM_MOCK=1 npx playwright test tests/e2e/onboarding.spec.ts` 通过；失败时有 trace。 |

### P0-02：补编辑器候选稿 E2E

| 字段 | 内容 |
|---|---|
| 类型 | `E2E` |
| 状态 | 已覆盖（2026-05-27 确认已有 E2E，本轮未改） |
| 建议 PR | PR-CORE-01 |
| 主要文件 | `tests/e2e/editor-candidate.spec.ts` |
| 具体动作 | 覆盖 AI 起草后候选稿的覆盖、追加、插入、丢弃四种操作；断言生成过程中正文不被自动覆盖。 |
| 依赖 | P0-01 |
| 验收 | 四个 candidate 场景稳定通过；接受候选稿后正文内容符合预期。 |

### P0-03：补 Beat Sheet 到起草链路 E2E

| 字段 | 内容 |
|---|---|
| 类型 | `E2E` |
| 状态 | 已覆盖（2026-05-27 确认已有 E2E，本轮未改） |
| 建议 PR | PR-CORE-01 |
| 主要文件 | `tests/e2e/beat-to-draft.spec.ts` |
| 具体动作 | 覆盖生成节拍、编辑节拍、基于节拍起草、候选稿接受、保存。 |
| 依赖 | P0-02 |
| 验收 | E2E 断言 draft 请求携带 beat sheet，候选稿接受后章节正文更新。 |

### P0-04：补版本恢复 E2E

| 字段 | 内容 |
|---|---|
| 类型 | `E2E` |
| 状态 | 已覆盖（2026-05-27 确认已有 E2E，本轮未改） |
| 建议 PR | PR-CORE-01 |
| 主要文件 | `tests/e2e/version-restore.spec.ts`、`app/(app)/editor/[novelId]/VersionsModal.tsx` |
| 具体动作 | 覆盖手动保存 -> 修改 -> 保存 -> 打开版本历史 -> diff -> 恢复旧版本 -> 再次保存。 |
| 依赖 | P0-02 |
| 验收 | 版本恢复后正文回到旧内容；恢复后 `version` 自增且后续保存不冲突。 |

### P0-05：验证 finalize 幂等和失败反馈

| 字段 | 内容 |
|---|---|
| 类型 | `API`、`UT`、`UI` |
| 状态 | 已完成（2026-05-27：并发幂等恢复 + Step5 防重入/失败反馈已落地） |
| 建议 PR | PR-CORE-02 |
| 主要文件 | `app/api/onboarding/sessions/[id]/finalize/route.ts`、`app/api/onboarding/sessions/[id]/finalize/route.test.ts`、`app/(app)/new/_components/Step5Review.tsx` |
| 具体动作 | 增加重复点击 finalize、刷新后 finalize、已完成 session finalize、非 owner finalize 的测试和 UI 反馈。 |
| 依赖 | P0-01 |
| 验收 | 重复 finalize 不创建重复 `Novel`；Step5 按钮 loading 时禁用；错误显示可重试。已通过 `vitest` finalize 9 tests、`tsc --noEmit`、定向 `eslint`。 |

### P0-06：统一 AI SSE 错误恢复

| 字段 | 内容 |
|---|---|
| 类型 | `API`、`UI`、`UT` |
| 状态 | 已完成（2026-05-27：SSE error 元数据解析和客户端 retryable 语义已落地） |
| 建议 PR | PR-CORE-02 |
| 主要文件 | `app/api/novels/[id]/chapters/draft/route.ts`、`app/api/novels/[id]/chapters/draft/resume/route.ts`、`app/(app)/editor/[novelId]/useChapterDrafting.ts` |
| 具体动作 | 梳理 draft SSE 的 timeout、审核阻断、retrieval error、LLM error、客户端断开；确保都落到 `error` 或 resumable session。 |
| 依赖 | P0-02 |
| 验收 | SSE 失败不丢正文；候选稿面板显示错误；可恢复 partial draft。已通过 `vitest` chapterUtils 55 tests、draft route/resume 20 tests、`tsc --noEmit`、定向 `eslint`。 |

### P0-07：候选稿失败态与检索失败态

| 字段 | 内容 |
|---|---|
| 类型 | `UI` |
| 状态 | 已完成（2026-05-27：候选稿空态、流错误、检索降级、记忆预览失败动作已落地） |
| 建议 PR | PR-CORE-02 |
| 主要文件 | `app/(app)/editor/[novelId]/CandidatePanel.tsx`、`app/(app)/editor/[novelId]/AIPanel.tsx` |
| 具体动作 | 增加生成失败、审核阻断、检索失败、空候选稿、重试中的明确 UI 状态。 |
| 依赖 | P0-06 |
| 验收 | 每种失败都有用户可执行动作：重试、丢弃、查看部分生成、返回修改输入。已通过 `vitest` CandidatePanel 4 tests、useChapterHooks 24 tests、`tsc --noEmit`、定向 `eslint`。 |

### P0-08：导出中心 E2E 和审核失败路径

| 字段 | 内容 |
|---|---|
| 类型 | `E2E`、`API` |
| 状态 | 已完成（2026-05-27：导出中心浏览器流程与 API 失败路径已覆盖） |
| 建议 PR | PR-CORE-03 |
| 主要文件 | `app/api/novels/[id]/export/route.ts`、`app/(app)/novels/[id]/export/ExportCenterClient.tsx`、`tests/e2e/export.spec.ts`、`playwright.config.ts` |
| 具体动作 | 新增导出 E2E：markdown/txt/docx/epub、range、include bible；覆盖审核阻断和非法参数。 |
| 依赖 | P0-01 |
| 验收 | 四种格式下载响应正确；非法 range 给明确错误；审核阻断不返回文件。已通过 `vitest` export route 17 tests、`E2E_BROWSER_CHANNEL=chrome playwright test tests/e2e/export.spec.ts --workers=1`、`tsc --noEmit`、定向 `eslint`。 |

---

## 三、P1 AI 质量评估与 Prompt 迭代体系

目标：让 AI 生成质量可衡量、可回归，而不是靠主观感觉调 prompt。

### P1-01：建立评估目录结构

| 字段 | 内容 |
|---|---|
| 类型 | `DOC`、`LIB` |
| 状态 | 已完成（2026-05-27：fixture 目录、玄幻基础样例、README 已落地） |
| 建议 PR | PR-EVAL-01 |
| 主要文件 | `scripts/fixtures/eval-novels/`、`scripts/fixtures/eval-chapters/`、`docs/evals/README.md` |
| 具体动作 | 新增评估目录和 README，定义 fixture JSON 格式：profile、bible、chapters、target chapter、expected memories。 |
| 依赖 | P0 完成 |
| 验收 | 文档说明如何新增一个评估样例；fixture schema 清晰。已通过 `LLM_MOCK=1 npm run eval:ai`、`tsc --noEmit`、定向 `eslint`。 |

### P1-02：新增 AI 质量评估脚本

| 字段 | 内容 |
|---|---|
| 类型 | `LIB` |
| 状态 | 已完成（2026-05-27：评估脚本、命令、latest/日期报告生成已落地） |
| 建议 PR | PR-EVAL-01 |
| 主要文件 | `scripts/eval-ai-quality.ts`、`package.json`、`docs/evals/latest.md`、`docs/evals/latest.json` |
| 具体动作 | 新增 `npm run eval:ai`，批量读取 fixtures，运行 writer/critic/state-diff/retrieval，输出 JSON 和 markdown 报告。 |
| 依赖 | P1-01 |
| 验收 | `npm run eval:ai` 可在 `LLM_MOCK=1` 下运行，并生成 `docs/evals/YYYY-MM-DD.md`。已通过 `LLM_MOCK=1 npm run eval:ai` 9 checks passed、相关 `vitest` 22 tests、`tsc --noEmit`、定向 `eslint`。 |

### P1-03：补 Writer Prompt snapshot 测试

| 字段 | 内容 |
|---|---|
| 类型 | `UT` |
| 状态 | 已完成（2026-05-27：Writer prompt 关键结构顺序测试已落地） |
| 建议 PR | PR-EVAL-02 |
| 主要文件 | `lib/llm/prompts/chapter.ts`、`lib/llm/prompts/chapter.test.ts` |
| 具体动作 | 固定 prompt 关键结构：Bible、Story State、recent summaries、retrieved memories、beat sheet、existing content 顺序。 |
| 依赖 | P1-01 |
| 验收 | 改动 prompt 关键结构会触发测试失败或 snapshot 更新。已通过 `vitest` chapter prompt 14 tests、`tsc --noEmit`、定向 `eslint`。 |

### P1-04：补 Bible 生成质量评估

| 字段 | 内容 |
|---|---|
| 类型 | `LIB`、`DOC` |
| 状态 | 已完成（2026-05-27：三类新增 Bible fixture 与三类质量评分已落地） |
| 建议 PR | PR-EVAL-02 |
| 主要文件 | `lib/llm/prompts/bible.ts`、`scripts/fixtures/eval-novels/*.json`、`scripts/eval-ai-quality.ts` |
| 具体动作 | 增加 3 个代表性开书样例，评估 Bible 的角色目标、世界规则、章节大纲可写性。 |
| 依赖 | P1-02 |
| 验收 | 报告中输出 Bible completeness、outline usability、character conflict 三类评分。已通过 `LLM_MOCK=1 npm run eval:ai` 66 checks passed、`vitest` bible prompt 9 tests、`tsc --noEmit`、定向 `eslint`。 |

### P1-05：补 Critic 评估样例

| 字段 | 内容 |
|---|---|
| 类型 | `LIB` |
| 状态 | 已完成（2026-05-27：Critic 负例 fixture 与预期 issue 类型断言已落地） |
| 建议 PR | PR-EVAL-03 |
| 主要文件 | `lib/llm/prompts/critic.ts`、`lib/llm/prompts/critic.test.ts`、`scripts/fixtures/eval-chapters/`、`scripts/eval-ai-quality.ts` |
| 具体动作 | 准备包含设定冲突、人物动机冲突、节奏问题的章节样例。 |
| 依赖 | P1-02 |
| 验收 | Critic 能输出结构化问题，且测试检查至少命中预期问题类型。已通过 `LLM_MOCK=1 npm run eval:ai` 74 checks passed、critic/client route 24 tests、`tsc --noEmit`、定向 `eslint`。 |

### P1-06：补 State Diff 评估样例

| 字段 | 内容 |
|---|---|
| 类型 | `LIB` |
| 状态 | 已完成（2026-05-27：StateDiff 正例 fixture 与结构化变更断言已落地） |
| 建议 PR | PR-EVAL-03 |
| 主要文件 | `lib/llm/prompts/stateDiff.ts`、`lib/validation/stateDiffMerge.test.ts`、`scripts/fixtures/eval-chapters/`、`scripts/eval-ai-quality.ts` |
| 具体动作 | 用固定章节验证人物位置、目标、关系、伏笔状态是否被正确抽取和合并。 |
| 依赖 | P1-02 |
| 验收 | StateDiff 输出能通过 schema，并在 merge 后产生预期 Story State。已通过 `LLM_MOCK=1 npm run eval:ai` 84 checks passed、state-diff 19 tests、`tsc --noEmit`、定向 `eslint`。 |

### P1-07：补 Retrieval 召回评估脚本雏形

| 字段 | 内容 |
|---|---|
| 类型 | `LIB` |
| 状态 | 已完成（2026-05-27：离线 retrieval cases 与召回报告脚本已落地） |
| 建议 PR | PR-EVAL-04 |
| 主要文件 | `scripts/eval-retrieval.ts`、`scripts/fixtures/retrieval-cases.json`、`lib/agent/retrieval.ts` |
| 具体动作 | 定义“当前章节应该召回哪些历史事件”的 fixture，输出 topK 命中率。 |
| 依赖 | P1-02 |
| 验收 | 脚本能输出 recall@3、recall@5、missed expected memories。已通过 `npm run eval:retrieval`（recall@3=0.889，recall@5=1.000）、agent 21 tests、`tsc --noEmit`、定向 `eslint`。 |

### P1-08：改进 Mock LLM 的边界情况

| 字段 | 内容 |
|---|---|
| 类型 | `LIB`、`UT` |
| 状态 | 已完成（2026-05-27：`LLM_MOCK_SCENARIO` 与 retrieval mock 降级场景已落地） |
| 建议 PR | PR-EVAL-04 |
| 主要文件 | `lib/llm/mock.ts`、`lib/llm/client.test.ts`、`lib/agent/retrieval.ts`、`lib/agent/retrieval.test.ts`、`app/api/novels/[id]/chapters/draft/route.test.ts`、`docs/evals/README.md` |
| 具体动作 | 增加 mock 场景：SSE 中断、空输出、审核阻断、retrieval error、慢速 token。 |
| 依赖 | P0-06 |
| 验收 | E2E 可以通过 env 切换 mock 场景，稳定复现异常路径。已通过定向 `vitest` 39 tests、`LLM_MOCK=1 npm run eval:ai` 84 passed / 0 failed、`npm run eval:retrieval` recall@3=0.889 recall@5=1.000、`tsc --noEmit`、定向 `eslint`。 |

### P1-09：新增连续小说质量测评

| 字段 | 内容 |
|---|---|
| 类型 | `LIB`、`DOC` |
| 状态 | 已完成（2026-05-28：连续章节读者体验评分与报告已落地） |
| 建议 PR | PR-EVAL-05 |
| 主要文件 | `lib/evals/novelQuality.ts`、`lib/evals/novelQuality.test.ts`、`scripts/eval-novel-quality.ts`、`docs/evals/README.md`、`docs/evals/novel-quality-latest.md` |
| 具体动作 | 新增 `npm run eval:novel-quality`，连续生成或读取 4 章样本，从连续性、因果逻辑、人物一致性、剧情推进、世界规则、AI 味、正文可读性七个维度评分。 |
| 依赖 | P1-02 |
| 验收 | 生成 `docs/evals/novel-quality-latest.md/json`；无真实 LLM 时清楚标注低置信度；测评器单测能区分连贯样本和坏样本。已通过 `vitest` novelQuality 2 tests、真实 `eval:novel-quality` 56/70、`LLM_MOCK=1 npm run eval:ai` 84 passed / 0 failed、`tsc --noEmit`、定向 `eslint`。 |

### P1-10：接入 humanizer skill 到生成与测评

| 字段 | 内容 |
|---|---|
| 类型 | `LIB`、`PROMPT`、`UT` |
| 状态 | 已完成（2026-05-28：用户提供的 humanizer skill 已接入 Writer、局部改写和连续质量测评） |
| 建议 PR | PR-EVAL-05 |
| 主要文件 | `lib/llm/prompts/humanStyle.ts`、`lib/llm/prompts/chapter.ts`、`lib/llm/prompts/chapterRevision.ts`、`lib/evals/novelQuality.ts`、`scripts/eval-novel-quality.ts` |
| 具体动作 | 将 humanizer skill 的 5 类 29 种 AI 写作痕迹提炼为共享规则；Writer 生成前按规则内部自查；局部 `humanize` 改写复用同一检查清单；连续小说测评输出命中规则、类别、次数和示例。 |
| 依赖 | P1-09、P2-11 |
| 验收 | AI 味不再只给笼统分数，报告能指出具体命中项；Prompt 测试锁定 Writer 已注入 humanizer skill；测评器能区分坏样本的 AI 痕迹。已通过 `vitest` chapter/chapterRevision/novelQuality 21 tests、`tsc --noEmit`、定向 `eslint`；真实 `eval:novel-quality` 使用 `mimo-v2.5-pro` 生成 4 章，当前 56/70，主要风险为因果逻辑和 AI 味控制。 |

### P1-11：强化章节因果链与状态变化

| 字段 | 内容 |
|---|---|
| 类型 | `PROMPT`、`LIB`、`UT` |
| 状态 | 已完成（2026-05-28：Writer 已强制内部规划因果链，StateDiff/测评同步检查状态变化） |
| 建议 PR | PR-EVAL-05 |
| 主要文件 | `lib/llm/prompts/chapter.ts`、`lib/llm/prompts/humanStyle.ts`、`lib/llm/prompts/stateDiff.ts`、`lib/evals/novelQuality.ts`、`lib/validation/domain.ts`、`lib/validation/stateDiffMerge.ts` |
| 具体动作 | Writer 生成前内部规划“目标 -> 阻碍 -> 行动 -> 结果”；正文必须保留清晰因果钩，并在结尾前留下新线索、关系变化、位置变化、道具归属、敌人反应、伤势/能力变化或世界规则确认。StateDiff 优先抽取这些可验证变化；测评按章节检查可记录状态变化。 |
| 依赖 | P1-09、P1-10 |
| 验收 | 真实 LLM 连续评估不再因 StateDiff 输出异常 fallback；剧情推进恢复到 10/10，总分从 56/70 提升到 60/70。已通过 `vitest` chapter/stateDiff/novelQuality/stateDiffMerge/schemas 66 tests、`tsc --noEmit`、定向 `eslint`；真实 `eval:novel-quality` 使用 `mimo-v2.5-pro` 完整生成 4 章，当前主要风险剩余为 AI 高频词和破折号。 |

### P1-12：Writer 因果钩二次优化与输出清洗

| 字段 | 内容 |
|---|---|
| 类型 | `PROMPT`、`LIB`、`API`、`UT` |
| 状态 | 已完成（2026-05-29：Writer Prompt、SSE 输出和测评导出已完成二次优化） |
| 建议 PR | PR-EVAL-06 |
| 主要文件 | `lib/llm/prompts/chapter.ts`、`lib/llm/prompts/humanStyle.ts`、`lib/llm/writerOutputCleanup.ts`、`app/api/novels/[id]/chapters/draft/route.ts`、`lib/evals/novelQuality.ts`、`scripts/eval-novel-quality.ts` |
| 具体动作 | Writer 正文要求从“一个因果钩”升级为“两处自然因果/代价句”；把打断式对白限定为省略、短回应、动作停顿，避免模型滥用破折号；新增 Writer 输出清洗层，统一清除旁白/对白破折号、Markdown 粗体/标题/列表、教程路标和“慢慢/似乎/仿佛”等高频词；连续测评支持复用最新真实章节重算并自动导出 `docs/evals/chapters/*.md`。 |
| 依赖 | P1-10、P1-11 |
| 验收 | 真实 LLM 连续评估保持 4/4 章有因果钩和状态变化，AI 高频词与破折号降到 0；真实 `eval:novel-quality` 达到 67/70（优秀），复用同一批真实章节按最新规则重算 66/70（优秀）。已通过 `vitest` writer cleanup/chapter/draft route/novelQuality 33 tests、`tsc --noEmit`、定向 `eslint`。 |

### P1-13：多题材、多模型、修订前后矩阵测评

| 字段 | 内容 |
|---|---|
| 类型 | `LIB`、`SCRIPT`、`DOC`、`UT` |
| 状态 | 已完成（2026-05-29：矩阵测评脚本和报告已落地，默认 fixture fallback 可快速跑通；真实 LLM 小矩阵已完成） |
| 建议 PR | PR-EVAL-07 |
| 主要文件 | `scripts/eval-novel-quality-matrix.ts`、`lib/evals/novelQualityMatrix.ts`、`docs/evals/README.md`、`package.json` |
| 具体动作 | 新增 `npm run eval:novel-quality:matrix`；支持 `EVAL_NOVEL_MATRIX_FIXTURES`、`EVAL_NOVEL_MATRIX_MODELS`、`EVAL_NOVEL_MATRIX_CHAPTERS`、`EVAL_NOVEL_MATRIX_REVISION_ROUNDS`、`EVAL_NOVEL_MATRIX_REAL`；输出草稿分、修订后分、变化幅度、最好/最弱组合和 AI 痕迹 Top。默认不调用真实模型，覆盖玄幻、都市悬疑、硬科幻、历史权谋四类 fixture。 |
| 依赖 | P1-09、P1-10、P1-12 |
| 验收 | 能快速生成 `docs/evals/novel-quality-matrix-latest.md/json`；报告横向比较题材/模型/修订前后；真实多模型评估必须显式设置 `EVAL_NOVEL_MATRIX_REAL=1`，避免日常命令误触发高成本调用。已通过 fixture fallback 4 cases；真实 LLM `mimo-v2.5-pro` 跑 `xuanhuan-seed,urban-suspense` 各 3 章、1 轮修订，修订后均分 95.7/100，玄幻 98.6/100，都市悬疑 92.9/100。 |

### P1-14：悬疑题材目标链与修订触发优化

| 字段 | 内容 |
|---|---|
| 类型 | `PROMPT`、`LIB`、`SCRIPT`、`UT` |
| 状态 | 待开始（2026-05-29：真实矩阵暴露都市悬疑逻辑链和 AI 痕迹仍有优化空间） |
| 建议 PR | PR-EVAL-08 |
| 主要文件 | `lib/llm/prompts/chapter.ts`、`lib/llm/prompts/critic.ts`、`lib/llm/prompts/chapterRevision.ts`、`lib/evals/novelQuality.ts`、`scripts/eval-novel-quality-matrix.ts` |
| 具体动作 | 针对悬疑/推理题材强化“目标 -> 阻碍 -> 行动 -> 结果”的可见链条，要求每章至少出现一次调查选择、证据代价或嫌疑人反应；Critic 需要把目标链缺失、句首重复、三连排比、聊天机器人话术纳入可修复问题；矩阵脚本增加进度日志，长时间真实评估不再黑箱。 |
| 依赖 | P1-10、P1-12、P1-13 |
| 验收 | 真实 LLM 小矩阵重跑都市悬疑 3 章后，逻辑分 >= 8/10、AI 味 >= 9/10；若 Critic 发现 AI 痕迹或目标链缺口，`changedChapters` 应大于 0；报告保留具体命中项和修订前后差异。 |

---

## 四、P2 编辑器体验强化

目标：让编辑器从“能写”变成“愿意每天写”。

### P2-01：记录选区范围

| 字段 | 内容 |
|---|---|
| 类型 | `UI`、`LIB` |
| 状态 | 已完成（2026-05-27：编辑器选区状态与测试已落地） |
| 建议 PR | PR-EDITOR-01 |
| 主要文件 | `app/(app)/editor/[novelId]/EditorClient.tsx`、`app/(app)/editor/[novelId]/useChapterEditor.ts`、`app/(app)/editor/[novelId]/useChapterDrafting.ts`、`app/(app)/editor/[novelId]/CandidatePanel.tsx`、`lib/editor/chapterUtils.ts` |
| 具体动作 | 从只记录 cursor position 升级为记录 `selectionStart`、`selectionEnd`、`selectedText`。 |
| 依赖 | P0-02 |
| 验收 | 选中文本、取消选中、切换章节后选区状态正确更新。已通过定向 `vitest` 96 tests、`tsc --noEmit`、定向 `eslint`。 |

### P2-02：定义局部改写 API 请求结构

| 字段 | 内容 |
|---|---|
| 类型 | `API`、`UT` |
| 状态 | 已完成（2026-05-27：局部改写请求结构与 400 测试已落地） |
| 建议 PR | PR-EDITOR-01 |
| 主要文件 | `lib/validation/api.ts`、`app/api/novels/[id]/chapters/draft/revise/route.ts`、`app/api/novels/[id]/chapters/draft/revise/route.test.ts`、`lib/editor/chapterUtils.ts` |
| 具体动作 | 增加 `operation`、`selected_text`、`before_context`、`after_context`、`chapter_index`、`title` schema。 |
| 依赖 | P2-01 |
| 验收 | 非法 operation、空 selected text、过长上下文都有 400 测试覆盖。已通过 `vitest` revise route + chapterUtils 68 tests、`tsc --noEmit`、定向 `eslint`。 |

### P2-03：实现局部改写 Prompt

| 字段 | 内容 |
|---|---|
| 类型 | `LIB`、`UT` |
| 状态 | 已完成（2026-05-27：局部改写 prompt 与 route 接入已落地） |
| 建议 PR | PR-EDITOR-01 |
| 主要文件 | `lib/llm/prompts/chapterRevision.ts`、`lib/llm/prompts/chapterRevision.test.ts` |
| 具体动作 | 为润色、扩写、缩写、改对白、增强冲突、续写选中段落定义 prompt 模板。 |
| 依赖 | P2-02 |
| 验收 | Prompt 测试确认不同 operation 的指令不同，且要求“只返回改写正文”。已通过 `vitest` chapterRevision + revise route + chapterUtils 71 tests、`tsc --noEmit`、定向 `eslint`。 |

### P2-04：AIPanel 增加局部操作控件

| 字段 | 内容 |
|---|---|
| 类型 | `UI` |
| 状态 | 已完成（2026-05-27：AIPanel 局部改写控件与触发链路已落地） |
| 建议 PR | PR-EDITOR-02 |
| 主要文件 | `app/(app)/editor/[novelId]/AIPanel.tsx`、`app/(app)/editor/[novelId]/useChapterDrafting.ts`、`app/(app)/editor/[novelId]/EditorClient.tsx`、`app/(app)/editor/[novelId]/AIPanel.test.ts` |
| 具体动作 | 选中文本后显示局部操作按钮；未选中时按钮禁用并提示先选中文本。 |
| 依赖 | P2-01、P2-03 |
| 验收 | 用户可以从 UI 触发局部改写；loading 和失败状态清楚。已通过 `vitest` AIPanel/EditorClient/useChapterHooks/chapterUtils 97 tests、`tsc --noEmit`、定向 `eslint`。 |

### P2-05：候选稿支持替换选区

| 字段 | 内容 |
|---|---|
| 类型 | `UI`、`LIB` |
| 状态 | 已完成（2026-05-27：候选稿替换选区已落地） |
| 建议 PR | PR-EDITOR-02 |
| 主要文件 | `app/(app)/editor/[novelId]/CandidatePanel.tsx`、`app/(app)/editor/[novelId]/useChapterDrafting.ts`、`lib/editor/chapterUtils.ts` |
| 具体动作 | 新增 accept mode：`replace_selection`；接受前自动创建版本。 |
| 依赖 | P2-04 |
| 验收 | 只替换选区，不影响前后文；接受后保存 source 为 `ai`。已通过 `vitest` CandidatePanel/useChapterHooks/chapterUtils 95 tests、`tsc --noEmit`、定向 `eslint`。 |

### P2-06：候选稿 diff 默认接入

| 字段 | 内容 |
|---|---|
| 类型 | `UI` |
| 状态 | 已完成（2026-05-27：候选稿 diff 已覆盖，折叠测试已补） |
| 建议 PR | PR-EDITOR-03 |
| 主要文件 | `components/ui/DiffView.tsx`、`components/ui/DiffView.test.ts`、`app/(app)/editor/[novelId]/CandidatePanel.tsx`、`vitest.config.ts` |
| 具体动作 | CandidatePanel 增加“候选稿/差异”切换；长文本 diff 自动折叠。 |
| 依赖 | P2-05 |
| 验收 | 当前正文与候选稿差异可见；超过 8 行未变内容折叠。已通过 `vitest` DiffView + CandidatePanel 5 tests、`tsc --noEmit`、定向 `eslint`。 |

### P2-07：统一编辑器保存状态机

| 字段 | 内容 |
|---|---|
| 类型 | `LIB` |
| 状态 | 已完成（2026-05-27：编辑器保存状态机已统一为 clean/dirty/saving/saved/conflict/offline/error，并保留 drafting 作为 AI 活动态） |
| 建议 PR | PR-EDITOR-04 |
| 主要文件 | `lib/editor/chapterUtils.ts`、`app/(app)/editor/[novelId]/useChapterPersistence.ts`、`app/(app)/editor/[novelId]/useChapterCoreState.ts`、`app/(app)/editor/[novelId]/useChapterDrafting.ts`、`app/(app)/editor/[novelId]/EditorClient.tsx` |
| 具体动作 | 明确状态：`clean`、`dirty`、`saving`、`saved`、`conflict`、`offline`、`error`；`drafting` 保留为 AI 生成活动状态，避免打断候选稿链路。 |
| 依赖 | P0-06 |
| 验收 | autosave、manual save、AI save、版本恢复都走同一套状态语义。已通过 `vitest` chapterUtils/EditorClient/useChapterHooks 103 tests、`tsc --noEmit`、定向 `eslint`。 |

### P2-08：Toolbar 显示清晰状态

| 字段 | 内容 |
|---|---|
| 类型 | `UI` |
| 状态 | 已完成（2026-05-27：Toolbar 保存状态胶囊与状态文案映射已落地） |
| 建议 PR | PR-EDITOR-04 |
| 主要文件 | `app/(app)/editor/[novelId]/EditorToolbar.tsx`、`app/(app)/editor/[novelId]/EditorToolbar.test.ts`、`components/ui/StatusTag.tsx` |
| 具体动作 | 展示保存状态、离线状态、冲突状态、最近保存时间、AI 生成状态；保存状态胶囊使用固定最小宽度，避免状态变化造成布局跳动。 |
| 依赖 | P2-07 |
| 验收 | 不同状态有明确文案和颜色；状态变化不造成布局跳动。已通过 `vitest` EditorToolbar/EditorClient 10 tests、`tsc --noEmit`、定向 `eslint`。 |

### P2-09：离线草稿保护

| 字段 | 内容 |
|---|---|
| 类型 | `LIB`、`UI` |
| 状态 | 已完成（2026-05-27：离线本地草稿快照、恢复提示与显式同步/载入/丢弃流程已落地） |
| 建议 PR | PR-EDITOR-05 |
| 主要文件 | `lib/editor/chapterUtils.ts`、`app/(app)/editor/[novelId]/useChapterPersistence.ts`、`app/(app)/editor/[novelId]/useChapterEditor.ts`、`app/(app)/editor/[novelId]/EditorClient.tsx` |
| 具体动作 | 离线时将当前章节本地草稿写入 localStorage；恢复网络后提示同步、载入编辑器或丢弃本地草稿；同步时使用本地快照版本号，避免静默覆盖远端。 |
| 依赖 | P2-07 |
| 验收 | 刷新页面后可发现本地未同步草稿；不会静默覆盖远端内容。已通过 `vitest` chapterUtils/EditorClient/useChapterHooks 109 tests、`tsc --noEmit`、定向 `eslint`。 |

### P2-10：长章节性能保护

| 字段 | 内容 |
|---|---|
| 类型 | `LIB`、`UT` |
| 状态 | 已完成（2026-05-27：长章节字数统计延迟更新、非正则计数与 autosave 长度退避已落地） |
| 建议 PR | PR-EDITOR-05 |
| 主要文件 | `lib/editor/chapterUtils.ts`、`lib/editor/chapterUtils.test.ts`、`app/(app)/editor/[novelId]/useChapterEditor.ts`、`app/(app)/editor/[novelId]/useChapterPersistence.ts` |
| 具体动作 | 超长章节字数统计使用 `useDeferredValue` 和非正则计数；autosave debounce 根据内容长度动态调整；增加 5 万字测试。 |
| 依赖 | P2-07 |
| 验收 | 5 万字章节输入无明显卡顿；统计和保存仍准确。已通过 `vitest` chapterUtils/EditorClient/useChapterHooks/EditorToolbar 116 tests、`tsc --noEmit`、定向 `eslint`。 |

### P2-11：局部“去 AI 味”改写

| 字段 | 内容 |
|---|---|
| 类型 | `API`、`UI`、`LIB` |
| 状态 | 已完成（2026-05-28：编辑器选区支持去 AI 味改写，结果进入候选稿替换选区流程） |
| 建议 PR | PR-EDITOR-06 |
| 主要文件 | `lib/validation/api.ts`、`lib/llm/prompts/chapterRevision.ts`、`app/(app)/editor/[novelId]/AIPanel.tsx`、`lib/llm/mock.ts` |
| 具体动作 | 新增 `humanize` 局部改写 operation，prompt 要求识别并改掉聊天机器人痕迹、Markdown 痕迹、空泛意义化、模板悬念、三连排比、AI 高频词和段落工整等 AI 写作痕迹，同时保留剧情事实、人物动作和前后文衔接。 |
| 依赖 | P2-01、P2-05 |
| 验收 | 选中文本后可点击“去AI味”；API 接受 `operation: humanize`；候选稿可替换原选区；`LLM_MOCK=1` 返回可演示的局部正文。已通过定向 `vitest` 139 tests、`LLM_MOCK=1 npm run eval:ai` 84 passed / 0 failed、`tsc --noEmit`、定向 `eslint`。 |

---

## 五、P3 长篇记忆与 Story State 可信化

目标：让作者能看见、修正、信任 AI 的长篇记忆。

### P3-01：设计记忆库页面数据结构

| 字段 | 内容 |
|---|---|
| 类型 | `API`、`LIB` |
| 状态 | 已完成（2026-05-27：记忆库 GET 预览合约、分页/章节/类型筛选与 freshness 汇总已落地） |
| 建议 PR | PR-MEMORY-01 |
| 主要文件 | `app/api/novels/[id]/memories/preview/route.ts`、`app/api/novels/[id]/memories/preview/route.test.ts`、`lib/agent/contracts.ts` |
| 具体动作 | 定义记忆库返回结构：chapter summaries、volume summaries、novel summary、memory chunks、freshness；`GET` 支持分页、章节筛选、类型筛选，保留 `POST` 作为生成前检索预览。 |
| 依赖 | P1-07 |
| 验收 | API 支持分页、章节筛选、类型筛选。已通过 `vitest` memories preview route 5 tests、`tsc --noEmit`、定向 `eslint`。 |

### P3-02：新增记忆库页面 v1

| 字段 | 内容 |
|---|---|
| 类型 | `UI` |
| 状态 | 已完成（2026-05-27：记忆库页面 v1 与共享 memoryLibrary view model 已落地） |
| 建议 PR | PR-MEMORY-01 |
| 主要文件 | `app/(app)/novels/[id]/memories/page.tsx`、`app/(app)/novels/[id]/memories/MemoriesClient.tsx`、`lib/agent/memoryLibrary.ts`、`lib/agent/memoryLibrary.test.ts` |
| 具体动作 | 展示章节摘要、卷摘要、全书摘要、MemoryChunk；支持按章节和类型筛选；右侧展示 freshness 概览并链接到章节刷新页。 |
| 依赖 | P3-01 |
| 验收 | 空作品、无摘要、检索失败都有清楚状态。已通过 `vitest` memoryLibrary + memories preview route 7 tests、`tsc --noEmit`、定向 `eslint`。 |

### P3-03：项目导航加入记忆库入口

| 字段 | 内容 |
|---|---|
| 类型 | `UI` |
| 状态 | 已完成（2026-05-27：项目详情、章节管理与编辑器顶栏已加入记忆库入口） |
| 建议 PR | PR-MEMORY-01 |
| 主要文件 | `app/(app)/novels/[id]/page.tsx`、`app/(app)/novels/[id]/chapters/ChaptersClient.tsx`、`app/(app)/editor/[novelId]/EditorClient.tsx` |
| 具体动作 | 在小说详情/章节管理/编辑器相关入口加入“记忆库”。 |
| 依赖 | P3-02 |
| 验收 | 用户可以从项目详情进入记忆库，再返回编辑器。已通过 `vitest` project shell + EditorClient 14 tests、`tsc --noEmit`、定向 `eslint`。 |

### P3-04：摘要刷新返回新旧 diff

| 字段 | 内容 |
|---|---|
| 类型 | `API`、`UI` |
| 状态 | 已完成（2026-05-27：摘要预览/确认保存两步流程与 diff metadata 已落地） |
| 建议 PR | PR-MEMORY-02 |
| 主要文件 | `app/api/chapters/[id]/summarize/route.ts`、`app/(app)/novels/[id]/chapters/ChaptersClient.tsx`、`components/ui/DiffView.tsx`、`lib/agent/summaryDiff.ts` |
| 具体动作 | 手动刷新摘要时返回旧摘要、新摘要和 diff metadata，前端允许确认。 |
| 依赖 | P3-02 |
| 验收 | 用户可以在覆盖旧摘要前看到变化；确认后才覆盖旧摘要并刷新卷/全书摘要。已通过 `vitest` summaryDiff + summarize route 9 tests、`tsc --noEmit`、定向 `eslint`。 |

### P3-05：MemoryChunk 增加可观察元数据

| 字段 | 内容 |
|---|---|
| 类型 | `DB`、`LIB` |
| 状态 | 已完成（2026-05-27：MemoryChunk 重要性、来源类型与最近命中时间已落地） |
| 建议 PR | PR-MEMORY-03 |
| 主要文件 | `prisma/schema.prisma`、`prisma/migrations/20260527010000_add_memory_chunk_observability/migration.sql`、`lib/agent/chunking.ts`、`lib/agent/retrieval.ts`、`lib/agent/memoryLibrary.ts` |
| 具体动作 | 评估并新增 `importance`、`source_kind`、`last_used_at` 字段；检索命中后更新 last_used_at。 |
| 依赖 | P3-01 |
| 验收 | migration 通过；旧数据默认值安全；检索命中可记录使用时间；记忆库可展示重要性/来源/最近命中。已通过 `vitest` chunking/retrieval/memoryLibrary/memories preview 17 tests、`prisma generate`、`tsc --noEmit`、定向 `eslint`。 |

### P3-06：RAG query expansion 可解释化

| 字段 | 内容 |
|---|---|
| 类型 | `LIB` |
| 状态 | 已完成（2026-05-27：RAG 召回策略与单条记忆解释已结构化展示） |
| 建议 PR | PR-MEMORY-04 |
| 主要文件 | `lib/agent/retrieval.ts`、`lib/agent/contracts.ts`、`app/api/novels/[id]/chapters/draft/route.ts`、`app/(app)/editor/[novelId]/CandidatePanel.tsx` |
| 具体动作 | retrieval 返回 queryTexts、keyword filters、time decay 解释，供调试和 UI 展示。 |
| 依赖 | P1-07 |
| 验收 | CandidatePanel 能显示 query expansion、keyword filters、chunk 类型、相似度、章节距离、时间衰减、重要性和命中关键词。已通过 `vitest` retrieval/chapterUtils/draft route/CandidatePanel/EditorClient 98 tests、`tsc --noEmit`、定向 `eslint`。 |

### P3-07：用户标记不相关记忆

| 字段 | 内容 |
|---|---|
| 类型 | `DB`、`API`、`UI` |
| 状态 | 已完成（2026-05-27：记忆反馈表、反馈 API 与候选稿面板标记已落地） |
| 建议 PR | PR-MEMORY-04 |
| 主要文件 | `prisma/schema.prisma`、`prisma/migrations/20260527020000_add_memory_feedback/migration.sql`、`app/api/novels/[id]/memories/feedback/route.ts`、`app/(app)/editor/[novelId]/CandidatePanel.tsx` |
| 具体动作 | 增加 memory feedback 表或 metadata 记录，支持用户标记“不相关/有用”。 |
| 依赖 | P3-06 |
| 验收 | 标记后可按 `rating` 汇总 irrelevant/helpful；不直接删除原记忆。已通过 `vitest` memories feedback/preview/draft route/chapterUtils/CandidatePanel/EditorClient/retrieval 106 tests、`prisma generate`、`tsc --noEmit`、定向 `eslint`。 |

### P3-08：扩展 StoryState schema

| 字段 | 内容 |
|---|---|
| 类型 | `DB`、`LIB`、`UT` |
| 状态 | 已完成（2026-05-27：StoryState 扩展地点/道具/伏笔/关系等运行时字段，保持旧 Bible 兼容） |
| 建议 PR | PR-STATE-01 |
| 主要文件 | `lib/validation/domain.ts`、`lib/validation/schemas.test.ts`、`lib/validation/stateDiffMerge.ts`、`lib/validation/stateDiffMerge.test.ts` |
| 具体动作 | 扩展 StoryState：地点、道具、伏笔、关系、人物当前目标；保持向后兼容。 |
| 依赖 | P1-06 |
| 验收 | 旧 Bible 能 parse；新字段有 schema 测试；new_entities 可同步进入运行时地点/道具/伏笔。已通过 `vitest` schemas + stateDiffMerge 28 tests、`tsc --noEmit`、定向 `eslint`。 |

### P3-09：StateDiff 支持逐项接受/拒绝

| 字段 | 内容 |
|---|---|
| 类型 | `UI`、`LIB` |
| 状态 | 已完成（2026-05-27：StateDiff 面板支持逐项勾选，merge 前只保留被选中的变更） |
| 建议 PR | PR-STATE-01 |
| 主要文件 | `app/(app)/editor/[novelId]/StateDiffPanel.tsx`、`app/(app)/editor/[novelId]/StateDiffPanel.test.ts`、`lib/validation/stateDiffMerge.ts`、`lib/validation/stateDiffMerge.test.ts` |
| 具体动作 | StateDiffPanel 每条变化可单独选择；merge 只应用被选中的变更。 |
| 依赖 | P3-08 |
| 验收 | 用户可以只接受人物状态，不接受新实体或伏笔变化。已通过 `vitest` stateDiffMerge + StateDiffPanel + EditorClient 24 tests、`tsc --noEmit`、定向 `eslint`。 |

### P3-10：Story State 冲突检测

| 字段 | 内容 |
|---|---|
| 类型 | `LIB`、`UT` |
| 状态 | 已完成（2026-05-27：新增 Story State 冲突 warning，StateDiff 审阅面板可展示且不阻断采纳） |
| 建议 PR | PR-STATE-02 |
| 主要文件 | `lib/validation/stateDiffMerge.ts`、`lib/validation/stateDiffMerge.test.ts`、`app/(app)/editor/[novelId]/StateDiffPanel.tsx`、`app/(app)/editor/[novelId]/StateDiffPanel.test.ts`、`app/(app)/editor/[novelId]/EditorClient.tsx`、`app/(app)/editor/[novelId]/EditorClient.test.ts` |
| 具体动作 | 检测同一人物位置冲突、伏笔重复解决、关系互斥等基础冲突。 |
| 依赖 | P3-09 |
| 验收 | 冲突返回 warnings，不直接阻断保存；UI 可展示待确认。已通过 `vitest` stateDiffMerge + StateDiffPanel + EditorClient 31 tests、`tsc --noEmit`、定向 `eslint`。 |

---

## 六、P4 后台任务生产化

目标：后台摘要、索引、刷新任务不依赖用户请求存活。

### P4-01：抽象单任务领取接口

| 字段 | 内容 |
|---|---|
| 类型 | `LIB`、`UT` |
| 状态 | 已完成（2026-05-27：新增 worker 友好的单任务领取与执行接口，保留旧 runJob/runPendingJobsForNovel 兼容） |
| 建议 PR | PR-JOBS-01 |
| 主要文件 | `lib/jobs/queue.ts`、`lib/jobs/queue.test.ts` |
| 具体动作 | 新增 `claimNextJob()`、`runNextJob()`，支持按 status/type/novelId 获取任务。 |
| 依赖 | P0 完成 |
| 验收 | 并发 claim 不会重复领取同一 job。已通过 `vitest` queue 16 tests、`tsc --noEmit`、定向 `eslint`。 |

### P4-02：增加任务超时和并发限制

| 字段 | 内容 |
|---|---|
| 类型 | `LIB`、`UT` |
| 状态 | 已完成（2026-05-27：按 job type 配置 timeout/max attempts/max concurrent，领取任务前跳过并发饱和类型） |
| 建议 PR | PR-JOBS-01 |
| 主要文件 | `lib/jobs/queue.ts` |
| 具体动作 | 支持每种 job type 的 timeout、max attempts、并发上限。 |
| 依赖 | P4-01 |
| 验收 | handler 超时后 job 进入 pending 或 failed，attempts 正确递增；并发达到上限时不会领取同类型新任务。已通过 `vitest` queue 20 tests、`tsc --noEmit`、定向 `eslint`。 |

### P4-03：新增 worker 脚本

| 字段 | 内容 |
|---|---|
| 类型 | `OPS` |
| 状态 | 已完成（2026-05-27：新增 `npm run jobs:worker`，支持一次性 drain、轮询、按作品/类型过滤、SIGINT/SIGTERM 优雅停止） |
| 建议 PR | PR-JOBS-02 |
| 主要文件 | `scripts/jobs-worker.ts`、`scripts/jobs-worker.test.ts`、`package.json` |
| 具体动作 | 新增 `npm run jobs:worker`，循环消费 pending jobs，支持 SIGINT/SIGTERM graceful shutdown。 |
| 依赖 | P4-02 |
| 验收 | 启动 worker 后，pending jobs 能在无浏览器请求时完成。已通过 `vitest` jobs-worker + queue 26 tests、`tsc --noEmit`、定向 `eslint`、`JOBS_WORKER_ONCE=1 JOBS_WORKER_POLL_MS=0 npm run jobs:worker`。 |

### P4-04：jobs API 改为纯入队

| 字段 | 内容 |
|---|---|
| 类型 | `API` |
| 状态 | 已完成（2026-05-27：jobs POST 与 refresh-dirty 只入队并返回 job ids，不再在请求内 drain） |
| 建议 PR | PR-JOBS-02 |
| 主要文件 | `app/api/novels/[id]/jobs/route.ts`、`app/api/novels/[id]/jobs/route.test.ts`、`app/api/novels/[id]/jobs/refresh-dirty/route.ts`、`app/api/novels/[id]/jobs/refresh-dirty/route.test.ts` |
| 具体动作 | API 返回 job ids；不再假设当前请求能 drain 完任务。 |
| 依赖 | P4-03 |
| 验收 | API 响应更快；任务由 worker 消费。已通过 `vitest` jobs API + worker + queue 42 tests、`tsc --noEmit`、定向 `eslint`。 |

### P4-05：重试 API 只重置状态

| 字段 | 内容 |
|---|---|
| 类型 | `API`、`UT` |
| 状态 | 已完成（2026-05-27：retry API 仅允许 failed job 重置为 pending，不再在请求内执行 handler） |
| 建议 PR | PR-JOBS-02 |
| 主要文件 | `app/api/novels/[id]/jobs/[jobId]/retry/route.ts`、`app/api/novels/[id]/jobs/[jobId]/retry/route.test.ts` |
| 具体动作 | retry 将 failed job 改回 pending；不在 API 请求内长时间运行。 |
| 依赖 | P4-04 |
| 验收 | done/running/pending job 不能 retry；failed job retry 后等待 worker。已通过 `vitest` retry + jobs API + worker + queue 50 tests、`tsc --noEmit`、定向 `eslint`。 |

### P4-06：前端 job 状态轮询

| 字段 | 内容 |
|---|---|
| 类型 | `UI` |
| 状态 | 已完成（2026-05-27：JobsBadge 初次加载摘要，展开面板后立即刷新并按 interval 轮询最近 jobs） |
| 建议 PR | PR-JOBS-03 |
| 主要文件 | `app/(app)/editor/[novelId]/JobsBadge.tsx`、`app/(app)/editor/[novelId]/JobsBadge.test.ts`、`app/api/novels/[id]/jobs/route.ts` |
| 具体动作 | JobsBadge 展开后定时刷新最近 jobs；显示 pending/running/done/failed。 |
| 依赖 | P4-04 |
| 验收 | worker 完成任务后 UI 状态自动更新。已通过 `vitest` JobsBadge + EditorClient + jobs API + worker + queue 56 tests、`tsc --noEmit`、定向 `eslint`。 |

### P4-07：Docker Compose 增加 worker

| 字段 | 内容 |
|---|---|
| 类型 | `OPS` |
| 状态 | 已完成（2026-05-27：Docker Compose 新增 app/worker 服务，worker 复用 app 镜像运行 `npm run jobs:worker`） |
| 建议 PR | PR-JOBS-03 |
| 主要文件 | `docker-compose.yml`、`Dockerfile`、`.env.example` |
| 具体动作 | 新增 worker service，复用 app image，运行 `npm run jobs:worker`。 |
| 依赖 | P4-03 |
| 验收 | `docker compose up` 后 app 和 worker 同时启动。已通过 `vitest` jobs-worker + queue 26 tests、`tsc --noEmit`、定向 `eslint`、静态检查 app/worker service 与 worker command；本机缺少 `docker` 命令，未能运行 `docker compose config`。 |

### P4-08：job 指标和告警

| 字段 | 内容 |
|---|---|
| 类型 | `OPS`、`DOC` |
| 状态 | 已完成（2026-05-27：新增 job backlog、最长等待时间、15m 失败率指标，并补 Grafana 告警与排查文档） |
| 建议 PR | PR-JOBS-04 |
| 主要文件 | `lib/metrics/collector.ts`、`lib/metrics/collector.test.ts`、`lib/observability/grafana/ai-novel-alert-rules.yaml`、`docs/OBSERVABILITY.md` |
| 具体动作 | 输出 pending/running/failed 数量、最长等待时间、失败率。 |
| 依赖 | P4-06 |
| 验收 | `/api/metrics` 可看到 job backlog 指标；文档说明如何排查失败任务。已通过 `vitest` metrics collector 3 tests、`tsc --noEmit`、定向 `eslint`、静态检查指标/告警/文档引用。 |

---

## 七、P5 产品信息架构与文案收敛

目标：减少“协议感/引擎感”的展示语言，让产品更像日常写作工具。

### P5-01：Dashboard 文案收敛

| 字段 | 内容 |
|---|---|
| 类型 | `UI` |
| 状态 | 已完成（2026-05-27：Dashboard 第一屏文案已收敛为下一步建议、继续写作、失败任务等日常表达） |
| 建议 PR | PR-CONTENT-01 |
| 主要文件 | `app/(app)/dashboard/page.tsx` |
| 具体动作 | 将“智能创作协议 / DIRECTIVE”等文案改为“下一步建议”“继续写作”“失败任务”。 |
| 依赖 | P0 完成 |
| 验收 | Dashboard 第一屏只呈现继续创作所需信息。已通过 `vitest` dashboard page 2 tests、`tsc --noEmit`、定向 `eslint`、静态搜索旧文案无业务残留。 |

### P5-02：New Wizard 文案收敛

| 字段 | 内容 |
|---|---|
| 类型 | `UI` |
| 状态 | 已完成（2026-05-27：New Wizard 文案已收敛为题材、灵感、问题、设定、大纲等日常写作表达） |
| 建议 PR | PR-CONTENT-01 |
| 主要文件 | `app/(app)/new/page.tsx`、`app/(app)/new/_components/*` |
| 具体动作 | 减少“核心/协议/引擎”词频，改为题材、灵感、问题、设定、大纲。 |
| 依赖 | P0-01 |
| 验收 | 不影响 E2E selector；用户能更清楚知道当前步骤要做什么。已通过 `vitest` new wizard copy + finalize 10 tests、`tsc --noEmit`、定向 `eslint`、静态搜索旧文案无业务残留。 |

### P5-03：编辑器文案和状态统一

| 字段 | 内容 |
|---|---|
| 类型 | `UI` |
| 状态 | 已完成（2026-05-27：编辑器顶部、写作助手和状态标签文案已统一为更直接的写作工具表达） |
| 建议 PR | PR-CONTENT-02 |
| 主要文件 | `EditorClient.tsx`、`EditorToolbar.tsx`、`AIPanel.tsx`、`StatusTag.tsx` |
| 具体动作 | 统一保存、AI、导出、任务、状态文案。 |
| 依赖 | P2-08 |
| 验收 | 编辑器顶部信息密度更低，状态含义更清楚。已通过 `vitest` AIPanel/EditorToolbar/EditorClient 18 tests、`tsc --noEmit`、定向 `eslint`、静态搜索旧编辑器文案无业务残留。 |

### P5-04：统一 StatusStates 使用

| 字段 | 内容 |
|---|---|
| 类型 | `UI` |
| 状态 | 已完成（2026-05-27：`EmptyState` 支持紧凑面板并已替换 Dashboard/Activity 里的重复空状态块） |
| 建议 PR | PR-CONTENT-02 |
| 主要文件 | `components/ui/StatusStates.tsx`、`app/(app)/**/*.tsx` |
| 具体动作 | 统一空、加载、错误、生成中组件，替换页面内临时状态块。 |
| 依赖 | P5-01 |
| 验收 | 主要页面状态样式一致；没有明显重复状态 UI。已通过 `vitest` StatusStates + dashboard page 3 tests、`tsc --noEmit`、定向 `eslint`、静态检查手写空态已替换。 |

### P5-05：管理页与创作页风格区分

| 字段 | 内容 |
|---|---|
| 类型 | `UI` |
| 状态 | 已完成（2026-05-28：模型配置与管理页已改为配置/监控/权限管理语气） |
| 建议 PR | PR-CONTENT-03 |
| 主要文件 | `app/(app)/models/page.tsx`、`app/(app)/models/embeddings/page.tsx`、`app/(app)/admin/*` |
| 具体动作 | 管理页文案更偏配置/审计，不混入创作叙事风格。 |
| 依赖 | P5-03 |
| 验收 | 管理页读起来像后台工具，创作页读起来像写作空间。已通过 `vitest` admin-copy 1 test、`tsc --noEmit`、定向 `eslint`、静态搜索旧管理页文案无业务残留。 |

### P5-06：Landing 定位选择

| 字段 | 内容 |
|---|---|
| 类型 | `UI`、`DOC` |
| 状态 | 已完成（2026-05-28：首页已定位为写作工作台入口，README 同步为工具型产品说明） |
| 建议 PR | PR-CONTENT-03 |
| 主要文件 | `app/page.tsx`、`README.md` |
| 具体动作 | 决定首页是营销官网还是工具入口；如果是官网，增加真实产品截图位；如果是工具入口，减少大段营销文案。 |
| 依赖 | P5-01 |
| 验收 | 首页定位和 README 描述一致。已通过 `vitest` home-copy 1 test、`tsc --noEmit`、定向 `eslint`、静态搜索旧 Landing 文案无残留。 |

---

## 八、P6 数据、安全、成本、监控与上线能力

目标：上线前确保用户作品、AI 成本、管理员操作和生产故障都有兜底。

### P6-01：完整作品数据导出

| 字段 | 内容 |
|---|---|
| 类型 | `API`、`LIB` |
| 状态 | 已完成（2026-05-28：新增完整项目 JSON / ZIP 导出，包含摘要、Story State 与记忆元数据，不导出 embedding 向量） |
| 建议 PR | PR-PROD-01 |
| 主要文件 | `app/api/novels/[id]/export/route.ts`、`lib/export/formatNovel.ts` |
| 具体动作 | 增加完整项目导出格式，包含 Bible、章节、摘要、Story State、记忆元数据。 |
| 依赖 | P3-02 |
| 验收 | 用户能下载完整 JSON/zip；不泄漏其他用户数据。已通过 `vitest` formatNovel + export route 39 tests、`tsc --noEmit`、定向 `eslint`。 |

### P6-02：账户级数据导出准备

| 字段 | 内容 |
|---|---|
| 类型 | `API` |
| 状态 | 已完成（2026-05-28：Profile 已加入“导出我的数据”，后端按当前用户聚合所有作品完整 JSON 备份） |
| 建议 PR | PR-PROD-01 |
| 主要文件 | `app/api/user/profile/route.ts`、`app/(app)/profile/page.tsx` |
| 具体动作 | Profile 页面增加“导出我的数据”入口，后端聚合当前用户所有作品。 |
| 依赖 | P6-01 |
| 验收 | 当前用户只能导出自己的作品。已通过 `vitest` profile export + formatNovel + novel export 42 tests、`tsc --noEmit`、定向 `eslint`。 |

### P6-03：软删除评估与实现

| 字段 | 内容 |
|---|---|
| 类型 | `DB`、`API` |
| 状态 | 已完成（2026-05-28：Novel 已支持软删除与恢复，默认读取路径隐藏已删除作品） |
| 建议 PR | PR-PROD-02 |
| 主要文件 | `prisma/schema.prisma`、`app/api/novels/[id]/route.ts` |
| 具体动作 | 评估 `Novel`、`ChapterDraft` 是否增加 `deleted_at`；删除操作先软删除，后台再清理。 |
| 依赖 | P6-01 |
| 验收 | 用户误删后有恢复窗口；默认查询不显示已删除。已通过 `vitest` novels route/restore/export/profile export 35 tests、`prisma generate`、`tsc --noEmit`、定向 `eslint`。 |

### P6-04：管理员操作审计

| 字段 | 内容 |
|---|---|
| 类型 | `DB`、`API` |
| 状态 | 已完成（2026-05-28：管理员关键写操作已写入 AdminAudit，API key 只记录更新标记和字段名） |
| 建议 PR | PR-PROD-02 |
| 主要文件 | `prisma/schema.prisma`、`app/api/admin/users/*`、`app/api/llm-models/*`、`app/api/embedding-models/*` |
| 具体动作 | 新增 admin audit 表，记录角色变更、模型配置变更、API key 更新、审核复核。 |
| 依赖 | 无 |
| 验收 | 每次 admin 关键操作都有审计行，不记录明文 API key。已通过 `vitest` admin audit write paths 43 tests、`prisma generate`、`tsc --noEmit`、定向 `eslint`。 |

### P6-05：保护最后一个管理员

| 字段 | 内容 |
|---|---|
| 类型 | `API`、`UI` |
| 状态 | 已完成（2026-05-28：撤销 admin 前检查 DB admin 数量，最后一个数据库 admin 会返回 `LAST_ADMIN`） |
| 建议 PR | PR-PROD-02 |
| 主要文件 | `app/api/admin/users/[id]/roles/[role]/route.ts`、`app/(app)/admin/users/page.tsx` |
| 具体动作 | 防止撤销最后一个 DB admin，或至少强提醒 env fallback 风险。 |
| 依赖 | P6-04 |
| 验收 | 删除最后一个 admin 时 API 返回明确错误或 UI 二次确认。已通过 `vitest` admin role revoke 6 tests、`tsc --noEmit`、定向 `eslint`。 |

### P6-06：metrics 路由生产保护

| 字段 | 内容 |
|---|---|
| 类型 | `API`、`UT` |
| 状态 | 已完成（2026-05-28：已确认生产未配置 token 默认拒绝，缺失/错误 token 均不采集指标） |
| 建议 PR | PR-PROD-03 |
| 主要文件 | `app/api/metrics/route.ts`、`app/api/metrics/route.test.ts` |
| 具体动作 | 生产环境未配置 `METRICS_TOKEN` 时默认拒绝访问；测试覆盖 token 缺失和错误 token。 |
| 依赖 | 无 |
| 验收 | metrics 不会在生产裸奔。已通过 `vitest` metrics route 9 tests、`tsc --noEmit`、定向 `eslint`。 |

### P6-07：成本额度策略升级

| 字段 | 内容 |
|---|---|
| 类型 | `LIB`、`API` |
| 状态 | 已完成（2026-05-28：增加单次请求预算、日/月 reset 时间、调用次数与统一结构化 quota exceeded 响应） |
| 建议 PR | PR-PROD-03 |
| 主要文件 | `lib/llm/usage.ts`、`app/api/usage/route.ts`、高成本 LLM API routes、`.env.example` |
| 具体动作 | 增加日额度、月额度、单次请求预算、下一次重置时间。 |
| 依赖 | P1 完成 |
| 验收 | quota exceeded 响应包含原因、limitType、当前用量、限制值和 reset 时间。已通过 `vitest` usage/onboarding 45 tests、受影响 LLM route 37 tests、`tsc --noEmit`、定向 `eslint`。 |

### P6-08：用户用量页面

| 字段 | 内容 |
|---|---|
| 类型 | `UI` |
| 状态 | 已完成（2026-05-28：`/activity` 已改为当前用户用量页，并接入 `/api/usage` 趋势与记录数据） |
| 建议 PR | PR-PROD-04 |
| 主要文件 | `app/(app)/activity/page.tsx`、`app/api/usage/route.ts`、`components/layout/Sidebar.tsx` |
| 具体动作 | 展示用户自己的 AI 调用记录、token、费用趋势、失败率。 |
| 依赖 | P6-07 |
| 验收 | 用户可以理解自己的本月消耗。已通过 `vitest` usage/activity 3 tests、`tsc --noEmit`、定向 `eslint`。 |

### P6-09：admin AI 成本聚合

| 字段 | 内容 |
|---|---|
| 类型 | `UI`、`API` |
| 状态 | 已完成（2026-05-28：admin AI 调用 API/页面已增加用户、作品、Agent、模型聚合） |
| 建议 PR | PR-PROD-04 |
| 主要文件 | `app/(app)/admin/ai-calls/page.tsx`、`app/api/admin/ai-calls/route.ts` |
| 具体动作 | 增加按用户、作品、agent、模型聚合的成本视图。 |
| 依赖 | P6-07 |
| 验收 | 管理员能定位高成本用户和高失败 agent。已通过 `vitest` admin ai-calls 3 tests、`tsc --noEmit`、定向 `eslint`。 |

### P6-10：生产指标扩展

| 字段 | 内容 |
|---|---|
| 类型 | `OPS` |
| 状态 | 已完成（2026-05-28：新增 LLM 成功率、审核阻断率、导出失败率、draft session 活跃/失败率指标） |
| 建议 PR | PR-PROD-05 |
| 主要文件 | `lib/metrics/collector.ts`、`lib/export/events.ts`、`app/api/metrics/route.ts`、`app/api/novels/[id]/export/route.ts`、`prisma/schema.prisma` |
| 具体动作 | 增加 LLM 成功率、SSE 失败率、job backlog、审核阻断率、导出失败率。 |
| 依赖 | P4-08 |
| 验收 | Prometheus 输出新增指标，测试覆盖格式。已通过 `vitest` metrics/export 25 tests、`prisma generate`、`tsc --noEmit`、定向 `eslint`。 |

### P6-11：Grafana 告警规则

| 字段 | 内容 |
|---|---|
| 类型 | `OPS`、`DOC` |
| 状态 | 已完成（2026-05-28：Grafana alert rules 已覆盖 LLM、draft SSE、job、moderation、export 生产信号，Observability 文档补排障步骤） |
| 建议 PR | PR-PROD-05 |
| 主要文件 | `lib/observability/grafana/ai-novel-alert-rules.yaml`、`docs/OBSERVABILITY.md` |
| 具体动作 | 增加 LLM 错误率、job 堆积、审核服务异常、导出失败告警。 |
| 依赖 | P6-10 |
| 验收 | 告警规则可被 Grafana 加载；文档有排障步骤。已通过 `js-yaml` 解析、14 条 rule/UID 唯一/关键指标覆盖静态校验、`tsc --noEmit`。 |

### P6-12：备份与恢复演练文档

| 字段 | 内容 |
|---|---|
| 类型 | `DOC`、`OPS` |
| 状态 | 已完成（2026-05-28：新增 `npm run backup:check`、备份新鲜度配置说明和恢复演练模板） |
| 建议 PR | PR-PROD-06 |
| 主要文件 | `scripts/backup-check.ts`、`scripts/backup-check.test.ts`、`docs/HEALTH.md`、`.env.example`、`package.json` |
| 具体动作 | 新增备份检查脚本和恢复演练记录模板。 |
| 依赖 | P6-01 |
| 验收 | 能验证数据库连接、关键表数量、最近写入和备份时间。已通过 `vitest` backup-check 4 tests、`tsc --noEmit`、定向 `eslint`；本地 `npm run backup:check` 因测试库缺少 `ExportEvent` migration 正确失败，提示部署前需先 `npm run db:deploy`。 |

---

## 九、P7 后续增强：资产化、协作与商业化

目标：核心写作体验优先。商业化相关 P7-01/P7-02 先暂缓；角色、伏笔、时间线等能直接帮助作者写长篇的资产化能力可以提前做。

### P7-01：套餐与额度模型设计

| 字段 | 内容 |
|---|---|
| 类型 | `DOC`、`DB` |
| 状态 | 暂缓（2026-05-28：商业化先不做，优先继续打磨核心写小说能力） |
| 建议 PR | PR-BIZ-01 |
| 主要文件 | `docs/pricing-model.md`、`prisma/schema.prisma` |
| 具体动作 | 设计 Free/Pro/Studio 的作品数、月 token、导出、模型权限。 |
| 依赖 | P6-07 |
| 验收 | 文档能直接指导后续账单表设计。 |

### P7-02：用户套餐字段

| 字段 | 内容 |
|---|---|
| 类型 | `DB`、`API` |
| 状态 | 暂缓（2026-05-28：等待套餐设计重新进入范围后再将 quota 与套餐关联） |
| 建议 PR | PR-BIZ-01 |
| 主要文件 | `prisma/schema.prisma`、`lib/llm/usage.ts` |
| 具体动作 | 增加用户套餐或订阅表，将 quota 与套餐关联。 |
| 依赖 | P7-01 |
| 验收 | 不同套餐返回不同 quota。 |

### P7-03：协作者数据模型

| 字段 | 内容 |
|---|---|
| 类型 | `DB` |
| 建议 PR | PR-COLLAB-01 |
| 主要文件 | `prisma/schema.prisma`、`lib/auth/ownership.ts` |
| 具体动作 | 增加 `NovelCollaborator`，角色包含 owner/editor/viewer/commenter。 |
| 依赖 | P6 完成 |
| 验收 | owner 逻辑向 collaborator 权限平滑迁移。 |

### P7-04：协作权限 API

| 字段 | 内容 |
|---|---|
| 类型 | `API`、`UT` |
| 建议 PR | PR-COLLAB-01 |
| 主要文件 | `app/api/novels/[id]/collaborators/route.ts` |
| 具体动作 | 支持邀请、移除、修改权限；所有作品 API 使用统一权限检查。 |
| 依赖 | P7-03 |
| 验收 | viewer 不能编辑；editor 不能删除作品；owner 可管理成员。 |

### P7-05：评论与批注模型

| 字段 | 内容 |
|---|---|
| 类型 | `DB`、`API` |
| 建议 PR | PR-COLLAB-02 |
| 主要文件 | `prisma/schema.prisma`、`app/api/chapters/[id]/comments/route.ts` |
| 具体动作 | 增加章节范围评论，支持 start/end offset、resolved 状态。 |
| 依赖 | P7-03 |
| 验收 | 评论不会破坏正文；正文变化后能标记评论位置可能失效。 |

### P7-06：角色资产独立建表

| 字段 | 内容 |
|---|---|
| 类型 | `DB`、`API` |
| 建议 PR | PR-ASSET-01 |
| 主要文件 | `prisma/schema.prisma`、`app/(app)/novels/[id]/characters/page.tsx` |
| 具体动作 | 评估从 Bible JSON 中抽出 Character 表，或建立同步缓存表。 |
| 依赖 | P3-08 |
| 验收 | 不破坏现有 BibleDraft；角色编辑更适合后续关系图和检索。 |

### P7-07：伏笔系统

| 字段 | 内容 |
|---|---|
| 类型 | `DB`、`UI` |
| 建议 PR | PR-ASSET-02 |
| 主要文件 | `prisma/schema.prisma`、`app/(app)/novels/[id]/outline/page.tsx` |
| 具体动作 | 增加 plot thread / foreshadowing 可视化，记录引入、推进、回收章节。 |
| 依赖 | P3-10 |
| 验收 | 用户能查看未回收伏笔和已解决伏笔。 |

### P7-08：故事时间线页面

| 字段 | 内容 |
|---|---|
| 类型 | `UI`、`API` |
| 状态 | 已完成（2026-05-28：新增故事时间线页面，按章节展示大纲、正文进度、Story State 事件、线索、伏笔和关系变化） |
| 建议 PR | PR-ASSET-02 |
| 主要文件 | `app/(app)/novels/[id]/timeline/page.tsx`、`lib/novels/timeline.ts`、`app/(app)/novels/[id]/page.tsx`、`app/(app)/novels/[id]/project-shell.test.ts` |
| 具体动作 | 按章节和故事内时间展示事件，支持从 StateDiff 自动累积。 |
| 依赖 | P3-10；P7-07 完整伏笔系统后可继续增强筛选和编辑能力 |
| 验收 | 用户能定位某个事件发生在哪章、影响了哪些人物和伏笔。已通过 `vitest` timeline/project shell 6 tests、`tsc --noEmit`、定向 `eslint`。 |

---

## 十、建议 PR 切分总表

| PR | 包含任务 | 目标 |
|---|---|---|
| PR-CORE-01 | P0-01, P0-02, P0-03, P0-04 | 核心链路 E2E 基线 |
| PR-CORE-02 | P0-05, P0-06, P0-07 | finalize/SSE/candidate 失败恢复 |
| PR-CORE-03 | P0-08 | 导出中心 E2E |
| PR-EVAL-01 | P1-01, P1-02 | AI 评估脚手架 |
| PR-EVAL-02 | P1-03, P1-04 | Writer/Bible 评估 |
| PR-EVAL-03 | P1-05, P1-06 | Critic/StateDiff 评估 |
| PR-EVAL-04 | P1-07, P1-08 | Retrieval 评估与 Mock 边界 |
| PR-EDITOR-01 | P2-01, P2-02, P2-03 | 局部改写底座 |
| PR-EDITOR-02 | P2-04, P2-05 | 局部改写 UI 与替换选区 |
| PR-EDITOR-03 | P2-06 | 候选稿 diff |
| PR-EDITOR-04 | P2-07, P2-08 | 保存状态机与 toolbar |
| PR-EDITOR-05 | P2-09, P2-10 | 离线草稿与长章节性能 |
| PR-MEMORY-01 | P3-01, P3-02, P3-03 | 记忆库页面 v1 |
| PR-MEMORY-02 | P3-04 | 摘要 diff 确认 |
| PR-MEMORY-03 | P3-05 | MemoryChunk 元数据 |
| PR-MEMORY-04 | P3-06, P3-07 | RAG 可解释与反馈 |
| PR-STATE-01 | P3-08, P3-09 | Story State 扩展与逐项接受 |
| PR-STATE-02 | P3-10 | Story State 冲突检测 |
| PR-JOBS-01 | P4-01, P4-02 | Job queue 抽象升级 |
| PR-JOBS-02 | P4-03, P4-04, P4-05 | Worker 与 jobs API 改造 |
| PR-JOBS-03 | P4-06, P4-07 | Jobs UI 轮询与 Docker worker |
| PR-JOBS-04 | P4-08 | Job 指标与文档 |
| PR-CONTENT-01 | P5-01, P5-02 | Dashboard/New 文案 |
| PR-CONTENT-02 | P5-03, P5-04 | 编辑器文案和状态组件 |
| PR-CONTENT-03 | P5-05, P5-06 | 管理页风格与首页定位 |
| PR-PROD-01 | P6-01, P6-02 | 数据导出 |
| PR-PROD-02 | P6-03, P6-04, P6-05 | 软删除与管理员审计 |
| PR-PROD-03 | P6-06, P6-07 | metrics 保护与额度策略 |
| PR-PROD-04 | P6-08, P6-09 | 用户/管理员用量视图 |
| PR-PROD-05 | P6-10, P6-11 | 指标与告警 |
| PR-PROD-06 | P6-12 | 备份与恢复演练 |
| PR-BIZ-01 | P7-01, P7-02 | 套餐与额度模型 |
| PR-COLLAB-01 | P7-03, P7-04 | 协作者模型与权限 |
| PR-COLLAB-02 | P7-05 | 评论批注 |
| PR-ASSET-01 | P7-06 | 角色资产化 |
| PR-ASSET-02 | P7-07, P7-08 | 伏笔系统与时间线 |

---

## 十一、第一批建议立刻开工任务

如果只选最值得马上做的 10 个任务，建议按这个顺序：

1. P0-01 建立核心链路 E2E 基线。
2. P0-02 补编辑器候选稿 E2E。
3. P0-05 验证 finalize 幂等和失败反馈。
4. P0-06 统一 AI SSE 错误恢复。
5. P1-01 建立评估目录结构。
6. P1-02 新增 AI 质量评估脚本。
7. P1-03 补 Writer Prompt snapshot 测试。
8. P2-01 记录选区范围。
9. P2-02 定义局部改写 API 请求结构。
10. P2-03 实现局部改写 Prompt。

这 10 个任务完成后，项目会从“功能很多”转向“可稳定验证、可持续迭代”的状态。
