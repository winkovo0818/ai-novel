# AI Novel

一个面向中文长篇创作的 AI 写小说产品原型仓库。当前阶段聚焦第一批用户最先接触到的入口体验：`/new` Onboarding 向导。

目标不是先做一个“大而全”的 AI 编辑器，而是先把下面这条主链路打通：

1. 用户输入书名、类型、子类型
2. 用户写 1-2 句话灵感，或让 AI 推荐 logline
3. AI 反向追问 3-5 个关键选择题
4. DeepSeek-V3 流式生成一份小说 Bible 草稿
5. 用户调整、重摆、保存草稿，或进入写作页占位页

---

## 1. 项目背景

这个项目要解决的核心问题不是“怎么生成一段好看的文本”，而是“怎么让长篇小说在长上下文里尽量不失真、不跑偏、不自相矛盾”。

整体产品方案已经在两份文档中定义完成：

- [AI小说网站技术实现方案 v1.0.md](./AI%E5%B0%8F%E8%AF%B4%E7%BD%91%E7%AB%99%E6%8A%80%E6%9C%AF%E5%AE%9E%E7%8E%B0%E6%96%B9%E6%A1%88%20v1.0.md)
- [Onboarding向导原型设计 v0.1.md](./Onboarding%E5%90%91%E5%AF%BC%E5%8E%9F%E5%9E%8B%E8%AE%BE%E8%AE%A1%20v0.1.md)

当前仓库只落地其中的第一阶段 MVP：Onboarding 向导。

---

## 2. 本轮 MVP 目标

本轮只做 Onboarding，不做完整写作平台。

### 本轮要实现

- 5 步 Onboarding 向导 UI
- 5 个后端 API
- 3 个 Prompt 模板
- DeepSeek-V3 调用封装
- Bible 的 SSE 流式生成
- `partial-json` 增量解析
- Zustand Wizard 状态机与本地持久化
- 基础错误处理
- LLM token、耗时、成本日志
- README、录屏脚本与自测说明

### 本轮不做

- 鉴权 / 支付 / 计费
- 移动端适配
- i18n
- 正式内容审核接入
- 完整主编辑器
- Bible 之外的业务表

---

## 3. 产品主流程

### Step 1 基础信息

- 书名，可选
- 类型大类，必填
- 子类型，必填

### Step 2 一句话灵感

- 用户输入 1-2 句话 logline
- 如果没想好，可让 AI 推荐 5 条
- 也允许直接跳过，走保守默认生成

### Step 3 AI 反向追问

- AI 根据 logline 生成 3-5 道关键选择题
- 题型包含单选、多选、自定义
- 每题带推荐选项，降低用户决策成本

### Step 4 流式生成 Bible

- 后端调用 DeepSeek-V3
- 通过 SSE 边生成边返回
- 客户端按 `meta / character / world / outline / beat` 逐步显示卡片

### Step 5 调整或开写

- 用户可编辑 Bible 草稿
- 可重摆一份
- 可保存草稿
- 可进入 `/editor/[novelId]` 占位页

---

## 4. 技术栈

| 模块 | 选型 |
| --- | --- |
| Framework | Next.js 15 + App Router + TypeScript strict |
| UI | Tailwind CSS v4 + shadcn/ui + lucide-react |
| State | Zustand |
| Server | Next.js Route Handlers |
| Stream | SSE + `ReadableStream`，Node runtime |
| DB | PostgreSQL + Prisma |
| LLM | DeepSeek-V3，OpenAI 兼容协议 |
| Validation | zod |
| JSON 流解析 | `partial-json` |
| Lint/Format | eslint + prettier |

---

## 5. 关键设计约束

以下约束是实现过程中不能随意改的：

1. DeepSeek 流式生成时，不要同时使用 `stream: true` 和 `response_format: { type: "json_object" }`
2. 流式场景通过 Prompt 强约束 JSON 输出，客户端用 `partial-json` 兜底
3. SSE 每 15 秒发送一次心跳，避免中间层断连
4. JSON 增量解析不能每个 chunk 都 parse，要使用累积 buffer，并按节流窗口触发
5. Prompt 5.3 必须保留全部硬规则：
   - 主角动机闭环
   - 反派动机合理
   - 首卷至少 1 个小高潮
   - 首卷至少 1 个伏笔
   - 章节数 8-12
   - 避免敏感内容
6. 所有 API 入参与出参必须走 zod 校验
7. Wizard 状态必须持久化到 localStorage
8. 每次 LLM 调用都要在控制台打印 token 与耗时

---

## 6. 目标目录结构

```text
ai-novel/
├── app/
│   ├── (onboarding)/
│   │   ├── new/page.tsx
│   │   └── _components/
│   │       ├── ProgressDots.tsx
│   │       ├── StepShell.tsx
│   │       ├── Step1Basic.tsx
│   │       ├── Step2Logline.tsx
│   │       ├── Step3Questions.tsx
│   │       ├── Step4Generating.tsx
│   │       ├── Step5Review.tsx
│   │       ├── BibleCard.tsx
│   │       └── CostBadge.tsx
│   ├── api/onboarding/
│   │   ├── sessions/route.ts
│   │   ├── sessions/[id]/loglines/route.ts
│   │   ├── sessions/[id]/questions/route.ts
│   │   ├── sessions/[id]/bible/route.ts
│   │   └── sessions/[id]/finalize/route.ts
│   └── editor/[novelId]/page.tsx
├── lib/
│   ├── llm/
│   │   ├── client.ts
│   │   └── prompts/
│   ├── stream/
│   │   ├── sseEncode.ts
│   │   └── jsonStreamParser.ts
│   ├── store/
│   │   └── wizardStore.ts
│   └── validation/
│       └── schemas.ts
├── prisma/
│   └── schema.prisma
├── scripts/
├── tmp/
├── .env.example
└── README.md
```

---

## 7. API 设计范围

本轮涉及以下 5 个 API：

| 接口 | 说明 |
| --- | --- |
| `POST /api/onboarding/sessions` | 创建 Onboarding 会话 |
| `POST /api/onboarding/sessions/:id/loglines` | 生成 5 条 logline 推荐 |
| `POST /api/onboarding/sessions/:id/questions` | 生成 3-5 条反向追问 |
| `POST /api/onboarding/sessions/:id/bible` | SSE 流式生成 Bible |
| `POST /api/onboarding/sessions/:id/finalize` | 保存草稿或创建项目 |

说明：

- `7.4` 必须使用 SSE
- `7.1 / 7.2 / 7.3 / 7.5` 为标准 JSON API
- 所有入参与出参都要做 schema 校验

---

## 8. 数据模型范围

本轮只保留 3 张核心表：

| 表 | 用途 |
| --- | --- |
| `OnboardingSession` | 保存当前用户在向导阶段的输入与中间结果 |
| `Novel` | 保存正式创建出来的小说项目 |
| `BibleDraft` | 保存生成完成或编辑后的 Bible 草稿 |

本轮不引入更多业务表，避免在入口体验阶段过早扩散设计复杂度。

---

## 9. 环境变量

最少需要以下变量：

```env
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
# LLM_MOCK=1
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

变量说明：

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | Prisma 运行时 PostgreSQL 连接串 |
| `DIRECT_URL` | Prisma migrate 直连串；本地 Docker 可与 `DATABASE_URL` 相同 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key；`LLM_MOCK=1` 时可不填真实值 |
| `DEEPSEEK_BASE_URL` | DeepSeek OpenAI 兼容 API 基地址 |
| `DEEPSEEK_MODEL` | DeepSeek 模型名，默认 `deepseek-chat` |
| `LLM_MOCK` | 可选。设为 `1` 或 `true` 时使用本地确定性 mock，不调用 DeepSeek |
| `NEXT_PUBLIC_APP_URL` | 当前应用对外访问地址 |

建议另外在本地创建：

```env
.env.local
```

并把真实密钥只放进 `.env.local`，不要提交到仓库。

---

## 10. 启动方式

### 1. 安装依赖

```bash
npm install
```

`postinstall` 钩子会自动跑一次 `prisma generate`，无需手动执行。

### 2. 准备环境变量

```bash
cp .env.example .env.local
```

然后填写：

- `DATABASE_URL`（与 `docker-compose.yml` 默认一致即可）
- `DIRECT_URL`（本地 Docker 可与 `DATABASE_URL` 相同）
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`
- `LLM_MOCK`（可选；本地无 key 时可设为 `1`）
- `NEXT_PUBLIC_APP_URL`

### 3. 启动本地数据库（决策 D-01）

需要本地装好 Docker。

```bash
npm run db:up         # 起本地 PostgreSQL 16
npm run db:migrate    # 应用 Prisma 迁移（脚本会读取 .env.local）
npm run db:smoke      # （可选）跑三表 CRUD smoke 验证连通（脚本会读取 .env.local）
```

如果不用 Docker，可以直接把 `.env.local` 里的 `DATABASE_URL` 和 `DIRECT_URL` 改成你自己的 PostgreSQL 连接串，然后从 `npm run db:migrate` 开始执行。

如需重置：`npm run db:reset`（会清库重迁）；停库：`npm run db:down`。

### 4. 启动开发环境

```bash
npm run dev
```

启动后访问：

```text
http://localhost:3000/new
```

### 健康检查

打开 `http://localhost:3000/api/healthz/llm` 应返回 `{ ok: true, data: { reply, token_in, token_out, cost_cny, took_ms } }`，并在服务端控制台看到一行符合契约 §9 的 `[LLM] route=/api/healthz/llm ...` 日志。

### Onboarding API Smoke

在另一个终端保持 `npm run dev` 运行后，可执行：

```bash
npm run smoke:onboarding
```

该脚本会调用真实本地服务，依次验证：

- 创建 session
- 生成 logline 推荐
- 生成反向追问
- 通过 POST SSE 生成 Bible
- finalize 创建 Novel 与 BibleDraft

默认情况下该脚本会调用 DeepSeek，需 `.env.local` 中有真实 `DEEPSEEK_API_KEY`，并会产生少量调用成本。若只想验证本地链路，可在 `.env.local` 设置 `LLM_MOCK=1`，此时不会调用 DeepSeek。

---

## 11. 开发顺序

严格按照以下顺序推进：

1. 脚手架搭建 + DeepSeek 探活
2. Prisma + DB
3. Prompt 5.3 离线调试
4. API 7.4 SSE 流式 Bible
5. Wizard 骨架 + Step 1/2/3 Mock UI
6. Step 1/2/3 接真实 API
7. Step 4 接 SSE
8. Step 5 编辑 + 重摆 + 保存/开写
9. 错误处理矩阵
10. Demo 录屏 + README 收尾

原因很明确：

- 先证明模型链路通
- 再证明数据能落库
- 先把最难的 Prompt 质量打稳
- 再做最难的流式解析
- 最后才接用户界面

---

## 12. 当前文档分层

仓库内当前有三份核心文档，各自职责不同：

| 文档 | 作用 |
| --- | --- |
| [AI小说网站技术实现方案 v1.0.md](./AI%E5%B0%8F%E8%AF%B4%E7%BD%91%E7%AB%99%E6%8A%80%E6%9C%AF%E5%AE%9E%E7%8E%B0%E6%96%B9%E6%A1%88%20v1.0.md) | 整体产品与系统方案 |
| [Onboarding向导原型设计 v0.1.md](./Onboarding%E5%90%91%E5%AF%BC%E5%8E%9F%E5%9E%8B%E8%AE%BE%E8%AE%A1%20v0.1.md) | Onboarding 交互、Prompt、API 契约 |
| [docs/contracts.md](./docs/contracts.md) | **Step 0 契约冻结**：决策记录、API/Schema/Profile/Fixture/Prompt 硬规则 — 后续所有 Step 唯一引用源 |
| [MVP任务规划表.md](./MVP%E4%BB%BB%E5%8A%A1%E8%A7%84%E5%88%92%E8%A1%A8.md) | 里程碑级任务总控 |
| [Implementation Breakdown.md](./Implementation%20Breakdown.md) | 可执行级任务拆分 |

---

## 13. 录屏 Demo 脚本

最终演示建议按以下脚本录：

1. 打开 `/new`
2. Step 1 选择：
   - 类型大类：网文
   - 子类型：玄幻
3. Step 2 输入玄幻 logline 示例，或点击“AI 推荐 5 条”后选择一条
4. Step 3 点击“生成反向追问”，确认/调整推荐答案
5. Step 4 点击“开始生成”，观察 SSE 事件逐步出现
6. Step 5 编辑标题、角色、世界观、大纲或第一章节拍
7. 点击“保存草稿”，验证 finalize API 可保存 Bible
8. 点击“重摆一版”，验证次数计数；第 4 次会被拦截
9. 点击“开始写作”，进入 `/editor/[novelId]` 占位页

建议录屏时同时展示：

- 浏览器页面
- 服务端控制台

这样可以一起证明：

- SSE 逐步渲染生效
- LLM token 与耗时日志有输出

---

## 14. 验收标准

本轮自测必须至少覆盖以下项目：

- `npm run dev` 后访问 `/new`，5 步全部能走通
- 文档中的玄幻例子能成功产出一份 Bible
- Step 4 在 8 秒内出现首字
- Step 4 SSE 事件逐步出现，而不是等待最终响应
- 主动断网后 Step 4 报错，恢复网络后可重新点击生成
- “重摆一份”点击第 4 次时出现提示
- 控制台能看到每次 LLM 调用的 token 与耗时
- `npm run typecheck` 通过
- `npm run test` 通过
- `npm run build` 0 type error / 0 eslint error
- `npm run smoke:onboarding` 可在本地 dev server 上跑通主 API 链路
- README 中能看到环境变量和启动 3 步

---

## 15. 开发约定

- TypeScript 严格模式，不使用 `any`
- API 返回统一走 zod schema
- 文件超过 300 行就拆
- 组件超过 150 行就拆
- 每个 implementation step 一个 commit
- commit 使用 Conventional Commits

推荐提交节奏：

- `feat: bootstrap next app and deepseek health check`
- `feat: add prisma schema and onboarding persistence models`
- `feat: implement bible prompt and offline validation script`
- `feat: add streaming bible api with incremental json parser`
- `feat: build onboarding wizard shell and mock steps`
- `feat: connect onboarding steps to session logline and question apis`
- `feat: render streaming bible cards in step 4`
- `feat: add bible review finalize flow and editor placeholder`
- `fix: harden onboarding error handling and retry flows`
- `docs: add setup guide env example and demo script`

---

## 16. 当前状态

当前仓库已经具备 Onboarding MVP 的端到端最小闭环：

- `/new` 5 步 Wizard
- Zustand + localStorage 持久化
- 创建 session、logline 推荐、反向追问、Bible SSE、finalize API
- DeepSeek client、token/耗时/成本日志、timeout 自动重试一次
- `partial-json` 增量解析与 Bible 解析失败占位回退
- Step 5 字段级编辑与保存/开写跳转
- `/editor/[novelId]` 占位页
- 内容审核 hook（当前 mock pass，可替换真实审核服务）

当前验证结果：

- `npm run typecheck` 通过
- `npm run test` 通过
- `npm run build` 通过
- `npm run smoke:onboarding` 可用于真实 API 主链路 smoke

仍可继续增强的部分：

- 增加更细的 UI 自动化测试
- 将内容审核 hook 替换为真实服务
- 进一步优化 Step 4 的卡片动效与加载阶段提示
