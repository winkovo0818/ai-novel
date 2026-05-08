# AI Novel — 当前任务状态与风险需求台账

> 更新时间：2026-05-09  
> 依据：当前工作区代码、`README.md`、`PROGRESS.md`、`AUDIT.md`、`TECHNICAL_PLAN.md`、`docs/contracts.md`、实际验证命令。  
> 当前结论：项目已具备可演示的 AI 小说写作 MVP，但不应视为生产级上线完成。后续任务优先级按“先可构建、再安全、再成本、再长篇能力、最后体验产品化”排序。

---

## 一、状态定义

| 状态 | 含义 |
|---|---|
| ✅ 已完成 | 当前代码已实现，且已有基础验证或测试覆盖 |
| 🟡 部分完成 | 已有实现雏形，但覆盖、闭环、生产可用性或验证不足 |
| 🔴 待处理 | 尚未实现，或当前实现存在明确阻塞/风险 |
| ⚫ 暂缓 | 属于中长期完整产品范围，当前不建议优先投入 |

---

## 二、当前完成度总览

| 模块 | 当前状态 | 完成度估计 | 说明 | 关键证据 |
|---|---|---:|---|---|
| Onboarding 5 步开书 | ✅ 已完成 | 85-90% | `/new`、session、logline、questions、Bible SSE、Review、Finalize 已形成闭环 | `app/(app)/new/**`、`app/api/onboarding/**`、`docs/contracts.md` |
| 多章节编辑器 MVP | ✅ 已完成 | 75-85% | 多章节、保存、AI 起草、删除、版本历史、自动保存、状态切换已实现 | `app/(app)/editor/[novelId]/**`、`app/api/chapters/**` |
| 账号与访问控制 | 🟡 部分完成 | 70-80% | Supabase Auth、middleware、ownership、admin-only 已有；RLS 已禁用，完全依赖应用层校验 | `utils/supabase/**`、`lib/auth/**`、`prisma/migrations/20260508050000_disable_rls` |
| LLM 基础设施 | ✅ 已完成 | 75-85% | 统一 client、stream、mock、prompt、成本日志均有；用量未持久化 | `lib/llm/**`、`lib/stream/**` |
| 内容审核 | 🟡 部分完成 | 55-65% | 本地关键词 + LLM 审核已接入部分路径；审核失败 fail-open，覆盖面不完整 | `lib/moderation/moderate.ts`、`app/api/chapters/[id]/route.ts` |
| 长篇记忆 L1/L2 | 🟡 部分完成 | 60-70% | Bible、Story State、章节摘要、卷摘要、全书摘要已有 | `lib/agent/chapterContext.ts`、`lib/agent/summaries.ts` |
| RAG / MemoryChunk | 🟡 部分完成 | 35-45% | MemoryChunk、embedding、hybrid retrieval 已有雏形；仍是应用层全量拉取，不是生产级向量检索 | `lib/agent/retrieval.ts`、`prisma/schema.prisma` |
| 多 Agent 协作 | 🟡 部分完成 | 30-40% | Writer、Critic、StateUpdater 有雏形；Outline/Retrieval/Orchestrator 不完整 | `lib/agent/contracts.ts`、`app/api/novels/[id]/chapters/critic` |
| 工程验证 | 🔴 待处理 | 45-55% | Vitest 通过，但 typecheck/build/lint 当前失败，`npm run verify` 不通过 | `package.json`、`next.config.ts` |
| CI/CD | 🟡 部分完成 | 40-50% | workflow 存在但当前 `.github/` 未跟踪；E2E 注释；lint 不在 CI 中 | `.github/workflows/ci.yml` |
| 产品化能力 | 🔴 待处理 | 30-40% | 缺导出、用量/配额、生产限流、健康检查、写作工具、UI 低噪声打磨 | `design.md`、`AUDIT.md` |

---

## 三、已完成任务归档

| 状态 | 编号 | 任务 | 当前说明 | 后续注意 |
|---|---:|---|---|---|
| ✅ | D-01 | Onboarding 5 步主流程 | 创建 session、logline、questions、Bible SSE、Step5 Review、Finalize 已实现 | 继续补 Step4 中断恢复和重复 finalize 幂等 |
| ✅ | D-02 | SSE 与 partial JSON 解析 | Bible 生成和章节起草均采用 SSE；Bible partial parser 有测试 | 客户端 SSE parser 仍有重复实现和边界能力不足 |
| ✅ | D-03 | Supabase 登录注册基础链路 | `/login`、`/signup`、密码重置、auth callback、logout 已有 | 需要 E2E 覆盖登录/注册/重置最小链路 |
| ✅ | D-04 | 应用层 ownership | 主要 Novel/Chapter/API/SSR 页面已接入 `canAccessOwnerResource` | RLS 禁用后必须持续补全负向测试 |
| ✅ | D-05 | 多章节编辑器 | 多章节加载、切换、保存、AI 起草、状态切换已实现 | 需要更强写作工具和候选稿/差异保存能力 |
| ✅ | D-06 | 章节删除 | `DELETE /api/chapters/[id]` 已实现 | 当前仍使用浏览器原生确认体验 |
| ✅ | D-07 | 章节版本历史 | `ChapterVersion`、hash 去重、50 条上限、版本列表 UI 已有 | 版本恢复 API 尚未实现 |
| ✅ | D-08 | Autosave 与版本历史解耦 | `source=autosave/manual/ai/status_change` 已区分 | 需要事务化保护更新和版本写入一致性 |
| ✅ | D-09 | 一致性检查 | `POST /api/novels/[id]/consistency` 和编辑器入口已接入 | 当前更多是手动审计，不是自动闭环 |
| ✅ | D-10 | Bible 编辑器 | `PATCH /api/novels/[id]/bible` 与 `BibleEditorPanel` 已有 | 保存 Bible 缺内容审核和更细粒度编辑体验 |
| ✅ | D-11 | State Diff v1 | `POST /api/chapters/[id]/state-diff`、前端确认、回写 Bible 已实现 | `new_entities` 合并能力不完整 |
| ✅ | D-12 | Critic v1 | 起草后自动审校，critical/major 冲突阻止静默保存 | 尚未实现自动修订/回炉策略 |
| ✅ | D-13 | Chapter Context Builder | `buildChapterContext()` 统一组装 Bible、摘要、story_state、retrievedMemories | RAG 检索结果质量仍需提升 |
| ✅ | D-14 | 分层摘要 v1 | `VolumeSummary`、`NovelSummary`、最近 5 章摘要策略已有 | dirty 检测较粗，章节改稿后级联刷新不足 |
| ✅ | D-15 | MemoryChunk 雏形 | 表结构、chunking、embedding、retrieval 已有 | 需要 pgvector/索引/rerank 才能支撑规模 |
| ✅ | D-16 | Admin-only 模型配置 | `/models` 与 `/api/llm-models/**` 已接入 admin guard | API key 明文存储和返回仍是高风险 |
| ✅ | D-17 | API 限流雏形 | `lib/auth/rateLimit.ts` 已覆盖部分高成本路由 | 内存 Map 不适合生产，多实例无效 |
| ✅ | D-18 | Vitest 基础覆盖 | 当前 24 个测试文件、127 个测试通过 | coverage 未配置，E2E 未进入质量门禁 |

---

## 四、P0 阻塞任务：先恢复可交付工程状态

| 状态 | 编号 | 风险需求 / 任务 | 风险说明 | 技术实现方案 | 验收标准 | 关键文件 |
|---|---:|---|---|---|---|---|
| 🔴 | P0-01 | 修复当前 `typecheck/build/lint` 失败 | 当前 `npm run verify` 不通过，项目不能视为可交付；失败原因是本地 `next-intl` 未安装或依赖状态损坏 | 1. 执行 `npm install` 或 `npm ci` 恢复 `node_modules`；2. 确认 `package-lock.json` 中 `next-intl` 与 `package.json` 一致；3. 重新运行 `npm run typecheck`、`npm run build`；4. 若仍失败，检查 `next.config.ts` 的 `next-intl/plugin` 引入路径 | `npm run typecheck`、`npm run build`、`npm run test` 全部通过；`npm run verify` 通过 | `package.json`、`package-lock.json`、`next.config.ts`、`app/layout.tsx`、`i18n/**` |
| 🔴 | P0-02 | 替换废弃的 `next lint` | `next lint` 已提示 deprecated，Next 16 会移除；当前 lint 还会被 config 加载失败阻断 | 1. 将 script 改为 `eslint .`；2. 确认 `eslint.config.mjs` 可直接被 ESLint CLI 使用；3. 将 `npm run lint` 纳入 `verify` 或 CI；4. 修复现有 lint 问题 | `npm run lint` 通过；CI 执行 lint | `package.json`、`eslint.config.mjs`、`.github/workflows/ci.yml` |
| 🔴 | P0-03 | 提交并启用 CI 工作流 | 当前 `.github/` 在 git status 中显示未跟踪，若不提交则 GitHub Actions 不会运行 | 1. 将 `.github/workflows/ci.yml` 纳入版本控制；2. CI 中执行 `npm ci`、`prisma generate`、`typecheck`、`lint`、`test`、`build`；3. build 阶段提供必要 placeholder env；4. 后续另建 e2e job | PR 上 CI 自动运行且失败会阻断合并 | `.github/workflows/ci.yml` |
| 🔴 | P0-04 | 清理工作区未跟踪关键文件状态 | 当前大量核心实现文件未跟踪，任务状态无法对应稳定版本 | 1. 审查所有 `??` 文件是否属于本轮功能；2. 将源码、测试、迁移、CI 纳入 git；3. 不提交 `.env`、临时文件、个人 IDE 文件；4. 删除或记录 `generate_report.py` 的删除原因 | `git status --short` 中只剩预期变更；关键功能文件均被追踪 | `lib/agent/**`、`app/api/**`、`prisma/migrations/**`、`.github/**` |

---

## 五、P0/P1 安全与成本风险任务

| 状态 | 编号 | 风险需求 / 任务 | 风险说明 | 技术实现方案 | 验收标准 | 关键文件 |
|---|---:|---|---|---|---|---|
| 🔴 | S-01 | 保护 `/api/healthz/llm` | 当前该接口属于 public path，未登录即可真实调用 LLM，可能被刷成本 | 方案 A：改为 admin-only；方案 B：拆分 `/api/healthz` 基础探针与 `/api/healthz/llm` 深度探针，深度探针要求 admin 或内部 header；同时加限流 | 未登录访问 `/api/healthz/llm` 返回 401/403；公开 `/api/healthz` 不调用 LLM | `app/api/healthz/llm/route.ts`、`utils/supabase/middleware.ts`、`lib/auth/admin.ts` |
| 🔴 | S-02 | LLM API key 加密存储与脱敏返回 | `LlmModel.api_key` 明文存储，GET/POST/PATCH 返回完整 row，admin 浏览器侧也能看到密钥 | 1. 新增 `MODEL_KEY_ENCRYPTION_SECRET`；2. 用 Node `crypto` AES-GCM 加密 api_key；3. DB 字段可继续叫 `api_key` 或迁移为 `api_key_encrypted`；4. API 返回 `api_key_masked`，不返回原文；5. 更新 LLM client 解密使用；6. 加单测覆盖创建、更新空 key、不泄露 key | API 响应不含明文 key；数据库不存明文；LLM 调用仍可读取并解密 | `prisma/schema.prisma`、`app/api/llm-models/**`、`lib/llm/client.ts` |
| 🔴 | S-03 | 模型配置输入校验和 SSRF 防护 | admin 可配置 `base_url`，随后服务端 fetch；若被滥用可访问内网地址 | 1. 为 LLM model 新增 Zod schema；2. 校验 URL scheme 仅允许 `https:`，开发环境可允许 `http://localhost`；3. 增加 provider allowlist；4. 禁止私网 IP、metadata IP、file 协议；5. 保存前 normalize URL | 非法 URL 返回 400；私网地址被拒绝；测试覆盖 | `app/api/llm-models/**`、`lib/validation/schemas.ts`、`lib/llm/client.ts` |
| 🟡 | S-04 | 生产级限流 | 当前限流是进程内 `Map`，多实例、serverless、重启均失效，不能控制成本 | 1. 抽象 `RateLimiter` 接口；2. 本地保留 memory 实现；3. 生产使用 Redis/Upstash/Supabase RPC；4. key 维度包含 userId + route + IP；5. 高成本路由设置更低额度；6. 响应增加 `Retry-After` | 多实例共享限流；LLM 路由超过额度返回 429；有单测和集成测试 | `lib/auth/rateLimit.ts`、所有 LLM API route |
| 🟡 | S-05 | 内容审核从 fail-open 改成策略化 | `moderateContent()` 调 LLM 审核失败时返回 allowed，公网场景风险高 | 1. 引入 `MODERATION_FAILURE_MODE=allow|block|review`；2. 默认生产 `block` 或 `review`；3. 本地关键词永远强阻断；4. 保存、起草输入、起草输出、Bible 编辑、导出前统一调用；5. 日志记录审核失败原因 | 生产审核服务失败不会默认放行；关键路径都有审核覆盖 | `lib/moderation/moderate.ts`、`app/api/chapters/[id]/route.ts`、`app/api/novels/[id]/bible/route.ts` |
| 🟡 | S-06 | RLS 禁用后的 ownership 负向测试补齐 | 当前隔离完全靠应用层；任一路由漏校验都会越权 | 1. 列出所有 owner-scoped API；2. 为每个 API 补 401/403/404 负向测试；3. 新增 helper 降低 route 测试重复；4. CI 强制跑测试 | 用户 B 无法访问用户 A 的 novel/chapter/session/model；测试覆盖所有关键路由 | `lib/auth/ownership.ts`、`app/api/**/route.test.ts` |
| 🟡 | S-07 | owner 为空资源访问策略收紧 | `canAccessOwnerResource(null, userId)` 允许任意登录用户访问 legacy/anonymous 资源，长期会扩大访问面 | 1. 只允许 onboarding session claim 流程访问 owner 为空资源；2. Novel/Chapter owner 为空需先 claim 或迁移；3. 新增迁移脚本把历史匿名资源绑定到创建者或标记不可访问；4. 改 `canAccessOwnerResource` 默认拒绝空 owner，另建 `canClaimAnonymousResource` | 普通用户不能直接访问 owner 为空的正式 Novel/Chapter；claim 路径单独受控 | `lib/auth/ownership.ts`、`lib/auth/onboardingAccess.ts`、`app/api/novels/**` |

---

## 六、P1 长篇写作闭环任务

| 状态 | 编号 | 风险需求 / 任务 | 风险说明 | 技术实现方案 | 验收标准 | 关键文件 |
|---|---:|---|---|---|---|---|
| 🟡 | L-01 | State Diff 自动闭环 | 当前 state diff 需要用户手动触发，章节完成后状态不一定回写 | 1. 在标记 done 后提示生成 state diff；2. 后台生成 diff，前端展示待确认卡片；3. 用户确认后合并回 Bible；4. 拒绝时记录原因；5. 避免自动无确认覆盖 Bible | 完成章节后能稳定看到状态更新建议；确认后下一章 prompt 使用新状态 | `app/api/chapters/[id]/state-diff/route.ts`、`StateDiffPanel.tsx`、`useChapterEditor.ts` |
| 🟡 | L-02 | `new_entities` 合并能力 | `StateDiffSchema` 有 `new_entities`，但合并逻辑不完整，新角色/地点/物品无法进入 Bible | 1. 扩展 `applyStateDiff()`；2. 新角色写入 characters 或 pending registry；3. 新地点/物品/规则写入 world 或 story_state extensions；4. 前端展示“登记新设定”确认项 | LLM 检测的新角色/地点可被用户确认登记；有 merge 单测 | `lib/validation/stateDiffMerge.ts`、`lib/validation/schemas.ts` |
| 🟡 | L-03 | 章节改稿后的摘要/状态级联刷新 | 用户修改旧章节后，卷摘要、全书摘要、MemoryChunk、Story State 可能过期 | 1. 为 ChapterDraft 增加 `content_hash` 或 `last_indexed_hash`；2. 保存后标记 summary/index dirty；3. 增加 `/summaries/refresh` 后台任务；4. 用户打开编辑器时提示“记忆需刷新”；5. 长期接任务队列 | 修改旧章节后，摘要和索引能重新生成，不会继续使用旧记忆 | `lib/agent/summaries.ts`、`app/api/novels/[id]/summaries/refresh`、`lib/agent/chunking.ts` |
| 🟡 | L-04 | RAG 从应用层全量扫描升级 | 当前 `retrieveMemories()` 拉取小说所有 chunks 后在应用层过滤，章节多后不可用 | 1. 引入 pgvector 或外部向量库；2. `embedding Float[]` 迁移为 vector 类型或外部 index id；3. SQL 端 topK 相似度检索；4. 关键词和向量分数融合；5. 增加 rerank；6. 检索结果带 chapter/source 引用 | 1000+ chunks 下检索耗时稳定；第 50 章可召回早期伏笔；prompt 中带来源 | `lib/agent/retrieval.ts`、`prisma/schema.prisma`、`lib/llm/embeddings.ts` |
| 🟡 | L-05 | RAG 检索失败显式可见 | 当前检索失败 fail-open，模型可能继续编造 | 1. `retrieveMemories` 返回状态：success/empty/error；2. prompt 中显式说明“未召回相关记忆时不要编造”；3. UI 显示本章使用的记忆片段或“无记忆召回”；4. debug 日志记录 query 和 topK | 检索失败不会静默；用户能看到本章引用了哪些记忆 | `lib/agent/retrieval.ts`、`lib/llm/prompts/chapter.ts`、`AIPanel.tsx` |
| 🔴 | L-06 | Outline Agent / Beat Sheet v1 | 无 outline 的长篇章节目前只能用默认标题和摘要，缺动态章纲 | 1. 新增 `buildBeatSheetPrompt()`；2. 输入 Bible、story_state、上一章摘要、章节目标；3. 输出 5-8 个 beats；4. Writer prompt 消费 beats；5. 用户可编辑 beats 后生成正文 | 第 21 章以后即使没有 Bible outline，也能先生成可编辑章纲 | `lib/llm/prompts/**`、`app/api/novels/[id]/chapters/**` |
| 🔴 | L-07 | Agent 契约落地到真实调用 | `lib/agent/contracts.ts` 定义了契约，但部分 Agent 仍只是文档层 | 1. 为 Outline/Retrieval/Writer/Critic/StateUpdater 定义 TypeScript input/output；2. 每个 prompt 有 schema 和测试；3. LLM 日志 route 区分 agent；4. `buildChapterContext` 作为 orchestrator v1 | 每个 Agent 都有类型、prompt、schema、单测、日志 route | `lib/agent/contracts.ts`、`lib/llm/prompts/**`、`lib/agent/README.md` |

---

## 七、P1/P2 产品化任务

| 状态 | 编号 | 风险需求 / 任务 | 风险说明 | 技术实现方案 | 验收标准 | 关键文件 |
|---|---:|---|---|---|---|---|
| 🔴 | P-01 | LLM 用量统计与配额 | 当前 token/cost 只 console.log，无法控成本、计费或审计 | 1. 新增 `LlmUsage` 表：user_id、novel_id、route、model、token_in、token_out、cost_cny、status、created_at；2. LLM client 写入 usage；3. API 调用前检查用户日/月配额；4. Profile 页展示用量 | 每次 LLM 调用有持久化记录；超过配额返回 429/402；可按用户汇总成本 | `lib/llm/client.ts`、`prisma/schema.prisma`、`app/(app)/profile/page.tsx` |
| 🔴 | P-02 | 导出 Markdown/TXT/docx/epub | 原始设计要求导出，当前没有实现，影响真实作者使用 | 1. 先做 Markdown/TXT；2. 按章节顺序拼接标题、正文、Bible 摘要；3. 后续引入 docx/epub 生成库；4. 导出前内容审核；5. 记录导出日志 | 用户可导出整本小说 Markdown/TXT；章节顺序正确；未授权不可导出 | `app/api/novels/[id]/export/route.ts`、`app/(app)/editor/[novelId]/**` |
| 🟡 | P-03 | 写作工具补齐 | textarea 可用但不像专业写作工具，缺查找替换、目标字数、章节进度 | 1. 增加查找/替换；2. 章节目标字数来自 profile；3. 显示今日写作字数、章节完成度；4. 保存草稿恢复提示；5. 后续考虑富文本或 CodeMirror/TipTap | 作者能进行基础长文编辑，不依赖外部编辑器 | `EditorClient.tsx`、`EditorToolbar.tsx`、`useChapterEditor.ts` |
| 🟡 | P-04 | AI 起草改为候选稿/差异保存 | 当前 AI 起草主要覆盖正文，虽然有 confirm 和版本，但体验风险高 | 1. AI 输出先进入 candidate buffer；2. 用户选择“覆盖/追加/插入光标/另存版本”；3. 展示 diff；4. 保存前创建版本 | AI 生成不会直接替换用户正文；用户可选择合并方式 | `useChapterEditor.ts`、`AIPanel.tsx`、`VersionsModal.tsx` |
| 🟡 | P-05 | 替换 `window.confirm` | 原生确认框打断写作，与 `design.md` 的沉浸式目标冲突 | 1. 建统一 `ConfirmDialog`；2. 切章、起草、删除、未保存离开都使用自定义 modal；3. 支持保存并继续/放弃/取消 | 不再出现浏览器原生 confirm；交互文案统一 | `useChapterEditor.ts`、`EditorToolbar.tsx`、`components/ui/**` |
| 🔴 | P-06 | Profile -> Generation Policy | NovelProfile 字段未充分影响 prompt 参数，用户配置价值不足 | 1. 新增 `lib/llm/generationPolicy.ts`；2. 将 audience、tone、pace、chapter_word_count、ai_freedom 映射到 temperature、字数、审核等级、prompt 风格；3. 所有生成路由统一使用 policy | 修改 profile 后，后续章节生成参数和 prompt 明确变化 | `lib/validation/schemas.ts`、`lib/llm/prompts/chapter.ts`、`app/api/novels/[id]/chapters/draft/route.ts` |
| 🔴 | P-07 | 小说项目详情/角色/世界观/大纲独立页面 | `design.md` 规划了完整创作工作台，当前多数能力集中在编辑器侧栏 | 1. 增加 `/novels/[id]` 项目详情；2. 拆出角色、世界观、大纲管理 tab；3. 与 Bible JSON 同步；4. 编辑器只保留高频写作视图 | 用户能清晰管理“小说-卷-章-角色-世界观-大纲”关系 | `app/(app)/novels/**`、`BibleEditorPanel.tsx` |
| 🟡 | P-08 | UI 低噪声重设计 | 当前 UI 与设计文档目标仍有差距，偏后台/协议感，不适合长时间写作 | 1. 按 `design.md` 建立色彩、字体、卡片、编辑器规范；2. 写作页优先低噪声；3. AI 面板默认收起或分层；4. 增加空/加载/错误状态 | 主编辑器长时间写作舒适；信息层级清晰；AI 不打扰创作 | `app/globals.css`、`components/ui/**`、`app/(app)/**` |

---

## 八、P2 工程质量与运维任务

| 状态 | 编号 | 风险需求 / 任务 | 风险说明 | 技术实现方案 | 验收标准 | 关键文件 |
|---|---:|---|---|---|---|---|
| 🔴 | Q-01 | 增加 `.dockerignore` | 当前 Dockerfile `COPY . .`，本地 `.env`、node_modules、临时文件可能进入 build context | 新增 `.dockerignore`，排除 `.env*`、`node_modules`、`.next`、`.git`、coverage、tmp、IDE 文件；保留 `.env.example` | Docker build context 不包含 `.env` 和本地产物 | `Dockerfile`、`.dockerignore` |
| 🟡 | Q-02 | Docker/Compose 生产边界标注 | docker-compose 使用默认 postgres/postgres 且暴露 5432，仅适合本地 | 1. README 明确 compose 仅本地；2. 改用 `.env` 注入密码；3. 可选只绑定 `127.0.0.1:5432`; 4. 生产不使用该 compose | 开发者不会误把本地 compose 当生产配置 | `docker-compose.yml`、`README.md` |
| 🟡 | Q-03 | E2E 进入 CI | 当前 E2E 存在但 CI 中注释，无法防回归 | 1. 新增独立 e2e job；2. 起 PostgreSQL service；3. 设置 `LLM_MOCK=1`；4. `prisma migrate deploy` 后跑 Playwright；5. 初期只跑 chromium | CI 中至少跑 onboarding 和 editor failure E2E | `.github/workflows/ci.yml`、`tests/e2e/**` |
| 🟡 | Q-04 | 覆盖率报告 | 当前无 coverage script，测试数量无法代表覆盖率 | 1. 配置 Vitest coverage；2. 新增 `npm run test:coverage`；3. CI 上传 artifact；4. 先不设硬阈值，稳定后设置核心库阈值 | 能看到行/分支/函数覆盖率；核心库覆盖率逐步提升 | `vitest.config.ts`、`package.json` |
| 🟡 | Q-05 | API 错误响应统一 | 多个 route 重复 `jsonError()`，错误结构容易漂移 | 1. 新增 `lib/http/json.ts`；2. 定义 `ApiErrorCode` union；3. 统一 `jsonOk/jsonError`; 4. 逐步替换 route 内重复 helper | 新增 route 默认使用统一响应；测试不需重复断言结构 | `app/api/**/route.ts`、`lib/http/**` |
| 🟡 | Q-06 | 数据写入事务化 | 更新章节 + 写版本 + 副作用当前不是事务，失败可能局部成功 | 1. `PATCH /api/chapters/[id]` 使用 `prisma.$transaction`；2. 版本写入和 pruning 放同事务；3. 对 finalize 创建 Novel + BibleDraft 做幂等和事务化 | 关键写入要么全部成功，要么全部失败 | `app/api/chapters/[id]/route.ts`、`app/api/onboarding/sessions/[id]/finalize/route.ts` |
| 🔴 | Q-07 | Finalize 幂等 | 重复调用 finalize 可能重复创建 Novel，导致脏数据 | 1. 给 `Novel.session_id` 加唯一索引或在 finalize 中先查已有 novel；2. action=`save_only/start_writing` 重复调用返回同一 novel；3. 单测覆盖重复提交 | 网络重试不会创建多个 Novel | `prisma/schema.prisma`、`app/api/onboarding/sessions/[id]/finalize/route.ts` |
| 🟡 | Q-08 | SSE parser 边界增强 | `readSse()` 对多行 data、末尾未 flush block 支持不足；Step4 还有内联重复实现 | 1. 统一使用 `lib/stream/readSse.ts`；2. 支持多行 data 合并；3. stream 结束时 flush buffer；4. Step4 删除内联 parser | SSE 客户端解析符合标准；测试覆盖多行和无尾分隔符 | `lib/stream/readSse.ts`、`Step4Generating.tsx` |
| 🟡 | Q-09 | LLM stream retry 保护 | 流式请求如果已输出部分 delta 后重试，可能混合两次输出 | 1. 在 `streamChatCompletionWithRetry()` 中记录是否已 emit delta；2. 只有未输出时允许 retry；3. 已输出后失败直接发 error，让前端保留部分内容或提示重试 | 不会把两次生成内容混在同一个流里 | `lib/llm/client.ts`、`app/api/novels/[id]/chapters/draft/route.test.ts` |
| 🟡 | Q-10 | 后台任务队列 | summarize/index/refresh 现在 fire-and-forget，失败不可见 | 1. MVP 可先建 `BackgroundJob` 表；2. 记录 type、payload、status、attempts、error；3. UI 显示记忆刷新状态；4. 后续接 BullMQ/Trigger.dev | 摘要/索引失败可见、可重试 | `lib/agent/summaries.ts`、`lib/agent/chunking.ts`、`useChapterEditor.ts` |

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
| 5 | 长篇能力 | L-04、L-05、L-06、L-07 | 把 RAG 和 Agent 从雏形推进到真实可用 |
| 6 | 产品化 | P-01、P-02、P-03、P-04、P-05、P-06 | 成本、导出、写作体验、profile 策略化 |
| 7 | 运维质量 | Q-01 至 Q-10 | Docker、CI、E2E、coverage、事务、后台任务 |

---

## 十一、近期验收清单

| 验收项 | 目标 |
|---|---|
| 工程验证 | `npm run verify` 通过，且包含 typecheck/test/build；lint 单独通过或纳入 verify |
| 测试基线 | Vitest 继续 100% 通过；新增 P0/S 类风险单测 |
| 安全基线 | 未登录不能调用真实 LLM health check；普通用户不能读写模型配置；API key 不明文返回 |
| 成本基线 | 所有高成本 LLM 路由有限流；用量至少能持久化记录 |
| 文档基线 | `README.md`、`PROGRESS.md`、`TASKS.md`、`AUDIT.md` 不再互相冲突 |
| 试用基线 | 登录用户可完整走通：注册/登录 → 新建小说 → 生成 Bible → 进入编辑器 → AI 起草 → 保存 → 查看版本 |
