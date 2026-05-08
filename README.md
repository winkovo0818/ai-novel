# AI Novel

AI 协同写小说平台，支持 5 步生成 Bible 草稿 + 多章节 AI 写作。

---

## 功能概览

### Onboarding（5 步向导）
- Step 1：输入书名、类型（网文/文学/剧本等）、子类型
- Step 2：输入一句话灵感，或让 AI 推荐 5 条 logline
- Step 3：AI 生成 3-5 条反向追问（单选/多选），AI 推荐默认答案
- Step 4：SSE 流式生成 Bible（角色卡、世界观、章节大纲、节拍）
- Step 5：字段级编辑、重摆（≤3 次）、保存或进入写作页

### 多章节编辑器
- `/editor/[novelId]` 左侧 Bible 侧栏，右侧章节编辑
- 每章独立标题、正文、状态（草稿/完成）
- AI 起草：基于 Bible + 前文章节上下文，SSE 流式输出
- 自动保存（停止输入 3 秒）+ Ctrl/Cmd+S 快捷保存
- 章节删除、版本历史（自动快照）
- 全文一致性校验 API（LLM Critic Agent）

### 账号与安全
- 登录 / 注册 / 密码重置
- API 鉴权（未登录 401）
- 应用层 ownership 隔离（每个 API/SSR 路由调用 `canAccessOwnerResource`，不依赖 DB RLS）
- LLM 模型配置 admin-only（见下方 §1.1）
- LLM 内容审核 + 本地关键词过滤

---

## 1. 环境准备

### 依赖
- Node.js 22+
- PostgreSQL 16（本地或 Supabase）
- DeepSeek API Key

### 安装
```bash
npm install
```

### 环境变量
```bash
cp .env.example .env
```

填入以下变量（真实密钥只放 `.env.local`，不要提交）：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `DIRECT_URL` | Prisma migrate 连接串 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` |
| `DEEPSEEK_MODEL` | `deepseek-chat` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |
| `ADMIN_USER_IDS` | 管理员 Supabase user ID 列表（逗号分隔），可访问 `/models` 与 `/api/llm-models/**` |
| `ADMIN_EMAILS` | 管理员邮箱列表（逗号分隔，大小写不敏感），作用同上 |

**可选**：`LLM_MOCK=1` 开启本地 mock，不调用 DeepSeek。

### 1.1 管理员与 LLM 模型配置

`/models` 页面与 `/api/llm-models/**` 路由仅对管理员开放，避免任意登录用户写入共享 API key。判定方式：

- `ADMIN_USER_IDS=uuid1,uuid2`：把 Supabase 用户 ID 列在这里。
- `ADMIN_EMAILS=alice@example.com,bob@example.com`：邮箱大小写不敏感。

任一命中即视为管理员。两个变量都不设时，没有任何账号能访问模型配置（默认安全）。

获取你的 Supabase user ID：登录后访问 `/profile`，或在 Supabase Dashboard 的 Auth → Users 中查找。

普通用户访问 `/models` 会看到无权限提示；API 返回 `403 FORBIDDEN`。


### 数据库
```bash
npm run db:up        # 本地 Docker 起 PostgreSQL
npm run db:migrate   # 应用 Prisma migrations
```

已有 Supabase？直接填 `.env.local` 后：
```bash
npm run db:deploy    # 生产环境应用迁移
```

---

## 2. 启动

```bash
npm run dev
```

访问 `http://localhost:3000`

### 健康检查
```bash
curl http://localhost:3000/api/healthz/llm
```

应返回 `{ ok: true, data: { reply, token_in, token_out, cost_cny, took_ms } }`

---

## 3. 完整使用流程

### 3.1 注册账号
1. 访问 `http://localhost:3000/signup`
2. 输入邮箱 + 密码（≥6 位）
3. 点击"注册"，收到确认邮件后点击链接验证
4. 访问 `http://localhost:3000/login` 登录

### 3.2 创建小说
1. 登录后自动跳转 `/novels`（作品列表页）
2. 点击右上角"新建小说"，进入 `/new`
3. **Step 1**：选择类型大类（网文/文学/剧本等）+ 子类型（玄幻/都市/悬疑等）
4. **Step 2**：输入灵感，或点击"AI 推荐 5 条"后选择一条
5. **Step 3**：点击"生成反向追问"，确认/调整推荐答案
6. **Step 4**：点击"开始生成"，观察 Bible 卡片流式出现
7. **Step 5**：编辑标题、角色、世界观、大纲，可重摆（≤3次），确认后点击"保存草稿"或"开始写作"

### 3.3 多章节写作
1. 进入 `/editor/[novelId]` 编辑器
2. 左侧 Bible 侧栏查看角色、世界规则、章节大纲
3. 点击章节按钮切换章节（未保存会提示）
4. 在文本框中编辑正文
5. 点击"AI 起草"让 AI 生成章节正文（SSE 流式输出）
6. 编辑器会自动保存（3秒无操作），或按 Ctrl/Cmd+S 手动保存
7. 点击"标记完成"切换章节状态

### 3.4 一致性检查
```bash
curl -X POST http://localhost:3000/api/novels/{novelId}/consistency \
  -H "Content-Type: application/json"
```
返回 `{ consistent: true }` 或 `{ consistent: false, issues: [...] }`

### 3.5 查看章节历史
```bash
curl http://localhost:3000/api/chapters/{chapterId}/versions
```
返回该章节的历史快照列表。

---

## 4. 验证命令

```bash
# 一键验证（typecheck + test + build）
npm run verify

# 单独验证
npm run typecheck
npm run test
npm run build

# E2E 测试（需 LLM_MOCK=1）
$env:LLM_MOCK='1'; npm run test:e2e

# API smoke（需先启动服务）
$env:LLM_MOCK='1'; npm run start   # 终端 1
$env:LLM_MOCK='1'; npm run smoke:onboarding  # 终端 2
```

---

## 5. 技术栈

| 模块 | 选型 |
|------|------|
| Framework | Next.js 15 + App Router + TypeScript strict |
| UI | Tailwind CSS v4 |
| State | Zustand |
| DB | PostgreSQL + Prisma |
| LLM | DeepSeek-V3（OpenAI 兼容） |
| Auth | Supabase Auth |
| i18n | next-intl |
| Validation | Zod |
| Tests | Vitest + Playwright |

---

## 6. 目录结构

```
app/
├── page.tsx                     # 首页（已登录跳转 /novels）
├── login/page.tsx              # 登录
├── signup/page.tsx             # 注册
├── reset-password/page.tsx    # 忘记密码
├── update-password/page.tsx   # 设置新密码
├── novels/page.tsx             # 作品列表
├── profile/page.tsx            # 账号设置
├── new/                        # Onboarding 向导
│   └── page.tsx
├── editor/[novelId]/           # 多章节编辑器
│   ├── page.tsx
│   ├── EditorClient.tsx
│   ├── EditorSidebar.tsx
│   ├── EditorToolbar.tsx
│   └── useChapterEditor.ts
└── api/
    ├── auth/callback/          # OAuth callback
    ├── auth/logout/             # 登出
    ├── chapters/[id]/
    │   ├── route.ts             # PATCH/DELETE
    │   ├── versions/           # 版本历史
    │   └── summarize/          # 章节摘要
    ├── novels/
    │   ├── route.ts             # GET list
    │   └── [id]/
    │       ├── route.ts         # GET one
    │       ├── chapters/       # 创建/更新章节
    │       ├── chapters/draft/  # AI 起草
    │       └── consistency/     # 一致性检查
    └── onboarding/              # Onboarding APIs
```

---

## 7. 数据库模型

| 表 | 说明 |
|-----|------|
| `OnboardingSession` | Onboarding 向导中间状态 |
| `Novel` | 小说项目（含 user_id） |
| `BibleDraft` | Bible 草稿（JSON） |
| `ChapterDraft` | 章节草稿 |
| `ChapterVersion` | 章节历史快照 |
| `ChapterSummary` | 章节摘要（用于 RAG） |

---

## 8. 部署

### Docker
```bash
DOCKER_BUILD=1 npm run build
docker build -t ai-novel .
docker run -p 3000:3000 --env-file .env.production ai-novel
```

### Supabase
```bash
npm run db:deploy
```
