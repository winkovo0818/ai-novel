# AI Novel — 项目状态

> 最近更新：2026-05-11 晚 · 阶段 1 + 阶段 2 + 阶段 3 已完成；阶段 3 之后追加 Phase A（DB 权限）+ Phase B（Embedding 配置）+ UI 设计刷新；M3.1 dirty 标脏链路（P2-4）补齐；4 条 backlog（Tab 整合 / 候选稿 diff / 字号切换 / 状态四态审计）已落地；新增基础设施（rateLimit Upstash / healthz subsystem probes / 生产响应头基线）
> 本文件是 PROGRESS / AUDIT / TASKS 三份历史状态文档的合并版本，是当前**唯一**的项目状态来源。
> 战略路线见 `docs/ROADMAP_2_4_8_WEEKS.md`，战术任务单见 `docs/IMPLEMENTATION_TASKS.md`，阶段 3 之后的 phase 决策见 `docs/phases/`，每次任务后的体检报告见 `docs/HEALTH.md`。

---

## 一、当前实测验证基线（2026-05-11 晚，M3.1 dirty 链路完成后）

| 命令                          | 结果                                                                                                          |
|-----------------------------|-------------------------------------------------------------------------------------------------------------|
| `npm run typecheck`         | ✅ 通过                                                                                                        |
| `npm run lint` (`eslint .`) | ✅ 通过                                                                                                        |
| `npm run test` (Vitest)     | ✅ 通过，**61 files / 419 tests**（M3.1 后又净增多个 agent/jobs/onboarding/usage 覆盖批次）                                                  |
| `npm run build`             | ✅ 通过（17 个静态页 + 30 个动态路由；新增 `/novels/[id]/export` 独立页面）                                            |
| `tests/e2e/` (Playwright)   | ✅ 3 spec（onboarding / editor-failure / editor-candidate），**已进 CI**                                          |
| coverage（v8）                | ✅ 已生成报告 + **CI 门禁**（thresholds: lines/statements 66 · functions 92 · branches 82，基线 68.28 / 93.75 / 84.30）                                                                                  |

`.github/workflows/ci.yml` 现有两个 job：`verify`（lint/typecheck/test/build）+ `e2e`（pgvector postgres + LLM_MOCK + playwright + 失败上传 trace）。

> 累计 migration（21 条），关键的近期 5 条：
> - `20260510070000_add_chapter_version` — `ChapterDraft.version`（乐观锁计数器，M3.6）
> - `20260510080000_add_user_roles` — `UserRole(user_id, role)` 复合主键（Phase A）
> - `20260511010000_add_embedding_models` — `EmbeddingModel` 表 + `(provider, model)` 唯一约束（Phase B）
> - `20260511020000_add_chapter_dirty_flags` — `ChapterDraft.summary_dirty / index_dirty` + 双索引 + 历史数据 backfill（M3.1，2026-05-11 晚）
>
> 上线前需要 `npx prisma migrate deploy`。Phase A 还需在 env 里加 `SUPABASE_SERVICE_ROLE_KEY`（`/admin/users` 列用户必需）。

---

## 二、模块完成度

| 模块                    | 状态 |    完成度 | 说明                                                                                     |
|-----------------------|----|-------:|----------------------------------------------------------------------------------------|
| Onboarding 5 步开书      | ✅  | 80-88% | 闭环可用；跳过 / 中断恢复 / 重复 finalize 仍待打磨                                                      |
| 多章节编辑器 MVP            | ✅  | 85-90% | 多章节、保存、AI 起草、删除、版本恢复 + diff、Critic、State Diff、retrieval 可视化、乐观锁、四格式导出已实现             |
| 账号与 Ownership         | ✅  | 70-80% | Supabase Auth + middleware + 应用层 ownership；RLS 已禁用                                     |
| **DB-驱动权限**           | ✅  | 80-85% | **Phase A（2026-05-10）**：`user_roles` 多对多表 + `/admin/users` 页 + grant/revoke API；env allowlist 永久兜底 |
| LLM 基础设施              | ✅  | 78-85% | client / stream / mock / 加密 key / 用量 / 配额覆盖完整                                          |
| **Embedding 基础设施**    | ✅  | 80-85% | **Phase B（2026-05-11）**：`embedding_models` 表 + `/models/embeddings` 页 + DB→env fallback；维度严格 1024 |
| 内容审核                  | 🟡 | 70-78% | 关键词 + LLM + `MODERATION_FAILURE_MODE` 策略化；Bible 编辑路径仍缺                                 |
| 长篇记忆 L1/L2            | 🟡 | 65-75% | Bible / Story State / 章节摘要 / 卷摘要 / 全书摘要 / state diff / 级联刷新已实现；dirty 检测仍粗              |
| RAG / MemoryChunk     | 🟡 | 65-75% | pgvector + HNSW + 混合检索已落地；M3.4 命中片段对用户可见；索引失败可观测性、召回评估未生产化                            |
| 多 Agent 协作            | 🟡 | 55-65% | Writer / Critic / StateUpdater / Outline(BeatSheet) / Retrieval 都有；Outline UI 已接，自动回炉无 |
| 工程验证                  | ✅  | 80-85% | lint/typecheck/test/build 都过                                                           |
| CI/CD                 | 🟡 | 65-75% | 基础 verify 已接；E2E + coverage 仍未入门禁                                                      |
| 产品化能力                 | 🟡 | 70-80% | 候选稿、项目层信息架构、Dashboard、生成历史、版本恢复 + diff、四格式导出、retrieval 命中可视化、UI 降噪 + 设计刷新、乐观锁均已落地；导出仍是菜单非独立中心，dirty 标脏未做 |
| **UI 设计语言**           | ✅  | 85-90% | **2026-05-11 一次性刷新**：tokens（颜色 / 阴影 / 字体节奏）+ 6 大页面层级（auth / onboarding / workspace / 详情 / 编辑器）一致采用；新增 SectionCard / StatCard 原语 |

---

## 三、已完成主要能力

### Onboarding（D-01 ~ D-04）
- `/new` 5 步 Wizard（基础信息 → logline → 反向追问 → Bible SSE → Review）
- `partial-json` 增量解析 + 解析失败 fallback
- 重摆限制 ≤3 次
- Finalize 创建 Novel + BibleDraft（事务化、`session_id` 唯一约束保证幂等）

### 项目层信息架构（M1.1 / M1.2 / M2.1 / M2.3 / M2.4 - 2026-05-10）
- **`/dashboard`（M2.4）**：登录后默认入口，最近编辑 / 待继续章节 / 最近 AI 调用 / 月度用量 / 失败 jobs / "下一步建议" 卡
- `/novels/:id` 详情页：进度 / Bible 状态 / 最近编辑章节 / 5 个入口卡 / 最近章节列表
- `/novels/:id/characters` 角色管理页（左名单 + 右编辑器，含 schema 全字段）
- `/novels/:id/world` 世界观页（背景 / 规则 / 地理 / 势力，与 schema min/max 对齐）
- `/novels/:id/outline` 大纲页（按卷分组、起草状态徽章、深链入编辑器）
- **`/novels/:id/chapters`（M2.1）**：按卷分组的章节管理表，按状态/摘要/索引筛选，行内"重新刷新"按钮
- **`/novels/:id/history`（M2.3）**：最近 100 次 AI 调用，按 agent/status 筛选，详情抽屉展示路由/模型/Token/耗时/费用
- 共享 `useBibleEdit` hook + `SaveBar` 组件
- NovelCard 改指向项目详情页
- Sidebar 加入"工作台"入口

### 多章节编辑器（D-05 ~ D-15 + M1.3 + M1.5 + M2.2 + M2.5）
- `/editor/[novelId]` 章节切换、自动保存、Ctrl/Cmd+S、章节状态切换
- 支持 `?chapter=N` query 直达指定章节
- **AI 起草改候选稿流（M1.3）**：流式不再覆盖正文，候选面板 4 个动作（覆盖 / 追加 / 插入光标 / 放弃），critic 内嵌为警告，覆盖前自动存版本
- **目标字数 + 最近保存时间（M1.5）**：toolbar 显示 `X / Y 字 · NN%`、`保存于 X 分钟前`
- **Beat Sheet 接入主流程（M2.2）**：AIPanel 内可生成节拍 → 编辑节拍 → 基于节拍起草，复用候选稿流
- **JobsBadge 展开面板 + 单 job 重试（M2.5）**：点击徽章查看最近 20 个任务，失败可点重试（POST `/jobs/:jobId/retry`）
- **Retrieval 状态显示（M2.5）**：候选稿面板顶部显示"未召回记忆 / 检索失败"提示
- 章节删除、版本历史、autosave 与版本解耦（source=autosave/manual/ai/status_change）
- Bible 编辑器（角色 / 世界规则 / 章节大纲）— 编辑器侧栏快速查看，主编辑入口已迁至独立页面
- State Diff 生成 / 确认 / 回写 Bible
- Chapter Context Builder（Bible + 摘要 + state + retrieved memories）
- 分层摘要（VolumeSummary / NovelSummary）+ 改稿后级联刷新
- MemoryChunk + pgvector + HNSW 混合检索

### UI 一致性（M1.4 - 2026-05-10）
- ConfirmProvider 提到 `(app)/layout.tsx` 全局
- 全仓 `window.confirm` 清零

### 长篇可靠性 + 版本 + 导出（阶段 3，2026-05-10）

> 优先级在阶段开工时重排为：版本恢复 → 导出中心 → retrieval 可视化 → UI 降噪 → 乐观锁。M3.1（dirty 字段）按 ROADMAP 原计划暂缓。

- **章节版本恢复 + diff（M3.2）**：`POST /api/chapters/:id/versions/:versionId/restore` 在事务里先把当前正文存为 manual 版本（同 hash 时跳过）再覆盖 draft，restore 行也参与乐观锁的 version 自增；`VersionsModal` 升级为可操作的历史面板，每行有"与当前对比"打开 `components/ui/DiffView`（按行 diff，超过 8 行未变的段折叠为"省略 N 行"）和"恢复此版本"（带 ConfirmDialog 警告）；恢复后 hook 通过 `applyRestoredChapter` 同步本地状态而不是整页刷新。
- **四格式导出（M3.3）**：`lib/export/formatNovel` 在 markdown / txt 之上扩出 `formatAsDocx`（用 `docx` 包，每个章节是 HEADING_1 + 每行一个 Paragraph 保留硬换行）和 `formatAsEpub`（用 `epub-gen-memory`，每行 `<p>` HTML 转义，作者缺省时填"佚名"）；`formatNovel` 改为 async 返回 `string | ArrayBuffer`；`/api/novels/:id/export` 接受 `format=docx|epub`，`ExportMenu` 由 2 项扩为 4 项；测试覆盖 ZIP 头 `PK` 字节、空章节稳健、disposition 文件名。
- **Retrieval 可视化（M3.4）**：draft SSE 在第一个 `chapter_delta` 之前推送 `event: retrieval` 携带 `{status, error?, memories: [{source, reason, score, text}]}`，每条 text 截断到 200 字 + 省略号；`useChapterEditor` 解析后把命中片段交给 `CandidatePanel`，渲染为可折叠的"已引用 N 条历史记忆"区块（source / 三位小数相似度 / reason / 截断片段）；`retrieval_status` 在 `done` 事件里保留以兼容旧客户端。
- **UI 降噪（M3.5）**：编辑界面减去 26 行装饰性 chrome —— 标题上方的 `Unit XX · Manuscript Draft` chip 行去掉、placeholder 由"在此处镌刻章节标题..."改为"章节标题"、"正在创作" eyebrow 删除、StatusTag 闲时不渲染、pendingStateDiff 收成琥珀小圆点图标、画布底部"云端同步协议已激活"+ 重复字数行整段移除、CandidatePanel 检索块绿色降为中性 secondary；候选稿"sim"前缀去掉只留数字。
- **章节乐观锁（M3.6）**：`ChapterDraft.version Int @default(0)` 计数器，PATCH 与 restore 都自增；`UpdateChapterDraftRequestSchema` 新增 `expected_version`，不匹配时返回 `409 CHAPTER_VERSION_CONFLICT` 并把最新行同时回吐；`useChapterEditor` 维护 `chapterVersion`，autosave / manual / ai / target_words 四条 PATCH 路径全部带 expected_version；命中 409 后存 `conflictChapter`，编辑器在工具栏下方渲染琥珀色冲突横幅（"加载最新" / "暂不处理"），本地正文保留以便复制。候选稿应用前的快照保存改走 `persistChapter("manual")` 避免与紧随的 ai PATCH 自我冲突。

### Phase A — DB-驱动权限（2026-05-10）

> 决策记录：`docs/phases/PHASE-A-PERMISSIONS-CONTEXT.md`

- **`UserRole` 多对多表**：`(user_id, role)` 复合主键 + `granted_by` + `created_at`；`role` 是字符串字段，Phase A 只填 `'admin'`，后续 phase 加 `'embedding_admin'` 等不动 schema。
- **`checkAdmin()` 改为 DB-then-env**：`lib/auth/admin.ts:36-48` 先查 `user_roles`，未命中或 DB 抛错时 fallback 到 `ADMIN_USER_IDS` / `ADMIN_EMAILS` env。env 永久兜底，应对 DB 删空 / 最后一个 admin 误删的死锁场景。
- **`/admin/users` 管理页**：列出 supabase auth.users + 当前 roles + grant/revoke 按钮；403 网关页风格与 `/models` 一致。
- **REST API（admin-only）**：`GET /api/admin/users` 列表（含 roles）、`POST /api/admin/users/:id/roles` 授权、`DELETE /api/admin/users/:id/roles/:role` 收回。Role allowlist 当前只接受 `'admin'`。
- **Service-role Supabase client**：`lib/supabase/admin.ts` 单例，封装 `SUPABASE_SERVICE_ROLE_KEY`；服务器端独占，永不暴露给浏览器。
- **零自我保护护栏**：admin 可以撤回自己 / 删到 0 个 admin（依赖 env fallback 兑底）。无 `role_changes` 审计表（个人项目当前不需要）。

### Phase B — Embedding 配置入 UI（2026-05-11）

> 决策记录：`docs/phases/PHASE-B-EMBEDDINGS-CONTEXT.md`

- **`EmbeddingModel` 表**：与 `LlmModel` 平行字段集 + 新增 `dim Int` 字段（默认 1024）。`(provider, model)` 唯一约束。
- **维度严格 1024**：`lib/validation/embeddingModel.ts` 的 zod schema 拒绝 dim ≠ 1024，提示 "需要单独迁移脚本"。原因：`MemoryChunk.embedding` 是 `vector(1024)`，混维度会让旧 chunk 失效。换其他维度的迁移流程留 backlog。
- **`createEmbeddings` 改为 DB-then-env**：`lib/llm/embeddings.ts` 先查 `is_default=true && is_enabled=true` 的行（解密 api_key 后用），未命中或 DB 抛错时 fallback 到 `EDGEFN_API_KEY` / `EDGEFN_BASE_URL` env。两个 caller（`lib/agent/chunking.ts` 写入、`lib/agent/retrieval.ts` 读取）签名不变。
- **多配置 + 全局唯一 default**：与 LlmModel 相似的 `is_default + is_enabled` 模式，但 `is_default=true` 时 unset 所有其他行（不分 provider），因为 runtime 只挑一个 default。
- **`/models/embeddings` 独立页**：自带"Chat 节点"返回链接。Tab 整合到 `/models` 是 backlog（避免与未提交 UI 改动冲突，决策见 PHASE-B-EMBEDDINGS-CONTEXT §B-D-05）。
- **REST API（admin-only）**：`GET/POST /api/embedding-models`、`PATCH/DELETE /api/embedding-models/:id`。AES-256-GCM 加密 + SSRF 防护 与 LlmModel 共用 helper。
- **沿用 admin role**：不引入 `embedding_admin`（schema 已支持，未来加 guard 时一行）。

### UI 设计刷新（2026-05-11）

- 一次性切换设计 token：indigo 主色提亮（`#4f46e5` → `#6366f1`）、阴影柔化、纸感背景升级、文本灰阶（`text-muted` / `text-dim`）拉开层次。
- `PageHeader` API 调整：`breadcrumb` 由 `ReactNode` 改为 `{label, href?}[]`；移除装饰性下边线条。
- 新增 `SectionCard` / `StatCard` UI 原语（Dashboard 风格布局复用）。
- 6 个页面层级一致采用：auth/landing/profile · onboarding wizard · workspace shell（dashboard / 我的书架 / 模型配置）· novel detail（含 6 个子页）· editor（client + sidebar + toolbar + AIPanel）· shared primitives。

### API（统一 jsonOk / jsonError 响应）

#### 内容创作
- `GET /api/novels` `/api/novels/:id`
- `POST /api/novels/:id/chapters`、`PATCH/DELETE /api/chapters/:id`
- `POST /api/novels/:id/chapters/draft`（SSE）
- `POST /api/novels/:id/chapters/critic`、`/outline`（Beat Sheet）
- `POST /api/chapters/:id/state-diff`、`/summarize`、`/index`
- `GET /api/chapters/:id/versions`、`POST /api/chapters/:id/versions/:versionId/restore`（M3.2）
- `POST /api/novels/:id/consistency`、`/summaries/refresh`、`/export`（md / txt / docx / epub，M3.3）、`/jobs`

#### 配置与权限（admin-only）
- `GET/POST /api/llm-models`、`PATCH/DELETE /api/llm-models/:id`
- `GET/POST /api/embedding-models`、`PATCH/DELETE /api/embedding-models/:id`（**Phase B**）
- `GET /api/admin/users`、`POST /api/admin/users/:id/roles`、`DELETE /api/admin/users/:id/roles/:role`（**Phase A**）
- `GET /api/healthz/llm`

### 安全 / 成本（S-01 ~ S-07，全部完成；Phase A 加固）
- `/api/healthz` 公开 + `/api/healthz/llm` admin-only
- AES-256-GCM 加密 LLM api_key + 脱敏返回；EmbeddingModel 沿用同一加密链路
- LLM / Embedding 模型 SSRF 防护（URL/scheme/私网 IP）共享 `validateLlmBaseUrl`
- RateLimiter 接口抽象（memory + Redis 占位），扩面 critic/state-diff/healthz_llm
- `MODERATION_FAILURE_MODE`、`QUOTA_FAILURE_MODE` 生产默认 block
- `canAccessOwnerResource` 默认拒绝空 owner；anonymous onboarding session 的 claim 流程走 `authorizeOnboardingSession` 直接 update，不再用单独的 helper
- novels/route、summaries/refresh 负向测试覆盖 401/404
- **DB-驱动 admin 权限**：`user_roles` + env 永久 fallback（Phase A）

### 工程基线（Q-01 ~ Q-10）
- `.dockerignore`、Docker/Compose 生产边界标注
- 统一 `lib/http/json.ts`，14 个 route 接入
- 关键写入 `prisma.$transaction`（章节更新+版本+pruning；finalize 含幂等）
- `BackgroundJob` 表 + `lib/jobs/queue` + `JobsBadge`，编辑器 3 处 fire-and-forget 改走 jobs API

---

## 四、待处理（按优先级）

> 详细任务拆分见 `docs/IMPLEMENTATION_TASKS.md`，每条对应到具体页面/接口/文件。

### P0 — 影响内测可用性

| 编号       | 任务                                                          | 状态                           | 来源                             |
|----------|-------------------------------------------------------------|------------------------------|--------------------------------|
| ~~P0-1~~ | ~~AI 起草改候选稿，停止直接覆盖正文~~                                      | ✅ M1.3 完成（2026-05-10）        | TASKS P-04 / ROADMAP M1.3      |
| ~~P0-2~~ | ~~项目层信息架构（小说详情页 + 角色/世界观/大纲独立页）~~                           | ✅ M1.1 + M1.2 完成（2026-05-10） | TASKS P-07 / ROADMAP M1.1-M1.2 |
| ~~P0-3~~ | ~~消灭 `app/(app)/models/page.tsx:110` 残留的 `window.confirm`~~ | ✅ M1.4 完成（2026-05-10）        | TASKS P-05 / ROADMAP M1.4      |

### P1 — 工作台与可靠性

| 编号       | 任务                                                                     | 状态                                       | 来源                        |
|----------|------------------------------------------------------------------------|------------------------------------------|---------------------------|
| ~~P1-1~~ | ~~E2E 进 CI（onboarding + editor-failure + 新增 candidate / project-shell）~~ | ✅ M2.6 完成（2026-05-10）                    | TASKS Q-03 / ROADMAP M2.6 |
| ~~P1-2~~ | ~~章节管理页（`/novels/:id/chapters`）+ 摘要/索引状态可见~~                            | ✅ M2.1 完成（2026-05-10）                    | ROADMAP M2.1 / M2.5       |
| ~~P1-3~~ | ~~Beat Sheet 接入主写作流程（`POST /chapters/outline` 已存在）~~                    | ✅ M2.2 完成（2026-05-10）                    | ROADMAP M2.2              |
| ~~P1-4~~ | ~~生成历史页 + `LlmGeneration` 表~~                                           | ✅ M2.3 完成，复用 `LlmUsage`（无新表）             | ROADMAP M2.3              |
| ~~P1-5~~ | ~~Dashboard（`/`）替换当前重定向~~                                               | ✅ M2.4 完成（2026-05-10，新 `/dashboard`）     | ROADMAP M2.4              |
| ~~P1-6~~ | ~~编辑器基础写作工具（目标字数 / 最近保存 / AI 反馈）~~                                     | ✅ M1.5 完成；AI 反馈 chip 由 M2.3 历史页替代        | TASKS P-03 / ROADMAP M1.5 |
| ~~P1-7~~ | ~~retrieval 失败显式提示 + jobs retry API~~                                   | ✅ M2.5 完成（候选稿面板 + JobsBadge 重试 + 单 job 重试 API） | TASKS L-05 / ROADMAP M2.5 / M3.1 |

### P2 — 长篇可靠性 + 版本 + 导出

| 编号       | 任务                                      | 状态                          | 来源                           |
|----------|-----------------------------------------|-----------------------------|------------------------------|
| ~~P2-1~~ | ~~章节版本恢复 API + UI（当前只有列表无 restore）~~  | ✅ M3.2 完成（2026-05-10）       | ROADMAP M3.2                 |
| ~~P2-2~~ | ~~版本 / 候选稿 diff 渲染~~                   | ✅ M3.2 完成（DiffView 接入历史 modal；候选稿 diff 暂未接） | ROADMAP M3.2                 |
| ~~P2-3~~ | ~~导出中心 v1（`/novels/:id/export`，docx/epub）~~ | 🟡 M3.3 完成 docx/epub 格式扩展，仍是 ExportMenu，独立页面未做 | TASKS P-02 后续 / ROADMAP M3.3 |
| ~~P2-4~~ | ~~长篇记忆 dirty 字段 + 改稿不立即触发，改为标脏~~     | ✅ M3.1 完成（2026-05-11 晚）：`summary_dirty / index_dirty` + PATCH 标脏 + handler 清脏 + `POST /api/novels/:id/jobs/refresh-dirty` + 章节管理页"刷新所有 dirty (N)"按钮 | TASKS L-03 续 / ROADMAP M3.1 |
| ~~P2-5~~ | ~~UI 文案降噪 + 状态四态统一~~                  | ✅ M3.5 完成（编辑界面 26 行装饰性 chrome 移除；状态四态统一组件复用情况未审计） | TASKS P-08 / ROADMAP M3.4    |
| ~~P2-6~~ | ~~多人协作前置（章节乐观锁）~~                    | ✅ M3.6 完成（version 列 + 409 + 加载最新横幅） | ROADMAP M3.5                 |

### P3 — 阶段 3 之后追加（已完成）

| 编号    | 任务                                                | 状态                           | 来源                                |
|-------|---------------------------------------------------|------------------------------|-----------------------------------|
| ~~P3-A~~ | ~~DB-驱动 admin 权限（`user_roles` + `/admin/users`）~~ | ✅ Phase A 完成（2026-05-10）     | `docs/phases/PHASE-A-PERMISSIONS-CONTEXT.md` |
| ~~P3-B~~ | ~~Embedding 配置入 UI + DB→env fallback~~           | ✅ Phase B 完成（2026-05-11）     | `docs/phases/PHASE-B-EMBEDDINGS-CONTEXT.md`  |
| ~~P3-UI~~ | ~~设计语言刷新（tokens + 6 大页面层级）~~                  | ✅ 2026-05-11 完成              | commit `6610943` 起 6 个原子 refactor commit |

### 其他遗留小项
- UX3 — SSE 中断不可续传（暂缓）

### 阶段 3 后续已完成（2026-05-11 末批）
- ✅ **Tab 整合 `/models` ↔ `/models/embeddings`**：commit `98dcdcd` 加 `ModelsTabs` 共享 nav
- ✅ **候选稿 vs 正文 diff**：commit `9cbe39b`，DiffView 接入 `CandidatePanel`
- ✅ **编辑器字号切换（M3.4.4）**：commit `7508714`，small / medium / large 三档
- ✅ **状态四态统一组件审计**：commit `ce9aa9c`，新增 `GeneratingState` + `StatusStates` 跨 6 页面统一
- ✅ **rateLimit Upstash adapter + healthz 子系统探针**：commit `a76af3c`
- ✅ **生产响应头基线**：commit `2ed876b`
- ✅ **onboarding routes 负向 ownership 测试**：questions / loglines / bible 各加 5-6 个测试（401 / 404 / 400 INVALID_INPUT / 429 RATE_LIMITED / 429 QUOTA / REGEN_LIMIT / MODERATION_BLOCKED），原 finalize 测试已有
- ✅ **coverage CI 门禁**：`vitest.config.ts` 加 thresholds（lines/statements 64 · functions 90 · branches 80，留 ~2 pt 缓冲）；CI verify job 由 `npm run test` 改为 `npm run test:coverage`，覆盖率回退会让 build 失败
- ✅ **独立导出中心页 `/novels/[id]/export`**：server component + `ExportCenterClient`；3 张 StatCard（已起草 / 累计字数 / 最近编辑）+ 2×2 格式卡片（markdown / txt / docx / epub），每张卡片含说明 + 用例 + loading 状态 + 成功/错误反馈；novel 详情页 5 卡 NavCard 升至 5 列网格；编辑器 `ExportMenu` 内联入口保留
- ✅ **死代码清理 + i18n 拆除**：删除 `canClaimAnonymousResource`（无 caller 的 ownership helper）；移除 next-intl + messages/ + i18n/（0 处 `useTranslations` 调用，纯死基础设施）；layout 与 next.config.ts 简化
- ✅ **lib/llm/usage.ts 测试满覆盖**：从 46.24% / 50% 拉到 **100% / 100%**；新增 11 个测试覆盖 logUsage / getUserUsage / checkQuota 全部分支；全仓 coverage lines 65.83→68.28、funcs 92.24→93.75、branches 83.40→84.30；阈值升级到 66/66/92/82

### 暂缓（3 个月内不做）
F-01 多人实时协作 / F-02 分支创作 / F-03 平台直发 / F-04 角色关系图 / F-05 Prompt Cache 多模型 Router / F-06 计费支付

---

## 五、关键文件索引

### 内容创作
| 文件                                                | 用途                                |
|---------------------------------------------------|-----------------------------------|
| `app/(app)/new/**`                                | Onboarding 5 步 Wizard             |
| `app/(app)/editor/[novelId]/EditorClient.tsx`     | 编辑器主 UI 编排                        |
| `app/(app)/editor/[novelId]/useChapterEditor.ts`  | 编辑器状态机、保存、起草、版本、审校                |
| `app/(app)/editor/[novelId]/BibleEditorPanel.tsx` | 角色/世界/大纲编辑（待拆为独立页面）               |
| `app/api/novels/[id]/route.ts`                    | 获取 Novel + Bible + chapters       |
| `app/api/novels/[id]/chapters/draft/route.ts`     | 章节 SSE 起草                         |
| `app/api/novels/[id]/chapters/outline/route.ts`   | Beat Sheet 生成                     |
| `app/api/chapters/[id]/route.ts`                  | 章节更新 + 版本快照 + pruning + 乐观锁 409（事务化）   |
| `app/api/chapters/[id]/versions/route.ts`         | 版本列表                                  |
| `app/api/chapters/[id]/versions/[versionId]/restore/route.ts` | 版本恢复（M3.2，事务内先快照当前再覆盖 + 自增 version） |
| `app/api/novels/[id]/jobs/route.ts`               | 后台任务入队 + 状态                       |

### Agent / 记忆
| 文件                                                | 用途                                |
|---------------------------------------------------|-----------------------------------|
| `lib/agent/chapterContext.ts`                     | 章节上下文编排                           |
| `lib/agent/summaries.ts`                          | 分层摘要刷新                            |
| `lib/agent/retrieval.ts`                          | RAG 检索（pgvector）                  |
| `lib/agent/chunking.ts`                           | chunk 切分 + 写入 embedding           |
| `lib/llm/client.ts`                               | DeepSeek 客户端 + 加密 key             |
| `lib/llm/embeddings.ts`                           | **Phase B**：embedding 客户端，DB-first + EDGEFN env fallback |
| `lib/llm/usage.ts` + `generationPolicy.ts`        | 用量配额 + profile→prompt 映射          |

### 权限 / 配置（admin-only）
| 文件                                                | 用途                                |
|---------------------------------------------------|-----------------------------------|
| `lib/auth/admin.ts`                               | **Phase A**：`checkAdmin` DB-then-env，`adminGuardResponse` 通用 gate |
| `lib/auth/ownership.ts`                           | 资源归属校验（应用层唯一隔离）                   |
| `lib/auth/rateLimit.ts`                           | RateLimiter 接口（memory + Redis 占位） |
| `lib/supabase/admin.ts`                           | **Phase A**：service-role client，封装 `SUPABASE_SERVICE_ROLE_KEY` |
| `lib/validation/llmModel.ts`                      | LLM 配置 zod + SSRF guard            |
| `lib/validation/embeddingModel.ts`                | **Phase B**：Embedding zod，dim 严格 1024 |
| `lib/validation/userRole.ts`                      | **Phase A**：role allowlist（当前只 `'admin'`） |
| `app/(app)/admin/users/page.tsx`                  | **Phase A**：用户与权限页                  |
| `app/(app)/models/page.tsx`                       | LLM 模型配置页                          |
| `app/(app)/models/embeddings/page.tsx`            | **Phase B**：Embedding 模型配置页         |
| `app/api/admin/users/**`                          | **Phase A**：list / grant / revoke   |
| `app/api/llm-models/**` + `app/api/embedding-models/**` | 模型配置 REST                       |
| `lib/moderation/moderate.ts`                      | 内容审核 + `MODERATION_FAILURE_MODE`  |

### 共享 UI / 数据
| 文件                                                | 用途                                |
|---------------------------------------------------|-----------------------------------|
| `lib/export/formatNovel.ts`                       | 四格式导出（markdown / txt / docx / epub，M3.3） |
| `components/ui/DiffView.tsx`                      | 行级 diff 渲染（M3.2，VersionsModal 引用）     |
| `components/ui/PageHeader.tsx`                    | 页面标题（UI 刷新后 breadcrumb API 改为对象数组） |
| `components/ui/SectionCard.tsx` / `StatCard.tsx`  | 设计刷新新增的卡片原语                        |
| `lib/jobs/queue.ts` + `handlers.ts`               | 后台任务队列                            |
| `lib/http/json.ts`                                | jsonOk / jsonError 统一响应           |
| `prisma/schema.prisma`                            | 数据模型（含 `LlmModel` / `EmbeddingModel` / `UserRole`） |

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

| 文档                             | 角色                |
|--------------------------------|-------------------|
| `README.md`                    | 项目入口、启动方式         |
| `docs/STATUS.md`               | **本文件**：当前状态唯一来源  |
| `docs/ROADMAP_2_4_8_WEEKS.md`  | 2/4/8 周战略路线（阶段 1-3） |
| `docs/IMPLEMENTATION_TASKS.md` | 路线图的页面/接口级任务单     |
| `docs/contracts.md`            | API / Schema 契约参考 |
| `docs/phases/`                 | 阶段 3 之后的 phase 决策记录（PHASE-A、PHASE-B…） |
| `design.md`                    | 设计目标参考（不是实现状态）    |
| `docs/archive/**`              | 已归档的历史规划/设计稿      |
