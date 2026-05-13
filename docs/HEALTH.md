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
- **2026-05-13 (CSP nonce middleware)** — `middleware.ts` 每请求生成 nonce，`lib/security/csp.ts` 注入 request/response `Content-Security-Policy` + `x-nonce`，Supabase middleware 保留 forwarded headers；策略无 `unsafe-inline`，生产无 `unsafe-eval`，同时清理 JSX `style={{...}}` 为 `progress` / class / SVG 属性。新增 `csp.test.ts` 5 tests，Vitest 582 → 587 tests。
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
| `npm run lint` | ✅ 通过（零 warning） | eslint + next/core-web-vitals |
| `npm run test` | ✅ **75 files / 635 tests** 全绿,约 12s | 本轮 +18 promptSafety + chapter injection tests |
| `npm run build` | ✅ 通过 | |
| Playwright E2E | 5 spec（onboarding / editor-failure / editor-candidate × 3）；P0-1 后按钮文案对齐 M1.3 候选稿模式 | helper 内 "Chapter Draft" 改为 `保存草稿` button 探测 |
| Coverage（v8） | ✅ lines/statements 68 · functions 93 · branches 83 阈值入 CI；基线 70.04/94.24/85.50 | summaries / handlers / chapterStatus 100% |
| Prisma migrations | 22 条 | 含 `20260512000000_add_draft_sessions`；部署前需 `prisma migrate deploy` |

**规模**：业务源码 17,500+ LoC（136 ts/tsx）；测试 7,600+ LoC（75 个 .test.ts）；38 个 API route + 21 个 page.tsx；15 个 Prisma model。

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
| 内容审核（关键词 + LLM + failure mode） | 🟡 | 70–78% |
| **长篇记忆 L1/L2 + RAG + state diff + dirty 标脏** | ✅ | **75–82%**（M3.1 完成后从 65–75% 提升） |
| 多 Agent 协作（Writer / Critic / StateUpdater / BeatSheet / Retrieval） | 🟡 | 55–65% |
| CI/CD | 🟡 | 65–75% |
| UI 设计语言 | ✅ | 85–90% |

---

## 三、待办（按优先级）

### P2（剩余 / 待补完）

- [x] **P2-4 / M3.1.1–3** — `ChapterDraft.summary_dirty / index_dirty: Boolean` 字段 + 改稿后只标脏不立即触发 job + 章节管理页"刷新所有 dirty"按钮（**2026-05-11 完成**：含 `POST /api/novels/:id/jobs/refresh-dirty` 新端点 + chapterStatus 优先用 dirty + 编辑器删除两处客户端推 job）
- [x] **M3.2.5** ✅ 候选稿 vs 正文 diff 切换（已实现于 CandidatePanel viewMode + DiffView 调用；P2-3 E2E 已覆盖）
- [ ] **M3.2.6** — `tests/e2e/version-restore.spec.ts`（版本恢复 E2E）
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
- [ ] `tests/e2e/` 增补 `project-shell.spec.ts`、`beat-to-draft.spec.ts`（路线图列出但未提交）

### 体检中新发现

- [x] **rateLimit Redis 适配器** ✅ Upstash REST 落地（2026-05-12），fail-open 异常路径 + 接口转 async + normalizeRouteKey bug 顺手修复
- [x] **`/api/healthz` 合并探针** ✅ DB + pgvector + Supabase 三维（2026-05-12），200/503 + 子系统级 code 分类
- [x] **`useChapterEditor.ts`（298 行，hook + 交互覆盖起步）** ✅ 已压到 300 行以内 — 纯函数、持久化 / 版本 / 候选稿 / state-diff / beat-sheet / actions / selection / core state 均已拆出，并补关键路径轻量 hook 测试与 EditorClient 交互布线测试；后续如需更高信心再切 jsdom + RTL
- [x] **`lib/agent/summaries.ts`** ✅ 100% 覆盖（2026-05-11 深夜）
- [x] **`lib/jobs/handlers.ts`** ✅ 100% 覆盖（2026-05-11 深夜）
- [x] **`lib/agent/chapterStatus.ts`** ✅ 100% 覆盖（2026-05-12）— buildChapterStatus + getChapterStatusesForNovel 都已覆盖；2026-05-13 补 dirty/job 优先级组合快照
- [x] **`ChapterDraft.content` 80,000 char 上限**与目标字数无交互验证 ✅ 95%/上限/超限边界纯函数测试 + 保存前阻断测试已覆盖
- [x] **`expected_version` 缺省兼容路径** ✅ P0-3 已强制必传(2026-05-12,schema 去 `.optional()` + route 简化,helper 注入默认 0,back-compat 用例反转为 schema 拒绝)
- [x] **生产 security headers + CSP** ✅ baseline headers（`X-Content-Type-Options / X-Frame-Options / Referrer-Policy / Permissions-Policy / HSTS`）已加；CSP nonce middleware 已接入（2026-05-13），无 `unsafe-inline`，生产无 `unsafe-eval`。
- [x] **`refresh-dirty` 与单章"重新刷新"路径并存** ✅ route 测试已锁住：refresh-dirty 是 dirty-driven，row-level 是 user-forced 重摆，语义不同
- [x] **dirty 字段未参与 chapterStatus 全部组合的快照测试** ✅ 2026-05-13 已加 inline snapshot 防回归

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

1. **补 `project-shell` 级轻量测试（非 E2E）** — 在本地 PostgreSQL 未就绪前，优先用 Vitest/RSC mock 锁住 novels → detail → editor/export/history 入口与 ownership 分支，避免等 E2E 环境。
2. **M3.2.6 version-restore E2E** — 暂缓到本地 PostgreSQL 就绪后执行；准备好后跑 LLM_MOCK，覆盖编辑→保存→再编辑→恢复→内容回滚，并再考虑 `project-shell` / `beat-to-draft` E2E。

---

## 六、文档地图

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
