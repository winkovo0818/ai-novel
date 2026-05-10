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

- **2026-05-12 (中段)** — `chapterStatus.getChapterStatusesForNovel` 单测补齐（5 个：空 novel / 多章节聚合 / chunk count=0 视为 missing / 最新 job 优先 / 忽略无 chapter_id 的 novel-scoped job）。文件覆盖率 43% → 100%。M3.2.5 候选稿 vs 正文 diff 经检视已实现（CandidatePanel viewMode + DiffView 集成 + EditorClient wire-up），文档勾掉。总测试 389 → **394**。
- **2026-05-12** — 基础设施加固：rateLimit Upstash Redis 适配器（HTTP-only 4-command pipeline，fail-open）+ healthz 探针扩展（DB / pgvector / Supabase env / 200 vs 503 + 错误码）。`isRateLimited` 接口转 async + 修 normalizeRouteKey regex bug。新增测试 21 个；总测试 373 → 389。
- **2026-05-11 (深夜)** — 关键路径测试补全。`lib/agent/summaries.ts` 0% → **100%**；`lib/jobs/handlers.ts` 0% → **100%**；总测试 352 → 373，branches 79.21% → 82.18%。
- **2026-05-11 (晚)** — M3.1 dirty 字段链路落地。新增 `ChapterDraft.summary_dirty / index_dirty` + migration backfill；PATCH 在 content 变化时标脏；handlers 完成后清脏；编辑器删除两处客户端推 job；新端点 `POST /api/novels/:id/jobs/refresh-dirty`；章节管理页加"刷新所有 dirty (N)"按钮。
- **2026-05-11** — 初版健康度报告（基于 Phase A + Phase B + UI 设计刷新完成后状态）

---

## 一、实测基线

| 命令 | 结果 | 备注 |
|---|---|---|
| `npm run typecheck` | ✅ 通过（无输出） | TypeScript strict |
| `npm run lint` | ✅ 通过（零 warning） | eslint + next/core-web-vitals |
| `npm run test` | ✅ **58 files / 394 tests** 全绿，7.45s | chapterStatus 聚合补齐后净增 5 tests |
| `npm run build` | ✅ 通过 | 16 静态页 + 29 动态路由 |
| Playwright E2E | 3 spec（onboarding / editor-failure / editor-candidate）已进 CI | |
| Coverage（v8） | 🟡 lines 64% / functions 87.6% / branches 82%（chapterStatus 加测后未重生） | summaries / handlers / chapterStatus 100% |
| Prisma migrations | 21 条 | 部署前需 `prisma migrate deploy` |

**规模**：业务源码 17,500+ LoC（136 ts/tsx）；测试 7,200+ LoC（58 个 .test.ts）；36 个 API route + 19 个 page.tsx。

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
- [ ] **M3.4.1 / .2** — PageHeader / StatusStates 全仓审计 + 替换为统一 4 态
- [ ] **M3.4.4** — 编辑器 3 档字号切换

### 工程化遗留

- [ ] B2 — i18n 已装但 locale 锁死 zh：删除假 i18n 或补完整路由
- [ ] UX3 — SSE 中断不可续传
- [ ] onboarding/sessions ownership 负向测试补齐
- [ ] coverage 入 CI 门禁
- [ ] Tab 整合 `/models` 与 `/models/embeddings`（Phase B 决策中推迟）
- [ ] `tests/e2e/` 增补 `project-shell.spec.ts`、`beat-to-draft.spec.ts`（路线图列出但未提交）

### 体检中新发现

- [x] **rateLimit Redis 适配器** ✅ Upstash REST 落地（2026-05-12），fail-open 异常路径 + 接口转 async + normalizeRouteKey bug 顺手修复
- [x] **`/api/healthz` 合并探针** ✅ DB + pgvector + Supabase 三维（2026-05-12），200/503 + 子系统级 code 分类
- [ ] **`useChapterEditor.ts`（799 行，0% 覆盖）** 拆分 + 切 jsdom + RTL 行为级测试 — 单独 phase
- [x] **`lib/agent/summaries.ts`** ✅ 100% 覆盖（2026-05-11 深夜）
- [x] **`lib/jobs/handlers.ts`** ✅ 100% 覆盖（2026-05-11 深夜）
- [ ] **`lib/agent/chapterStatus.ts`** ✅ 100% 覆盖（2026-05-12）— buildChapterStatus + getChapterStatusesForNovel 都已覆盖
- [ ] **`ChapterDraft.content` 80,000 char 上限**与目标字数无交互验证 — 补"接近上限"提醒
- [ ] **`expected_version` 缺省兼容路径** 与 M3.6 防覆盖目标存在轻度冲突，可重新评估是否强制
- [ ] **生产 security headers**：`next.config.ts` 无 CSP / images / headers 配置
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

1. `useChapterEditor.ts` 828 行，单文件最复杂的客户端 hook（覆盖率 0%）— 建议拆 3–4 个子 hook（save / draft / version / conflict）+ 补 RTL 行为级测试
2. `lib/agent/summaries.ts`、`jobs/handlers.ts` 是改稿后台链路核心，0% 单测 → 回归风险偏高
3. i18n 状态尴尬：locale 锁死 zh，messages/en.json 是占位 — 要么补完，要么暂时拆掉
4. rateLimit 内存实现仅适合单实例；Redis 适配器接口已分离，需要落地
5. `/api/healthz` 缺 DB / Supabase / pgvector 合并探针；`/api/healthz/llm` admin-only 监控不能直接用

---

## 五、下一步建议（按优先级）

> 完成任意一件后回到本文档勾掉对应 §三 待办、刷新 §一 基线、并在 §最近更新 加一行摘要。

1. **useChapterEditor 拆分 + RTL 测试** — 当前 799 行 0% 覆盖，是最大盲区；需要切 jsdom 环境 + RTL setup，单独 phase 处理。
2. **M3.4.4 编辑器字号切换** — 简单 UI 改动，3 档字号切换，长时间阅读体验改进。
3. **M3.2.6 version-restore E2E** — 编辑→保存→再编辑→恢复→内容回滚，跑 LLM_MOCK，进 CI。

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
