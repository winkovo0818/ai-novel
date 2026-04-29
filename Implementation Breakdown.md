# AI 写小说网站 Onboarding MVP 执行拆分

## 说明

本文件是 `MVP任务规划表.md` 的执行层拆分版本，用于把里程碑级任务继续下钻成可直接实施、可单独验收、可单独提交的子任务。

拆分原则：

1. 每个子任务只解决一个明确问题
2. 每个子任务都要有可见产物
3. 每个子任务都能独立判断完成/未完成
4. 避免把实现、联调、容错、文档混在一个任务里

---

## Step 0 契约冻结

本 Step 的所有产物统一汇入 `docs/contracts.md`，**单文件单 PR**，不分散。

| 子任务 | 输入 | 输出（contracts.md 对应章节） | 完成判定 | 风险 |
| --- | --- | --- | --- | --- |
| 0.1 冻结 API 路径 | doc#2 §4/§7 | §2.1 路径表 | 全部 `/api/onboarding/sessions/...`，含错误码表 | 旧路径描述混淆 |
| 0.2 冻结 Bible schema | doc#2 §5.3 | §3 字段表 | 全英文 snake_case；`口头禅` → `catchphrase`；长度约束写死 | 中英文字段不一致 |
| 0.3 冻结 Wizard state shape | doc#2 §6 | §5 store 定义 | Step 1–5 字段齐全；明确哪些 persist | 后续组件反复改 store |
| 0.4 冻结 default profile | doc#1 Novel Profile | §4 NovelProfile 默认值 | 仅 9 个字段，其它全用默认 | profile 过大拖慢接口 |
| 0.5 冻结验收 fixture | doc#2 §3 玄幻例子 | §7 fixture + 质检 checklist | Step 3/4/6B/10 全用同一组 | 各阶段用不同样例 |
| 0.6 冻结数据库与启动方式 | 决策 D-01 | §1 + 后续 `.env.example` 注释 | 本地 PG 16 + Docker Compose 方案落定 | 实施时再改要返工 |
| 0.7 冻结匿名身份与重摆计数 | 决策 D-03/D-04 | §1 + §6 Prisma schema | `Novel.user_id` 可空；`OnboardingSession.regeneration_count` 字段 | 接鉴权后归属不清 |
| 0.8 冻结 partial-json 兜底与延迟口径 | 决策 D-05/D-06 | §1 + Step 4/9 风险表 | 失败回退路径明确；首字 P95 < 3s | 实施期反复调指标 |

建议 commit：`docs: freeze onboarding contracts (api/schema/profile/fixture/decisions)`

---

## Step 1 脚手架 + DeepSeek 探活

| 子任务 | 输入 | 输出 | 完成判定 | 风险 |
| --- | --- | --- | --- | --- |
| 1.1 初始化 Git 仓库 | 当前目录 | `.git/` | `git status` 正常 | 当前目录未初始化 |
| 1.2 创建 Next.js 15 脚手架 | 空项目根目录 | `app/`、配置文件 | `npm run dev` 可启动 | CLI 参数变化 |
| 1.3 安装基础依赖 | 技术栈约束 | `package.json` 依赖 | 安装成功 | Windows/npm 权限 |
| 1.4 建目标目录骨架 | 项目结构要求 | `lib/`、`app/api/` 等空目录 | 目录结构符合规划 | 过早放业务代码 |
| 1.5 补 `.env.example` | 环境变量清单 | `.env.example` | 变量完整 | 漏掉 base URL |
| 1.6 实现 LLM client | DeepSeek 协议 | `lib/llm/client.ts` | 支持 hello 调用 | SDK 兼容性 |
| 1.7 健康检查路由 | client | `/api/healthz/llm` | 返回成功 JSON | Node runtime 配置错误 |
| 1.8 日志格式验证 | healthz 调用 | 控制台日志样例 | 输出 req/resp/cost/took | usage 字段不稳定 |
| 1.9 vitest 基线 | 项目根 | `vitest.config.ts` + 一条空 spec 跑通 | `npm run test` 退出码 0 | 后续 Step 难以补单测 |

建议 commit：`feat: bootstrap app and add deepseek health check`

---

## Step 2 Prisma + DB

| 子任务 | 输入 | 输出 | 完成判定 | 风险 |
| --- | --- | --- | --- | --- |
| 2.1 确认数据库来源 | 本地 PG 或 Supabase | DB 连接方案 | `DATABASE_URL` 可用 | 环境没库可连 |
| 2.2 设计 3 张表字段 | doc#2 API 契约 | Prisma 模型草案 | `OnboardingSession`、`Novel`、`BibleDraft` 定稿 | 表字段过多 |
| 2.3 建 Prisma 基础配置 | DB URL | `schema.prisma` 初版 | `prisma validate` 通过 | provider 配错 |
| 2.4 生成迁移 | schema | `migrations/` | `prisma migrate dev` 成功 | 权限/连接失败 |
| 2.5 封装 Prisma client | Prisma 生成结果 | `lib/db.ts` | 服务端可 import | 热重载重复实例 |
| 2.6 做 CRUD smoke test | 三张表 | 测试脚本或临时 route | 增删改查都通 | JSON 字段映射问题 |

建议 commit：`feat: add prisma schema and onboarding persistence`

---

## Step 3 Prompt 5.3 离线调试

| 子任务 | 输入 | 输出 | 完成判定 | 风险 |
| --- | --- | --- | --- | --- |
| 3.1 定义 BibleDraft zod schema | 文档 5.3 | `BibleDraftSchema` | 能校验目标结构 | schema 与 prompt 不一致 |
| 3.2 写 Prompt 5.3 初版 | 文档硬规则 | `lib/llm/prompts/bible.ts` | 包含全部硬规则 | 漏规则 |
| 3.3 准备 5 条样例 logline | 验收案例 + 边界案例 | `scripts/fixtures/*.json` 或内嵌数据 | 样例覆盖玄幻/空 logline/保守情况 | 样例太单一 |
| 3.4 写离线调试脚本 | client + prompt | `scripts/test-bible-prompt.ts` | 可批量调用并落盘 `tmp/` | 输出目录管理混乱 |
| 3.5 做结构校验 | 脚本输出 | 校验结果日志 | 5 条都通过 zod | 输出非法 JSON |
| 3.6 做人工质量复核 | `tmp/*.json` | 质量结论记录 | 动机、反派、章节数、伏笔达标 | 只有结构正确、内容不行 |
| 3.7 修 Prompt 一轮 | 复核结果 | prompt v2 | 稳定度提升 | 反复调 prompt 耗时 |

建议 commit：`feat: implement bible prompt and offline validation`

---

## Step 4 SSE Bible API

| 子任务 | 输入 | 输出 | 完成判定 | 风险 |
| --- | --- | --- | --- | --- |
| 4.1 写 SSE 编码器 | SSE 规范 | `sseEncode.ts` | 可输出标准 event/data | 编码格式不标准 |
| 4.2 写 stream 上游封装 | DeepSeek stream | LLM stream helper | 能稳定收到 delta | SDK stream 结构不熟 |
| 4.3 写 chunk 聚合器 | delta 文本 | 累积 buffer | 能持续拼接文本 | 乱码/丢 chunk |
| 4.4 写增量 JSON 解析器 | buffer | `jsonStreamParser.ts` | 满足 200ms/256B 节流 | 解析频率过高 |
| 4.5 定义 path -> event 映射 | Bible schema | emit 规则 | `meta`、`character` 等全覆盖 | 事件粒度过粗 |
| 4.6 写 Bible route | API 契约 | `sessions/[id]/bible/route.ts` | Post 后可持续推流 | `ReadableStream` 生命周期 |
| 4.7 加 SSE 心跳 | route | 心跳注释行 | 15s 一次 | 中间层断连 |
| 4.8 加 stream 完成/异常收尾 | route | `done/error` 事件 | 异常时不悬挂连接 | abort 未处理 |
| 4.9 终端验证脚本 | curl/EventSource | 验证命令 | 能观察事件顺序 | 只测通路没测内容 |
| 4.10 partial-json 回归 | Step 3 产出的 5 条 Bible JSON | jsonStreamParser vitest 单测 | 5 条都能按节点 emit；中文字符不乱码 | partial-json 中文 corner case |
| 4.11 解析失败兜底 | 决策 D-05 | 全文 `JSON.parse` 重试 + `error` 事件路径 | 故意喂入残缺 JSON 不卡死 | 半成品 Bible 污染 store |

建议 commit：`feat: add streaming bible api with incremental parser`

---

## Step 5 Wizard 骨架 + Mock UI

| 子任务 | 输入 | 输出 | 完成判定 | 风险 |
| --- | --- | --- | --- | --- |
| 5.1 建 `/new` 页面路由 | 目录结构 | `new/page.tsx` | 可访问 | 路由分组放错 |
| 5.2 建 StepShell | 线框稿 | 公共骨架组件 | 顶栏/卡片/按钮区域稳定 | 后续每步重复写布局 |
| 5.3 建 ProgressDots | 步骤定义 | 进度组件 | 1–5 步显示正确 | 状态映射错 |
| 5.4 建 Wizard store 基础版 | 状态 shape | `wizardStore.ts` | step/inputs/error 可读写 | persist 结构不稳 |
| 5.5 接 persist | store | localStorage 持久化 | 刷新后状态保留 | hydration 问题 |
| 5.6 Step1 mock | 线框+校验 | `Step1Basic.tsx` | 类型/子类型交互可用 | 枚举先写死后难改 |
| 5.7 Step2 mock | 线框+交互 | `Step2Logline.tsx` | 输入/跳过/推荐卡片可用 | 状态分支复杂 |
| 5.8 Step3 mock | 题目样例 | `Step3Questions.tsx` | 单选/多选/自定义可用 | 自定义值并入答案结构 |
| 5.9 页面切换编排 | 3 个 step 组件 | `new/page.tsx` 完整流转 | mock 下能走到 Step 4 | 步骤切换逻辑分散 |

建议 commit：`feat: build onboarding wizard shell and mock steps`

---

## Step 6A 后端 API + Prompt（7.1 / 7.2 / 7.3）

> Question schema 已在 contracts §5 冻结，本 Step 不再重复定稿。

| 子任务 | 输入 | 输出 | 完成判定 | 风险 |
| --- | --- | --- | --- | --- |
| 6A.1 创建会话 API | Step1 输入 | `sessions/route.ts` | 返回 `sessionId` 与 `defaultProfile` | profile 字段漂移 |
| 6A.2 Logline prompt | 文档 5.1 | `prompts/logline.ts` | 满足 5 条约束 | 5 条变体不明显 |
| 6A.3 Logline API | `sessionId` | `loglines/route.ts` | 返回 5 条推荐；`regenerate` 计数累加 | 计数与服务端不同步 |
| 6A.4 Questions prompt | 文档 5.2 | `prompts/questions.ts` | 含 `recommended_index` | 多选推荐规则 |
| 6A.5 Questions API | `logline` | `questions/route.ts` | 返回 3–5 题，全部通过 zod | 输出结构漂移 |

建议 commit：`feat: implement onboarding session and ai recommendation apis`

---

## Step 6B 前端联调（替换 mock）

| 子任务 | 输入 | 输出 | 完成判定 | 风险 |
| --- | --- | --- | --- | --- |
| 6B.1 Step1 接真实 session | 前端 store | session 建立流程 | 首次进入后有 `sessionId`；刷新仍在 | 状态与 session 同步 |
| 6B.2 Step2 接真实 loglines | API 7.2 | UI 推荐替换 mock | 可「再来 5 个」；loading 态正确 | 请求中状态 |
| 6B.3 Step3 接真实 questions | API 7.3 | UI 题目替换 mock | 可正常渲染推荐项；自定义值入 answers | 自定义值兼容 |
| 6B.4 玄幻 fixture 回归 | contracts §7 | 跑完 Step1–3 的测试记录 | 能走到 Step 4 前；answers 完整 | 联调时状态错位 |

建议 commit：`feat: connect onboarding wizard steps to real apis`

---

## Step 7 Step 4 接 SSE

| 子任务 | 输入 | 输出 | 完成判定 | 风险 |
| --- | --- | --- | --- | --- |
| 7.1 Step4 页面骨架 | 线框稿 | `Step4Generating.tsx` | 有占位与状态槽位 | 渲染结构过早耦合 |
| 7.2 建 SSE 客户端消费层 | API 7.4 | fetch stream 消费逻辑 | 能接收事件流 | `EventSource` 不支持 POST |
| 7.3 建 partial draft merge 逻辑 | 分段 payload | store 合并器 | 局部数据可累计成草稿 | merge 覆盖错误 |
| 7.4 建卡片数据映射 | `BibleDraft` partial | `BibleCard` 所需 props | 每类卡片可独立出现 | path 粒度不一致 |
| 7.5 加逐张浮现动效 | 事件到 UI | 动画进入效果 | 不是一次性出现 | 动画与状态竞争 |
| 7.6 加 loading/进度提示 | stream 状态 | 阶段提示文案 | 用户知道生成到哪 | 进度假死 |
| 7.7 `done` 后自动跳 Step5 | stream `done` | 页面流转 | 生成完成后进入 review | `done` 过早触发 |
| 7.8 首字时延验证 | 手测 | 测试记录 | 8 秒内首字出现 | 首包太晚 |

建议 commit：`feat: render streaming bible cards in step 4`

---

## Step 8 Step 5 Review + Finalize

| 子任务 | 输入 | 输出 | 完成判定 | 风险 |
| --- | --- | --- | --- | --- |
| 8.1 Step5 页面骨架 | 线框稿 | `Step5Review.tsx` | 卡片总览能渲染 | 草稿结构过深 |
| 8.2 局部编辑模型 | `BibleDraft` | 编辑态与保存态转换 | 可改标题/角色/世界观 | 深层更新麻烦 |
| 8.3 重摆计数 | store | `regenerationCount` 生效 | 计数可追踪 | 跨刷新是否保留 |
| 8.4 重摆调用 | Step4 API | 保留前置输入重新生成 | 可回到 Step4 | 草稿旧数据残留 |
| 8.5 第 4 次限制提示 | 验收规则 | 弹窗/提示组件 | 第 4 次被拦截 | 计数边界 |
| 8.6 Finalize API | `bibleDraft + action` | `finalize/route.ts` | 能创建 `Novel`/`BibleDraft` | 数据表关系错误 |
| 8.7 保存草稿流程 | `action=save_only` | 留在总览或返回链接 | 保存成功 | 路径返回不清晰 |
| 8.8 开始写流程 | `action=start_writing` | `/editor/[novelId]` 占位页 | 能跳转 | `novelId` 生成时机 |
| 8.9 编辑器占位页 | `novelId` | `editor/[novelId]/page.tsx` | 页面可访问 | 过早引入编辑器逻辑 |

建议 commit：`feat: add bible review finalize flow and editor placeholder`

---

## Step 9 错误处理矩阵

| 子任务 | 输入 | 输出 | 完成判定 | 风险 |
| --- | --- | --- | --- | --- |
| 9.1 LLM timeout 包装 | 所有 LLM 调用 | 超时控制 | 15s 超时可触发重试 | 重试重复写入 |
| 9.2 非流式 JSON 校验失败 | 5.1/5.2 接口 | fallback 错误响应 | 用户可重试 | 错误信息过底层 |
| 9.3 流式 JSON 失败回退 | API 7.4 | 错误事件或占位 Bible | Step4 不白屏 | 半成品草稿污染 |
| 9.4 网络中断 UI 恢复 | Step4 前端 | retry 逻辑 | 断网恢复后可重试 | fetch stream 中断状态不清 |
| 9.5 用户跳过路径补齐 | 空 `logline` / 跳过追问 | 最低可用流程 | 仍可到 Step5 | fallback 模板未准备 |
| 9.6 内容审核 hook | 保存/生成点 | mock pass hook | 代码边界清晰 | 后续难替换 |
| 9.7 统一错误展示 | 全部 step | 错误文案与按钮策略 | 不同失败路径表现一致 | 各组件自己管错误 |

建议 commit：`fix: harden onboarding error handling and retry flows`

---

## Step 10 工程质量 + 文档

| 子任务 | 输入 | 输出 | 完成判定 | 风险 |
| --- | --- | --- | --- | --- |
| 10.1 ESLint 规则确认 | Next 默认配置 | lint 配置 | 无额外冲突 | 规则过严影响推进 |
| 10.2 Prettier 配置 | 项目代码 | prettier 配置 | 格式统一 | 与 eslint 冲突 |
| 10.3 提交前检查 | lint/format | husky/lint-staged 或等价方案 | 提交前自动执行 | Windows hook 兼容 |
| 10.4 `.env.example` 终稿 | 实际依赖 | 完整变量清单 | README 可引用 | 漏变量 |
| 10.5 README 启动说明 | 完整项目 | 启动 3 步 | 新人可跑起来 | 文档滞后代码 |
| 10.6 Demo 脚本 | 玄幻例子 | 录屏步骤 | 可重复演示 | 脚本与当前 UI 偏离 |
| 10.7 Build 与 lint 总验收 | 全项目 | 最终结果记录 | 0 type error 0 eslint error | 临门一脚爆类型问题 |

建议 commit：`docs: finalize setup guide demo script and quality gates`

---

## 建议使用方式

1. `MVP任务规划表.md` 继续作为里程碑层总控文档
2. 本文档作为执行层，按 Step 和子任务逐项推进
3. 真正开始开发时，可以再从本文档中截取 Step 0–4 形成首周执行清单
