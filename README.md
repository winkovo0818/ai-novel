# AI Novel

AI 协同写小说平台：5 步生成 Bible 草稿 → 项目层信息架构 → 多章节 AI 写作（候选稿模式） → 版本恢复 + diff、四格式导出、retrieval 可视化、章节乐观锁。

当前状态：阶段 1 + 2 + 3 已完成，可演示并稳定内测的 MVP。`lint`、`typecheck`、Vitest、生产构建、Playwright E2E 当前全绿；CI 包含 `verify` + `e2e`（pgvector + LLM_MOCK）两个 job，coverage 阈值 68/68/93/83 已入门禁。

实测数字（测试数 / 路由数 / 完成度等）以 `docs/STATUS.md` 与 `docs/HEALTH.md` 为准——这里不再 inline 任何会过期的数字，避免文档漂移。详细状态见 `docs/STATUS.md`，体检报告见 `docs/HEALTH.md`，路线图见 `docs/ROADMAP_2_4_8_WEEKS.md`，任务单见 `docs/IMPLEMENTATION_TASKS.md`，真实产品审阅见 `docs/PROJECT_REVIEW_REPORT.md`。

---

## 功能概览

### Onboarding（5 步向导）
- Step 1：输入书名、类型（网文/文学/剧本等）、子类型
- Step 2：输入一句话灵感，或让 AI 推荐 5 条 logline
- Step 3：AI 生成 3-5 条反向追问（单选/多选），AI 推荐默认答案
- Step 4：SSE 流式生成 Bible（角色卡、世界观、章节大纲、节拍）
- Step 5：字段级编辑、重摆（≤3 次）、保存或进入写作页

### 项目工作台
- `/novels` 书架 → `/novels/:id` 项目详情（章节进度 / Bible 状态 / 最近编辑 / 4 个入口卡）
- `/novels/:id/characters` 角色管理：左侧名单，右侧含 schema 全字段的角色编辑器
- `/novels/:id/world` 世界观：背景设定 / 规则 / 地理 / 势力四个 section
- `/novels/:id/outline` 大纲：按卷分组，已起草章节带徽章，深链跳进编辑器
- `/editor/:id?chapter=N` 编辑器支持直达指定章节

### 多章节编辑器
- 章节切换 / 自动保存（3s 停顿）/ Ctrl·Cmd+S 快捷保存
- **AI 起草改候选稿模式**：流式不再覆盖正文，候选面板提供「覆盖 / 追加 / 插入光标 / 放弃」4 种处理方式；critic 内嵌为警告；接受候选稿前自动把当前正文存为版本
- **Retrieval 可视化（M3.4）**：候选稿面板折叠展示本次起草引用的历史记忆（source / 相似度 / 选中理由 / 截断片段），让 RAG 命中对作者透明
- 章节目标字数 + 进度环 + 最近保存时间显示
- **章节版本恢复 + diff（M3.2）**：历史版本 modal 支持"与当前对比"行内 diff 视图、"恢复此版本"二次确认；恢复时事务内先把当前正文存为 manual 版本，可再次回滚
- **章节乐观锁（M3.6）**：另一端先存的章节，本端保存会收到 409 + 最新数据，编辑器顶部出现"加载最新 / 暂不处理"横幅，本地正文保留以便复制
- 全文一致性校验 API（LLM Critic Agent）

### 导出
- **四格式导出（M3.3）**：编辑器 ExportMenu 一键下载 markdown / 纯文本 / Word（.docx，每行 Paragraph 保留硬换行）/ EPUB（HTML 转义 `<p>` 段落）；导出前内容审核仍生效

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
npm run db:up        # 本地 Docker 起 PostgreSQL（仅本地开发，端口绑 127.0.0.1）
npm run db:migrate   # 应用 Prisma migrations
```

> `docker-compose.yml` 仅用于本地开发，密码从 `.env` 的 `POSTGRES_PASSWORD` 读取（缺省为 `postgres`），并把 5432 端口绑到 `127.0.0.1`，不会暴露到 LAN。生产请用 Supabase 或托管 Postgres，不要部署这份 compose。

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
curl http://localhost:3000/api/healthz
```

应返回基础探针结果。  
`/api/healthz/llm` 当前为 admin-only 深度探针，需要登录管理员账号后访问。

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

# 实测数字以 docs/STATUS.md §一 为准；不在 README 内 inline 测试数，避免漂移。

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
