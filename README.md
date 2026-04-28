# AI Novel

基于 Next.js 15 + TypeScript + DeepSeek-V3 的 AI 写小说网站。当前仓库聚焦第一阶段 MVP：5 步 Onboarding 向导，让用户通过一句话灵感生成一份可用的小说 Bible 草稿，并继续保存或进入写作页。

## 当前目标

本轮只实现 Onboarding MVP 主链路：

1. Step 1：基础信息
2. Step 2：一句话灵感
3. Step 3：反向追问
4. Step 4：流式生成 Bible
5. Step 5：调整、保存或开始写

## 核心文档

- [AI小说网站技术实现方案 v1.0.md](./AI%E5%B0%8F%E8%AF%B4%E7%BD%91%E7%AB%99%E6%8A%80%E6%9C%AF%E5%AE%9E%E7%8E%B0%E6%96%B9%E6%A1%88%20v1.0.md)
- [Onboarding向导原型设计 v0.1.md](./Onboarding%E5%90%91%E5%AF%BC%E5%8E%9F%E5%9E%8B%E8%AE%BE%E8%AE%A1%20v0.1.md)
- [MVP任务规划表.md](./MVP%E4%BB%BB%E5%8A%A1%E8%A7%84%E5%88%92%E8%A1%A8.md)

## 技术栈

- Next.js 15 App Router
- TypeScript strict
- Tailwind CSS v4
- shadcn/ui
- Zustand
- Prisma + PostgreSQL
- DeepSeek-V3 (`deepseek-chat`)
- zod
- SSE + `ReadableStream`
- `partial-json`

## MVP 范围

### In Scope

- 5 步 Onboarding UI
- 5 个后端 API
- 3 个 Prompt 模板
- Bible 流式生成与增量解析
- Wizard 状态机与本地持久化
- 基础错误处理
- LLM token、耗时、成本日志
- README 与 Demo 脚本

### Out of Scope

- 鉴权 / 支付 / 计费
- 移动端适配
- i18n
- 正式内容审核
- 完整主编辑器
- Bible 之外的业务表

## 目标目录结构

```text
ai-novel/
├── app/
│   ├── (onboarding)/
│   │   ├── new/page.tsx
│   │   └── _components/
│   ├── api/onboarding/
│   │   ├── sessions/route.ts
│   │   ├── sessions/[id]/loglines/route.ts
│   │   ├── sessions/[id]/questions/route.ts
│   │   ├── sessions/[id]/bible/route.ts
│   │   └── sessions/[id]/finalize/route.ts
│   └── editor/[novelId]/page.tsx
├── lib/
│   ├── llm/
│   ├── stream/
│   ├── store/
│   └── validation/
├── prisma/schema.prisma
├── .env.example
└── README.md
```

## 环境变量

后续开发默认需要以下变量：

```env
DATABASE_URL=postgresql://...
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 实现顺序

1. 脚手架搭建 + DeepSeek 探活
2. Prisma + DB
3. Prompt 5.3 离线调试
4. API 7.4 SSE 流式 Bible
5. Wizard 骨架 + Step 1/2/3 Mock UI
6. Step 1/2/3 接真实 API
7. Step 4 接 SSE
8. Step 5 编辑 + 重摆 + 保存/开写
9. 错误处理矩阵
10. Demo 与 README 收尾

## 开发约束

- 流式调用 DeepSeek 时不带 `response_format: { type: "json_object" }`
- SSE 每 15 秒发送一次心跳
- `partial-json` 使用累积 buffer 节流解析
- 所有 API 入参与出参使用 zod 校验
- Zustand 状态使用 `persist`
- 所有 LLM 调用输出 token、耗时、成本日志

## 当前状态

当前仓库处于文档和规划阶段，代码实现将按 `MVP任务规划表.md` 逐步推进。
