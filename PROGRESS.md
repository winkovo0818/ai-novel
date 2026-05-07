# 项目进度

> 最后更新：2026-05-08
> 当前分支：main
> 最新提交：`f35121c docs: document API ownership checks`

---

## 一、总体判断

| 阶段 | 进度 | 说明 |
| --- | --- | --- |
| Onboarding MVP | 95% | `/new` 5 步流程完整可跑，API + UI + 测试均已覆盖 |
| 多章节写作 MVP | 85% | 编辑器已支持多章节、AI 起草、自动保存、状态流转 |
| 安全上线准备 | 65% | 已有 API ownership 隔离，缺 RLS、登录 UI、密码重置 |
| 正式产品化 | 35% | 缺版本历史、全文一致性、内容审核、长篇记忆/RAG |

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

### 多章节编辑器

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

- Unit/API tests：10 files / 41 tests passed
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

### CI/CD

- `.github/workflows/ci.yml` — GitHub Actions 跑 `npm run verify`
- `npm run verify` — typecheck + test + build 一键验证
- `npm run db:deploy` — Prisma migrate deploy（Supabase/生产用）

### 文档

- `README.md` — 已同步当前多章节编辑器状态、环境变量、启动方式、验证流程
- `.env.example` — 通用占位符，无具体 project ref

---

## 三、未完成项

### 高优先级

- **推送代码到远端** — 当前所有提交仅在本地
- **重置 Supabase 数据库密码** — 之前密码在对话中暴露过
- **Supabase RLS 策略** — 数据库层用户隔离
- **登录/注册 UI** — 当前只记录用户 ID，无完整登录流程
- **内容审核替换** — 当前仍是 mock pass

### 中优先级

- **章节版本历史** — 当前只有最新版本
- **全文一致性校验** — 长篇小说跨章节一致性
- **长篇记忆/RAG** — 基于已有章节生成后续内容
- **Playwright E2E 进 CI** — 当前只在本地跑
- **删除章节功能** — 当前只能创建和编辑
- **编辑器组件进一步拆分** — `EditorClient` 仍较大

### 低优先级

- **移动端适配**
- **i18n**
- **正式部署配置和线上验证**
- **Step4 卡片动效优化**
- **用户 profile 管理页**

---

## 四、关键文件索引

| 文件 | 用途 |
| --- | --- |
| `app/new/page.tsx` | Onboarding 入口 |
| `app/new/_components/Step4Generating.tsx` | Bible 流式生成 UI |
| `app/new/_components/Step5Review.tsx` | Bible 审阅编辑 |
| `app/editor/[novelId]/page.tsx` | 编辑器 server loader |
| `app/editor/[novelId]/EditorClient.tsx` | 编辑器核心状态和逻辑 |
| `app/editor/[novelId]/EditorSidebar.tsx` | Bible 侧栏和章节列表 |
| `app/editor/[novelId]/EditorToolbar.tsx` | 编辑器工具栏 |
| `app/api/onboarding/sessions/route.ts` | 创建 session |
| `app/api/onboarding/sessions/[id]/bible/route.ts` | Bible SSE 流式生成 |
| `app/api/onboarding/sessions/[id]/finalize/route.ts` | Finalize 创建 Novel |
| `app/api/novels/[id]/route.ts` | 获取 Novel 数据 |
| `app/api/novels/[id]/chapters/route.ts` | 创建/更新章节 |
| `app/api/novels/[id]/chapters/draft/route.ts` | 章节 SSE 起草 |
| `app/api/chapters/[id]/route.ts` | 更新章节 |
| `lib/llm/client.ts` | DeepSeek 客户端 |
| `lib/llm/mock.ts` | Mock LLM |
| `lib/llm/prompts/bible.ts` | Bible 生成 prompt |
| `lib/llm/prompts/chapter.ts` | 章节生成 prompt |
| `lib/stream/sseEncode.ts` | SSE 编码 |
| `lib/stream/readSse.ts` | SSE 读取工具 |
| `lib/stream/jsonStreamParser.ts` | 增量 JSON 解析 |
| `lib/validation/schemas.ts` | 全链路 zod schema |
| `lib/auth/ownership.ts` | 用户归属校验 |
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
