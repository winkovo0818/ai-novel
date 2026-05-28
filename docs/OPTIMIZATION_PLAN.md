# AI Novel 优化计划（按优先级）

> 创建时间：2026-05-27  
> 目标：把当前“功能完整的 AI 小说写作 MVP”推进为“长篇类型小说创作者愿意长期使用的稳定创作工具”。  
> 范围：产品体验、AI 质量、长篇记忆、后台任务、工程可靠性、上线安全与运营能力。  
> 建议主定位：优先服务 **长篇网文 / 类型小说创作**，因为该场景最依赖叙事圣经、章节大纲、长程记忆、批量章节管理和持续更新的 Story State。

---

## 一、总体判断

当前项目已经具备比较完整的骨架：

- 五步创作向导已形成从灵感到 `BibleDraft` 的闭环。
- 多章节编辑器已经有章节切换、保存、AI 候选稿、Critic、Beat Sheet、版本历史、导出中心。
- 数据层已经有 `Novel`、`BibleDraft`、`ChapterDraft`、`MemoryChunk`、分层摘要、LLM 用量、审核审计和后台任务。
- AI 写作路由已经接入 RAG、SSE、内容审核、额度检查、可续传 draft session。
- 工程层已有 Vitest、Playwright、CI、Prisma migration、Prometheus/Sentry 相关能力。

接下来最重要的不是继续堆零散功能，而是按顺序解决这几个问题：

1. 核心写作链路是否稳定、清晰、可反复使用。
2. AI 生成质量是否可评估、可迭代、可解释。
3. 长篇记忆是否可靠，用户是否知道 AI 记住了什么。
4. 后台任务是否真正适合生产环境。
5. 产品是否围绕作者日常创作，而不是围绕系统能力展示。
6. 上线后数据、安全、成本、监控是否能兜住。

---

## 二、优先级总览

| 优先级 | 阶段 | 主题 | 目标 | 建议周期 |
|---|---|---|---|---|
| P0 | 立即 | 核心链路体检与阻断问题修复 | 确保注册、开书、生成 Bible、写章、AI 起草、保存、导出全链路稳定 | 1 周 |
| P1 | 短期 | AI 质量评估与 Prompt 迭代体系 | 让生成质量可衡量、可回归、可持续优化 | 1-2 周 |
| P2 | 短期 | 编辑器体验强化 | 把编辑器从“能写”打磨到“愿意每天写” | 2-3 周 |
| P3 | 中期 | 长篇记忆与 Story State 可信化 | 让 AI 对长篇上下文更可靠，也让用户看得见 | 2-4 周 |
| P4 | 中期 | 后台任务生产化 | 从 API 内联 drain 升级到稳定 worker/queue | 2-3 周 |
| P5 | 中期 | 产品信息架构与文案收敛 | 降低概念噪音，提高创作效率 | 1-2 周 |
| P6 | 上线前 | 数据、安全、成本、监控 | 具备可上线、可恢复、可观测的产品底座 | 2-4 周 |
| P7 | 长期 | 商业化与多人协作 | 面向真实团队和付费场景扩展 | 4 周以上 |

---

## 三、P0：核心链路体检与阻断问题修复

### 目标

确认一个真实用户可以完成以下路径，并且每一步都有清楚反馈：

注册/登录 -> 新建作品 -> 生成 Bible -> 确认作品 -> 进入编辑器 -> AI 起草 -> 接受候选稿 -> 保存 -> 查看版本 -> 导出。

### 需要变动的地方

| 类型 | 路径 | 建议改动 |
|---|---|---|
| E2E | `tests/e2e/onboarding.spec.ts` | 扩展为完整开书链路，覆盖 session 创建、logline、questions、Bible SSE、finalize。 |
| E2E | `tests/e2e/beat-to-draft.spec.ts` | 确认 Beat Sheet -> 起草 -> 候选稿 -> 接受 -> 保存链路稳定。 |
| E2E | `tests/e2e/editor-candidate.spec.ts` | 强化候选稿四种操作：覆盖、追加、插入、丢弃，并断言正文不会被 AI 自动覆盖。 |
| E2E | `tests/e2e/version-restore.spec.ts` | 覆盖手动保存、AI 保存、恢复版本、恢复后继续保存。 |
| E2E | `tests/e2e/bookshelf-navigation.spec.ts` | 补作品列表、详情页、编辑器、导出中心之间的导航回归。 |
| API | `app/api/onboarding/sessions/[id]/finalize/route.ts` | 检查重复 finalize、刷新页面后 finalize、session 归属校验是否都有明确返回。 |
| API | `app/api/novels/[id]/chapters/draft/route.ts` | 确认所有错误路径都会给 SSE `error` 事件，并且客户端能落到可恢复状态。 |
| UI | `app/(app)/new/_components/Step4Generating.tsx` | 增加 Bible SSE 失败后的“重试/返回修改输入”明确操作。 |
| UI | `app/(app)/new/_components/Step5Review.tsx` | 确认 finalize loading、失败、重复点击都不会创建重复作品。 |
| UI | `app/(app)/editor/[novelId]/CandidatePanel.tsx` | 候选稿生成失败、审核阻断、检索失败时给出可操作反馈。 |
| UI | `app/(app)/editor/[novelId]/JobsBadge.tsx` | 失败任务需要能直达章节管理或一键重试。 |

### 验收标准

- `npm run verify` 通过。
- `npm run test:e2e` 至少覆盖核心链路，并在 CI 里稳定通过。
- 设置 `LLM_MOCK=1` 时，本地无需真实 API key 也能完整走通链路。
- 用户在任意 AI 生成失败时都不会丢正文、不会卡死在 loading。
- 重复点击 finalize、起草、保存按钮不会产生重复作品或覆盖正文。

---

## 四、P1：AI 质量评估与 Prompt 迭代体系

### 目标

目前项目有很多 Agent 和 Prompt，但缺少“生成质量是否变好”的客观反馈。需要建立一套固定评估集，让每次改 prompt、模型、RAG、generation policy 时都能回归。

### 新增评估资产

| 类型 | 建议路径 | 内容 |
|---|---|---|
| Fixture | `scripts/fixtures/eval-novels/` | 固定 5-10 部测试小说设定，覆盖玄幻、都市、科幻、悬疑、剧本等。 |
| Fixture | `scripts/fixtures/eval-chapters/` | 每部作品准备 3-5 章前文、目标章节大纲、关键记忆点。 |
| Script | `scripts/eval-ai-quality.ts` | 批量调用 writer/critic/state-diff/retrieval，输出 JSON 和 markdown 报告。 |
| Report | `docs/evals/` | 保存每轮评估报告，记录 prompt/model/RAG 变动前后的结果。 |

### 需要变动的地方

| 模块 | 路径 | 建议改动 |
|---|---|---|
| Writer Prompt | `lib/llm/prompts/chapter.ts` | 增加可测试的 prompt snapshot，避免无意中改变输出结构或上下文顺序。 |
| Bible Prompt | `lib/llm/prompts/bible.ts` | 评估 Bible 结构完整度、角色目标是否冲突、章节大纲是否可写。 |
| Critic Prompt | `lib/llm/prompts/critic.ts` | 验证 Critic 是否能识别人物动机冲突、设定违背、节奏问题，而不是只给泛泛建议。 |
| State Diff Prompt | `lib/llm/prompts/stateDiff.ts` | 验证是否能准确抽取人物位置、目标变化、伏笔状态和新增实体。 |
| Beat Sheet Prompt | `lib/llm/prompts/beatSheet.ts` | 评估节拍是否能服务章节目标，是否避免重复“铺垫-冲突-反转”的模板化。 |
| Generation Policy | `lib/llm/generationPolicy.ts` | 给不同类型小说建立参数对照表，避免所有类型共用同一套温度/惩罚参数。 |
| Mock LLM | `lib/llm/mock.ts` | 让 mock 输出更接近真实事件顺序和边界情况，例如半截 SSE、失败、审核阻断。 |

### 评估维度

| 维度 | 说明 | 建议评分 |
|---|---|---|
| 设定一致性 | 是否违背 Bible 中角色、世界规则、阵营关系 | 1-5 |
| 人物稳定性 | 主角动机、语气、行为逻辑是否一致 | 1-5 |
| 长篇记忆 | 是否正确引用前文事件、伏笔、道具、关系 | 1-5 |
| 章节节奏 | 是否有推进、冲突、转折、收束 | 1-5 |
| 文风稳定 | 是否符合 `NovelProfile` 的类型、语气、节奏 | 1-5 |
| 可编辑性 | 生成稿是否可直接修改使用，而不是只能当灵感 | 1-5 |
| 重复度 | 是否出现套话、重复句式、空泛形容 | 1-5 |
| 安全合规 | 是否触发审核误伤或漏判 | pass/fail |

### 验收标准

- `npm run eval:ai` 或类似脚本可以一键运行评估。
- 每次 prompt 大改后都有评估报告。
- 至少保留最近 5 次评估结果，能比较质量变化。
- Writer、Critic、StateDiff、Retrieval 至少各有一组稳定评估样例。

---

## 五、P2：编辑器体验强化

### 目标

编辑器是产品的核心。下一步要把它从“功能完整”打磨成“作者愿意长时间使用”的工具。

### 重点优化 1：局部 AI 操作

当前 AI 起草更偏整章生成。真实写作更常见的是局部修改。

| 类型 | 路径 | 建议改动 |
|---|---|---|
| UI | `app/(app)/editor/[novelId]/EditorClient.tsx` | 记录 textarea selection range，不只记录光标位置。 |
| Hook | `app/(app)/editor/[novelId]/useChapterEditor.ts` | 新增 `selectedText`、`selectionStart`、`selectionEnd` 状态。 |
| UI | `app/(app)/editor/[novelId]/AIPanel.tsx` | 增加局部操作按钮：润色、扩写、缩写、改对白、增强冲突、续写选中段落。 |
| API | `app/api/novels/[id]/chapters/draft/revise/route.ts` | 扩展为支持 `operation`、`selected_text`、`before_context`、`after_context`。 |
| Prompt | `lib/llm/prompts/chapterRevision.ts` | 明确不同操作的输出要求：只返回改写片段，不返回解释。 |
| UI | `app/(app)/editor/[novelId]/CandidatePanel.tsx` | 支持“替换选中范围”，而不是只支持覆盖/追加/插入。 |

### 重点优化 2：候选稿 diff 与合并

| 类型 | 路径 | 建议改动 |
|---|---|---|
| UI | `components/ui/DiffView.tsx` | 保持通用，但增加长文本性能保护和折叠策略。 |
| UI | `app/(app)/editor/[novelId]/CandidatePanel.tsx` | 默认展示候选稿，可切换“与当前正文对比”。 |
| Hook | `app/(app)/editor/[novelId]/useChapterEditor.ts` | 接受候选稿时统一走 `persistChapter("ai")`，确保版本与乐观锁一致。 |
| E2E | `tests/e2e/editor-candidate.spec.ts` | 补 diff 展示和接受后版本数量断言。 |

### 重点优化 3：写作状态清晰化

| 类型 | 路径 | 建议改动 |
|---|---|---|
| UI | `app/(app)/editor/[novelId]/EditorToolbar.tsx` | 明确显示：本地修改、保存中、已保存、冲突、离线、AI 生成中。 |
| Hook | `app/(app)/editor/[novelId]/useChapterPersistence.ts` | 统一保存状态机，减少多个 hook 分散维护状态。 |
| Hook | `lib/hooks/useOnlineStatus.ts` | 离线后写入 localStorage 草稿，恢复后提示用户手动同步。 |
| UI | `app/(app)/editor/[novelId]/StateDiffPanel.tsx` | 将“设定变更待确认”从警告变成明确待办，不打断写作。 |

### 重点优化 4：长文编辑性能

| 类型 | 路径 | 建议改动 |
|---|---|---|
| Utility | `lib/editor/chapterUtils.ts` | 增加大章节字数、行数、保存频率的性能提示。 |
| UI | `app/(app)/editor/[novelId]/EditorClient.tsx` | 对超过阈值的章节降低实时统计频率，避免每次输入触发重计算。 |
| Hook | `app/(app)/editor/[novelId]/useChapterPersistence.ts` | autosave debounce 根据章节长度动态调整。 |
| Test | `lib/editor/chapterUtils.test.ts` | 加大文本边界测试。 |

### 验收标准

- 选中文本后可以让 AI 局部润色、扩写、缩写，并替换原片段。
- AI 候选稿和正文差异一眼可见。
- 离线/保存冲突/生成失败不会让用户丢稿。
- 5 万字章节编辑时基本不卡顿，保存和统计不会明显拖慢输入。

---

## 六、P3：长篇记忆与 Story State 可信化

### 目标

这个项目最有潜力的差异点是长篇记忆。需要让系统不只是“有 RAG”，而是让作者相信 AI 真的记得前文。

### 重点优化 1：记忆可视化与可编辑

| 类型 | 路径 | 建议改动 |
|---|---|---|
| Page | `app/(app)/novels/[id]/memories/page.tsx` | 新增“记忆库”页面，展示章节摘要、卷摘要、全书摘要、MemoryChunk。 |
| API | `app/api/novels/[id]/memories/preview/route.ts` | 扩展为支持分页、按章节筛选、按类型筛选。 |
| API | `app/api/chapters/[id]/summarize/route.ts` | 返回新旧摘要 diff，用户可以确认摘要是否准确。 |
| UI | `app/(app)/novels/[id]/chapters/ChaptersClient.tsx` | 每章显示摘要/索引的新鲜度和最后刷新时间。 |
| DB | `prisma/schema.prisma` | 可考虑给 `MemoryChunk` 增加 `importance`、`source_kind`、`last_used_at`。 |

### 重点优化 2：RAG 召回评估

| 类型 | 路径 | 建议改动 |
|---|---|---|
| Script | `scripts/eval-retrieval.ts` | 给定章节目标，断言应召回的历史片段是否进入 topK。 |
| Fixture | `scripts/fixtures/retrieval-cases.json` | 写入“第 N 章应召回第 M 章某事件”的样例。 |
| Lib | `lib/agent/retrieval.ts` | 输出 query expansion 明细，便于排查为什么召回失败。 |
| UI | `app/(app)/editor/[novelId]/CandidatePanel.tsx` | 检索块展示“为什么召回这条记忆”，并允许用户标记“不相关”。 |

### 重点优化 3：Story State 生命周期

| 类型 | 路径 | 建议改动 |
|---|---|---|
| Schema | `lib/validation/domain.ts` | 扩展 `StoryStateV1Schema`，区分人物状态、地点、道具、伏笔、关系变化。 |
| Prompt | `lib/llm/prompts/stateDiff.ts` | 让 diff 更结构化，避免只生成泛泛事件。 |
| Merge | `lib/validation/stateDiffMerge.ts` | 增加冲突检测，例如同一人物同时在两个地点。 |
| UI | `app/(app)/editor/[novelId]/StateDiffPanel.tsx` | 展示“接受后会改变哪些设定”，支持逐项接受/拒绝。 |
| Page | `app/(app)/novels/[id]/world/page.tsx` | 将 Story State 中的当前状态和静态世界观区分开。 |

### 验收标准

- 用户可以看到 AI 起草时使用了哪些记忆。
- 用户可以发现并修正错误摘要或不相关记忆。
- RAG 有固定召回测试，不再只靠感觉调参。
- Story State 更新前可审阅、可部分接受、可回滚。

---

## 七、P4：后台任务生产化

### 目标

当前 `BackgroundJob` 已经持久化，但执行方式仍偏 API 内联 drain。生产环境需要真正的 worker，否则摘要、索引、刷新任务在 Serverless 或长任务场景下会不稳定。

### 建议方案

优先选简单可控的方案：

1. 本地和 Docker 环境：Node worker 进程轮询 `BackgroundJob`。
2. Vercel/Serverless 环境：Cron 定期 drain pending jobs。
3. 后续需要高并发时再迁移到 BullMQ、Inngest、Trigger.dev 或云队列。

### 需要变动的地方

| 类型 | 路径 | 建议改动 |
|---|---|---|
| Script | `scripts/jobs-worker.ts` | 新增常驻 worker，循环调用 pending jobs，支持 graceful shutdown。 |
| Lib | `lib/jobs/queue.ts` | 增加 `claimNextJob()`、`runNextJob()`、按类型并发限制、超时控制。 |
| Lib | `lib/jobs/handlers.ts` | 所有 handler 明确输入 schema、超时、幂等策略。 |
| API | `app/api/novels/[id]/jobs/route.ts` | 只负责任务入队，不再强依赖立即 drain。 |
| API | `app/api/novels/[id]/jobs/refresh-dirty/route.ts` | 批量入队后返回 job ids，前端轮询状态。 |
| API | `app/api/novels/[id]/jobs/[jobId]/retry/route.ts` | 重试只改状态，不假设当前请求能跑完任务。 |
| UI | `app/(app)/editor/[novelId]/JobsBadge.tsx` | 通过轮询或 SSE 获取 job 状态，不依赖当前页面触发任务。 |
| Docker | `docker-compose.yml` | 增加 worker service。 |
| Package | `package.json` | 增加 `jobs:worker`、`jobs:drain` 脚本。 |
| Docs | `docs/OBSERVABILITY.md` | 补 job 监控指标、失败告警、重试策略。 |

### 验收标准

- 关闭浏览器后，摘要/索引任务仍能继续执行。
- Worker 崩溃后，stale running job 能重新入队。
- 同一个章节重复入队不会造成重复 MemoryChunk 或脏状态错乱。
- 失败 job 在 UI 可见，并且可以重试。
- 有指标能看到 pending/running/failed/done 数量。

---

## 八、P5：产品信息架构与文案收敛

### 目标

当前产品有较强的“协议感”“引擎感”表达，适合展示，但真实写作场景需要更安静、更直接。应把界面语言从“系统能力展示”转向“作者下一步要做什么”。

### 页面级优化

| 页面 | 路径 | 建议方向 |
|---|---|---|
| Landing | `app/page.tsx` | 如果目标是产品官网，保留品牌表达；如果目标是工具入口，减少夸张文案，突出真实写作场景截图。 |
| Dashboard | `app/(app)/dashboard/page.tsx` | “智能创作协议 / DIRECTIVE”等概念文案改成“下一步建议”。 |
| New Wizard | `app/(app)/new/page.tsx` | 降低“核心/协议/引擎”词频，突出“题材、灵感、问题、设定、大纲”。 |
| Editor | `app/(app)/editor/[novelId]/EditorClient.tsx` | 顶部状态更贴近写作：保存、字数、AI、导出、任务。 |
| Models | `app/(app)/models/page.tsx` | 与创作页面明显区分，使用更管理后台式的文案。 |
| Admin | `app/(app)/admin/*` | 强调审计、权限、用量，不混入创作风格。 |

### 组件级优化

| 组件 | 路径 | 建议改动 |
|---|---|---|
| `PageHeader` | `components/ui/PageHeader.tsx` | 统一页面标题、描述、breadcrumb、actions 的信息密度。 |
| `SectionCard` | `components/ui/SectionCard.tsx` | 避免页面上卡片嵌套卡片，保持工作台密度。 |
| `StatusStates` | `components/ui/StatusStates.tsx` | 全仓统一空、加载、错误、生成中状态。 |
| `StatusTag` | `components/ui/StatusTag.tsx` | 状态文案统一：草稿、已完成、保存中、生成中、失败。 |
| `NoBible` | `components/ui/NoBible.tsx` | 无 Bible 时明确引导用户去完成向导或重新生成。 |

### 验收标准

- 作者无需理解“协议/引擎/核心”等概念，也能完成写作流程。
- Dashboard 第一屏只呈现继续创作所需的信息。
- 管理配置页和创作页的信息风格明显区分。
- 空状态、错误状态、加载状态在主要页面统一。

---

## 九、P6：数据、安全、成本、监控与上线能力

### 目标

如果准备真实上线，必须把用户作品当成核心资产处理。这里不追求花哨功能，优先保证不丢稿、不泄漏、不失控。

### 数据可靠性

| 类型 | 路径 | 建议改动 |
|---|---|---|
| API | `app/api/user/profile/route.ts` | 增加用户数据导出入口的准备字段，后续支持账户级导出。 |
| API | `app/api/novels/[id]/export/route.ts` | 增加完整项目导出格式，包含 Bible、章节、摘要、记忆元数据。 |
| DB | `prisma/schema.prisma` | 评估是否给关键表增加软删除字段，例如 `deleted_at`。 |
| Script | `scripts/backup-check.ts` | 增加备份可用性检查脚本，至少验证连接、表数量、最近写入。 |
| Docs | `docs/HEALTH.md` | 增加上线前数据恢复演练记录。 |

### 安全与权限

| 类型 | 路径 | 建议改动 |
|---|---|---|
| Auth | `middleware.ts` | 复查所有公开路径，避免误放 admin/model/metrics 路由。 |
| Auth | `lib/auth/admin.ts` | 增加管理员行为审计，例如授予/撤销管理员。 |
| API | `app/api/admin/users/*` | 防止误删最后一个管理员，或者至少增加强提醒与审计。 |
| API | `app/api/metrics/route.ts` | 确保生产环境必须 token；未配置 token 时默认拒绝。 |
| Security | `lib/security/csp.ts` | 上线前用真实部署域名验证 CSP，不要仅靠本地。 |
| LLM Config | `app/api/llm-models/*` | API key 更新、删除、默认模型切换都写入审计。 |
| Embedding Config | `app/api/embedding-models/*` | 维度限制和重嵌入提示要更明确。 |

### 成本与额度

| 类型 | 路径 | 建议改动 |
|---|---|---|
| Usage | `lib/llm/usage.ts` | 增加日额度、月额度、单次请求预算、用户级预算。 |
| UI | `app/(app)/activity/page.tsx` | 展示用户自己的 AI 调用、token、费用趋势。 |
| Admin | `app/(app)/admin/ai-calls/page.tsx` | 增加按用户/作品/agent 聚合的成本视图。 |
| API | `app/api/usage/route.ts` | 返回更明确的 quota 状态和下一次重置时间。 |
| Prompt | `lib/llm/prompts/*` | 给长 prompt 增加 token 估算和上下文裁剪策略。 |

### 监控与告警

| 类型 | 路径 | 建议改动 |
|---|---|---|
| Metrics | `lib/metrics/collector.ts` | 增加 AI 成功率、SSE 失败率、job backlog、审核阻断率。 |
| Metrics | `app/api/metrics/route.ts` | 输出新增指标。 |
| Grafana | `lib/observability/grafana/ai-novel-alert-rules.yaml` | 增加 LLM 错误率、job 失败堆积、导出失败、审核服务异常告警。 |
| Sentry | `lib/observability/sentry.ts` | 关键 API 记录 route、userId hash、novelId hash，不记录正文。 |
| Docs | `docs/OBSERVABILITY.md` | 补生产排障手册。 |

### 验收标准

- 任意用户可以导出自己的完整作品数据。
- 管理员关键操作有审计记录。
- 生产环境 metrics/admin/model 配置接口没有裸奔风险。
- AI 成本可以按用户、作品、agent 追踪。
- LLM 错误率、job 堆积、审核异常都有告警。

---

## 十、P7：商业化与多人协作

### 目标

这部分不建议现在立刻做，但应提前避免架构堵死。

### 方向 1：付费与额度

| 模块 | 建议改动 |
|---|---|
| 用户套餐 | 增加 Free/Pro/Studio 额度模型。 |
| 用量限制 | 按月 token、生成次数、作品数、导出次数限制。 |
| 账单 | 先记录内部账单表，再考虑 Stripe/国内支付。 |
| 模型成本 | 不同套餐可用不同默认模型。 |

### 方向 2：多人协作

| 模块 | 建议改动 |
|---|---|
| 数据模型 | 给 `Novel` 增加 collaborator/permission 关系表。 |
| 权限 | 区分 owner/editor/viewer/commenter。 |
| 编辑冲突 | 当前章节乐观锁可以继续沿用，但需要冲突 diff 和合并。 |
| 评论批注 | 在章节正文中支持评论或范围批注。 |
| 审计 | 记录谁修改了 Bible、章节、版本、设定状态。 |

### 方向 3：创作资产化

| 模块 | 建议改动 |
|---|---|
| 角色资产 | 角色卡、口癖、关系、成长线可独立管理。 |
| 世界观资产 | 地点、势力、道具、规则可独立建表。 |
| 伏笔系统 | 伏笔的引入、推进、回收状态可视化。 |
| 时间线 | 按章节/故事时间展示事件。 |

---

## 十一、建议实施顺序

### 第 1 周：P0 核心链路稳定

1. 扩展 E2E 覆盖完整开书到写作链路。
2. 修复 finalize、SSE、候选稿、保存、导出的阻断问题。
3. 确保 `LLM_MOCK=1` 下稳定可演示。
4. 记录第一版真实链路体检报告到 `docs/HEALTH.md`。

### 第 2-3 周：P1 AI 质量评估

1. 建立 `scripts/fixtures/eval-novels/`。
2. 新增 `scripts/eval-ai-quality.ts`。
3. 给 Writer、Critic、StateDiff、Retrieval 各做最少 3 个评估案例。
4. 形成第一份 `docs/evals/YYYY-MM-DD.md`。

### 第 3-5 周：P2 编辑器体验

1. 做选中文本局部改写。
2. 做候选稿 diff/替换选区。
3. 做保存/离线/冲突状态统一。
4. 优化长章节性能。

### 第 5-7 周：P3 长篇记忆可信化

1. 新增记忆库页面。
2. 增加摘要 diff 和用户确认。
3. 增加 retrieval eval。
4. 强化 Story State 逐项接受/拒绝。

### 第 7-9 周：P4 后台任务生产化

1. 新增 worker 脚本。
2. 调整 jobs API 为纯入队。
3. 增加 Docker worker service。
4. 增加 job 指标和告警。

### 第 9-10 周：P5 信息架构和文案

1. 收敛 Dashboard、新建向导、编辑器文案。
2. 统一主要页面状态组件。
3. 降低营销式表达，增强写作任务导向。

### 第 10 周以后：P6/P7 上线与扩展

1. 补数据导出、备份、审计、额度。
2. 补生产监控与告警。
3. 再考虑付费、协作、资产化。

---

## 十二、近期可直接拆 PR 的任务清单

### PR-1：核心链路 E2E 加固

| 项 | 内容 |
|---|---|
| 改动文件 | `tests/e2e/onboarding.spec.ts`、`tests/e2e/editor-candidate.spec.ts`、`tests/e2e/beat-to-draft.spec.ts`、`tests/e2e/version-restore.spec.ts` |
| 目标 | 覆盖开书、起草、接受候选稿、保存、版本恢复、导出 |
| 验收 | `npm run test:e2e` 通过 |

### PR-2：AI 质量评估脚手架

| 项 | 内容 |
|---|---|
| 新增文件 | `scripts/eval-ai-quality.ts`、`scripts/fixtures/eval-novels/*.json`、`docs/evals/README.md` |
| 修改文件 | `package.json` 增加 `eval:ai` |
| 目标 | 固定评估样例，输出质量报告 |
| 验收 | `npm run eval:ai` 能在 `LLM_MOCK=1` 和真实模型下运行 |

### PR-3：局部 AI 改写

| 项 | 内容 |
|---|---|
| 修改文件 | `EditorClient.tsx`、`useChapterEditor.ts`、`AIPanel.tsx`、`CandidatePanel.tsx` |
| 修改 API | `app/api/novels/[id]/chapters/draft/revise/route.ts` |
| 修改 Prompt | `lib/llm/prompts/chapterRevision.ts` |
| 目标 | 支持选中文本润色/扩写/缩写/替换 |
| 验收 | E2E 覆盖选中文本 -> AI 改写 -> 替换选区 |

### PR-4：记忆库页面 v1

| 项 | 内容 |
|---|---|
| 新增页面 | `app/(app)/novels/[id]/memories/page.tsx` |
| 修改 API | `app/api/novels/[id]/memories/preview/route.ts` |
| 修改导航 | `app/(app)/novels/[id]/page.tsx`、`components/layout/Sidebar.tsx` 或项目二级导航 |
| 目标 | 用户能查看章节摘要、卷摘要、全书摘要、MemoryChunk |
| 验收 | 至少支持按章节筛选、空状态、错误状态 |

### PR-5：Jobs Worker

| 项 | 内容 |
|---|---|
| 新增文件 | `scripts/jobs-worker.ts` |
| 修改文件 | `lib/jobs/queue.ts`、`lib/jobs/handlers.ts`、`package.json`、`docker-compose.yml` |
| 目标 | 后台任务不依赖用户请求完成 |
| 验收 | 浏览器关闭后 pending jobs 仍被 worker 消费 |

### PR-6：上线安全与监控补强

| 项 | 内容 |
|---|---|
| 修改文件 | `app/api/metrics/route.ts`、`lib/metrics/collector.ts`、`lib/observability/grafana/ai-novel-alert-rules.yaml`、`docs/OBSERVABILITY.md` |
| 目标 | 增加 job、LLM、SSE、审核相关指标 |
| 验收 | `/api/metrics` 输出新增指标，Grafana rules 可加载 |

---

## 十三、不要优先做的事情

这些事情看起来诱人，但不建议在 P0-P3 前做：

- 复杂富文本编辑器迁移。当前 textarea 足够支撑核心验证，过早迁移会放大编辑器复杂度。
- 多人实时协作。当前单人写作体验还没有完全打磨好。
- 大规模商业化系统。先把 AI 质量、稳定性和成本可见性做好。
- 过多题材同时深挖。先把长篇类型小说做好，再扩严肃文学、剧本、同人。
- 新增更多 Agent。现有 Writer、Critic、StateUpdater、Outline、Retrieval 需要先变可靠。
- 过度美化 Landing。真实产品价值在编辑器和长篇记忆，不在首页动效。

---

## 十四、最终验收图景

当这一轮优化完成后，项目应该达到以下状态：

- 一个新用户可以在 10 分钟内创建作品并开始写第一章。
- 一个老用户每天打开 Dashboard，就知道应该继续写哪一章、哪些任务失败、哪些设定待确认。
- AI 生成前会使用可解释的上下文，生成后以候选稿形式交给用户选择。
- 用户能看见 AI 引用了哪些记忆，并能修正错误记忆。
- 长篇写到几十章后，摘要、索引、Story State 仍然可追踪、可刷新、可回滚。
- 后台任务不依赖浏览器页面存活。
- Prompt 和 RAG 的质量变化有评估报告，不靠主观感觉。
- 用户作品可以导出、备份、恢复，管理员操作和 AI 成本可审计。

如果要用一句话定义成功标准：

> 作者不再把它当“AI 生成器”，而是把它当“长篇小说项目管理和协同写作空间”。
