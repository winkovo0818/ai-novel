# AI Novel — 当前任务状态与风险需求台账

> 更新时间：2026-05-10  
> 依据：当前工作区代码、`README.md`、`PROGRESS.md`、`AUDIT.md`、`TECHNICAL_PLAN.md`、`docs/contracts.md`、实际验证命令。  
> 当前结论：项目已具备可演示、可内部试用的 AI 小说写作 MVP；`typecheck`、Vitest、生产构建当前通过。但不应视为生产级上线完成。后续任务优先级按“先恢复 CI/lint 与交付状态、再安全成本硬边界、再长篇可靠性、最后体验产品化”排序。

---

## 一、状态定义

| 状态      | 含义                       |
|---------|--------------------------|
| ✅ 已完成   | 当前代码已实现，且已有基础验证或测试覆盖     |
| 🟡 部分完成 | 已有实现雏形，但覆盖、闭环、生产可用性或验证不足 |
| 🔴 待处理  | 尚未实现，或当前实现存在明确阻塞/风险      |
| ⚫ 暂缓    | 属于中长期完整产品范围，当前不建议优先投入    |

---

## 二、当前完成度总览

| 模块                | 当前状态    |  完成度估计 | 说明                                                                                       | 关键证据                                                                             |
|-------------------|---------|-------:|------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| Onboarding 5 步开书  | ✅ 已完成   | 80-88% | `/new`、session、logline、questions、Bible SSE、Review、Finalize 已形成闭环；跳过/直接开写/中断恢复仍需补         | `app/(app)/new/**`、`app/api/onboarding/**`、`docs/contracts.md`                   |
| 多章节编辑器 MVP        | ✅ 已完成   | 78-85% | 多章节、保存、AI 起草、删除、版本历史、自动保存、状态切换、Critic、State Diff、导出已实现                                   | `app/(app)/editor/[novelId]/**`、`app/api/chapters/**`                            |
| 账号与访问控制           | 🟡 部分完成 | 70-80% | Supabase Auth、middleware、ownership、admin-only 已有；RLS 已禁用，完全依赖应用层校验                       | `utils/supabase/**`、`lib/auth/**`、`prisma/migrations/20260508050000_disable_rls` |
| LLM 基础设施          | ✅ 已完成   | 78-85% | 统一 client、stream、mock、prompt、加密模型 key、用量表、成本日志均有；配额覆盖不完整                                 | `lib/llm/**`、`lib/stream/**`                                                     |
| 内容审核              | 🟡 部分完成 | 70-78% | 本地关键词+LLM 审核+`MODERATION_FAILURE_MODE` 策略化；Bible 编辑等少数路径仍缺审核                             | `lib/moderation/moderate.ts`、`app/api/chapters/[id]/route.ts`                    |
| 长篇记忆 L1/L2        | 🟡 部分完成 | 65-75% | Bible、Story State、章节摘要、卷摘要、全书摘要、state diff、级联刷新均已实现；dirty/hash 可靠性不足                     | `lib/agent/chapterContext.ts`、`lib/agent/summaries.ts`                           |
| RAG / MemoryChunk | 🟡 部分完成 | 60-70% | pgvector + HNSW 已引入；SQL 端检索与混合检索有实现；索引失败/后台任务/召回质量仍非生产级                                  | `lib/agent/retrieval.ts`、`lib/agent/chunking.ts`                                 |
| 多 Agent 协作        | 🟡 部分完成 | 55-65% | Writer、Critic、StateUpdater、Outline(BeatSheet) 均有契约+prompt+路由；自动修订/回炉和编排可靠性未完成            | `lib/agent/contracts.ts`、`lib/llm/prompts/**`                                    |
| 工程验证              | ✅ 已完成   | 80-85% | `lint`、`typecheck`、Vitest、`build` 当前通过；`verify` 已覆盖四者                                    | `package.json`、`next.config.ts`                                                  |
| CI/CD             | 🟡 部分完成 | 65-75% | `.github/workflows/ci.yml` 已恢复 lint/typecheck/test/build；E2E 仍未进 CI，coverage 仅本地可见未入质量门禁 | `.github/workflows/ci.yml`                                                       |
| 产品化能力             | 🟡 部分完成 | 45-55% | 已有 Markdown/TXT 导出和用量表；缺候选稿、写作工具、生产限流、低噪声 UI、后台任务                                        | `design.md`、`AUDIT.md`                                                           |

---

## 三、已完成任务归档

| 状态 | 编号 | 任务 | 当前说明 | 后续注意 |
|---|---:|---|---|---|
| ✅ | D-01 | Onboarding 5 步主流程 | 创建 session、logline、questions、Bible SSE、Step5 Review、Finalize 已实现 | 继续补 Step4 中断恢复和重复 finalize 幂等 |
| ✅ | D-02 | SSE 与 partial JSON 解析 | Bible 生成和章节起草均采用 SSE；Bible partial parser 有测试 | 客户端 SSE parser 仍有重复实现和边界能力不足 |
| ✅ | D-03 | Supabase 登录注册基础链路 | `/login`、`/signup`、密码重置、auth callback、logout 已有 | 需要 E2E 覆盖登录/注册/重置最小链路 |
| ✅ | D-04 | 应用层 ownership | 主要 Novel/Chapter/API/SSR 页面已接入 `canAccessOwnerResource` | RLS 禁用后必须持续补全负向测试 |
| ✅ | D-05 | 多章节编辑器 | 多章节加载、切换、保存、AI 起草、状态切换已实现 | 需要更强写作工具和候选稿/差异保存能力 |
| ✅ | D-06 | 章节删除 | `DELETE /api/chapters/[id]` 已实现 | 编辑器主路径已改用 `ConfirmDialog`；其余页面仍需统一危险操作确认 |
| ✅ | D-07 | 章节版本历史 | `ChapterVersion`、hash 去重、50 条上限、版本列表 UI 已有 | 版本恢复 API 尚未实现 |
| ✅ | D-08 | Autosave 与版本历史解耦 | `source=autosave/manual/ai/status_change` 已区分 | 需要事务化保护更新和版本写入一致性 |
| ✅ | D-09 | 一致性检查 | `POST /api/novels/[id]/consistency` 和编辑器入口已接入 | 当前更多是手动审计，不是自动闭环 |
| ✅ | D-10 | Bible 编辑器 | `PATCH /api/novels/[id]/bible` 与 `BibleEditorPanel` 已有 | 保存 Bible 缺内容审核和更细粒度编辑体验 |
| ✅ | D-11 | State Diff v1 | `POST /api/chapters/[id]/state-diff`、前端确认、回写 Bible 已实现 | `new_entities` 合并能力不完整 |
| ✅ | D-12 | Critic v1 | 起草后自动审校，critical/major 冲突阻止静默保存 | 尚未实现自动修订/回炉策略 |
| ✅ | D-13 | Chapter Context Builder | `buildChapterContext()` 统一组装 Bible、摘要、story_state、retrievedMemories | RAG 检索结果质量仍需提升 |
| ✅ | D-14 | 分层摘要 v1 | `VolumeSummary`、`NovelSummary`、最近 5 章摘要策略已有 | dirty 检测较粗，章节改稿后级联刷新不足 |
| ✅ | D-15 | MemoryChunk 雏形 | 表结构、chunking、embedding、retrieval 已有 | 需要 pgvector/索引/rerank 才能支撑规模 |
| ✅ | D-16 | Admin-only 模型配置 | `/models` 与 `/api/llm-models/**` 已接入 admin guard | 后续重点转向设置页体验与操作确认统一，而非权限缺口 |
| ✅ | D-17 | API 限流雏形 | `lib/auth/rateLimit.ts` 已覆盖部分高成本路由 | 内存 Map 不适合生产，多实例无效 |
| ✅ | D-18 | Vitest 基础覆盖 | 当前 46 个测试文件、289 个测试通过 | coverage 已配置但未进入 CI 质量门禁；E2E 仍未进入 CI |

---

## 四、P0 阻塞任务：先恢复可交付工程状态

| 状态 | 编号 | 风险需求 / 任务 | 风险说明 | 技术实现方案 | 验收标准 | 关键文件 |
|---|---:|---|---|---|---|---|
| ✅ | P0-01 | 修复当前 `typecheck/build` 失败 | 当前实测 `npm run lint`、`npm run typecheck`、`npm run test`、`npm run build` 均通过；`npm run verify` 已覆盖四者 | 保持依赖锁定和构建环境稳定；下一步把 E2E 逐步纳入质量门禁 | `npm run lint`、`npm run typecheck`、`npm run test`、`npm run build` 通过 | `package.json`、`package-lock.json`、`next.config.ts` |
| ✅ | P0-02 | 替换废弃的 `next lint` | `package.json` 已改为 `eslint .`；CI 已纳入 lint job；当前 `npm run lint` 通过 | `npm run lint` 通过；CI 执行 lint | `package.json`、`eslint.config.mjs`、`.github/workflows/ci.yml` |
| ✅ | P0-03 | 恢复并增强 CI 工作流 | `.github/workflows/ci.yml` 已包含 typecheck/lint/test/build；E2E 仍未进 CI（Q-03） | PR 上 CI 自动运行且失败会阻断合并 | `.github/workflows/ci.yml` |
| 🟡 | P0-04 | 清理工作区未跟踪关键文件状态 | 当前仅 `package.json` / `package-lock.json` 仍有本地修改；源码、测试、迁移、CI 已基本跟踪 | `git status --short` 中只保留预期文档或依赖变更；关键功能文件均被追踪 | — |

---

## 五、P0/P1 安全与成本风险任务

| 状态 | 编号 | 风险需求 / 任务 | 风险说明 | 技术实现方案 | 验收标准 | 关键文件 |
|---|---:|---|---|---|---|---|
| ✅ | S-01 | 保护 `/api/healthz/llm` | 当前该接口属于 public path，未登录即可真实调用 LLM，可能被刷成本 | 方案 A：改为 admin-only；方案 B：拆分 `/api/healthz` 基础探针与 `/api/healthz/llm` 深度探针，深度探针要求 admin 或内部 header；同时加限流 | 未登录访问 `/api/healthz/llm` 返回 401/403；公开 `/api/healthz` 不调用 LLM | `app/api/healthz/llm/route.ts`、`utils/supabase/middleware.ts`、`lib/auth/admin.ts` |
| ✅ | S-02 | LLM API key 加密存储与脱敏返回 | `LlmModel.api_key` 明文存储，GET/POST/PATCH 返回完整 row，admin 浏览器侧也能看到密钥 | 1. 新增 `MODEL_KEY_ENCRYPTION_SECRET`；2. 用 Node `crypto` AES-GCM 加密 api_key；3. DB 字段可继续叫 `api_key` 或迁移为 `api_key_encrypted`；4. API 返回 `api_key_masked`，不返回原文；5. 更新 LLM client 解密使用；6. 加单测覆盖创建、更新空 key、不泄露 key | API 响应不含明文 key；数据库不存明文；LLM 调用仍可读取并解密 | `prisma/schema.prisma`、`app/api/llm-models/**`、`lib/llm/client.ts` |
| ✅ | S-03 | 模型配置输入校验和 SSRF 防护 | admin 可配置 `base_url`，随后服务端 fetch；若被滥用可访问内网地址 | 1. 为 LLM model 新增 Zod schema；2. 校验 URL scheme 仅允许 `https:`，开发环境可允许 `http://localhost`；3. 增加 provider allowlist；4. 禁止私网 IP、metadata IP、file 协议；5. 保存前 normalize URL | 非法 URL 返回 400；私网地址被拒绝；测试覆盖 | `app/api/llm-models/**`、`lib/validation/schemas.ts`、`lib/llm/client.ts` |
| ✅ | S-04 | 生产级限流 | 当前限流是进程内 `Map`，多实例、serverless、重启均失效，不能控制成本 | 1. 抽象 `RateLimiter` 接口；2. 本地保留 memory 实现；3. 生产使用 Redis/Upstash/Supabase RPC；4. key 维度包含 userId + route + IP；5. 高成本路由设置更低额度；6. 响应增加 `Retry-After` | 多实例共享限流；LLM 路由超过额度返回 429；有单测和集成测试 | `lib/auth/rateLimit.ts`、所有 LLM API route |
| ✅ | S-05 | 内容审核从 fail-open 改成策略化 | `moderateContent()` 调 LLM 审核失败时返回 allowed，公网场景风险高 | 1. 引入 `MODERATION_FAILURE_MODE=allow|block|review`；2. 默认生产 `block` 或 `review`；3. 本地关键词永远强阻断；4. 保存、起草输入、起草输出、Bible 编辑、导出前统一调用；5. 日志记录审核失败原因 | 生产审核服务失败不会默认放行；关键路径都有审核覆盖 | `lib/moderation/moderate.ts`、`app/api/chapters/[id]/route.ts`、`app/api/novels/[id]/bible/route.ts` |
| ✅ | S-06 | RLS 禁用后的 ownership 负向测试补齐 | 当前隔离完全靠应用层；任一路由漏校验都会越权 | 1. 列出所有 owner-scoped API；2. 为每个 API 补 401/403/404 负向测试；3. 新增 helper 降低 route 测试重复；4. CI 强制跑测试 | 用户 B 无法访问用户 A 的 novel/chapter/session/model；测试覆盖所有关键路由 | `lib/auth/ownership.ts`、`app/api/**/route.test.ts` |
| ✅ | S-07 | owner 为空资源访问策略收紧 | `canAccessOwnerResource(null, userId)` 允许任意登录用户访问 legacy/anonymous 资源，长期会扩大访问面 | 1. 只允许 onboarding session claim 流程访问 owner 为空资源；2. Novel/Chapter owner 为空需先 claim 或迁移；3. 新增迁移脚本把历史匿名资源绑定到创建者或标记不可访问；4. 改 `canAccessOwnerResource` 默认拒绝空 owner，另建 `canClaimAnonymousResource` | 普通用户不能直接访问 owner 为空的正式 Novel/Chapter；claim 路径单独受控 | `lib/auth/ownership.ts`、`lib/auth/onboardingAccess.ts`、`app/api/novels/**` |

---

## 六、P1 长篇写作闭环任务

| 状态 | 编号 | 风险需求 / 任务 | 风险说明 | 技术实现方案 | 验收标准 | 关键文件 |
|---|---:|---|---|---|---|---|
| ✅ | L-01 | State Diff 自动闭环 | 当前 state diff 需要用户手动触发，章节完成后状态不一定回写 | 1. 在标记 done 后提示生成 state diff；2. 后台生成 diff，前端展示待确认卡片；3. 用户确认后合并回 Bible；4. 拒绝时记录原因；5. 避免自动无确认覆盖 Bible | 完成章节后能稳定看到状态更新建议；确认后下一章 prompt 使用新状态 | `app/api/chapters/[id]/state-diff/route.ts`、`StateDiffPanel.tsx`、`useChapterEditor.ts` |
| ✅ | L-02 | `new_entities` 合并能力 | `StateDiffSchema` 有 `new_entities`，但合并逻辑不完整，新角色/地点/物品无法进入 Bible | 1. 扩展 `applyStateDiff()`；2. 新角色写入 characters 或 pending registry；3. 新地点/物品/规则写入 world 或 story_state extensions；4. 前端展示“登记新设定”确认项 | LLM 检测的新角色/地点可被用户确认登记；有 merge 单测 | `lib/validation/stateDiffMerge.ts`、`lib/validation/schemas.ts` |
| ✅ | L-03 | 章节改稿后的摘要/状态级联刷新 | 用户修改旧章节后，卷摘要、全书摘要、MemoryChunk、Story State 可能过期 | 1. 为 ChapterDraft 增加 `content_hash` 或 `last_indexed_hash`；2. 保存后标记 summary/index dirty；3. 增加 `/summaries/refresh` 后台任务；4. 用户打开编辑器时提示“记忆需刷新”；5. 长期接任务队列 | 修改旧章节后，摘要和索引能重新生成，不会继续使用旧记忆 | `lib/agent/summaries.ts`、`app/api/novels/[id]/summaries/refresh`、`lib/agent/chunking.ts` |
| ✅ | L-04 | RAG 从应用层全量扫描升级 | 当前 `retrieveMemories()` 拉取小说所有 chunks 后在应用层过滤，章节多后不可用 | 1. 引入 pgvector；2. `embedding Float[]` 迁移为 `vector(1024)` 类型；3. SQL 端 `<=>` 余弦相似度 topK 检索；4. HNSW 索引；5. 关键词+向量混合检索；6. 检索结果带 chapter/source 引用 | 1000+ chunks 下检索耗时稳定；第 50 章可召回早期伏笔；prompt 中带来源 | `lib/agent/retrieval.ts`、`prisma/schema.prisma`、`lib/llm/embeddings.ts` |
| ✅ | L-05 | RAG 检索失败显式可见 | 当前检索失败 fail-open，模型可能继续编造 | 1. `retrieveMemories` 返回状态：success/empty/error；2. prompt 中显式说明"未召回相关记忆时不要编造"；3. SSE done 事件带 retrieval_status；4. debug 日志记录 | 检索失败不会静默；prompt 包含状态指令 | `lib/agent/retrieval.ts`、`lib/llm/prompts/chapter.ts`、`lib/agent/chapterContext.ts` |
| ✅ | L-06 | Outline Agent / Beat Sheet v1 | 无 outline 的长篇章节目前只能用默认标题和摘要，缺动态章纲 | 1. 新增 `buildBeatSheetPrompt()`；2. 输入 Bible、story_state、上一章摘要、章节目标；3. 输出 5-8 个 beats；4. Writer prompt 消费 beats；5. 用户可编辑 beats 后生成正文 | 第 21 章以后即使没有 Bible outline，也能先生成可编辑章纲 | `lib/llm/prompts/beatSheet.ts`、`app/api/novels/[id]/chapters/outline/route.ts`、`lib/agent/contracts.ts` |
| ✅ | L-07 | Agent 契约落地到真实调用 | `lib/agent/contracts.ts` 定义了契约，但部分 Agent 仍只是文档层 | 1. 为每个 Agent 定义 TypeScript input/output 并对齐实际 prompt；2. 删除重复类型（CriticIssue、RetrievedMemory）；3. LLM 日志 route 区分 agent 字段；4. `buildChapterContext` 包含 retrievalStatus 和 beatSheet | 每个 Agent 都有类型、prompt、schema、测试、日志 agent 字段 | `lib/agent/contracts.ts`、`lib/llm/prompts/**`、`lib/agent/retrieval.ts` |

---

## 七、P1/P2 产品化任务

| 状态 | 编号 | 风险需求 / 任务 | 风险说明 | 技术实现方案 | 验收标准 | 关键文件 |
|---|---:|---|---|---|---|---|
| ✅ | P-01 | LLM 用量统计与配额 | `LlmUsage` 模型 + `checkQuota()` + `GET /api/usage` 已实现；所有 7 条高成本 LLM 路由（draft / outline / critic / state-diff / bible / summarize / consistency / loglines / questions）均接入 checkQuota；`QUOTA_FAILURE_MODE=allow|block` 策略化，生产默认 block | 每次 LLM 调用有持久化记录；所有高成本路由超额返回 429；生产 quota 检查失败不默认放行 | `lib/llm/usage.ts`、`lib/llm/client.ts`、`app/api/usage/route.ts` |
| ✅ | P-02 | 导出 Markdown/TXT | `lib/export/formatNovel.ts` 格式化逻辑；`GET /api/novels/:id/export?format=markdown|txt` 路由含权限+审核；`ExportMenu` 下拉组件在编辑器顶栏；内容审核覆盖导出 | 用户可导出整本小说 Markdown/TXT；章节顺序正确；未授权不可导出；审核阻挡导出 | `lib/export/formatNovel.ts`、`app/api/novels/[id]/export/route.ts`、`EditorClient.tsx`、`ExportMenu.tsx` |
| 🟡 | P-03 | 写作工具补齐 | textarea 可用但不像专业写作工具，缺查找替换、目标字数、章节进度 | 1. 增加查找/替换；2. 章节目标字数来自 profile；3. 显示今日写作字数、章节完成度；4. 保存草稿恢复提示；5. 后续考虑富文本或 CodeMirror/TipTap | 作者能进行基础长文编辑，不依赖外部编辑器 | `EditorClient.tsx`、`EditorToolbar.tsx`、`useChapterEditor.ts` |
| 🟡 | P-04 | AI 起草改为候选稿/差异保存 | 当前 AI 起草主要覆盖正文，虽然有 confirm 和版本，但体验风险高 | 1. AI 输出先进入 candidate buffer；2. 用户选择“覆盖/追加/插入光标/另存版本”；3. 展示 diff；4. 保存前创建版本 | AI 生成不会直接替换用户正文；用户可选择合并方式 | `useChapterEditor.ts`、`AIPanel.tsx`、`VersionsModal.tsx` |
| 🟡 | P-05 | 替换 `window.confirm` | 编辑器主路径已迁移到 `ConfirmDialog`，但 `/models` 等次要页面仍残留原生确认 | 1. 统一危险操作确认组件；2. 清理剩余原生 confirm；3. 统一文案与焦点管理 | 主工作流和设置页都不再出现浏览器原生 confirm | `useChapterEditor.ts`、`app/(app)/models/page.tsx`、`components/ui/**` |
| ✅ | P-06 | Profile -> Generation Policy | `lib/llm/generationPolicy.ts` maps tone/pace/ai_freedom/audience/pov to temperature and prompt directives; draft route uses policy instead of hardcoded params; prompt builder consumes policy style directives | 修改 profile 后，后续章节生成参数和 prompt 明确变化 | `lib/llm/generationPolicy.ts`、`lib/llm/prompts/chapter.ts`、`app/api/novels/[id]/chapters/draft/route.ts` |
| 🔴 | P-07 | 小说项目详情/角色/世界观/大纲独立页面 | `design.md` 规划了完整创作工作台，当前多数能力集中在编辑器侧栏 | 1. 增加 `/novels/[id]` 项目详情；2. 拆出角色、世界观、大纲管理 tab；3. 与 Bible JSON 同步；4. 编辑器只保留高频写作视图 | 用户能清晰管理“小说-卷-章-角色-世界观-大纲”关系 | `app/(app)/novels/**`、`BibleEditorPanel.tsx` |
| 🟡 | P-08 | UI 低噪声重设计 | 当前 UI 与设计文档目标仍有差距，偏后台/协议感，不适合长时间写作 | 1. 按 `design.md` 建立色彩、字体、卡片、编辑器规范；2. 写作页优先低噪声；3. AI 面板默认收起或分层；4. 增加空/加载/错误状态 | 主编辑器长时间写作舒适；信息层级清晰；AI 不打扰创作 | `app/globals.css`、`components/ui/**`、`app/(app)/**` |

---

## 八、P2 工程质量与运维任务

| 状态 | 编号 | 风险需求 / 任务 | 风险说明 | 技术实现方案 | 验收标准 | 关键文件 |
|---|---:|---|---|---|---|---|
| ✅ | Q-01 | `.dockerignore` 已就位 | `.dockerignore` 排除 `.env*` / `node_modules` / `.next` / `.git` / `.github` / `coverage` / `playwright-report` / `*.tsbuildinfo` / `.claude` 等，保留 `.env.example` | Docker build context 不包含 `.env` 和本地产物 | `Dockerfile`、`.dockerignore` |
| ✅ | Q-02 | Docker/Compose 生产边界标注 | docker-compose 改用 `${POSTGRES_PASSWORD:-postgres}` 等占位、5432 绑 `127.0.0.1`、加文件头注释；README 增加生产边界声明；`.env.example` 增加 POSTGRES_* 注释 | 开发者不会误把本地 compose 当生产配置 | `docker-compose.yml`、`README.md`、`.env.example` |
| 🟡 | Q-03 | E2E 进入 CI | 当前 E2E 存在但 CI 中注释，无法防回归 | 1. 新增独立 e2e job；2. 起 PostgreSQL service；3. 设置 `LLM_MOCK=1`；4. `prisma migrate deploy` 后跑 Playwright；5. 初期只跑 chromium | CI 中至少跑 onboarding 和 editor failure E2E | `.github/workflows/ci.yml`、`tests/e2e/**` |
| ✅ | Q-04 | 覆盖率报告 | `vitest.config.ts` 已配置 v8 coverage（reporter: text/html/json-summary）；`npm run test:coverage` 可用；`coverage/` 已加入 `.gitignore`；当前基线 56.94% stmts / 76.08% branches / 81.25% funcs；CI 暂未强制阈值 | 能看到行/分支/函数覆盖率；核心库覆盖率逐步提升 | `vitest.config.ts`、`package.json` |
| ✅ | Q-05 | API 错误响应统一 | 新增 `lib/http/json.ts` 提供 `jsonError(code, message, retryable, status)` 和 `jsonOk(data)`；14 个 route.ts 删除内联 `jsonError` 副本改为 import；3 条单测覆盖错误/成功包络与 init 透传 | 新增 route 默认使用统一响应；测试不需重复断言结构 | `lib/http/json.ts`、`app/api/**/route.ts` |
| ✅ | Q-06 | 数据写入事务化 | `PATCH /api/chapters/[id]` 已用 `prisma.$transaction` 包章节更新 + 版本写入 + pruning 三步；新增回滚回归测试覆盖版本写入失败场景；finalize 的事务化此前已随 Q-07 完成 | 关键写入要么全部成功，要么全部失败 | `app/api/chapters/[id]/route.ts`、`app/api/onboarding/sessions/[id]/finalize/route.ts` |
| ✅ | Q-07 | Finalize 幂等 | `Novel.session_id` 加 `@@unique` 约束；finalize 事务中先查已有 novel，存在则直接返回；新增单测覆盖重复 finalize | 网络重试不会创建多个 Novel | `prisma/schema.prisma`、`app/api/onboarding/sessions/[id]/finalize/route.ts` |
| ✅ | Q-08 | SSE parser 边界增强 | `lib/stream/readSse.ts` 已支持多行 `data:` 合并、`\r\n` 行尾、末尾未 flush block，删除 `Step4Generating.tsx` 内联副本统一使用 lib 实现，单测 5 条 | SSE 客户端解析符合标准；测试覆盖多行和无尾分隔符 | `lib/stream/readSse.ts`、`Step4Generating.tsx` |
| ✅ | Q-09 | LLM stream retry 保护 | `streamChatCompletionWithRetry` 已通过 `emitted` 标记记录是否已发送 delta，已发送则不再 retry，让上层 SSE 直接发 error 事件；新增 2 条单测覆盖 | 不会把两次生成内容混在同一个流里 | `lib/llm/client.ts`、`lib/llm/client.test.ts` |
| ✅ | Q-10 | 后台任务队列 | 新增 `BackgroundJob` 表、`lib/jobs/queue` (enqueue/runJob/runPendingJobsForNovel，3 次重试)、`lib/jobs/handlers` (summarize/index/refresh 注册)、`POST/GET /api/novels/[id]/jobs`、`JobsBadge` 状态徽章；useChapterEditor 三处 fire-and-forget 改走 jobs API；17 条单测覆盖 | 摘要/索引失败可见、可重试 | `lib/jobs/**`、`app/api/novels/[id]/jobs/**`、`app/(app)/editor/[novelId]/JobsBadge.tsx`、`useChapterEditor.ts` |

---

## 九、P3 暂缓任务：完整产品愿景

| 状态 | 编号 | 需求 | 暂缓原因 | 前置条件 |
|---|---:|---|---|---|
| ⚫ | F-01 | 多人协作 | 当前单用户写作闭环尚未生产化，多人协作会显著增加权限和冲突复杂度 | 权限模型、版本恢复、冲突合并稳定后再做 |
| ⚫ | F-02 | 分支创作 | 需要更完整版本树和 diff/merge 基础 | 版本恢复、候选稿、导出完成后再做 |
| ⚫ | F-03 | 平台直发 | 涉及平台 API、审核、版权和账号安全 | 导出、内容审核、用户授权完成后再做 |
| ⚫ | F-04 | 角色关系图可视化 | 有价值但非当前上线阻塞 | 结构化角色/关系数据稳定后再做 |
| ⚫ | F-05 | Prompt Cache / 多模型 Router | 成本优化方向正确，但当前更需要用量统计和密钥安全 | LlmUsage、模型配置安全完成后再做 |
| ⚫ | F-06 | 计费支付 | 需要配额、用量、套餐、风控基础 | LlmUsage 和限流完成后再做 |

---

## 十、推荐执行顺序

| 顺序 | 阶段 | 必做任务 | 目标 |
|---:|---|---|---|
| 1 | 恢复可验证性 | P0-01、P0-02、P0-03、P0-04 | 让当前工作区成为可构建、可测试、可提交的版本 |
| 2 | 安全止血 | S-01、S-02、S-03、S-04 | 防止烧 key、泄密、SSRF、限流失效 |
| 3 | 隔离与合规 | S-05、S-06、S-07 | 让公网试用的安全边界可信 |
| 4 | 写作闭环 | L-01、L-02、L-03 | 章节完成后状态、摘要、记忆能跟上 |
| 5 | 长篇能力 | L-04、L-05、L-06、L-07 | RAG pgvector、检索状态可见、Outline Agent、Agent 契约 |
| 6 | 产品化 | P-01、P-02、P-03、P-04、P-05、P-06 | 成本、导出、写作体验、profile 策略化 |
| 7 | 运维质量 | Q-01 至 Q-10 | Docker、CI、E2E、coverage、事务、后台任务 |

---

## 十一、近期验收清单

| 验收项 | 目标 |
|---|---|
| 工程验证 | 当前 `npm run lint`、`npm run typecheck`、`npm run test`、`npm run build`、`npm run verify` 均通过；下一步把 E2E 纳入 CI |
| 测试基线 | Vitest 当前 46 files / 289 tests 通过；新增 P0/S 类风险单测 |
| 安全基线 | ✅ 未登录不能调用真实 LLM health check；普通用户不能读写模型配置；API key 不明文返回 |
| 成本基线 | 所有高成本 LLM 路由有限流；用量至少能持久化记录 |
| 文档基线 | `README.md`、`PROGRESS.md`、`TASKS.md`、`AUDIT.md` 不再互相冲突 |
| 试用基线 | 登录用户可完整走通：注册/登录 → 新建小说 → 生成 Bible → 进入编辑器 → AI 起草 → 保存 → 查看版本 |
