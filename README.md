<div align="center">

# 墨境 · AI Novel Studio

**面向长篇小说写作的 AI 辅助工作台。**

覆盖作品设定、大纲、章节编辑、候选稿、记忆库、导出和后台任务，帮助作者从灵感开始持续推进一部长篇作品。

[![CI](https://github.com/YunDanFengQing/ai-novel/actions/workflows/ci.yml/badge.svg)](https://github.com/YunDanFengQing/ai-novel/actions/workflows/ci.yml)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/tsconfig#strict)
[![Tests](https://img.shields.io/badge/tests-700%20passing-brightgreen)](https://github.com/YunDanFengQing/ai-novel)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/YunDanFengQing/ai-novel/pulls)

</div>

---

## ✨ 核心特性

### 🪄 五步创作向导

将一句话灵感整理成可继续写作的作品设定：

| 步骤 | 内容 | 说明 |
|:----:|------|------|
| 01 | 类型与标题 | 选择文学领域（网文 / 严肃文学 / 剧本 / 同人 / 短篇集），命名作品 |
| 02 | 故事灵感 | 撰写核心冲突，或让 AI 推荐 5 条灵感建议 |
| 03 | 创作追问 | AI 生成深挖世界与角色的关键问题，附带推荐答案 |
| 04 | 生成设定 | SSE 实时流式生成角色、世界观、阵营、章节大纲 |
| 05 | 核对微调 | 逐字段编辑、最多 3 次重新合成，确认后直接进入写作 |

### 📝 多章节协作编辑器

- **章节切换** + 未保存确认
- **自动保存**（3 秒防抖）+ 手动 Ctrl/Cmd+S
- **AI 起草 → 候选稿模式** — AI 不再覆盖原文，草稿出现在侧面板，支持替换 / 追加 / 插入光标 / 丢弃
- **Critic 一致性检查** — AI 逻辑警告内嵌候选面板
- **Beat Sheet 节拍表** — 生成并编辑章节节拍大纲，从节拍直接起草
- **检索可视化** — 查看 AI 引用了哪些记忆块（来源、相似度、原因、片段）
- **版本历史 + Diff** — 任意版本恢复，侧栏对比差异
- **乐观锁** — 409 冲突检测，防止多端静默覆盖
- **目标字数** — 实时进度环 + 上次保存时间

### 🗂 项目工作台

- **仪表盘** — 最近编辑、待写章节、AI 调用统计、月度用量、失败任务提醒、下一步建议
- **作品详情** — 创作进度、作品设定状态、最近章节、6 张导航卡片
- **角色编辑器** — 全 schema 角色卡片
- **世界观编辑器** — 背景、规则、地理、阵营结构化编辑
- **大纲编辑器** — 按卷分组的章节大纲，草稿状态标记
- **角色关系图** — 交互式 SVG 关系图，可编辑关系卡片
- **章节管理** — 可筛选表格，摘要/索引脏标记，批量刷新
- **AI 调用历史** — 最近 100 条调用，按 Agent/状态/费用筛选
- **导出中心** — Markdown / 纯文本 / Word (.docx) / EPUB，支持章节范围和设定附录

### 🛡 管理与安全

- **数据库驱动角色系统** — `user_roles` 表 + 环境变量灾备回退
- **用户管理** — `/admin/users` 授予/撤销管理员
- **LLM 模型配置** — 增删改启 DeepSeek/OpenAI 兼容端点，API Key 加密存储
- **Embedding 模型配置** — 管理 Embedding 提供商（严格 1024 维 pgvector 兼容）
- **内容审核** — 本地关键词 + LLM 双重检查，可配置失败模式（allow/block/review），完整审计链
- **审核复核队列** — 人工复核标记内容，状态追踪，90 天 TTL 清理
- **速率限制** — 内存 / Upstash Redis 双后端
- **CSP Nonce** — 每请求 Content Security Policy
- **SSRF 防护** — URL/协议/私网 IP 校验

---

## 🏗 技术架构

| 层 | 技术 |
|----|------|
| 框架 | [Next.js 15](https://nextjs.org/) App Router + TypeScript strict |
| UI | [Tailwind CSS v4](https://tailwindcss.com/) Ivory & Ink 设计令牌 |
| 状态 | [Zustand](https://zustand.docs.pmnd.rs/)（客户端）+ React Server Components（服务端）|
| 数据库 | [PostgreSQL 16](https://www.postgresql.org/) + [Prisma](https://www.prisma.io/) + [pgvector](https://github.com/pgvector/pgvector) HNSW |
| LLM | DeepSeek-V3（OpenAI 兼容协议），数据库可配模型路由 |
| 认证 | [Auth.js v5](https://authjs.dev/) Credentials Provider |
| 校验 | [Zod](https://zod.dev/) — 全链路单一数据形状来源 |
| 测试 | [Vitest](https://vitest.dev/)（单元/API）+ [Playwright](https://playwright.dev/)（E2E）|
| 可观测 | Prometheus 指标 · Sentry（零 SDK）· Grafana 告警 |

---

## 🚀 快速开始

### 环境要求

- **Node.js** 22+
- **PostgreSQL** 16+（需 pgvector 扩展）
- **DeepSeek API Key**（或设置 `LLM_MOCK=1` 本地开发）

### 安装

```bash
git clone https://github.com/YunDanFengQing/ai-novel.git
cd ai-novel
npm install
```

### 环境变量

```bash
cp .env.example .env
```

必填：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key |
| `AUTH_SECRET` | 会话密钥（`openssl rand -base64 32` 生成）|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |

推荐配置：

| 变量 | 说明 |
|------|------|
| `LLM_MOCK=1` | 使用 Mock LLM（无真实 API 调用）|
| `ADMIN_USER_IDS` | 管理员用户 ID（逗号分隔）|
| `ADMIN_EMAILS` | 管理员邮箱（逗号分隔）|
| `METRICS_TOKEN` | Prometheus `/api/metrics` Bearer Token |
| `SENTRY_DSN` | Sentry 项目 DSN |
| `RATE_LIMIT_STORE=redis` | 使用 Upstash Redis 限流 |

### 数据库

```bash
# 启动本地 PostgreSQL（Docker，仅绑定 127.0.0.1）
npm run db:up

# 执行迁移
npm run db:migrate
```

已有托管 PostgreSQL 时，设置 `DATABASE_URL` 后直接：

```bash
npm run db:deploy
```

### 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)，注册账号，创建第一部作品，开始创作。

---

## 📁 项目结构

```
ai-novel/
├── app/                          # Next.js App Router
│   ├── (app)/                    # 认证路由（侧边栏布局）
│   │   ├── dashboard/            # 工作台仪表盘
│   │   ├── novels/               # 作品管理 & 设定编辑器
│   │   ├── editor/[novelId]/     # 多章节编辑器
│   │   ├── new/                  # 五步创作向导
│   │   ├── models/               # LLM & Embedding 配置（管理）
│   │   ├── admin/                # 用户管理 & 审核（管理）
│   │   └── profile/              # 账号设置
│   └── api/                      # 46 个 API 路由
├── components/
│   ├── auth/                     # 认证表单组件
│   ├── layout/                   # 侧边栏
│   └── ui/                       # 设计系统原语
├── lib/
│   ├── agent/                    # AI 写作管线 Agent
│   ├── auth/                     # 会话、所有权、限流
│   ├── editor/                   # 章节工具函数
│   ├── export/                   # 4 格式导出（md/txt/docx/epub）
│   ├── llm/                      # LLM 客户端、Embedding、Prompt、用量
│   ├── moderation/               # 内容审核 & 流式守护
│   ├── validation/               # Zod Schema
│   └── ...                       # hooks / http / jobs / metrics / stream 等
├── prisma/
│   ├── schema.prisma             # 20 个模型，24 条迁移
│   └── migrations/
├── tests/e2e/                    # Playwright E2E
└── docs/                         # 状态、路线图、合约、阶段决策
```

---

## 🗄 数据模型

20 个 Prisma 模型，24 条迁移：

| 模型 | 用途 |
|------|------|
| `User` / `Account` / `Session` / `VerificationToken` | Auth.js 本地认证 |
| `OnboardingSession` | 五步向导状态 |
| `Novel` | 小说项目（用户所有）|
| `BibleDraft` | 作品设定内容（与 Novel 1:1）|
| `ChapterDraft` | 章节内容 + 乐观锁 |
| `ChapterVersion` | 版本历史快照 |
| `ChapterSummary` / `VolumeSummary` / `NovelSummary` | 分层摘要（RAG）|
| `MemoryChunk` | Embedding 存储（pgvector 1024 维）|
| `LlmModel` / `EmbeddingModel` | 数据库配置的 AI 模型端点 |
| `LlmUsage` | 逐调用审计日志（Token、费用、延迟）|
| `UserRole` | 数据库驱动的权限授予 |
| `ModerationAudit` | 内容审核决策 + 复核状态 |
| `BackgroundJob` | 后台任务队列 |
| `DraftSession` | 可续传 SSE 起草会话 |

---

## 🔌 API 概览

所有接口统一信封格式：`{ ok: true, data }` 或 `{ ok: false, error: { code, message, retryable } }`

| 分类 | 端点 |
|------|------|
| 认证 | `POST /signup` · `POST /password-reset` · `POST /password` · `POST /logout` |
| 作品 | `GET /novels` · `GET /novels/:id` · `PATCH /novels/:id` |
| 章节 | `POST /novels/:id/chapters` · `PATCH/DELETE /chapters/:id` |
| AI 写作 | `POST /novels/:id/chapters/draft`（SSE）· `POST /chapters/critic` · `POST /chapters/outline` |
| 版本 | `GET /chapters/:id/versions` · `POST /chapters/:id/versions/:vid/restore` |
| 导出 | `GET /novels/:id/export?format=md\|txt\|docx\|epub` |
| 向导 | `POST /onboarding/sessions` · `/loglines` · `/questions` · `/bible`（SSE）· `/finalize` |
| 管理 | `GET /admin/users` · `POST/DELETE /admin/users/:id/roles/:role` |
| 审核 | `GET /admin/moderation-audits` · `PATCH /admin/moderation-audits/:id` |
| 模型 | CRUD `/llm-models` · `/embedding-models`（仅管理员）|
| 可观测 | `GET /healthz` · `GET /healthz/llm` · `GET /metrics` |
| 定时 | `GET /cron/draft-sessions/cleanup` · `GET /cron/moderation-audits/cleanup` |

---

## 🧪 测试

```bash
# 完整验证（lint + typecheck + test + build + docs check）
npm run verify

# 单独执行
npm run typecheck          # TypeScript strict 模式检查
npm run lint               # ESLint
npm run test               # Vitest 单元/API 测试（700 测试，88 文件）
npm run test:coverage      # 覆盖率阈值（lines 68 · functions 93 · branches 83）
npm run build              # 生产构建

# E2E 测试（需 LLM_MOCK=1）
$env:LLM_MOCK='1'; npm run test:e2e

# API 冒烟测试
$env:LLM_MOCK='1'; npm run start              # 终端 1
$env:LLM_MOCK='1'; npm run smoke:onboarding   # 终端 2
```

---

## 🚢 部署

### Docker

```bash
DOCKER_BUILD=1 npm run build
docker build -t ai-novel .
docker run -p 3000:3000 --env-file .env.production ai-novel
```

### Vercel

项目包含 `vercel.json`，已配置 Draft Session 和 Moderation Audit 清理的 Cron Job。

### 上线检查清单

- [ ] 设置 `AUTH_SECRET`（`openssl rand -base64 32`）
- [ ] 设置 `MODEL_KEY_ENCRYPTION_SECRET`（至少 32 字符）
- [ ] 配置 `ADMIN_USER_IDS` 或 `ADMIN_EMAILS`
- [ ] 设置 `MODERATION_FAILURE_MODE=block`
- [ ] 设置 `QUOTA_FAILURE_MODE=block`
- [ ] 设置 `METRICS_TOKEN`
- [ ] 设置 `CRON_SECRET`
- [ ] 对生产数据库执行 `npm run db:deploy`
- [ ] 在 `/models` 管理页配置至少一个 LLM 模型

---

## 📚 文档

| 文档 | 说明 |
|------|------|
| [项目状态](docs/STATUS.md) | 唯一项目状态来源 |
| [健康报告](docs/HEALTH.md) | 项目体检报告 |
| [战略路线图](docs/ROADMAP_2_4_8_WEEKS.md) | 2/4/8 周路线图 |
| [任务分解](docs/IMPLEMENTATION_TASKS.md) | 页面/接口级任务单 |
| [API 合约](docs/contracts.md) | 冻结的 API/Schema 合约 |
| [可观测指南](docs/OBSERVABILITY.md) | Sentry/Grafana 集成 |
| [生产审阅](docs/PROJECT_REVIEW_REPORT.md) | 生产标准审查 |
| [阶段决策](docs/phases/) | Phase A / B / P0-8 决策记录 |

---

## 📄 许可证

Private — All rights reserved.
