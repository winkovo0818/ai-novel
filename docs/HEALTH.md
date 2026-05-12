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
| `npm run test` | ✅ **70 files / 529 tests** 全绿,约 8s | +30 P0-8 测试(segmenter 13 + guard 7 + matchBlockedKeywords 5 + signal forwarding 2 + draft route 集成 3) |
| `npm run build` | ✅ 通过 | |
| Playwright E2E | 5 spec（onboarding / editor-failure / editor-candidate × 3）；P0-1 后按钮文案对齐 M1.3 候选稿模式 | helper 内 "Chapter Draft" 改为 `保存草稿` button 探测 |
| Coverage（v8） | ✅ lines/statements 68 · functions 93 · branches 83 阈值入 CI；基线 70.04/94.24/85.50 | summaries / handlers / chapterStatus 100% |
| Prisma migrations | 22 条 | 含 `20260512000000_add_draft_sessions`；部署前需 `prisma migrate deploy` |

**规模**：业务源码 17,500+ LoC（136 ts/tsx）；测试 7,200+ LoC（68 个 .test.ts）；38 个 API route + 21 个 page.tsx；15 个 Prisma model。

---

## 二、进度与完整度

整体完成度约 **80–85%**（"可演示并稳定内测的 MVP" 已达成）。8 周路线 M1.x / M2.x / M3.x 已交付，并加了 Phase A + Phase B + UI 设计刷新。

| 模块 | 状态 | 完成度 |
|---|---|---|
| Onboarding 5 步开书 | ✅ | 80–88% |
| 多章节编辑器 MVP（候选稿 / 版本 / diff / 乐观锁 / 4 格式导出 / retrieval 可视化） | ✅ | 85–90% |
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
- [ ] **M3.2.5** — 候选稿 vs 正文 diff 切换（DiffView 已就绪可复用）

> 经检视：M3.2.5 已实现于 CandidatePanel.tsx:60(viewMode) + 235-258(切换按钮) + 271(DiffView 调用)，EditorClient.tsx:314 已传 currentContent。文档误判，2026-05-12 勾掉。
- [ ] **M3.2.6** — `tests/e2e/version-restore.spec.ts`（版本恢复 E2E）
- [ ] **M3.3.1 / .6 / .7** — 独立 `/novels/:id/export` 页面 + 审核状态说明 + ExportMenu 改"打开导出中心"链接
- [ ] **M3.3.2** — 导出 `range` / `include_bible` 参数
- [x] **M3.4.1 / .2** ✅ 经检视：PageHeader 全仓已统一；StatusStates 加 GeneratingState 凑齐四态（2026-05-12 深夜）。in-form / in-banner 错误提示按设计保留行内呈现。
- [x] **M3.4.4** ✅ 编辑器 3 档字号切换（2026-05-12 傍晚，EditorClient header + localStorage 持久化）

### 工程化遗留

- [ ] B2 — i18n 已彻底拆除（next-intl 已删，README 技术栈表 P0-2 已同步）；如未来重新做多语言需新建 phase
- [x] **UX3 SSE 续传** ✅ 已实现（migration `20260512000000_add_draft_sessions` + `lib/agent/draftSession.ts` 15 单测 + resume route 10 单测 + 客户端 indigo 横幅）
- [ ] onboarding/sessions ownership 负向测试补齐
- [x] **coverage 入 CI 门禁** ✅ vitest 阈值 68/68/93/83 入 verify
- [ ] Tab 整合 `/models` 与 `/models/embeddings`（Phase B 决策中推迟）
- [ ] `tests/e2e/` 增补 `project-shell.spec.ts`、`beat-to-draft.spec.ts`（路线图列出但未提交）

### 体检中新发现

- [x] **rateLimit Redis 适配器** ✅ Upstash REST 落地（2026-05-12），fail-open 异常路径 + 接口转 async + normalizeRouteKey bug 顺手修复
- [x] **`/api/healthz` 合并探针** ✅ DB + pgvector + Supabase 三维（2026-05-12），200/503 + 子系统级 code 分类
- [ ] **`useChapterEditor.ts`（934 行，0% 覆盖）** 拆分 + 切 jsdom + RTL 行为级测试 — 单独 phase
- [x] **`lib/agent/summaries.ts`** ✅ 100% 覆盖（2026-05-11 深夜）
- [x] **`lib/jobs/handlers.ts`** ✅ 100% 覆盖（2026-05-11 深夜）
- [ ] **`lib/agent/chapterStatus.ts`** ✅ 100% 覆盖（2026-05-12）— buildChapterStatus + getChapterStatusesForNovel 都已覆盖
- [ ] **`ChapterDraft.content` 80,000 char 上限**与目标字数无交互验证 — 补"接近上限"提醒
- [x] **`expected_version` 缺省兼容路径** ✅ P0-3 已强制必传(2026-05-12,schema 去 `.optional()` + route 简化,helper 注入默认 0,back-compat 用例反转为 schema 拒绝)
- [x] **生产 security headers** ✅ baseline（`X-Content-Type-Options / X-Frame-Options / Referrer-Policy / Permissions-Policy / HSTS`）已加（2026-05-13，`next.config.ts:headers()`）。CSP 单独 phase（需 nonce middleware）。
- [ ] **`refresh-dirty` 与单章"重新刷新"路径并存** — 经评估保留双端点：refresh-dirty 是 dirty-driven，row-level 是 user-forced 重摆，语义不同
- [ ] **dirty 字段未参与 chapterStatus 全部组合的快照测试** — 加 vitest snapshot 防回归

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

1. `useChapterEditor.ts` 934 行，单文件最复杂的客户端 hook（覆盖率 0%）— 建议拆 3–4 个子 hook（save / draft / version / conflict）+ 补 RTL 行为级测试
2. `lib/agent/summaries.ts`、`jobs/handlers.ts` 是改稿后台链路核心，0% 单测 → 回归风险偏高
3. i18n 状态尴尬：locale 锁死 zh，messages/en.json 是占位 — 要么补完，要么暂时拆掉
4. rateLimit 内存实现仅适合单实例；Redis 适配器接口已分离，需要落地
5. `/api/healthz` 缺 DB / Supabase / pgvector 合并探针；`/api/healthz/llm` admin-only 监控不能直接用

---

## 五、下一步建议（按优先级）

> 完成任意一件后回到本文档勾掉对应 §三 待办、刷新 §一 基线、并在 §最近更新 加一行摘要。

1. **useChapterEditor 拆分 + RTL 测试** — 当前 934 行 0% 覆盖，是最大盲区；需要切 jsdom 环境 + RTL setup，单独 phase 处理。
2. **M3.2.6 version-restore E2E** — 编辑→保存→再编辑→恢复→内容回滚，跑 LLM_MOCK，进 CI。
3. **CSP with nonce middleware** — 当前 baseline headers 已加，但 CSP 没接（Next.js 15 hydration 注入 inline script，需要 nonce 中间件正确放行）。

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
