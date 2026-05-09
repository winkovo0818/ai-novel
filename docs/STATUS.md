# AI Novel — 项目状态

> 最近更新：2026-05-10
> 本文件是 PROGRESS / AUDIT / TASKS 三份历史状态文档的合并版本，是当前**唯一**的项目状态来源。
> 战略路线见 `docs/ROADMAP_2_4_8_WEEKS.md`，战术任务单见 `docs/IMPLEMENTATION_TASKS.md`。

---

## 一、当前实测验证基线（2026-05-10）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 通过 |
| `npm run lint` (`eslint .`) | ✅ 通过 |
| `npm run test` (Vitest) | ✅ 通过，46 files / 289 tests |
| `npm run build` (Next.js 15) | ✅ 通过 |
| `npm run verify` | ✅ 通过（typecheck + lint + test + build） |
| `tests/e2e/` (Playwright) | 🟡 2 spec 通过，但**未进 CI** |
| coverage（v8） | 🟡 56.94% stmts / 76.08% branches / 81.25% funcs，未做 CI 门禁 |

`.github/workflows/ci.yml` 已恢复 lint/typecheck/test/build 验证。**E2E 与 coverage 未入 CI**。

---

## 二、模块完成度

| 模块 | 状态 | 完成度 | 说明 |
|---|---|---:|---|
| Onboarding 5 步开书 | ✅ | 80-88% | 闭环可用；跳过 / 中断恢复 / 重复 finalize 仍待打磨 |
| 多章节编辑器 MVP | ✅ | 78-85% | 多章节、保存、AI 起草、删除、版本、Critic、State Diff、导出已实现 |
| 账号与 Ownership | ✅ | 70-80% | Supabase Auth + middleware + 应用层 ownership；RLS 已禁用 |
| LLM 基础设施 | ✅ | 78-85% | client / stream / mock / 加密 key / 用量 / 配额覆盖完整 |
| 内容审核 | 🟡 | 70-78% | 关键词 + LLM + `MODERATION_FAILURE_MODE` 策略化；Bible 编辑路径仍缺 |
| 长篇记忆 L1/L2 | 🟡 | 65-75% | Bible / Story State / 章节摘要 / 卷摘要 / 全书摘要 / state diff / 级联刷新已实现；dirty 检测仍粗 |
| RAG / MemoryChunk | 🟡 | 60-70% | pgvector + HNSW + 混合检索已落地；索引失败可观测性、召回评估未生产化 |
| 多 Agent 协作 | 🟡 | 55-65% | Writer / Critic / StateUpdater / Outline(BeatSheet) / Retrieval 都有；Outline UI 未接，自动回炉无 |
| 工程验证 | ✅ | 80-85% | lint/typecheck/test/build 都过 |
| CI/CD | 🟡 | 65-75% | 基础 verify 已接；E2E + coverage 仍未入门禁 |
| 产品化能力 | 🟡 | 45-55% | 缺：候选稿、项目层信息架构、Dashboard、生成历史、版本恢复、导出中心、低噪声 UI |

---

## 三、已完成主要能力

### Onboarding（D-01 ~ D-04）
- `/new` 5 步 Wizard（基础信息 → logline → 反向追问 → Bible SSE → Review）
- `partial-json` 增量解析 + 解析失败 fallback
- 重摆限制 ≤3 次
- Finalize 创建 Novel + BibleDraft（事务化、`session_id` 唯一约束保证幂等）

### 多章节编辑器（D-05 ~ D-15）
- `/editor/[novelId]` 章节切换、自动保存、Ctrl/Cmd+S、章节状态切换
- AI 起草 SSE 流式 + 失败不覆盖原文（E2E 已覆盖）
- 章节删除、版本历史、autosave 与版本解耦（source=autosave/manual/ai/status_change）
- Bible 编辑器（角色 / 世界规则 / 章节大纲）
- Critic 自动审校（critical/major 阻断静默覆盖）
- State Diff 生成 / 确认 / 回写 Bible
- Chapter Context Builder（Bible + 摘要 + state + retrieved memories）
- 分层摘要（VolumeSummary / NovelSummary）+ 改稿后级联刷新
- MemoryChunk + pgvector + HNSW 混合检索

### API（统一 jsonOk / jsonError 响应）
- `GET /api/novels` `/api/novels/:id`
- `POST /api/novels/:id/chapters`、`PATCH/DELETE /api/chapters/:id`
- `POST /api/novels/:id/chapters/draft`（SSE）
- `POST /api/novels/:id/chapters/critic`、`/outline`（Beat Sheet API 已存在但 UI 未接）
- `POST /api/chapters/:id/state-diff`、`/summarize`、`/index`
- `GET /api/chapters/:id/versions`（仅列表，**无 restore**）
- `POST /api/novels/:id/consistency`、`/summaries/refresh`、`/export`、`/jobs`

### 安全 / 成本（S-01 ~ S-07，全部完成）
- `/api/healthz` 公开 + `/api/healthz/llm` admin-only
- AES-256-GCM 加密 LLM api_key + 脱敏返回
- LLM 模型 SSRF 防护（URL/scheme/私网 IP）
- RateLimiter 接口抽象（memory + Redis 占位），扩面 critic/state-diff/healthz_llm
- `MODERATION_FAILURE_MODE`、`QUOTA_FAILURE_MODE` 生产默认 block
- `canAccessOwnerResource` 默认拒绝空 owner，独立 `canClaimAnonymousResource`
- novels/route、summaries/refresh 负向测试覆盖 401/404

### 工程基线（Q-01 ~ Q-10）
- `.dockerignore`、Docker/Compose 生产边界标注
- 统一 `lib/http/json.ts`，14 个 route 接入
- 关键写入 `prisma.$transaction`（章节更新+版本+pruning；finalize 含幂等）
- `BackgroundJob` 表 + `lib/jobs/queue` + `JobsBadge`，编辑器 3 处 fire-and-forget 改走 jobs API

---

## 四、待处理（按优先级）

> 详细任务拆分见 `docs/IMPLEMENTATION_TASKS.md`，每条对应到具体页面/接口/文件。

### P0 — 影响内测可用性

| 编号 | 任务 | 来源 |
|---|---|---|
| P0-1 | AI 起草改候选稿，停止直接覆盖正文 | TASKS P-04 / ROADMAP M1.3 |
| P0-2 | 项目层信息架构（小说详情页 + 角色/世界观/大纲独立页） | TASKS P-07 / ROADMAP M1.1-M1.2 |
| P0-3 | 消灭 `app/(app)/models/page.tsx:110` 残留的 `window.confirm` | TASKS P-05 / ROADMAP M1.4 |

### P1 — 工作台与可靠性

| 编号 | 任务 | 来源 |
|---|---|---|
| P1-1 | E2E 进 CI（onboarding + editor-failure + 新增 candidate / project-shell） | TASKS Q-03 / ROADMAP M2.6 |
| P1-2 | 章节管理页（`/novels/:id/chapters`）+ 摘要/索引状态可见 | ROADMAP M2.1 / M2.5 |
| P1-3 | Beat Sheet 接入主写作流程（`POST /chapters/outline` 已存在） | ROADMAP M2.2 |
| P1-4 | 生成历史页 + `LlmGeneration` 表 | ROADMAP M2.3 |
| P1-5 | Dashboard（`/`）替换当前重定向 | ROADMAP M2.4 |
| P1-6 | 编辑器基础写作工具（目标字数 / 最近保存 / AI 反馈） | TASKS P-03 / ROADMAP M1.5 |
| P1-7 | retrieval 失败显式提示 + jobs retry API | TASKS L-05 / ROADMAP M2.5 / M3.1 |

### P2 — 长篇可靠性 + 版本 + 导出

| 编号 | 任务 | 来源 |
|---|---|---|
| P2-1 | 章节版本恢复 API + UI（当前只有列表无 restore） | ROADMAP M3.2 |
| P2-2 | 版本 / 候选稿 diff 渲染 | ROADMAP M3.2 |
| P2-3 | 导出中心 v1（`/novels/:id/export`，docx/epub） | TASKS P-02 后续 / ROADMAP M3.3 |
| P2-4 | 长篇记忆 dirty 字段 + 改稿不立即触发，改为标脏 | TASKS L-03 续 / ROADMAP M3.1 |
| P2-5 | UI 文案降噪 + 状态四态统一 | TASKS P-08 / ROADMAP M3.4 |
| P2-6 | 多人协作前置（章节乐观锁） | ROADMAP M3.5 |

### 其他遗留小项
- B2 — i18n 已装但 locale 锁死 zh：删除假 i18n 或补完整路由（暂缓）
- UX3 — SSE 中断不可续传（暂缓）
- onboarding/sessions ownership 负向测试补齐
- coverage 入 CI 门禁（当前已生成报告但未强制）

### 暂缓（3 个月内不做）
F-01 多人实时协作 / F-02 分支创作 / F-03 平台直发 / F-04 角色关系图 / F-05 Prompt Cache 多模型 Router / F-06 计费支付

---

## 五、关键文件索引

| 文件 | 用途 |
|---|---|
| `app/(app)/new/**` | Onboarding 5 步 Wizard |
| `app/(app)/editor/[novelId]/EditorClient.tsx` | 编辑器主 UI 编排 |
| `app/(app)/editor/[novelId]/useChapterEditor.ts` | 编辑器状态机、保存、起草、版本、审校 |
| `app/(app)/editor/[novelId]/BibleEditorPanel.tsx` | 角色/世界/大纲编辑（待拆为独立页面） |
| `app/api/novels/[id]/route.ts` | 获取 Novel + Bible + chapters |
| `app/api/novels/[id]/chapters/draft/route.ts` | 章节 SSE 起草 |
| `app/api/novels/[id]/chapters/outline/route.ts` | Beat Sheet 生成（**API 存在，UI 未接**） |
| `app/api/chapters/[id]/route.ts` | 章节更新 + 版本快照 + pruning（事务化） |
| `app/api/chapters/[id]/versions/route.ts` | 版本列表（**无 restore**） |
| `app/api/novels/[id]/jobs/route.ts` | 后台任务入队 + 状态 |
| `lib/agent/chapterContext.ts` | 章节上下文编排 |
| `lib/agent/summaries.ts` | 分层摘要刷新 |
| `lib/agent/retrieval.ts` | RAG 检索（pgvector） |
| `lib/jobs/queue.ts` + `handlers.ts` | 后台任务队列 |
| `lib/llm/client.ts` | DeepSeek 客户端 + 加密 key |
| `lib/llm/usage.ts` + `generationPolicy.ts` | 用量配额 + profile→prompt 映射 |
| `lib/auth/ownership.ts` | 资源归属校验（应用层唯一隔离） |
| `lib/auth/rateLimit.ts` | RateLimiter 接口（memory + Redis 占位） |
| `lib/moderation/moderate.ts` | 内容审核 + `MODERATION_FAILURE_MODE` |
| `prisma/schema.prisma` | 数据模型 |

---

## 六、验证命令

```bash
# 一键验证
npm run verify

# 单独验证
npm run typecheck
npm run lint
npm run test
npm run build

# 数据库
npm run db:smoke
npm run db:deploy

# E2E（需 LLM_MOCK=1）
LLM_MOCK=1 npm run test:e2e

# API smoke
LLM_MOCK=1 npm run start         # 终端 1
LLM_MOCK=1 npm run smoke:onboarding  # 终端 2
```

---

## 七、文档地图

| 文档 | 角色 |
|---|---|
| `README.md` | 项目入口、启动方式 |
| `docs/STATUS.md` | **本文件**：当前状态唯一来源 |
| `docs/ROADMAP_2_4_8_WEEKS.md` | 2/4/8 周战略路线 |
| `docs/IMPLEMENTATION_TASKS.md` | 路线图的页面/接口级任务单 |
| `docs/contracts.md` | API / Schema 契约参考 |
| `design.md` | 设计目标参考（不是实现状态） |
| `docs/archive/**` | 已归档的历史规划/设计稿 |
