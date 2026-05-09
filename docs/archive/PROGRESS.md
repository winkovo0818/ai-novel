# 项目进度

> 最后更新：2026-05-09  
> 当前口径：以当前工作区代码、文档审阅和实际验证命令为准。  
> 详细任务与风险台账见：`TASKS.md`。

---

## 一、总体判断

| 阶段 | 进度 | 说明 |
| --- | ---: | --- |
| Onboarding MVP | 80-88% | `/new` 5 步开书、Bible SSE、Step5 Review、Finalize 已形成主闭环；跳过/直接开写/中断恢复仍需打磨 |
| 多章节写作 MVP | 78-85% | 多章节编辑、保存、AI 起草、删除、版本历史、Critic、State Diff、Markdown/TXT 导出已实现 |
| 安全上线准备 | 60-70% | Supabase Auth、ownership、admin-only、key 加密、基础限流已接入；Bible 编辑审核、配额覆盖和生产级限流仍需补强 |
| 长篇记忆/Agent | 60-70% | Story State、分层摘要、MemoryChunk/RAG、Beat Sheet、Critic、State Diff 均有实现；可靠性和自动闭环仍不足 |
| 工程可交付性 | 60-70% | `typecheck`、Vitest、`build` 当前通过；CI workflow 已恢复基础验证；`lint` 脚本废弃且超时 |
| 正式产品化 | 45-55% | 已有导出、用量表、配额雏形；候选稿、写作工具、低噪声 UI、后台任务、coverage/E2E CI 未完成 |

核心结论：项目已经具备可演示、可内部试用的 AI 小说写作 MVP。当前 `typecheck`、单测和生产构建均通过，但还不能标记为“全部完成”或“可生产上线”。下一阶段应优先恢复 CI/lint 质量门禁、清理工作区交付状态、补齐成本/审核硬边界，并把长篇记忆闭环做扎实。

---

## 二、已完成项

### Onboarding 主链路

- `/new` 5 步 Wizard UI（Step1 基础信息 → Step2 logline → Step3 反向追问 → Step4 生成 Bible → Step5 审阅）
- Zustand + localStorage 持久化，刷新不丢状态
- AI 推荐 5 条 logline（`POST /api/onboarding/sessions/:id/loglines`）
- AI 生成 3-5 条反向追问（`POST /api/onboarding/sessions/:id/questions`）
- Bible SSE 流式生成（`POST /api/onboarding/sessions/:id/bible`）
- `partial-json` 增量解析，解析失败 fallback 占位 Bible
- Step5 字段级编辑（标题、角色、世界观、大纲、章节拍）
- 重摆限制 ≤3 次
- Finalize 创建 Novel + BibleDraft（`POST /api/onboarding/sessions/:id/finalize`）
- Finalize 支持 fallback 到服务端 BibleDraft

### 多章节编辑器与写作闭环

- `/editor/[novelId]` 多章节写作页
- 左侧 Bible 侧栏（主角、世界规则、第一章节拍、首卷章节列表）
- 首卷章节可点击切换
- 每章独立保存标题、正文、状态（draft/done）
- AI 起草第 N 章（`POST /api/novels/:id/chapters/draft`）
- 第 1 章使用第一章节拍，第 N 章使用章节大纲 + 前文上下文
- 前文章节上下文注入（每章最多 900 字摘要）
- 起草失败不覆盖原文（E2E 已覆盖）
- 自动保存（停止输入 3 秒后）
- `Ctrl/Cmd+S` 快捷保存
- 标记完成 / 恢复草稿
- 未保存切换确认（章节切换和 AI 起草前）
- 浏览器关闭前未保存提醒
- 字数统计、已存/完成/总章节进度统计
- 编辑器组件拆分：EditorSidebar、EditorToolbar、EditorClient
- 章节删除、版本历史、autosave 与版本解耦
- Bible 编辑器
- State Diff 生成、展示、确认、回写 Bible
- AI 起草后自动 Critic，严重冲突阻止静默覆盖
- Chapter Context Builder 接入 story_state、摘要和 retrieved memories
- 分层摘要模型与 MemoryChunk/RAG 雏形

### API 层

- `GET /api/novels/:id` — 获取 Novel + Bible + chapters
- `POST /api/novels/:id/chapters` — 创建/更新章节草稿（越界章节拒绝）
- `PATCH /api/chapters/:id` — 更新章节标题、正文或状态
- `POST /api/novels/:id/chapters/draft` — SSE 流式起草章节正文（越界章节拒绝）
- 所有 Novel/Chapter API 已加用户 ownership 隔离

### 数据模型

- `OnboardingSession` — 向导会话
- `Novel` — 小说项目
- `BibleDraft` — Bible 草稿
- `ChapterDraft` — 章节草稿（novel_id + chapter_index 唯一约束）
- `ChapterVersion` — 章节历史快照
- `ChapterSummary` — 章节摘要
- `VolumeSummary` / `NovelSummary` — 分层摘要
- `MemoryChunk` — 记忆切块与 embedding
- `LlmModel` — 管理员模型配置

### LLM 与 Mock

- DeepSeek-V3 client（OpenAI 兼容协议）
- Token、耗时、成本日志
- Timeout 自动重试一次
- `LLM_MOCK=1` 确定性 mock 模式
- Mock 支持 Bible JSON 和章节正文两种输出

### Supabase 集成

- Prisma + Supabase Session Pooler 连接
- Supabase SSR client helper
- Supabase middleware session refresh
- Onboarding session 记录已登录用户 ID（可选）
- API ownership 隔离（有 user_id 的项目仅 owner 可访问）

### 测试

- Unit/API tests：当前实测 46 files / 289 tests passed
  - `lib/stream/sseEncode.test.ts`
  - `lib/stream/readSse.test.ts`
  - `lib/stream/jsonStreamParser.test.ts`
  - `lib/llm/client.test.ts`
  - `lib/llm/prompts/chapter.test.ts`
  - `lib/validation/schemas.test.ts`
  - `app/api/novels/[id]/route.test.ts`
  - `app/api/novels/[id]/chapters/route.test.ts`
  - `app/api/novels/[id]/chapters/draft/route.test.ts`
  - `app/api/chapters/[id]/route.test.ts`
- Playwright E2E：2 tests
  - `tests/e2e/onboarding.spec.ts` — 完整 onboarding → 编辑器 → 多章节起草/保存/切换
  - `tests/e2e/editor-failure.spec.ts` — AI 起草失败不覆盖原文
- `scripts/db-smoke-test.ts` — 数据库 CRUD smoke
- `scripts/onboarding-api-smoke.ts` — API 全链路 smoke（含章节起草、越界拒绝、novel retrieval）

### CI/CD 与验证

- `npm run typecheck` — 当前实测通过
- `npm run test` — 当前实测通过，46 files / 289 tests passed
- `npm run build` — 当前实测通过，Next.js 15 生产构建成功
- `npm run lint` — 已迁移为 `eslint .`，当前实测通过
- `.github/workflows/ci.yml` — 已恢复基础 verify workflow；后续仍需纳入 lint、coverage 和 E2E job
- `npm run db:deploy` — Prisma migrate deploy（Supabase/生产用）

### 文档

- `README.md` — 已同步当前多章节编辑器状态、环境变量、启动方式、验证流程
- `.env.example` — 通用占位符，无具体 project ref

---

## 三、未完成项与风险需求

完整任务表、风险说明、技术实现方案和验收标准已迁移到 `TASKS.md`。当前最高优先级如下：

| 优先级 | 任务 | 原因 |
| --- | --- | --- |
| ~~P0~~ | ~~修复 `typecheck/build/lint` 失败~~ | ~~`npm run verify` 当前通过，lint 已迁移到 `eslint .`~~ |
| ~~P0~~ | ~~提交并启用 CI 工作流~~ | ~~`.github/workflows/ci.yml` 已恢复 verify job 并纳入 lint~~ |
| ~~P0~~ | ~~保护 `/api/healthz/llm`~~ | ~~已改为 admin-only，新增公开基础探针 `/api/healthz`~~ |
| ~~P0~~ | ~~LLM API key 加密存储与脱敏返回~~ | ~~AES-256-GCM 加密 + 脱敏返回 + 解密调用~~ |
| ~~P1~~ | ~~模型配置 SSRF 防护~~ | ~~已新增 Zod schema + URL 校验 + provider allowlist + 私网 IP 拒绝~~ |
| ~~P1~~ | ~~生产级限流~~ | ~~已抽象 RateLimiter 接口，保留 memory 实现，支持 Redis 扩展，扩面 critic/state-diff/healthz_llm~~ |
| ~~P1~~ | ~~内容审核策略化~~ | ~~MODERATION_FAILURE_MODE=allow|block|review，生产默认 block，本地关键词强阻断~~ |
| ~~P1~~ | ~~ownership 负向测试补齐~~ | ~~新增 novels/route、summaries/refresh 负向测试，覆盖 401/404~~ |
| ~~P1~~ | ~~owner 为空资源策略收紧~~ | ~~canAccessOwnerResource 默认拒绝空 owner，onboarding 单独 claim 路径~~ |
| ~~P1~~ | ~~LLM 用量统计与配额~~ | ~~summarize/consistency/loglines/questions 已接入 checkQuota，QUOTA_FAILURE_MODE 生产默认 block~~ |
| ~~P1~~ | ~~章节改稿后的摘要/索引级联刷新~~ | ~~已自动触发 summarize + index + summaries/refresh 当 done 章节被修改时~~ |
| P2 | 候选稿/差异保存 + 替换 window.confirm | 写作体验仍依赖原生 confirm，AI 起草直接覆盖原文 |
| P2 | 导出 docx/epub | Markdown/TXT 已实现，docx/epub 未做 |

---

## 四、关键文件索引

| 文件 | 用途 |
| --- | --- |
| `app/(app)/new/page.tsx` | Onboarding 入口 |
| `app/(app)/new/_components/Step4Generating.tsx` | Bible 流式生成 UI |
| `app/(app)/new/_components/Step5Review.tsx` | Bible 审阅编辑 |
| `app/(app)/editor/[novelId]/page.tsx` | 编辑器 server loader |
| `app/(app)/editor/[novelId]/EditorClient.tsx` | 编辑器主 UI 编排 |
| `app/(app)/editor/[novelId]/useChapterEditor.ts` | 编辑器状态机、保存、起草、版本、审校 |
| `app/(app)/editor/[novelId]/EditorSidebar.tsx` | Bible 侧栏和章节列表 |
| `app/(app)/editor/[novelId]/EditorToolbar.tsx` | 编辑器工具栏 |
| `app/(app)/editor/[novelId]/AIPanel.tsx` | AI 起草、逻辑审计、状态追踪入口 |
| `app/(app)/editor/[novelId]/BibleEditorPanel.tsx` | Bible 编辑器 |
| `app/(app)/editor/[novelId]/CriticPanel.tsx` | 起草后 Critic 冲突展示 |
| `app/(app)/editor/[novelId]/StateDiffPanel.tsx` | State Diff 确认回写 UI |
| `app/(app)/editor/[novelId]/VersionsModal.tsx` | 章节版本历史弹窗 |
| `app/api/onboarding/sessions/route.ts` | 创建 session |
| `app/api/onboarding/sessions/[id]/bible/route.ts` | Bible SSE 流式生成 |
| `app/api/onboarding/sessions/[id]/finalize/route.ts` | Finalize 创建 Novel |
| `app/api/novels/[id]/route.ts` | 获取 Novel 数据 |
| `app/api/novels/[id]/bible/route.ts` | Bible 更新 API |
| `app/api/novels/[id]/chapters/route.ts` | 创建/更新章节 |
| `app/api/novels/[id]/chapters/draft/route.ts` | 章节 SSE 起草 |
| `app/api/novels/[id]/chapters/critic/route.ts` | 起草后 Critic API |
| `app/api/novels/[id]/consistency/route.ts` | 全文一致性检查 |
| `app/api/novels/[id]/summaries/refresh/route.ts` | 分层摘要刷新 |
| `app/api/chapters/[id]/route.ts` | 更新章节 |
| `app/api/chapters/[id]/versions/route.ts` | 章节版本历史 |
| `app/api/chapters/[id]/summarize/route.ts` | 章节摘要生成 |
| `app/api/chapters/[id]/state-diff/route.ts` | State Diff 生成 |
| `app/api/chapters/[id]/index/route.ts` | MemoryChunk 索引 |
| `app/api/llm-models/route.ts` | LLM 模型配置列表和创建 |
| `lib/llm/client.ts` | DeepSeek 客户端 |
| `lib/llm/mock.ts` | Mock LLM |
| `lib/llm/embeddings.ts` | Embedding API 封装 |
| `lib/llm/prompts/bible.ts` | Bible 生成 prompt |
| `lib/llm/prompts/chapter.ts` | 章节生成 prompt |
| `lib/llm/prompts/critic.ts` | Critic prompt |
| `lib/llm/prompts/stateDiff.ts` | State Diff prompt |
| `lib/agent/chapterContext.ts` | 章节上下文编排 |
| `lib/agent/summaries.ts` | 分层摘要刷新 |
| `lib/agent/chunking.ts` | MemoryChunk 切块和索引 |
| `lib/agent/retrieval.ts` | RAG 检索雏形 |
| `lib/stream/sseEncode.ts` | SSE 编码 |
| `lib/stream/readSse.ts` | SSE 读取工具 |
| `lib/stream/jsonStreamParser.ts` | 增量 JSON 解析 |
| `lib/validation/schemas.ts` | 全链路 zod schema |
| `lib/validation/stateDiffMerge.ts` | State Diff 合并逻辑 |
| `lib/auth/ownership.ts` | 用户归属校验 |
| `lib/auth/rateLimit.ts` | 内存限流器 |
| `lib/auth/admin.ts` | 管理员判定 |
| `utils/supabase/server.ts` | Supabase server client |
| `utils/supabase/auth.ts` | 可选用户 ID 获取 |
| `prisma/schema.prisma` | 数据模型 |

---

## 五、验证命令

```bash
# 一键验证
npm run verify

# 单独验证
npm run typecheck
npm run test
npm run build

# 数据库
npm run db:smoke
npm run db:deploy

# E2E（需 LLM_MOCK=1）
$env:LLM_MOCK='1'; npm run test:e2e

# API smoke（需先启动服务）
$env:LLM_MOCK='1'; npm run start   # 终端 1
$env:LLM_MOCK='1'; npm run smoke:onboarding  # 终端 2
```

---

## 六、提交记录（最近）

```
f35121c docs: document API ownership checks
f188404 feat: enforce novel ownership on APIs
0e2aeb6 feat: capture authenticated onboarding user
478b579 chore: add migration deploy script
d33ed6a chore: add verify script
31c6cf5 ci: add basic verification workflow
4bee07c test: split editor e2e coverage
b7d3815 docs: sync editor README status
52de118 chore: generalize Supabase env example
7fed114 refactor: extract editor toolbar
2b018ac refactor: extract SSE reader
0e67efb refactor: extract editor sidebar
2d1a79c test: cover second chapter AI drafting
3ecd988 test: cover novel editor hydration API
c75cbc1 test: cover chapter draft APIs
8671035 test: cover chapter drafting failures
8611d9a fix: reject chapters outside outline
ae9b838 test: cover novel retrieval smoke
10ecb8d test: verify chapter status persistence
5506bd5 feat: autosave chapter drafts
5d932a4 feat: add editor save shortcut
1122586 test: cover chapter drafting prompt
3c64ddc feat: show chapter editor progress
d65d509 feat: add chapter drafting editor
adb2f64 test: add onboarding e2e coverage
950b557 feat: add deterministic llm mock mode
aee19bf feat: improve bible streaming review ui
1ce3414 feat: complete onboarding mvp flow
```
