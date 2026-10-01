# AI Novel — 项目健康度报告

> **文档角色**：每次执行完任务后更新本文档对应部分。
>
> **与 `STATUS.md` 的分工**：
> - `STATUS.md` 记录"已交付了什么"（事实清单 / 模块完成度 / 路线图勾选）
> - `HEALTH.md`（本文件）记录"当前体检结果"（命令通过情况、测试数、覆盖率、风险点、下一步建议）
>
> **维护规则**：每次完成任务后必须：
> 1. 顶部 `最近更新` 改成今天日期 + 一行变更摘要
> 2. §一 `实测基线` 重跑 `typecheck / lint / test`，填实测数字
> 3. §二 `进度与完整度` 修订对应模块的状态/完成度
> 4. §三 `待办` 勾掉已完成项；新发现的问题补到末尾
> 5. §四 `代码质量` 如有显著变化（覆盖率、零 any 等）刷新结论
> 6. §五 `下一步建议` 按当前情况重排或替换

---

## 最近更新

- **2026-10-02（logic 维度降软信号，P1.2 系统性发现）** — 真实跑批第 5、6 两章被质量门以**完全相同的判定**（总分 82.9% < 85%；logic 3/10 < 硬门 7）连续拦截，而两章 Critic 均无阻断问题、continuity/character/plot/world 全部 10/10、人工阅读因果链完整（白描文风下因果隐含于动作序列）。根因：logic 分项是因果连接词密度等**词汇代理**，与管线自身的文风优化（去 AI 腔、删模板句）直接对冲，对目标文风通过率为 0。处置：沿用 ai_voice（std 23.6）降软信号的先例，`logic` 移入 SOFT_SIGNAL_DIMENSIONS（阈值 7 仅告警），默认硬门集合为空；自定义硬门仍可通过 dimensionFloors 注入。第 5/6 章留作 LLM Judge 标定黄金样本（P2）。同批发现：gate 拦下的章节批准后不回填 state-diff，后续章节上下文缺失本章事实（产品设计缺口，记入问题清单）。

- **2026-10-02（卷规划线索名止链修复，P1.2 首轮发现）** — 真实跑批启动后 `plan_outline` 失败：卷规划器把状态中的「上古剑魂来源」改写为「活过宗门考核并确认剑魂来源」，`planVolume` 的逐字相等校验拒收、重试耗尽致整个 run failed（花费 0.015 元即止）。修复：prompt 显式列出未解决线索名并要求逐字复制；校验改为精确/包含匹配后**改写回规范名**（保证 `overduePayoffs` 精确匹配继续工作），无法对应或期限越界的目标**丢弃并告警**（`volume_plan.target_dropped`），不再止链——与角色名括号注释修复（4758e79）同一模式的防线后移。Vitest 1294 → 1295。

- **2026-10-02（状态变更上限可配置，P1.1）** — 单章 state-diff 条数上限从硬编码 15 改为 run 级 `max_state_changes`（int 5–40，默认 15）：`GenerationPolicySchema` 新字段随 `run.config` 持久化，`generate_chapter` handler 与文件 CLI 透传到 `validateStateDiff(options)`，`eval:serial` 新增 `--max-state-changes`。动机：真实连载验收第 2 章 16 条合法变更被默认上限止链；放宽入口打通验收循环，防「回灌全量状态」的兜底上限仍在（见 `docs/OPTIMIZATION_PLAN_2026-10.md` P1.1）。Vitest 1287 → 1294 tests。

- **2026-10-02（预算调度与真实验收）** — 每日预算、日/月配额到期唤醒、队列资源等待及站内提醒落地。新增明确不限累计预算策略和验收停止章数；真实验收在第二章进入待审，尚未达到百章目标。

- **2026-10-01（长期记忆与卷规划）** — 新增四张独立表及迁移、按需/批量回填、按章节读取与来源版本检查；章节大纲按变更同步。卷计划保存阶段目标、冲突、人物变化、高潮和线索期限，接入规划、起草、审校和修订；到期未回收或历史不可用时暂停待审。新增所有者记忆查询与详情页进度面板，备份检查纳入新表。

- **2026-10-01（持续连载、可靠性修复与实测）** — 原子版本写入及恢复、自动生成与后处理提交前的执行权检查、事务内入队、类型级并发取任务锁、心跳和超时取消；完整响应体超时；审校失效与最终修订质量门修复；短段落与历史检索边界修复。后台持久化分批规划、持续连载、任务链修复和 worker 数据库异常退避；界面接通检查点、规划暂停和预算调整。CLI 使用统一 schema/管线并接通恢复和预算。生产 CSP nonce、详情导航加载边界及节拍起草按钮修复，Docker standalone 和 pgvector 本地环境实测。

### 2026-10-02 验证证据与边界

- Vitest：145 files / 1295 tests；覆盖率 lines/statements 83.01%、functions 94.91%、branches 85.41%，满足现有门禁。覆盖率配置仍排除 API `route.ts`、TSX 和 scripts，不能把该数字解释成全仓覆盖率。
- Playwright 在生产构建下 13 条全绿（12 条产品用例 + 真实登录 setup），覆盖持续连载配置、规划暂停、预算调整、恢复与取消，以及卷目标/期限/校准提示展示、真实登录、新建作品、书架跳转、节拍起草、候选稿丢弃/追加/覆盖/差异预览、错误保护、未保存切章确认、自动保存、快捷键保存、恢复版本及刷新持久化、导出成功/失败。最后一轮显式传入专用的 `E2E_DATABASE_URL` / `E2E_DIRECT_URL`，使用本机 Chrome、单 worker，13 条用例通过并正常退出（约 1.1m），验证测试夹具和服务均使用同一隔离库；没有身份或限流绕过。Embedding 未配置，RAG 检索降级为空；本轮浏览器用例未验证真实向量召回。
- `typecheck`、生产 `build` 通过；lint 0 errors、6 warnings，来自原有 BibleEditorPanel、signup、useModelAdmin、CLI Poller。
- 隔离的本地 PostgreSQL 16 + pgvector 应用全部 33 条 migration。`scripts/reliability-smoke.ts` 使用独立 schema，验证真实并发保存只能成功一次、并行取任务受并发上限约束、长任务不被五分钟规则误回收、旧执行权失效及超时取消后无法提交；结束会删除该 schema。可复现命令：`RELIABILITY_DATABASE_URL=<专用本地测试库连接串> npx tsx scripts/reliability-smoke.ts`。
- Docker 镜像构建成功；容器 `/api/healthz` 返回 DB、pgvector、auth 全部正常；镜像内 worker 所需 `tsx` 可运行。此处未部署到生产。
- `eval:check` 通过，fixture 基线均分 87.5 → 92.5；这是固定样本规则评分，不是本轮真实模型小说生成效果。
- Next.js 锁定到 15.5.27，Auth.js 到 5.0.0-beta.32 / @auth/core 0.41.3，移除未使用且 peer 冲突的 ink-text-input。生产依赖 audit 仍有 5 条（4 high、1 moderate）：Prisma/deepmerge-ts 与 Next 内置 PostCSS 的依赖链；没有 critical。尚未进行 Next/Prisma 大版本迁移。[Next 安全公告](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)，[Auth.js 安全公告](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-8fpg-xm3f-6cx3)。
- 删除 Playwright 配置内的远程数据库凭据，改为必须显式传入 `E2E_DATABASE_URL`，CI 使用真实身份登录。旧凭据仍在 Git 历史中，需要账户持有人轮换；本轮没有更改远程账号或数据库。
- 成本依赖 `LLM_PRICING_JSON` 和 embedding 报价；未配置使用旧估价。调用前检查已经发生的费用，单次调用及异步后处理可能超额。根布局为动态渲染以匹配逐请求 CSP nonce，不能复用静态 HTML 缓存。
- 自动连载接入按章版本化记忆；较早章节改写、旧作品回填前历史及手动编辑器的全局状态仍需人工校准。文件 CLI 的章节、Bible、进度分别原子写入，跨文件没有数据库式事务；进程异常后需核对状态。数据库模式 planning 由独立 worker 恢复；本地文件 CLI 仍需按文件进度核对恢复。

- `scripts/continuous-generation-smoke.ts` 在真实隔离 schema 上验证 7 项：80 章后启动、第二卷规划及入队第 81 章、并发恢复和孤立任务修复只入队一次、真实章节管线将低质量 mock 草稿挂起、人工批准后扩展下一批、耗尽重试显式失败和恢复、并发启动只有一个 run。可复现：`RELIABILITY_DATABASE_URL=<专用本地测试库连接串> npx tsx scripts/continuous-generation-smoke.ts`。使用 mock 模型和未配置 embedding 的检索降级；未验证真实模型长篇品质或多日可用性。
- 持续连载仍需常驻 worker 和稳定模型服务。Bible 大纲仍以一个 JSON 存储，会随连载增长；最近剧情提示有界并不等于所有存储与页面都有界。卷目标、高潮、人物变化及回收期限已保存并参与生成；跨卷重复检测和支线配额尚未实现。资源等待已持久化下次执行时间，并在配额重置后唤醒；站内提醒及 Prometheus/Grafana 告警规则已接入，未配置外部通知目的地。累计预算属于调用前的软停止阈值。
- `scripts/story-memory-smoke.ts` 在独立 schema 上验证并发回填、25 条事件归档与有界读取、历史版本/旧目标召回、正文改动失效、事务回滚、唯一当前版本、并发卷计划保存与复用、旧快照历史边界。新迁移在本地 PostgreSQL 16 + pgvector 全部应用成功，未迁移或回填远程库。可复现：`RELIABILITY_DATABASE_URL=<专用本地测试库连接串> npx tsx scripts/story-memory-smoke.ts`。卷计划使用 mock；浏览器的计划内容展示使用 API 响应夹具，实际保存与复用另由数据库 smoke 验证。 批量回填 CLI 默认预览读取 12 份有效 Bible，未写入；本地 `BACKUP_CHECK_REQUIRE_BACKUP=0` 的连通性检查通过并包含新表，尚未进行真实备份恢复演练。

- Playwright CLI 使用真实登录态额外验证不限累计预算、每日预算保存、模拟到期等待显示及停止自动唤醒、修改预算保持暂停、书架提醒确认。配置与确认结果由专用测试库核对，确认不恢复待审任务；提醒截图在 `output/playwright/generation-alerts.png`。等待状态使用数据库夹具，定时唤醒另由数据库 smoke 验证。
- `scripts/generation-budget-smoke.ts` 在隔离 schema 验证并发每日费用更新、零点重置、迟到费用不重置当日计数、资源等待不计重试、并发唤醒只保留一个后继、人工暂停及提醒确认/消除。持续连载和记忆 smoke 在新迁移下再次通过。
- 真实验收使用数据库默认 `deepseek-v4-flash` 和真实 `BAAI/bge-m3` embedding。第 1 章通过；第 2 章状态模型返回 16 条变更，超过单章 15 条约束，正文保存为草稿，任务 `needs_review`。估价约 0.202034 元，摘要与索引排空；未完成 100 章，不构成长篇质量结论。报告与正文保留于 `artifacts/serial-agent/0c60a65f-91c1-4f33-be70-0e233ce35d19/`；独立本地验收数据库保留，远程库仅只读读取模型配置。导出不含模型密钥。

以下历史条目保留原日期；涉及当前质量门、冷启动、成本和测试基线时，以本节和当前代码为准。


- **2026-05-30 (全自动整本生成 M3 · 质量门 + needs_review + 成本兜底)** — 续上次中断：`lib/jobs/generateChapterHandler.ts` 自链收尾从纯链 `chainNextChapter` 升级为 `finalizeRun`，接入 T12 质量门（末 3 章滑窗 `evaluateChapterGate`，折百阈值 + 维度硬门 `ai_voice≥6` / `logic≥7`，冷启动 <3 章跳过；未达标且 `checkpoint_mode≠none`→`markNeedsReview` 止链，`none` 仅记录续跑）与 T13 成本兜底（`cost_cny_spent>cost_cap_cny`→`pause` 可 resume；输出 `moderateContent` 命中→`markNeedsReview` 且不落违规正文）。`.env.example` 补 `JOB_GENERATE_CHAPTER_*` 与「`JOBS_WORKER_TYPES` 须含 `generate_chapter`」说明。handler 测试 10→14 例、qualityGate 6 例；Vitest 937 → **947 tests / 122 files** 全绿，typecheck + 改动文件 lint 干净。详见 `docs/IMPL_AUTO_NOVEL_GENERATION_M1-M3.md`。
- **2026-05-29 (Sprint Day 2-10 · AI 质量可控可迭代收官)** — 10 天冲刺完成（详见 `docs/SPRINT_AI_QUALITY_2026-05-29.md`）。Day 2-4：critic 检查维度 5→7（加 `logic_chain` / `prose_quality`），chapter prompt 加悬疑分支，`generationPolicy` 暴露 topP/penalty 并对悬疑子题材 bump，真实 LLM 验证 urban-suspense 修订后 91.4/100。Day 5：玄幻 12 章长篇基线 67/70，`scripts/eval-novel-quality.ts` 加滑动窗口轨迹 + `analyzeDecay`（排除冷启动 partial 窗口、区分回撤回升 vs 真衰减），确认无明显衰减，归档 `docs/evals/long-form-baseline-2026-05-29.md`。Day 6-7：`MemoryFeedback` 真接入 `lib/agent/retrieval.ts`（feedbackFactor 乘数 + irrelevant≥2 过滤 + `RETRIEVAL_USE_FEEDBACK` flag），retrieval 单测 +3、eval-retrieval feedback 对照 case，实测 recall@3 0.5→1.0。Day 8-9：新增 `scripts/eval-critic-revise.ts`，critic 提示拆「主观克制 / 客观必报」两套尺度 + revise 针对性机制，critic recall 33%→100%、revise 命中 100%，归档 `docs/evals/critic-revise-hit-rate.md`。Day 10：`lib/llm/writerOutputCleanup.ts` 规则集化 + `cleanupWriterOutputWithReport`，`lib/evals/novelQuality.ts` 清洗前 AI 签名命中 ≥5 扣分，matrix / long-form 报告加「清洗前 AI 签名命中」表（仅真实生成有数据，fixture_fallback baseline 不变）。Vitest 888 → **907 tests / 115 files**；lint 0 error；`npm run verify` 通过；`eval:check` 87.5→87.5。
- **2026-05-29 (Sprint Day 1 · eval baseline 入 CI verify)** — 新增 `lib/evals/novelQualityBaseline.ts` + 8 单元测试；`scripts/eval-novel-quality-matrix.ts` 加 `--baseline` / `--tolerance`；冻结 `docs/evals/baselines/novel-quality-matrix-fixture-fallback-2026-05-29.json` 作 baseline（fixture_fallback，4 cases，avg 87.5/100）；`package.json` 加 `eval:check` 并入 `verify` 链路；`.github/workflows/ci.yml` verify job 新增 Eval quality baseline check step；顺手修 `lib/jobs/handlers.test.ts` mock 失效（`chatCompletion` → `chatCompletionWithRetry` + retry 参数断言）；顺手补 STATUS.md / HEALTH.md 数字漂移。Vitest 117 files / 888 tests 全绿；docs:check 13/13 通过。
- **2026-05-28 (P6-12 备份检查与恢复演练模板)** — 新增 `npm run backup:check` / `scripts/backup-check.ts`，上线前可验证数据库连接、关键表数量、最近写入和备份成功时间；`.env.example` 增加 `BACKUP_LAST_SUCCESS_AT` 与检查阈值说明；本文档新增数据备份与恢复演练模板。新增 4 条 backup-check 单测，定向 lint/typecheck 通过；本地未应用最新 migration 时会按预期拦截关键表缺失。
- **2026-05-15 (本地 smoke 通过)** — `scripts/onboarding-api-smoke.ts` 跟随当前章节乐观锁契约更新：章节 PATCH 带 `expected_version`，负向章节创建用 `chapter_index=0` 断言 `INVALID_INPUT`。本地 `npm run smoke:onboarding` 已通过，覆盖 onboarding session、logline、questions、Bible SSE、finalize、章节创建、章节起草 SSE、章节 PATCH 持久化、novel 回读、第二章起草和非法章节拒绝。
- **2026-05-14 (内容审核 review queue + TTL)** — 新增 `/admin/moderation` 人工复核队列，`GET/PATCH /api/admin/moderation-audits` 支持按 review 状态筛选与确认/误杀/忽略；`ModerationAudit` 增加 review 状态、复核人、复核时间和备注，`collectMetrics()` 增加 `ai_novel_moderation_review_queue{review_status}`；新增 `GET /api/cron/moderation-audits/cleanup` + `vercel.json` 每日 03:20 UTC 清理超过 90 天 audit 行，`MODERATION_AUDIT_RETENTION_MS` 可调。新增 14 条 review/TTL/metrics 回归测试，Vitest 666 → 680 tests；API route 39 → 42，page.tsx 21 → 22。
- **2026-05-14 (内容审核 audit trail)** — 新增 `ModerationAudit` Prisma model + migration `20260514010000_add_moderation_audit`，`moderateContent()` 在 block / fail-open / review 决策时 best-effort 写入审核元数据（不存原文，只存 sha256 + 字符数）；`collectMetrics()` 增加 `ai_novel_moderation_decisions_total{source,action,outcome,window="24h"}`。新增 1 条 audit 持久化失败不影响审核决策测试，Vitest 665 → 666 tests；Prisma migrations 22 → 23，models 15 → 16。
- **2026-05-14 (内容审核观测闭环)** — `moderateContent()` 在本地关键词拦截、LLM `allowed=false`、审核服务异常后的 allow/block/review 降级路径统一输出 `moderation.decision` 结构化日志，字段包含 `route/source/action/outcome/mode/matched_pattern`，不记录正常安全通过以控制日志量；`docs/OBSERVABILITY.md` 增加 Moderation Decisions 说明。新增 3 条日志字段回归测试，Vitest 662 → 665 tests。
- **2026-05-14 (Playwright 全量稳定化)** — `tests/e2e/editor-candidate.spec.ts` 改用显式保存种子正文，候选稿就绪等待收窄到 heading，接受候选稿后断言稳定 textarea 状态；`playwright.config.ts` 在 `E2E_AUTH_BYPASS=1` 下显式设置 `E2E_DISABLE_RATE_LIMIT=1`，避免全量并发 E2E 共享 `e2e-user` 触发 Bible SSE 5/min 限流。`npx playwright test` 8/8 通过；`lib/auth/rateLimit.test.ts` 补 E2E bypass 限流禁用测试，Vitest 661 → 662 tests。
- **2026-05-14 (beat-to-draft E2E)** — 新增 `tests/e2e/beat-to-draft.spec.ts`，完成 onboarding 后切到第 2 章，mock beat-sheet API 生成 3 条节拍，编辑第一条节拍后点击「基于节拍起草本章」，拦截 draft 请求断言 `beat_sheet.beats` 携带编辑后的节拍，再接受候选稿覆盖正文。`npx playwright test tests/e2e/beat-to-draft.spec.ts` 通过（1 test）。
- **2026-05-14 (M3.2.6 version-restore E2E)** — 新增 `tests/e2e/version-restore.spec.ts`，完成 onboarding 后在编辑器连续两次保存形成历史快照，打开历史版本弹窗恢复到第一版正文，并 reload 验证恢复结果已持久化。`npx playwright test tests/e2e/version-restore.spec.ts` 通过（1 test）。
- **2026-05-14 (project-shell 轻量 RSC 测试)** — 新增 `app/(app)/novels/[id]/project-shell.test.ts`，在 node Vitest 环境下 mock JSX runtime / prisma / auth / next navigation，覆盖 owned novel detail 的 editor/export/history/chapters 入口、foreign novel `notFound`、导出中心空正文 disabled、AI history 查询按 user+novel+agent/status 限定。新增 4 个项目层 shell 测试。Vitest 657 → 661 tests，Files 78 → 79。
- **2026-05-14 (P1-13 Sentry / Grafana alert 接入)** — 新增 `instrumentation.ts` 通过 Next `onRequestError` 捕获服务端未处理请求异常；`lib/observability/sentry.ts` 支持 `SENTRY_DSN` 直发 Sentry envelope（无新增 npm 依赖，未配置时 disabled）；Prometheus collector 新增 `ai_novel_llm_cost_cny_window{window=24h|30d}` 与 `ai_novel_llm_took_ms_p95{route,window=1h}`；`observability/grafana/ai-novel-alert-rules.yaml` 提供 fail rate、draft SSE p95、24h cost、job failure 四条告警。新增 4 个 Sentry 测试。Vitest 653 → 657 tests，Files 77 → 78。
- **2026-05-14 (P1-10 MemoryChunk 索引失败定位)** — `chunkChapterContent` 为每个 chunk 写入 `chunk_index / paragraph_start / paragraph_end` 元数据；`indexChapter` 保留 batch embedding 快路径，batch 失败时才逐 chunk 探测并抛出 `MEMORY_CHUNK_INDEX_FAILED chunk=N/M paragraphs=A-B stage=... preview=...`，且 embedding 失败前不删除旧 chunks；章节管理页读取 `lastJobError` 并在索引失败行显示段落范围、chunk 序号与正文预览。新增 7 个 chunking/index-failure 测试。Vitest 646 → 653 tests，Files 76 → 77。
- **2026-05-14 (P1-9 DraftSession 30 天 TTL cron)** — 新增 `cleanupExpiredDraftSessions()` 按 `updated_at < now - 30d` 删除续传草稿孤儿行，`DRAFT_SESSION_RETENTION_MS` 可调；新增 `GET /api/cron/draft-sessions/cleanup`，要求 `CRON_SECRET` Bearer token，失败只返回固定错误码；`vercel.json` 每日 03:00 UTC 触发。新增 7 个 helper/route 测试。Vitest 639 → 646 tests，Files 75 → 76。
- **2026-05-14 (P1-6 Critic 失败持久化 + 重试)** — `useChapterDrafting` 加 `criticFailure: { message, chapterIndex } | null` 持久态，candidate panel 关闭后失败仍可见；`retryLastCritic()` 重试用当前章节正文调 `/chapters/critic`：成功清空 badge + setMessage `审校通过` / `审校发现 N 条问题（critical/major: M）`；失败更新 badge 消息；丢弃候选稿同步清空。EditorClient 头部加 amber 重试 badge（与 autoStateDiffError 镜像 UX）。新增 4 个 hook 行为测试（持久化+清空 / retry 通过 / retry 有问题 / retry 再次失败），用 URL routing 的 fetch mock 避免 useEffect 重跑消耗顺序 mock。Vitest 635 → 639 tests。
- **2026-05-13 (P1-4 Prompt 注入防护)** — 新增 `lib/llm/promptSafety` 统一封装 `sanitizeForPrompt` / `wrap(text, kind)` / `PROMPT_SAFETY_PREAMBLE`：strip ASCII 控制字符 + 转义 `& < >` 防止用户从 XML 标签内闭合，system 消息加入"标签内是数据不是指令"前导。chapter / critic / consistency / stateDiff / beatSheet / summarize / tieredSummary 7 个 prompt 全部接入；用户 Bible 字段（角色 personality / motivation、world rules、outline、节拍、storyState、章节正文、上一章摘要、retrieval 片段、existing content）一律 wrap。`promptSafety.test.ts` 14 tests + chapter injection 攻击场景 4 tests（断言闭合标签永远只有外层一对、控制字符被剥）。Vitest 617 → 635 tests，Files 74 → 75。
- **2026-05-13 (EditorClient 交互级测试)** — 新增 `EditorClient.test.ts`，在现有 node Vitest 环境下用轻量 JSX/runtime mock 覆盖 Ctrl/Cmd+S 保存、防 drafting 误保存、标题/正文编辑回 idle、AI 面板开关、ExportMenu 导出中心链接 5 条交互布线。Vitest 612 → 617 tests，Files 73 → 74。
- **2026-05-13 (M3.3.7 ExportMenu 收敛)** — 编辑器 `ExportMenu` 从内联四格式下载菜单改为导出中心入口，跳转 `/novels/:id/export`；导出参数能力统一由独立导出中心承载，避免编辑器入口缺少 `range/include_bible`。无新增测试，lint/typecheck 通过。
- **2026-05-13 (`refresh-dirty` vs 单章强制刷新回归锁定)** — `refresh-dirty` route 测试断言只扫描 `summary_dirty/index_dirty` 行；`POST /jobs` route 测试断言用户显式 row-level refresh 不读 dirty flags、不自动追加 `refresh_summaries`。同时补齐 drainer mock，去掉这两组测试里的假 drain failure 日志。Vitest 610 → 612 tests。
- **2026-05-13 (M3.3.2 导出中心参数补齐)** — `parseExportRange` 支持单章、闭区间和逗号组合；`GET /api/novels/:id/export` 接入 `range` 与 `include_bible`，导出前审核覆盖选中正文 + Bible 附录；markdown/txt/docx/epub 都能追加作品 Bible。导出中心新增章节范围输入和 Bible checkbox。新增 12 条导出 helper/route 测试。Vitest 598 → 610 tests。
- **2026-05-13 (ChapterDraft 80,000 字上限交互验证)** — `getChapterContentLimitState` 抽到 `lib/editor/chapterUtils.ts`，EditorClient banner 复用纯函数；`useChapterPersistence` 在 fetch 前阻断超过 80,000 字的保存，避免等 API schema 报错。新增 95% 阈值、正好上限、超限删减字数、保存前阻断 5 条测试。Vitest 593 → 598 tests。
- **2026-05-13 (onboarding finalize ownership 负向测试)** — `app/api/onboarding/sessions/[id]/finalize/route.test.ts` 补 401 未登录与他人 session 404 两条负向用例，并断言不会触发 moderation、novel 查找/创建、session finalize 写入。Vitest 591 → 593 tests。
- **2026-05-13 (chapterStatus dirty 组合快照)** — `lib/agent/chapterStatus.test.ts` 增加 summary/index dirty 位、missing rows、pending/running/failed job 优先级 inline snapshot，锁住章节管理页状态徽章判定矩阵。Vitest 590 → 591 tests。
- **2026-05-13 (P2-9 结构化 logger)** — 新增 `lib/observability/logger.ts`，统一输出 `{ts,level,event,...fields}` JSON 单行日志；`llm.call`、usage quota/persist、moderation fallback/inline block、rate-limit Upstash、draft session best-effort、retrieval、jobs drain 运行时日志全部从裸 `console.*` 收敛为事件字段。新增 `logger.test.ts` 3 tests，Vitest 587 → 590 tests，Files 72 → 73。
- **2026-05-13 (编辑器 selection/core hook 拆分)** — 将章节切换确认/候选稿丢弃/reset 流程抽到 `useChapterSelection.ts`，基础 editor state + `resetEditorState` 抽到 `useChapterCoreState.ts`；`useChapterEditor.ts` 342 → 298 行，`useChapterHooks.test.ts` 补章节切换 3 条测试，Vitest 579 → 582 tests。
- **2026-05-13 (CSP nonce middleware)** — `middleware.ts` 每请求生成 nonce，`lib/security/csp.ts` 注入 request/response `Content-Security-Policy` + `x-nonce`，Auth.js middleware 保留 forwarded headers；策略无 `unsafe-inline`，生产无 `unsafe-eval`，同时清理 JSX `style={{...}}` 为 `progress` / class / SVG 属性。新增 `csp.test.ts` 5 tests，Vitest 582 → 587 tests。
- **2026-05-13 (编辑器 actions hook 拆分)** — 将删除章节与全书一致性检查抽到 `useChapterActions.ts`，`AIPanel` 的 `ConsistencyResult` 类型改从 actions hook 导入；`useChapterEditor.ts` 393 → 342 行，`useChapterHooks.test.ts` 补删除确认/取消、一致性成功/失败 4 条测试，Vitest 575 → 579 tests。
- **2026-05-13 (编辑器 hook 行为测试扩展)** — `useChapterHooks.test.ts` 用轻量 hook runtime 覆盖 `useChapterPersistence` 保存同步 / 409 冲突、`useChapterVersions` 历史加载 / 恢复回填 / 保留本地冲突稿、`useChapterDrafting` SSE 起草 / 候选稿追加接受 / 丢弃续传 session、`useChapterStateDiff` 手动/待处理 diff、`useChapterBeatSheet` 生成/第 1 章拒绝；Vitest 70 → 71 files，563 → 575 tests。
- **2026-05-13 (useChapterEditor 子 hook 拆分)** — 将章节保存 / autosave / 目标字数 PATCH 抽到 `useChapterPersistence.ts`，历史版本加载、恢复回填、409 冲突加载/保留抽到 `useChapterVersions.ts`，候选稿生成/接受/续传草稿抽到 `useChapterDrafting.ts`，状态分析抽到 `useChapterStateDiff.ts`，章节拍抽到 `useChapterBeatSheet.ts`；`useChapterEditor.ts` 895 → 393 行，编辑器主 hook 只保留章节选择、删除、consistency 编排。
- **2026-05-12 (useChapterEditor 提纯续批 2)** — 继续把目标字数 PATCH、章节起草 POST、draft SSE 事件累积/错误/retrieval/done 解析、恢复候选稿提示抽到 `lib/editor/chapterUtils.ts`；`useChapterEditor.ts` 911 → 883 行，`chapterUtils.test.ts` 29 → 40 tests，全仓 Tests 543 → 554。
- **2026-05-12 (useChapterEditor 提纯续批)** — 把保存请求构造、恢复草稿 payload 归一化、State Diff 是否有变化、restore 列表 patch、候选稿成功提示等纯逻辑抽到 `lib/editor/chapterUtils.ts`；`useChapterEditor.ts` 934 → 911 行，`chapterUtils.test.ts` 18 → 29 tests，全仓 Tests 532 → 543。
- **2026-05-12 (P1/P2 S batch)** — P1-8 `/api/metrics` 加 IP 限流(`x-forwarded-for` → `x-real-ip` fallback,token 校验前先 gate,brute-force 探测也能被限流);P1-11 章节正文 80K 字上限提取为 `CHAPTER_CONTENT_MAX_CHARS`,EditorClient 在 ≥95% / 达上限时显示 amber/red banner(`role=status`+`aria-live=polite`);P1-12 删除 dashboard 上 hardcoded "100% Online" 24 段绿条(无数据源,纯装饰,误导用户),留位置等真实 uptime 后端;P2-3 加 candidate panel diff 切换 E2E spec(M3.2.5 实现已久但无 E2E 兜底)。Tests 529 → 532。
- **2026-05-12 (P0-8 完成,P0 全清)** — P0-8 段落级输出审核:`StreamSegmenter`(`\n。!?！?` 边界 + 200 字硬截) → `StreamModerationGuard`(16 字滑动尾窗,复用 `matchBlockedKeywords`) → `ModerationBlockError` 在 onDelta 内同步 throw + `AbortController.abort()` 真正掐掉 DeepSeek HTTP(不再为命中后还在 yield 的 token 付费)。`ChatCompletionOptions/ChatStreamOptions` 新增 `signal?: AbortSignal`,内部 controller 通过 `forwardAbort` helper 串联外部。draft route catch 分支识别 `ModerationBlockError` → `MODERATION_BLOCKED_INLINE`(区别于全文审核的 `MODERATION_BLOCKED`),全文 LLM 审核保留作兜底。观测走 structured `console.warn` 一行(Vercel/CloudWatch 聚合,不污染 scrape-time DB 架构)。Tests 499 → 529(+5 matchBlockedKeywords + 13 StreamSegmenter + 7 StreamModerationGuard + 2 signal + 3 集成),Files 68 → 70。
- **2026-05-12 (P0 batch 续 3)** — P0-6 `sweepStaleRunningJobs(novelId?)`:`updateMany where status:running AND started_at < TTL` 复位 pending(`attempts` 不增,因为是基础设施失活不是 handler 失败),`runPendingJobsForNovel` 开头先 sweep 后 drain,卡 running 的 job 重新进入排空流。`JOB_STALE_RUNNING_MS` env 可调。Tests 495 → 499。
- **2026-05-12 (P0 batch 续 2)** — P0-5 `getResumableDraftSession` 读路径加 5min TTL 懒扫:`streaming` 且 `updated_at` 超龄的行被即时翻转为 `failed` + `STALE_STREAMING_TIMEOUT`,best-effort 写回 DB 失败也仍返回 `failed` 视图(下次读重试)。`DRAFT_STALE_STREAMING_MS` env 可调。无 schema 改动(已有 `updated_at @updatedAt` + `@@index([updated_at])`)。Tests 492 → 495。
- **2026-05-12 (P0 batch 续)** — P0-4 Bible PATCH 加 `moderateContent`(序列化整个 Bible 对象,所有子字段同审,堵注入 + 违规);P0-7 章节标 done 后台 state-diff 自动失败不再 `catch {}` 静默,改为在 header 显示红色三角徽章,tooltip 携带章节号与失败原因,点击 dismiss 后走手动 `generateStateDiff()` 重试。Tests 491 → 492。
- **2026-05-12 (P0 batch)** — P0-3 `expected_version` 改强制必传(schema 去 `.optional()` + route 简化 + test helper 默认注入 0,back-compat 用例反转为 schema 拒绝);P0-9 `dismissConflict` 在用户保留本地正文时同步 `chapterVersion = conflictChapter.version`(消除无限 409 循环);P0-10 draft 路由 input moderation 移到 quota check 之前(违规识别优先于配额);P0-11 `/draft/resume` GET + DELETE 加 `isRateLimited` 守护并补 2 个 429 测试用例。Tests 489 → 491,68 files 全绿。
- **2026-05-12** — P0-1 修复 5 个失效 E2E spec（候选稿模式按钮文案对齐 + helper 加固）；P0-2 三方文档对账 + `scripts/docs-check.ts` 入 verify hook 防数字漂移；归档 `docs/PROJECT_REVIEW_REPORT.md`（真实可用产品标准的一次性审阅快照）。
- **2026-05-13** — 生产 security headers baseline（X-Content-Type-Options / X-Frame-Options / Referrer-Policy / Permissions-Policy / HSTS）通过 `next.config.ts` 的 `headers()` 应用到全部路由。CSP 待单独 phase 处理（需要 Next.js 15 nonce middleware 才能避开 inline script 'unsafe-inline'）。
- **2026-05-12 (深夜)** — `StatusStates.GeneratingState` 新增；`VersionsModal` 加载/空状态从裸 div 改为 LoadingState / EmptyState。M3.4.1 PageHeader 全仓审计经检视已统一。
- **2026-05-12 (傍晚)** — M3.4.4 编辑器字号切换落地。
- **2026-05-12 (中段)** — `chapterStatus.getChapterStatusesForNovel` 单测补齐。M3.2.5 候选稿 vs 正文 diff 经检视已实现。
- **2026-05-12** — 基础设施加固：rateLimit Upstash Redis 适配器 + healthz 探针扩展。
- **2026-05-11 (深夜)** — 关键路径测试补全（summaries / handlers 100%）。
- **2026-05-11 (晚)** — M3.1 dirty 字段链路落地。
- **2026-05-11** — 初版健康度报告。

---

## 一、实测基线

| 命令 | 结果 | 备注 |
|---|---|---|
| `npm run typecheck` | ✅ 通过（无输出） | TypeScript strict |
| `npm run lint` | ✅ 0 errors，6 条已有 warning | eslint + next/core-web-vitals |
| `npm run test` | ✅ **145 files / 1295 tests** 全绿,约 3s | 新增并发、取消、审校、恢复及 CLI 回归覆盖 |
| `npm run build` | ✅ 通过 | |
| Playwright E2E | ✅ 13 条全绿，约 1.1m（12 条产品用例 + 登录 setup） | 独立测试 DB、真实登录，每例独立账号；LLM_MOCK=1 |
| `npm run smoke:onboarding` | ✅ 通过 | 2026-05-15 本地生产服务 + `LLM_MOCK=1` |
| `npm run backup:check` | 待生产配置后运行 | 需设置 `BACKUP_LAST_SUCCESS_AT` 或 `BACKUP_CHECK_LAST_SUCCESS_AT` |
| Coverage（v8） | ✅ lines/statements 68 · functions 93 · branches 83 阈值入 CI；当前 lines/statements 82.8 / functions 94.23 / branches 85.18 | summaries / handlers / chapterStatus 100% |
| Prisma migrations | 33 条 | 含 `20260515010000_add_authjs_tables`；部署前需 `prisma migrate deploy` |

**规模**：145 个 .test.ts；63 个 API route + 28 个 page.tsx；33 条 Prisma migration；29 个 Prisma model。

---

## 二、进度与完整度

整体完成度约 **80–85%**（"可演示并稳定内测的 MVP" 已达成）。8 周路线 M1.x / M2.x / M3.x 已交付，并加了 Phase A + Phase B + UI 设计刷新。

| 模块 | 状态 | 完成度 |
|---|---|---|
| Onboarding 5 步开书 | ✅ | 80–88% |
| 多章节编辑器 MVP（候选稿 / 版本 / diff / 乐观锁 / 导出中心 / retrieval 可视化） | ✅ | 86–91% |
| 账号 + 应用层 ownership | ✅ | 70–80% |
| DB-驱动权限（Phase A） | ✅ | 80–85% |
| LLM 基础设施（client / stream / mock / 加密 key / 用量 / 配额） | ✅ | 78–85% |
| Embedding 基础设施（Phase B，1024-dim 严格） | ✅ | 80–85% |
| 内容审核（关键词 + LLM + failure mode + review queue） | 🟡 | 78–85% |
| **长篇记忆 L1/L2 + RAG + state diff + dirty 标脏** | ✅ | **75–82%**（M3.1 完成后从 65–75% 提升） |
| 多 Agent 协作（Writer / Critic / StateUpdater / BeatSheet / Retrieval） | 🟡 | 55–65% |
| CI/CD | 🟡 | 65–75% |
| UI 设计语言 | ✅ | 85–90% |

---

## 三、待办（按优先级）

### P2（剩余 / 待补完）

- [x] **P2-4 / M3.1.1–3** — `ChapterDraft.summary_dirty / index_dirty: Boolean` 字段 + 改稿后只标脏不立即触发 job + 章节管理页"刷新所有 dirty"按钮（**2026-05-11 完成**：含 `POST /api/novels/:id/jobs/refresh-dirty` 新端点 + chapterStatus 优先用 dirty + 编辑器删除两处客户端推 job）
- [x] **M3.2.5** ✅ 候选稿 vs 正文 diff 切换（已实现于 CandidatePanel viewMode + DiffView 调用；P2-3 E2E 已覆盖）
- [x] **M3.2.6** — `tests/e2e/version-restore.spec.ts`（版本恢复 E2E）：编辑→保存→再编辑→恢复→reload 持久化回滚已覆盖
- [x] **M3.3.1 / .6** ✅ 独立 `/novels/:id/export` 页面 + 导出说明已落地；2026-05-13 补 `range` / `include_bible` 控件与说明
- [x] **M3.3.2** ✅ 导出 `range` / `include_bible` 参数已接入 API / helper / 导出中心 UI；覆盖非法参数、range 筛选、Bible 附录测试
- [x] **M3.3.7** ✅ 编辑器 `ExportMenu` 已改为"打开导出中心"链接，内联四按钮移除
- [x] **M3.4.1 / .2** ✅ 经检视：PageHeader 全仓已统一；StatusStates 加 GeneratingState 凑齐四态（2026-05-12 深夜）。in-form / in-banner 错误提示按设计保留行内呈现。
- [x] **M3.4.4** ✅ 编辑器 3 档字号切换（2026-05-12 傍晚，EditorClient header + localStorage 持久化）

### 工程化遗留

- [x] B2 ✅ i18n 已彻底拆除（next-intl 已删，README 技术栈表 P0-2 已同步）；如未来重新做多语言需新建 phase
- [x] **UX3 SSE 续传** ✅ 已实现（migration `20260512000000_add_draft_sessions` + `lib/agent/draftSession.ts` 15 单测 + resume route 10 单测 + 客户端 indigo 横幅）
- [x] onboarding/sessions ownership 负向测试补齐 ✅ `authorizeOnboardingSession` helper + loglines/questions/bible + finalize 401/404 负向路径已覆盖
- [x] **coverage 入 CI 门禁** ✅ vitest 阈值 68/68/93/83 入 verify
- [x] Tab 整合 `/models` 与 `/models/embeddings` ✅ `ModelsTabs` 共享 nav 已落地
- [x] `tests/e2e/` 增补 `beat-to-draft.spec.ts` ✅ 节拍生成→编辑→携带 beat_sheet 起草候选稿已覆盖；`project-shell` 已用非 E2E RSC mock 测试替代

### 体检中新发现

- [x] **rateLimit Redis 适配器** ✅ Upstash REST 落地（2026-05-12），fail-open 异常路径 + 接口转 async + normalizeRouteKey bug 顺手修复
- [x] **`/api/healthz` 合并探针** ✅ DB + pgvector + Auth.js config 三维（2026-05-12/15），200/503 + 子系统级 code 分类
- [x] **`useChapterEditor.ts`（380 行，hook + 交互覆盖起步）** ✅ 已拆分到 380 行以内 — 纯函数、持久化 / 版本 / 候选稿 / state-diff / beat-sheet / actions / selection / core state 均已拆出，并补关键路径轻量 hook 测试与 EditorClient 交互布线测试；后续如需更高信心再切 jsdom + RTL
- [x] **`lib/agent/summaries.ts`** ✅ 100% 覆盖（2026-05-11 深夜）
- [x] **`lib/jobs/handlers.ts`** ✅ 100% 覆盖（2026-05-11 深夜）
- [x] **`lib/agent/chapterStatus.ts`** ✅ 100% 覆盖（2026-05-12）— buildChapterStatus + getChapterStatusesForNovel 都已覆盖；2026-05-13 补 dirty/job 优先级组合快照
- [x] **`ChapterDraft.content` 80,000 char 上限**与目标字数无交互验证 ✅ 95%/上限/超限边界纯函数测试 + 保存前阻断测试已覆盖
- [x] **`expected_version` 缺省兼容路径** ✅ P0-3 已强制必传(2026-05-12,schema 去 `.optional()` + route 简化,helper 注入默认 0,back-compat 用例反转为 schema 拒绝)
- [x] **生产 security headers + CSP** ✅ baseline headers（`X-Content-Type-Options / X-Frame-Options / Referrer-Policy / Permissions-Policy / HSTS`）已加；CSP nonce middleware 已接入（2026-05-13），无 `unsafe-inline`，生产无 `unsafe-eval`。
- [x] **`refresh-dirty` 与单章"重新刷新"路径并存** ✅ route 测试已锁住：refresh-dirty 是 dirty-driven，row-level 是 user-forced 重摆，语义不同
- [x] **dirty 字段未参与 chapterStatus 全部组合的快照测试** ✅ 2026-05-13 已加 inline snapshot 防回归
- [x] **Sentry / Grafana alert 接入** ✅ `SENTRY_DSN` 未设时无副作用，设后通过 Next `onRequestError` 上报 Sentry envelope；Grafana provisioning rules 覆盖 LLM fail rate / draft SSE p95 / 24h cost / job failure；metrics collector 增加成本窗口与 p95 耗时 gauge。
- [x] **project-shell 级轻量测试（非 E2E）** ✅ 作品详情入口、ownership、导出中心和历史页查询归属已用 RSC mock 测试锁住。

### 暂缓（3 个月内不做）

F-01 多人实时协作 / F-02 分支创作 / F-03 平台直发 / F-04 角色关系图 / F-05 Prompt Cache 多模型 Router / F-06 计费支付。

---

## 四、代码质量

### 优点（罕见的工程素养）

- **零类型逃逸**：全仓没有任何 `any` / `@ts-ignore` / `@ts-expect-error` / `eslint-disable`。17K LoC + strict TS 一处不松。
- **零 TODO/FIXME/HACK**：标记彻底清空，反映持续重构而非堆债。
- **统一响应封装**：`lib/http/json.ts` 的 `jsonOk/jsonError` 全仓被 35 个 route 一致使用。
- **错误码体系完整**：`UNAUTHORIZED / FORBIDDEN / NOVEL_NOT_FOUND / CHAPTER_VERSION_CONFLICT / RATE_LIMITED / QUOTA_EXCEEDED / MODERATION_BLOCKED / LLM_TIMEOUT` 等错误码语义清楚。
- **Zod 全链路**：`lib/validation/schemas.ts` 单一来源覆盖 store / API in/out / Bible，配 `.refine` 做业务级约束（如"必须恰有 1 个 protagonist"）。
- **事务化关键写入**：章节 PATCH（更新 + 版本快照 + 50 条 pruning + 版本号自增）、版本恢复、finalize 都在 `prisma.$transaction` 里。
- **乐观锁鉴别冲突**：M3.6 的 `version Int @default(0)` + 409 携带最新 row + 编辑器横幅。
- **AES-256-GCM + 兜底脱敏**：`lib/llm/encryption.ts` 加密 LLM/Embedding API key，`maskApiKey` 始终不泄漏密文。
- **SSRF 防护严谨**：`validateLlmBaseUrl` 拦截 IPv4 私网 / 链路本地 / 0./255./IPv6 ULA，HTTPS 强制（仅开发态允许 localhost HTTP）。
- **failure-mode 显式化**：`MODERATION_FAILURE_MODE` / `QUOTA_FAILURE_MODE` 生产默认 block，开发默认 allow。
- **DB-then-env fallback 模式统一**：admin / LLM / Embedding 三处相同语义（DB 优先 + env 永久兜底兑死锁），各带 500ms 超时不阻塞主链路。
- **SSE 重试谨慎**：`streamChatCompletionWithRetry` 一旦发出第一个 delta 就拒绝重试，避免拼接错位。
- **注释克制有信息**：每个非平凡决策都有 `// PHASE-X §X-D-NN` 引用决策记录；解释 *为什么* 而非 *做什么*。

### 待改进

1. E2E 覆盖仍集中在 onboarding / editor candidate，项目层 `project-shell`、章节拍到起草、版本恢复链路还缺端到端回归。
2. `EditorClient` 已有轻量交互布线测试，但不是浏览器 DOM 级测试；若后续 UI 继续复杂化，再评估引入 jsdom / Testing Library。
3. 内容审核仍处于 70-78%：关键词 + LLM + failure mode 已有，但生产侧召回质量、误杀率与 review 流程还缺观测闭环。
4. CI/CD 已有 verify + e2e job，但本地 PostgreSQL 未就绪时无法复现 DB/E2E 全链路；发布前仍需跑一次 `db:deploy` / smoke / Playwright。

---

## 五、下一步建议（按优先级）

> 完成任意一件后回到本文档勾掉对应 §三 待办、刷新 §一 基线、并在 §最近更新 加一行摘要。

1. **真实长篇验收** — 冻结作品种子、模型与预算，先跑 100 章，检查跨卷衔接、人物状态、重复冲突和伏笔回收，再进行多日故障演练。
2. **日预算与连载告警** — 实现配额重置唤醒、供应商故障退避与待审通知。
3. **生产环境发布 smoke** — 部署后对生产地址跑 `/api/healthz`、登录、onboarding、起草、导出和 cron 鉴权检查，确认 env 与数据库迁移状态一致。
4. **内容审核策略复盘** — review queue 跑一段真实样本后，按 false-positive / confirmed 比例调整关键词与 LLM 审核提示词。

---

## 六、数据备份与恢复演练

### 上线前备份检查

运行：

```bash
npm run db:deploy
npm run backup:check
```

脚本检查项：

- 数据库连接是否可用。
- `User`、`Novel`、`BibleDraft`、`ChapterDraft`、`ChapterVersion`、`MemoryChunk`、`StoryMemoryCheckpoint`、`StoryMemoryRecord`、`NovelOutlineChapter`、`NovelVolumePlan`、`LlmUsage`、`ModerationAudit`、`BackgroundJob`、`DraftSession`、`ExportEvent` 等关键表是否可统计。
- 最近一次应用写入时间，避免误连空库或旧库。
- 最近一次外部备份成功时间。生产环境默认要求设置 `BACKUP_LAST_SUCCESS_AT` 或 `BACKUP_CHECK_LAST_SUCCESS_AT`，超过 `BACKUP_CHECK_MAX_BACKUP_AGE_HOURS` 会失败。
- 如果检查提示 `relation "... " does not exist`，先确认目标数据库已执行 `npm run db:deploy`，再重跑检查。

本地只想检查数据库连通性时，可以临时设置：

```bash
BACKUP_CHECK_REQUIRE_BACKUP=0 npm run backup:check
```

### 恢复演练模板

| 字段 | 记录 |
|---|---|
| 演练日期 | YYYY-MM-DD |
| 演练负责人 |  |
| 源环境 / 备份点 | production / `BACKUP_LAST_SUCCESS_AT=...` |
| 目标环境 | staging / 临时恢复库 |
| 恢复方式 | 托管 Postgres PITR / dump restore / provider snapshot |
| 恢复耗时 |  |
| 恢复后迁移状态 | `npm run db:deploy` 结果 |
| 数据完整性检查 | `BACKUP_CHECK_REQUIRE_BACKUP=0 npm run backup:check` 结果 |
| 关键业务 smoke | 登录、作品列表、编辑器打开、导出、`/api/metrics` |
| 发现问题 |  |
| 后续动作 |  |

恢复后必须确认：

- 目标环境没有连接生产写库，避免误写。
- `prisma migrate deploy` 已执行，迁移版本与应用版本一致。
- 至少抽查 1 个账号、1 部作品、1 个 Bible、1 个章节、1 条版本历史、1 条记忆记录。
- 导出 JSON / ZIP 能下载，且不会包含 embedding 向量。
- `/api/metrics` 有 token 保护，worker 和 cron 的密钥已换成目标环境值。

---

## 七、文档地图

| 文档 | 角色 |
|---|---|
| `README.md` | 项目入口、启动方式 |
| `docs/STATUS.md` | 已交付能力的唯一事实清单 |
| `docs/HEALTH.md` | **本文件**：每次任务后的体检报告 |
| `docs/ROADMAP_2_4_8_WEEKS.md` | 2/4/8 周战略路线（阶段 1-3） |
| `docs/IMPLEMENTATION_TASKS.md` | 路线图的页面/接口级任务单 |
| `docs/contracts.md` | API / Schema 契约参考 |
| `docs/phases/` | 阶段 3 之后的 phase 决策记录（PHASE-A、PHASE-B…） |
| `design.md` | 设计目标参考（不是实现状态） |
| `docs/archive/**` | 已归档的历史规划 |
