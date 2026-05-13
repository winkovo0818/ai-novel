# AI Novel 实施任务单（按页面 / 接口拆分）

> 创建时间：2026-05-10
> 来源：`docs/ROADMAP_2_4_8_WEEKS.md` 的细化与代码事实对齐版本
> 用途：后续 `gsd-add-phase` / 直接执行的可落地清单。每条任务都有产物路径与验收方式，可单独立 PR。

---

## 命名约定

| 标签 | 含义 |
|---|---|
| `[P]` | Page / 主要 UI 组件 |
| `[API]` | HTTP 路由 |
| `[DB]` | Prisma schema / migration |
| `[LIB]` | 业务逻辑模块 |
| `[CI]` | 工程化 / CI 配置 |
| `[DOC]` | 文档 |
| `[E2E]` / `[UT]` | Playwright / Vitest 测试 |

---

## 阶段 1（第 1-2 周）：把 MVP 收敛成可稳定内测的写作工具

### M1.1 小说详情页 + 项目级信息架构

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| 1.1.1 | [P] | 新建小说详情页（概览） | `app/(app)/novels/[id]/page.tsx`（server component，复用 `GET /api/novels/:id`） | 显示标题、类型、created_at、章节进度（已存/总数/完成）、Bible 状态、最近一次保存的章节；4 个入口卡片：角色 / 世界观 / 大纲 / 进入写作 |
| 1.1.2 | [P] | 详情页二级导航壳 | `app/(app)/novels/[id]/layout.tsx`（左侧二级 nav：概览 / 角色 / 世界观 / 大纲 / 章节 / 写作 / 导出） | 当前 `/novels` → `/novels/:id` → `/editor/:id` 链路通顺，浏览器返回不丢上下文 |
| 1.1.3 | [P] | "进入写作"按钮 | 详情页右上角 CTA，跳转 `/editor/:id?chapter=<lastEdited>` | 编辑器读 query 自动选中对应章节（修改 `useChapterEditor` 初始 `selectedIndex`） |
| 1.1.4 | [API] | 扩展 `GET /api/novels/:id` 返回最近编辑章节 | `app/api/novels/[id]/route.ts`：新增 `lastEditedChapterId`（按 `updated_at desc` 第一条） | response payload 新增字段；保持向后兼容 |
| 1.1.5 | [P] | `Sidebar.tsx` 加入"小说"二级展开（active 时高亮） | `components/layout/Sidebar.tsx` | 当 pathname 在 `/novels/:id/*` 下时显示二级 nav |
| 1.1.6 | [UT] | 详情页 RSC + API 联合测 | `app/(app)/novels/[id]/page.test.tsx`（vitest + RSC mock） | 未登录 → 跳 `/login`；非 owner → 404；正常返回所有计数 |

### M1.2 角色 / 世界观 / 大纲 三个独立页面

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| 1.2.1 | [P] | 角色管理页 | `app/(app)/novels/[id]/characters/page.tsx`：列表 + 编辑表单（复用 `BibleEditorPanel` 角色块抽取） | 与现有 `bible.characters` 双向绑定；保存调 `PATCH /api/novels/:id/bible` |
| 1.2.2 | [P] | 世界观页 | `app/(app)/novels/[id]/world/page.tsx` | 编辑 `bible.world.rules / factions / geography`；保存走 bible PATCH |
| 1.2.3 | [P] | 大纲页 | `app/(app)/novels/[id]/outline/page.tsx`：按卷分组、每章可编辑标题/摘要、显示该章节是否已有 ChapterDraft | 复用 `getVolumes(bible)`；编辑保存走 bible PATCH |
| 1.2.4 | [LIB] | 抽取 `BibleEditorPanel` 中 3 个 section 为可复用组件 | `components/bible/CharacterCard.tsx`、`components/bible/WorldRulesEditor.tsx`、`components/bible/OutlineList.tsx` | 编辑器侧栏与新页面共用；侧栏保留作为快速查看入口 |
| 1.2.5 | [API] | `PATCH /api/novels/:id/bible` 支持 partial patch | `app/api/novels/[id]/bible/route.ts`：当前是 full content 替换，需要支持 `{ patch: { characters?, world?, outline? } }` 单段更新避免并发覆盖 | 保留 full content 模式（向后兼容），新增 partial 分支；新增并发覆盖场景 UT |
| 1.2.6 | [E2E] | 项目层链路 | `tests/e2e/project-shell.spec.ts`：novels → 详情 → 角色 → 编辑保存 → 返回详情看到更新 | LLM_MOCK=1 |

### M1.3 AI 起草改造为候选稿（P0）

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| 1.3.1 | [P] | 候选稿面板组件 | `app/(app)/editor/[novelId]/CandidatePanel.tsx`：滑入式抽屉，显示生成的正文 + 4 个动作按钮（**覆盖正文** / **追加到末尾** / **插入到光标处** / **放弃**） | 4 个动作都不直接 setContent，而是返回操作类型给 hook |
| 1.3.2 | [LIB] | `useChapterEditor.draftChapter` 改造 | `useChapterEditor.ts:231-315`：流式不再 `setContent(generated)`，改为 `setCandidate(generated)`；新增 `acceptCandidate(mode: "replace" \| "append" \| "insert" \| "discard")` | 流式过程中正文不变；接受后才 persist；放弃时不创建版本/不入 critic |
| 1.3.3 | [LIB] | 光标位置追踪 | `EditorClient.tsx`：textarea 加 `onSelect` 记录 `selectionStart`，传给 hook；insert 模式按光标拼接 | 光标位置正确；undo 历史保留 |
| 1.3.4 | [LIB] | 接受候选稿前自动保存当前正文为版本 | 在 `acceptCandidate` 内调用一次 `PATCH /api/chapters/:id` (source=manual) 创建快照，再覆盖 | 用户永远可以回滚到接受前的状态；通过 `MAX_VERSIONS_PER_CHAPTER=50` 自然限流 |
| 1.3.5 | [LIB] | Critic 接入候选稿 | 候选生成完先跑 `runCritic`，结果显示在候选面板顶部；critical/major 不阻断"放弃"，但阻断"覆盖" | 与现状一致的安全语义 |
| 1.3.6 | [E2E] | 候选稿完整链路 | `tests/e2e/editor-candidate.spec.ts`：起草 → 4 种处理动作各一遍 + 失败保护 | LLM_MOCK=1，重写现有 `editor-failure.spec.ts` 的"不覆盖"断言 |

### M1.4 消灭 `window.confirm`

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| 1.4.1 | [P] | 模型配置删除改 ConfirmDialog | `app/(app)/models/page.tsx:110` 替换为 `useConfirm()` | 全仓 grep `window.confirm\|^\s*confirm\(` = 0 |
| 1.4.2 | [P] | 模型配置页用 `<ConfirmProvider>` 包裹 | `app/(app)/layout.tsx` 顶层加全局 ConfirmProvider | 不再每个页面单独包；侧栏退出登录也可以走 confirm |
| 1.4.3 | [LIB] | ConfirmProvider 提供"危险/常规"两套样式 | `components/ui/ConfirmDialog.tsx` 已有 danger 字段，确认主流程都用上 | 删除/丢弃/覆盖统一红色，普通切换灰色 |

### M1.5 编辑器基础写作工具

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| 1.5.1 | [DB] | `ChapterDraft` 增加 `target_words: Int?` 字段 | `prisma/schema.prisma` + migration | 默认 null 时 UI 不显示进度条 |
| 1.5.2 | [API] | `PATCH /api/chapters/:id` 接受 `target_words` | `lib/validation/schemas.ts` 的 `UpdateChapterDraftRequestSchema` 加可选字段 | UT 覆盖空值与边界 |
| 1.5.3 | [P] | `EditorToolbar` 加目标字数 + 进度环 | `app/(app)/editor/[novelId]/EditorToolbar.tsx` | 显示「已写 X / 目标 Y 字 · NN%」；右键/设置图标可改 target |
| 1.5.4 | [P] | "最近保存时间"显式展示 | toolbar 加 `保存于 X 分钟前`，由 `chapters[selectedIndex].updated_at` 计算 | 自动每 30s 刷新文案 |
| 1.5.5 | [P] | "上次 AI 生成"反馈条 | toolbar 下方 chip：显示 `本章最近 AI 起草于 …`、来源（ai/critic 阻断/接受候选） | 数据源：`ChapterVersion.source` 最新一条非 manual |

### M1.6 文档口径修正

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| 1.6.1 | [DOC] | `docs/STATUS.md`：把 P0-1 候选稿、P0-2 详情页等条目随实施进展更新 | 同步真实 verify 数 | 与 `npm run verify` 输出一致 |
| 1.6.2 | [DOC] | `README.md`：补 `/novels/:id` 路由说明、候选稿写作流程截图位 | | |
| 1.6.3 | [DOC] | （留作占位） | | |
| 1.6.4 | [DOC] | （留作占位） | | |

---

## 阶段 2（第 3-4 周）：升级为创作工作台 v1

### M2.1 章节管理页

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| 2.1.1 | [P] | `app/(app)/novels/[id]/chapters/page.tsx` | 卷分组、每行：编号 / 标题 / 字数 / 状态 / 更新时间 / 摘要状态 / 索引状态 / 操作（进入编辑） | 列表 ≥ 50 章不卡顿（虚拟滚动可暂缓） |
| 2.1.2 | [API] | `GET /api/novels/:id/chapters` 列表（区别于现有 POST 创建） | 新建 `app/api/novels/[id]/chapters/route.ts` 的 GET handler，返回 chapter + summary 状态（hasSummary / hasIndex / lastJobStatus） | UT：覆盖空、含失败 job、未索引 |
| 2.1.3 | [LIB] | 章节"刷新摘要 / 索引"状态计算 | `lib/agent/chapterStatus.ts`：根据 `ChapterSummary` 是否存在、`MemoryChunk` 是否有该 chapter_id、`BackgroundJob` 最近状态判定 dirty / fresh / stale | UT：构造 4 种组合 |
| 2.1.4 | [P] | 行内"重新刷新"按钮 | 触发 `POST /api/novels/:id/jobs` 推 `summarize_chapter + index_chapter` | 触发后行变 running 状态 |
| 2.1.5 | [P] | 状态筛选 | tab：全部 / 草稿 / 已完成 / 待刷新 / 失败 | URL query 同步 |

### M2.2 Beat Sheet 接入主写作流程

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| 2.2.1 | [P] | 章节大纲面板 | `app/(app)/editor/[novelId]/BeatSheetPanel.tsx`：右侧抽屉或在 AIPanel 上方新增 section | 显示当前章节 outline.summary + AI 生成的节拍列表 |
| 2.2.2 | [LIB] | `useChapterEditor` 增 `generateBeatSheet / acceptBeats / discardBeats` | 调 `POST /api/novels/:id/chapters/outline`，结果存为 hook state；用户编辑后传给后续 draft | 节拍是 string[]，draft 时作为 hint 注入 |
| 2.2.3 | [API] | `POST /api/novels/:id/chapters/draft` 增加 `beats?: string[]` 入参 | `app/api/novels/[id]/chapters/draft/route.ts` + `lib/llm/prompts/chapter.ts` 的 prompt 模板加 beats 段 | UT：传 beats vs 不传，prompt 内容差异断言 |
| 2.2.4 | [DB] | （可选）`ChapterDraft` 加 `beats: Json?` 字段 | 持久化用户确认的节拍，避免页面刷新丢失 | migration + UT |
| 2.2.5 | [LIB] | 写作流程：节拍 → 候选稿 → 接受 | hook 编排：`generateBeatSheet → acceptBeats(beatsState) → draftChapter(beats) → acceptCandidate` | E2E 串起来 |
| 2.2.6 | [E2E] | `tests/e2e/beat-to-draft.spec.ts` | LLM_MOCK 走完链路 | |

### M2.3 生成历史视图

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| 2.3.1 | [DB] | 新增 `LlmGeneration` 表 | id / user_id / novel_id / chapter_id? / agent (writer\|critic\|state_diff\|outline\|summarizer\|consistency) / status (ok\|failed\|blocked) / latency_ms / token_in / token_out / error / created_at | migration + index(novel_id, created_at) |
| 2.3.2 | [LIB] | `chatCompletionWithRetry` 旁路写一条 generation 记录 | `lib/llm/client.ts`：成功/失败都落库（失败也算一条），不阻塞响应 | UT：mock prisma create 调用次数 |
| 2.3.3 | [API] | `GET /api/novels/:id/generations?limit=50&agent=&status=` | `app/api/novels/[id]/generations/route.ts` | ownership 校验，分页 |
| 2.3.4 | [P] | 生成历史页 | `app/(app)/novels/[id]/history/page.tsx`：表格 + 筛选 + 详情面板（显示原始错误） | 失败可点"在编辑器打开该章节" |
| 2.3.5 | [P] | 编辑器 toolbar 增加"打开生成历史"链接 | | 跳到 history 页并预筛 chapter |

### M2.4 Dashboard

> 顺序上**放在 M2.3 之后**做，否则 Dashboard 没数据。

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| 2.4.1 | [P] | `app/(app)/page.tsx`（替换当前 `app/page.tsx` 重定向） | 卡片：最近编辑小说（top 3）/ 待继续章节（top 5）/ 最近 AI 生成 5 条 / 失败 job 数 / 当月 token 用量 | 空状态友好 |
| 2.4.2 | [API] | `GET /api/dashboard` | 聚合 novels.lastEdited、未完成章节、`LlmGeneration` 最近、`BackgroundJob` failed count、`LlmUsage` 当月 sum | 单接口一次拉完，避免瀑布 |
| 2.4.3 | [P] | "下一步建议"卡片 | 规则化：无 done 章节 → "完成第 1 章"；有 done 但无 summary → "刷新摘要"；多 failed job → "查看失败" | 只放规则，不接 LLM |
| 2.4.4 | [P] | Sidebar "我的书架"上方加"工作台" 入口 | `components/layout/Sidebar.tsx` | active 高亮 |

### M2.5 写作可靠性可见性

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| 2.5.1 | [P] | 章节 toolbar 显示三个状态徽章 | `EditorToolbar.tsx`：摘要 ✓/⏳/✗、索引 ✓/⏳/✗、Story State 待确认 | 数据源：M2.1.3 的 `chapterStatus` |
| 2.5.2 | [P] | `JobsBadge.tsx` 增加点击展开面板 | 显示最近 10 条 job + 重试按钮 | 点重试调下方 API |
| 2.5.3 | [API] | `POST /api/novels/:id/jobs/:jobId/retry` | 重置该 job 的 status 为 pending、attempts -= 1，并触发 drain | UT：覆盖 done/running 拒绝重试 |
| 2.5.4 | [P] | retrieval 失败显式提示 | AIPanel：起草时若 `retrieval.status === "error"` 显示黄色提示"已降级为无检索" | hook 把 retrieval 状态从 SSE 透传上来 |
| 2.5.5 | [API] | draft SSE 增加 `retrieval_status` 事件 | `app/api/novels/[id]/chapters/draft/route.ts` 在第一个 `chapter_delta` 之前 emit | 现有 `readSse` 已支持 |

### M2.6 E2E 进 CI

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| 2.6.1 | [CI] | `.github/workflows/ci.yml` 增加 e2e job | 矩阵：`LLM_MOCK=1`，启服务后跑 playwright | 当前 2 个 + M1/M2 新增 spec 全过 |
| 2.6.2 | [E2E] | 必须纳入：`onboarding.spec.ts`、`editor-failure.spec.ts`、`editor-candidate.spec.ts`（M1.3.6）、`project-shell.spec.ts`（M1.2.6）、`beat-to-draft.spec.ts`（M2.2.6） | | green |
| 2.6.3 | [CI] | 失败上传 trace zip artifact | playwright config + GHA upload-artifact | 失败时可下载 trace |
| 2.6.4 | [DOC] | `README.md` 补 e2e 本地运行说明 | | |

---

## 阶段 3（第 5-8 周）：长篇可靠性 + 版本恢复 + 导出中心

> **实施记录（2026-05-10）**：交付时优先级重排为 M3.2 → M3.3 → M3.1.5/3.1.6（retrieval 可视化）→ M3.4（UI 降噪）→ M3.5（乐观锁）。M3.1 的 dirty 字段链路（3.1.1-3.1.3）按下进入 backlog；M3.3.1（独立 export 页面）暂以 `ExportMenu` 多格式扩展替代。

### M3.1 长篇记忆可靠性

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| 3.1.1 | [DB] | `ChapterDraft` 增加 `summary_dirty / index_dirty: Boolean` 字段 | migration | 默认 false（**backlog**） |
| 3.1.2 | [LIB] | 改稿后只把 dirty 标记为 true，不再立即推 job | `app/api/chapters/[id]/route.ts` PATCH 时若 content 变化置 dirty | UT（**backlog**） |
| 3.1.3 | [P] | 章节管理页"刷新所有 dirty"按钮 | 触发 `POST /api/novels/:id/jobs` 批量入队 | （**backlog**） |
| ~~3.1.4~~ | [API] | ~~`POST /api/novels/:id/jobs/:jobId/retry`（沿用 M2.5.3）~~ | ✅ M2.5 已实现 | |
| ~~3.1.5~~ | [P] | ~~retrieval 结果可视化~~ | ✅ M3.4 完成：`CandidatePanel` 折叠展示 source / score / reason / 截断片段 | |
| ~~3.1.6~~ | [API] | ~~draft SSE 增加 `retrieval_used: { source, score }[]` 事件~~ | ✅ M3.4 完成：实际事件名 `retrieval`，载荷 `{status, error?, memories: [{source, reason, score, text}]}`，文本截断 200 字 | UT 覆盖事件序、字段、截断 |

### M3.2 版本恢复 + diff（✅ 已完成）

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| ~~3.2.1~~ | [API] | ~~`POST /api/chapters/:id/versions/:versionId/restore`~~ | ✅ 事务内：current → manual 版本（同 hash 跳过）→ 覆盖 draft + 自增 version | |
| ~~3.2.2~~ | [P] | ~~`VersionsModal` 增加"恢复此版本"按钮 + 二次确认~~ | ✅ 接入 ConfirmDialog（danger）；恢复后 `applyRestoredChapter` 同步本地状态 | |
| ~~3.2.3~~ | [LIB] | ~~diff 渲染组件~~ | ✅ `components/ui/DiffView.tsx`（基于 `diff` 包 diffLines；超过 8 行的未变段折叠为"省略 N 行"） | 红绿三色 |
| ~~3.2.4~~ | [P] | ~~历史版本点击对比当前~~ | ✅ VersionsModal "与当前对比"按钮 + 行内 diff 视图 + 标题差异提示 | |
| 3.2.5 | [P] | 候选稿 vs 正文 diff | M1.3 的 `CandidatePanel` 增"显示差异"切换 | （**backlog** — DiffView 已就绪可复用） |
| 3.2.6 | [E2E] | `tests/e2e/version-restore.spec.ts` | 编辑 → 保存 → 再编辑 → 恢复 → 内容回滚 | （**backlog**） |

### M3.3 导出 / 发布中心 v1（✅ 独立页面 + 参数已落地）

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| ~~3.3.1~~ | [P] | ~~`app/(app)/novels/[id]/export/page.tsx`~~ | ✅ 独立导出中心页：统计卡 + 4 格式卡 + range / Bible 参数 | 页面已落地 |
| ~~3.3.2~~ | [API] | ~~`GET /api/novels/:id/export?format=md\|txt&range=&include_bible=`~~ | ✅ `range` 支持单章 / 区间 / 逗号组合；`include_bible=true` 追加 Bible 附录 | route/helper UT：非法参数、range 筛选、Bible 附录 |
| ~~3.3.3~~ | [LIB] | ~~docx 导出~~ | ✅ `lib/export/formatNovel.ts` `formatAsDocx`（HEADING_1 + 每行 Paragraph） | UT：ZIP `PK` 头 + 空章节稳健 |
| ~~3.3.4~~ | [LIB] | ~~epub 导出~~ | ✅ `lib/export/formatNovel.ts` `formatAsEpub`（`epub-gen-memory`，HTML 转义 `<p>` 段落） | UT：ZIP 签名 + 空章节稳健 |
| ~~3.3.5~~ | [API] | ~~导出格式扩 docx/epub~~ | ✅ `/api/novels/:id/export?format=docx\|epub`，`formatNovel` 改 async 返回 `string \| ArrayBuffer` | content-type / disposition 测试 |
| ~~3.3.6~~ | [P] | ~~导出前审核状态说明~~ | ✅ 导出中心 notes 说明导出前审核与失败语义 | 页面说明 |
| ~~3.3.7~~ | [P] | ~~编辑器 `ExportMenu` 改为"打开导出中心"链接~~ | ✅ 顶栏导出图标跳 `/novels/:id/export` | lint/typecheck |

### M3.4 UI 统一与降噪（🟡 编辑界面已降噪；状态四态组件统一未审计）

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| 3.4.1 | [LIB] | 页面标题统一组件审计 | `components/ui/PageHeader.tsx` 已存在，所有新页面强制使用 | （**backlog**：阶段 3 未做全仓审计） |
| 3.4.2 | [P] | 统一空 / 错误 / 加载 / 生成中四态 | `components/ui/StatusStates.tsx` 已存在 `LoadingState/EmptyState`，补 `ErrorState/GeneratingState` | （**部分 backlog**：组件存在，统一替换未做） |
| ~~3.4.3~~ | [P] | ~~文案降噪~~ | ✅ M3.5 完成：编辑界面 26 行装饰性 chrome 移除（"云端同步协议已激活" / "Unit XX · Manuscript Draft" / "正在创作" eyebrow / 重复字数 / 闲时 StatusTag）；标题 placeholder 由"在此处镌刻..."改为"章节标题" | |
| 3.4.4 | [P] | 编辑器优化阅读字号 / 行距 | `EditorClient.tsx` textarea 提供 3 档字号切换 | （**backlog**） |

### M3.5 多人协作前置（✅ 已完成，对应实际 commit M3.6）

| # | 类型 | 任务 | 路径 / 产物 | 验收 |
|---|---|---|---|---|
| ~~3.5.1~~ | [DB] | ~~`ChapterDraft` 增 `version_lock: Int @default(0)` 乐观锁字段~~ | ✅ 实际命名为 `version`；migration `20260510070000_add_chapter_version` | |
| ~~3.5.2~~ | [API] | ~~PATCH/POST 章节带 `expected_version_lock`，不匹配 → 409~~ | ✅ 实际字段名 `expected_version`，409 `CHAPTER_VERSION_CONFLICT` 携带最新行；restore 也自增 version | UT：409 路径 + 匹配路径 + 缺省兼容路径 |
| ~~3.5.3~~ | [P] | ~~编辑器收到 409 → 弹 `ConfirmDialog`：覆盖 / 重载 / 合并稍后~~ | ✅ 实现为工具栏下方琥珀色横幅（"加载最新" / "暂不处理"），本地正文不强制覆盖 | |

---

## 阶段交付物总览

| 阶段 | 新增页面 | 新增 / 改造 API | 新增 DB 字段/表 | 新增 E2E |
|---|---|---|---|---|
| 1 | `/novels/:id`、`/novels/:id/characters`、`/novels/:id/world`、`/novels/:id/outline` | bible PATCH partial、`GET /novels/:id` 扩字段、`PATCH /chapters/:id` 加 `target_words` | `ChapterDraft.target_words` | candidate、project-shell |
| 2 | `/novels/:id/chapters`、`/novels/:id/history`、`/`（Dashboard） | `GET /novels/:id/chapters`、`GET /novels/:id/generations`、`GET /dashboard`、`POST /jobs/:jobId/retry`、draft SSE 加 `retrieval_status` | `LlmGeneration` 新表、`ChapterDraft.beats?` | beat-to-draft、ci-e2e |
| 3 | （独立 export 页面 backlog） | `POST /chapters/:id/versions/:vid/restore`、export 扩 docx/epub、draft SSE 加 `retrieval` 事件、PATCH `expected_version` + 409 | `ChapterDraft.version`（乐观锁；dirty 字段 backlog） | （version-restore 仍 backlog） |

---

## 立刻可以开工的"零号任务"

1. **M1.1.1 + M1.1.2 + M1.1.5**：新建 `/novels/:id` 详情页 + layout + sidebar 二级 nav。完成后所有 M1.2 / M2.x 都有承载页。
2. **M1.4.1 + M1.4.2**：消灭 `models/page.tsx` 的 `confirm()`。5 分钟的活，先把零分项清掉。
3. **M1.6.x**：开干前把 `docs/STATUS.md` 的"待处理"刷一遍，避免后面边做边对账。

---

## 不在本 8 周范围内（已论证）

以下事项有价值但**不抢占主线**，挪入 backlog：

- 多人实时协作（3.5 只做前置乐观锁，不做 CRDT/在线协作）
- 分支创作 / 故事树
- 平台直发（晋江 / 番茄 / 起点）
- 计费 / 订阅
- Prompt Cache、多模型 Router
- 角色关系图可视化
- 灵感库 / 素材库（路线图 8 周中提及，本任务单**故意删除**：当前 `MemoryChunk` 还在稳定期，再叠新表会分散精力）
