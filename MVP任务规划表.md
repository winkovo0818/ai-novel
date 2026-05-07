# AI 写小说网站 Onboarding MVP 任务规划表

## 一、项目目标

> 当前状态（2026-05-07）：Onboarding MVP 端到端闭环已实现。`/new` 可创建 session、生成 logline/追问、通过 SSE 生成 Bible、在 Step 5 审阅编辑并 finalize 到 `/editor/[novelId]` 占位页。已补 `LLM_MOCK`、API smoke 脚本和 Playwright e2e 基线；真实 smoke 仍依赖可用 PostgreSQL 与 DeepSeek key。

在现有整体产品方案基础上，优先落地用户入口体验：一个 5 步 Onboarding 向导，让用户只用 1–2 句话灵感，即可在 3 分钟内拿到一份可用的小说 Bible 草稿，并能继续保存或进入写作。

本轮目标不是做完整写作平台，而是先把以下闭环打通：

1. 用户进入 `/new`
2. 完成 Step 1–5
3. 后端通过 DeepSeek-V3 生成 Bible 草稿
4. 前端以 SSE 流式方式逐步展示生成结果
5. 用户可调整、重摆、保存草稿或进入编辑器占位页

---

## 二、本轮范围

### In Scope

- 5 步 Onboarding 向导 UI
- 5 个后端 API
- 3 个 Prompt 模板
- DeepSeek-V3 调用封装
- Bible 生成的 SSE 流式输出
- `partial-json` 增量解析
- Zustand Wizard 状态机与本地持久化
- 基础错误处理
- LLM token 用量与耗时日志
- README 与 Demo 脚本

### Out of Scope

- 鉴权 / 支付 / 计费
- 移动端适配
- i18n
- 正式内容审核接入
- 主编辑器完整能力
- Bible 之外的业务表

---

## 三、技术基线

| 模块 | 选型 |
| --- | --- |
| Framework | Next.js 15 + App Router + TypeScript strict |
| UI | Tailwind v4 + shadcn/ui + lucide-react |
| State | Zustand |
| API | Next.js Route Handlers |
| Stream | SSE + `ReadableStream` + Node runtime |
| DB | PostgreSQL + Prisma |
| DB 部署 | 本地 PostgreSQL 16 + Docker Compose（决策 D-01） |
| LLM | DeepSeek-V3 (`https://api.deepseek.com/v1`, model=`deepseek-chat`) |
| Validation | zod |
| JSON 增量解析 | `partial-json`（决策 D-05 含兜底策略） |
| Test | vitest（决策 D-07） |
| Lint/Format | eslint + prettier |

---

## 四、优先级定义

| 优先级 | 含义 |
| --- | --- |
| P0 | 阻塞项目成立，必须最先完成 |
| P1 | MVP 核心闭环，缺一不可 |
| P2 | 稳定性与体验优化，直接影响验收 |
| P3 | 文档、录屏、交付收尾 |

---

## 五、关键约束与实现原则

1. 流式调用 DeepSeek 时，不开启 `response_format: { type: "json_object" }`
2. 非流式调用统一使用 `response_format: { type: "json_object" }`
3. SSE 必须带 15 秒心跳，避免中间层断连
4. `partial-json` 采用累积 buffer 节流解析，不可每 chunk 全量 parse
5. Prompt 5.3 必须完整包含硬规则
6. 所有 API 入参与出参都必须经过 zod 校验
7. Zustand 使用 `persist`，刷新页面后 Step 与输入不丢
8. 所有 LLM 调用结束后打印 token、耗时、成本
9. 文件超过 300 行要拆，组件超过 150 行要拆
10. 每个 Implementation Step 一个 commit，使用 Conventional Commits
11. `lib/llm/client.ts`、`lib/stream/jsonStreamParser.ts`、`lib/validation/schemas.ts` 必须各有一组 vitest 单测（决策 D-07）
12. 首字延迟目标 P95 < 3s，Bible 总耗时 P95 < 10s（决策 D-06）
13. 匿名身份用 cookie sessionId，`Novel.user_id` 允许为空（决策 D-03）；重摆计数存服务端（决策 D-04）

---

## 六、任务规划表

| 优先级 | 阶段 | 任务 | 目标 | 主要产物 | 依赖 | 验收标准 |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | 0. 契约冻结 | 产出 `docs/contracts.md` | 所有后续 Step 仅引用本文档，避免按过期文档返工 | `docs/contracts.md`（决策记录、API 路径、Bible schema、store shape、profile、fixture、Prompt 硬规则） | 两份产品文档 | `docs/contracts.md` §1–§10 全部完成且通过 review |
| P0 | 1. 工程初始化 | 创建 Next.js 15 项目 | 建立可运行、可构建工程 | `app/`、`package.json`、`tsconfig.json`、ESLint/Tailwind 配置 | 无 | `npm run dev`、`npm run build` 可运行 |
| P0 | 1. DeepSeek 探活 | 封装 LLM 客户端并打通健康检查 | 证明模型链路可用 | `lib/llm/client.ts`、`app/api/healthz/llm/route.ts`、`.env.example` | 工程初始化 | `/api/healthz/llm` 返回成功；控制台打印 token 与耗时 |
| P0 | 2. Prisma + DB | 建立三张 MVP 表 | 打通会话、小说、Bible 草稿持久化 | `prisma/schema.prisma`、迁移文件、Prisma client | 工程初始化 | `prisma migrate dev` 成功；基础 CRUD 跑通 |
| P1 | 3. 数据 schema | 定义核心 zod schema | 建立前后端统一类型边界 | `lib/validation/schemas.ts` | DB、文档约定 | `Question`、`BibleDraft`、API schema 全部可校验 |
| P1 | 3. Prompt 5.3 | 实现 Bible 生成 Prompt | 固化核心生成逻辑 | `lib/llm/prompts/bible.ts` | LLM client、schema | 覆盖全部硬规则 |
| P1 | 3. Bible 离线调试 | 先验证生成质量与 JSON 稳定性 | 避免 UI 做完后才发现生成不稳 | `scripts/test-bible-prompt.ts`、`tmp/*.json` | Prompt 5.3 | 5 条示例 logline 输出有效 JSON |
| P1 | 4. SSE 工具层 | 实现 SSE 编码与心跳 | 为流式 API 提供统一封装 | `lib/stream/sseEncode.ts` | 无 | 支持标准 SSE 事件与 15s 心跳 |
| P1 | 4. JSON 增量解析器 | 包装 `partial-json` | 支持按 key 路径 emit | `lib/stream/jsonStreamParser.ts` | schema | 满足 `>=200ms` 或 `>=256B` 触发解析 |
| P1 | 4. API 7.4 | 实现 Bible 流式生成接口 | 建立最核心后端能力 | `app/api/onboarding/sessions/[id]/bible/route.ts` | LLM、DB、SSE、解析器 | `curl`/EventSource 可观察到事件流 |
| P1 | 5. Wizard 骨架 | 搭建 `/new` 与步骤壳子 | 为 5 步流程提供 UI 容器 | `new/page.tsx`、`ProgressDots.tsx`、`StepShell.tsx` | 工程初始化 | `/new` 可访问，步骤切换正常 |
| P1 | 5. 状态机 | Zustand + persist | 统一管理 Step、输入、错误态 | `lib/store/wizardStore.ts` | Wizard 骨架 | 刷新后 Step 和输入不丢 |
| P1 | 5. Step 1 UI | 基础信息页 | 完成标题、类型、子类型输入 | `Step1Basic.tsx` | 状态机 | 表单校验与交互符合原型 |
| P1 | 5. Step 2 UI | 一句话灵感页 | 支持输入、AI 推荐入口、跳过 | `Step2Logline.tsx` | 状态机 | mock 下可进入下一步或跳过 |
| P1 | 5. Step 3 UI | 反向追问页 | 支持单选、多选、自定义与推荐项 | `Step3Questions.tsx` | 状态机 | mock 下可答题并推进 |
| P1 | 6A. API 7.1 | 创建会话 | 保存基础信息与默认 profile | `app/api/onboarding/sessions/route.ts` | DB、schema | 返回 `{ sessionId, defaultProfile }` |
| P1 | 6A. Prompt 5.1 + API 7.2 | logline 推荐 | 生成 5 个推荐 logline | `prompts/logline.ts`、`sessions/[id]/loglines/route.ts` | LLM、session | 返回 5 条有效推荐 |
| P1 | 6A. Prompt 5.2 + API 7.3 | 反向追问生成 | 生成 3–5 道问题 | `prompts/questions.ts`、`sessions/[id]/questions/route.ts` | LLM、session | 返回含 `recommended_index` 的问题列表 |
| P1 | 6B. 前端接真实 API | 替换 mock 数据 | 让 Step 1–3 走真实后端 | Step1/2/3 组件更新 | 6A 全部 | 玄幻 fixture（contracts §7）可生成问题 |
| P1 | 7. Step 4 UI | 接入 SSE 流式结果 | 卡片逐张浮现，而不是一次性渲染 | `Step4Generating.tsx`、`BibleCard.tsx`、`CostBadge.tsx` | SSE API、状态机 | 8 秒内首字出现 |
| P1 | 8. Step 5 UI | Bible Review 与编辑 | 支持编辑、重摆、保存、开写 | `Step5Review.tsx` | Step 4、状态机 | 草稿可编辑，按钮动作完整 |
| P1 | 8. API 7.5 | 提交创建项目 | 保存 Novel 与 BibleDraft，跳转编辑器 | `finalize/route.ts`、`editor/[novelId]/page.tsx` | DB、Step 5 | `save_only` 与 `start_writing` 都能走通 |
| P2 | 9. 重摆限制 | 限制重摆次数 ≤ 3 | 控制成本并满足验收 | store/API 计数逻辑、提示框 | Step 5 | 第 4 次点击出现提示 |
| P2 | 9. 超时与重试 | LLM 调用失败兜底 | 避免偶发错误直接打断流程 | LLM wrapper、API retry | 所有 LLM API | 15s 超时后自动重试 1 次 |
| P2 | 9. JSON 解析失败回退 | 保证 Step 4 不白屏 | 支持失败后的结构化错误与占位回退 | parser/API fallback | SSE API | 解析失败不会导致流程中断 |
| P2 | 9. 网络中断恢复 | 支持 Step 4 断网后重试 | 满足验收项 | 前端错误态与 retry 流程 | Step 4 | 断网报错后可重试恢复 |
| P2 | 9. 成本与日志 | 统一打印 req/resp/cost/took | 满足成本可见要求 | `lib/llm/client.ts` | 所有 LLM 调用 | 日志格式统一 |
| P2 | 9. 内容审核 hook | 预留未来审核接入点 | 本轮 mock pass，但边界清晰 | moderation stub / hook | finalize、bible | 默认通过，可替换实现 |
| P2 | 10. 工程质量 | ESLint + Prettier + 提交前自动跑 | 保证交付质量 | lint/format/hook 配置 | 主功能基本完成 | `npm run build` 0 type error 0 eslint error |
| P3 | 11. README | 启动说明与环境变量文档 | 降低接手与自测成本 | `README.md`、`.env.example` | 主功能完成 | 含启动 3 步与变量列表 |
| P3 | 11. Demo 脚本 | 固化演示流程 | 便于录屏与验收 | README demo section | 主功能完成 | 可按脚本跑完玄幻案例 |
| P3 | 12. 最终验收 | 对照清单逐项自测 | 形成可交付版本 | 自测记录 | 全部任务 | 验收项全部覆盖 |

---

## 七、推荐执行顺序

| 顺序 | 目标 | 对应任务 |
| --- | --- | --- |
| 1 | 先证明技术链路成立 | 工程初始化 + DeepSeek 探活 |
| 2 | 先证明数据能落库 | Prisma + 三张表 |
| 3 | 先攻最难质量点 | Prompt 5.3 + 离线调试 |
| 4 | 再攻最难技术点 | SSE + `partial-json` |
| 5 | 先把用户入口体验搭起来 | Wizard 骨架 + mock UI |
| 6 | 再替换成真实后端 | API 7.1–7.5 + 前端联调 |
| 7 | 最后补稳定性与交付材料 | 错误处理 + README + Demo |

---

## 八、关键里程碑

| 里程碑 | 完成标志 |
| --- | --- |
| M0 | `docs/contracts.md` §1–§10 冻结，所有决策 D-01 ~ D-08 入档 |
| M1 | `/api/healthz/llm` 可成功调用 DeepSeek |
| M2 | Prisma 迁移成功，三张表 CRUD 跑通 |
| M3 | 5 条示例 logline 稳定生成有效 Bible JSON |
| M4 | Bible SSE API 可在终端观察到稳定事件流 |
| M5 | `/new` 静态 5 步流程可走完 |
| M6 | 真实 API 驱动下的 Onboarding 主链路可走完 |
| M7 | 错误处理、重试、重摆限制全部通过 |
| M8 | `npm run build` 通过，README 与 Demo 完整 |

---

## 九、验收清单映射

| 验收项 | 对应任务 |
| --- | --- |
| `/new` 5 步全部能走通 | Wizard 骨架、状态机、Step1–5、API 联调 |
| 玄幻例子能成功跑出 Bible | Prompt 5.3、API 7.4、前端联调 |
| Step 4 在 8s 内首字出现 | SSE API、Step4 UI、流式解析 |
| 断网后报错并可重试恢复 | 网络中断恢复、错误处理矩阵 |
| 重摆第 4 次弹提示 | 重摆限制 |
| 控制台能看到 token 与耗时 | LLM client 日志 |
| `npm run build` 0 type error 0 eslint error | 工程质量、类型安全 |
| README 里有变量列表与启动 3 步 | README、`.env.example` |

---

## 十、风险与缓解

| 风险 | 影响 | 缓解策略 |
| --- | --- | --- |
| DeepSeek 流式 JSON 不稳定 | Step 4 卡住或解析失败 | 流式不使用 `response_format=json_object`，改为 prompt 强约束 + `partial-json` |
| Prompt 5.3 输出结构漂移 | Bible 草稿不可用 | 离线先跑 5 条样例，严格 zod 校验 |
| SSE 被中间层断开 | 生成半途失败 | 每 15s 发送心跳注释 |
| 生成耗时过长 | 影响用户体验 | 首字优先、流式分段、15s 超时重试 |
| 用户频繁重摆 | 成本失控 | 限制 `<=3` 次并提示调整 logline；计数存服务端（D-04）防绕过 |
| 类型不严导致前后端错位 | 构建失败或运行时错误 | 全链路 zod schema + strict TS |
| `partial-json` 解析失败 | Step 4 卡住或白屏 | 回退到全文 `JSON.parse` 重试一次，仍失败发 `error` 事件 + 占位 Bible（D-05） |
| 首字延迟口径不一致 | 验收争议 | 统一为 P95 < 3s 首字 / < 10s 总耗时（D-06） |
| 匿名身份与鉴权迁移 | 接鉴权后历史 Novel 归属不清 | `Novel.user_id` 允许空，迁移时按 cookie sessionId 关联（D-03） |

---

## 十一、建议提交节奏

| Step | 建议 commit |
| --- | --- |
| Step 1 | `feat: bootstrap next app and deepseek health check` |
| Step 2 | `feat: add prisma schema and onboarding persistence models` |
| Step 3 | `feat: implement bible prompt and offline validation script` |
| Step 4 | `feat: add streaming bible api with incremental json parser` |
| Step 5 | `feat: build onboarding wizard shell and mock steps` |
| Step 6 | `feat: connect onboarding steps to session logline and question apis` |
| Step 7 | `feat: render streaming bible cards in step 4` |
| Step 8 | `feat: add bible review finalize flow and editor placeholder` |
| Step 9 | `fix: harden onboarding error handling and retry flows` |
| Step 10 | `docs: add setup guide env example and demo script` |

---

## 十二、单步交付格式

后续每完成一个 Implementation Step，统一按以下格式汇报：

1. 本步做了什么
2. 文件清单
3. 关键实现选择
4. 可运行自测命令
5. commit 信息
6. 等待确认下一步
