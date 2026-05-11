# Phase P0-8: Output Moderation 段落级 — Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Successor of:** P0-3 / P0-4 / P0-5 / P0-6 / P0-7 / P0-9 / P0-10 / P0-11(均已 ship)
**Tracked in:** `docs/PROJECT_REVIEW_REPORT.md` §"Day 4-5 batch — P0-8" / `docs/HEALTH.md`

---

## 1. Phase Boundary

把章节 SSE 起草的输出审核从「全量延迟」改为「段落级 + 本地关键词预筛先行」。当前实现是 `lib/agent/draftSession.ts` + `app/api/novels/[id]/chapters/draft/route.ts:200-223`:LLM 把所有 delta 流到客户端,流结束后才整体调一次 `moderateContent`。违规内容此时已在用户屏幕上、buffer 已 flush 到 DB,只能事后转 `failed`——审核形同虚设。

**包含:**

- 新增段落切分器:消费 delta 流,按句末标点/换行/字数边界产出 segment
- 在 segment 上做**本地关键词检查**(同步、零 cost、零延迟),命中即时中断 LLM stream + 通知客户端
- 中断时正确清理:DraftSession → `failed` + 错误码 `MODERATION_BLOCKED_INLINE`,fetch AbortController 真正掐掉 LLM HTTP 连接(避免后台继续 yield 烧钱)
- 保留**末段全文 LLM moderation**作为关键词漏网兜底(已存在,本期不动)
- 客户端 EditorClient 的 error 渠道复用(MODERATION_BLOCKED 已有 UI),但要确认已渲染的 partial delta 在错误后被丢弃,不被 accept 成正文

**不包含(→ 后续 phase 或 deferred):**

- 段落级 **LLM** moderation(每段一次 LLM 调用,cost 翻数倍;基线关键词漏检率收集后再评估)
- BLOCKED_KEYWORDS 清单扩充(当前仅 5 条;扩词表是策略问题,由产品决定,与本期 architecture 正交)
- Bible PATCH / Onboarding 文本的段落级审核(那些接口是一次性提交,没有流,P0-4 已用整体审核覆盖)
- Input moderation 时序(P0-10 已 ship,不再动)
- 违规内容的「审核日志/人工复核队列」(没有 admin review 后台,做了也没人看)

---

## 2. Implementation Decisions

### 段落切分策略

- **D-01:** 切分边界 = `\n` ∪ `。` ∪ `?` ∪ `!` ∪ `?` ∪ `!`,任一命中即 flush 一个 segment。
  额外硬上限:segment 长度达到 **200 字**强制 flush,避免 LLM 产出无标点长串时检查永远不触发。
  *Why 200:* 关键词最长 ~6 字,200 字段尾 + 200 字段头重叠扫描已经覆盖跨段拼接;再大会拉长「违规内容已发」的窗口。

- **D-02:** Segmenter 保留 **滑动窗口**:每次 flush 时,把当前 segment 的**尾部 16 字**与下一段头部拼起来再做一次检查,堵住关键词被段边界劈开的漏洞。
  16 = max keyword length × 2 + buffer。当前最长关键词 `诈骗教程`(4 字),16 是充裕的安全余量。

- **D-03:** delta 是否先发给客户端、再 moderate,还是反之?
  **先 moderate 后发**。理由:本地关键词检查是 O(segment.length) 同步,微秒级,延迟可忽略;反之则违规内容仍会先到客户端屏幕,审核失效。
  代价:打字机效果从 per-delta 变成 per-segment(标点处略卡顿),UX 上可接受。

### 中断协议

- **D-04:** Moderation 命中时,`onDelta` 抛 `ModerationBlockError(code, reason)`。

  - `streamChatCompletion` 在 client.ts:287 await onDelta,抛错会冒泡到调用方的 try/catch。
  - **关键**:必须同步触发 `AbortController.abort()` 让正在 read 的 fetch response 真的关闭,否则 LLM 服务器(DeepSeek)的 HTTP 流仍会持续 yield token,white-burn cost。
  - client.ts:220 的 timeout AbortController 当前是内部的,不暴露给调用方。需要扩展 `ChatCompletionOptions`:可选传入 `abortSignal: AbortSignal`,signal.aborted 后内部 controller 也 abort。

- **D-05:** Draft route 的 SSE handler(`route.ts:159-253`)外层 try/catch:

  - catch `ModerationBlockError` 时 → `await failDraftSession(sessionId, { buffer, code: "MODERATION_BLOCKED_INLINE", message: reason })` + `send(sseEncode("error", {...}))` + return(不再触发末段全文 moderation,因为已经命中且 fail 了)。
  - 其他 error(timeout/network)走现有路径,保持兼容。
  - **避免双重 send error**:`send` 之后立刻 `return`,跳过现有的"output moderation"块。

- **D-06:** 客户端 EditorClient 接到 `MODERATION_BLOCKED_INLINE` error 后:
  - **不**保留已收到的 partial buffer(候选稿 store 清空)。
  - 显示与现有 `MODERATION_BLOCKED` 相同的 UI(复用 critic panel / error banner)。
  - DraftSession 已在服务端被标 `failed`,客户端 `/resume` 路径在 P0-5 改造后会看到 `failed` 状态,正常流程衔接,不需要专门做手动 dismiss。

### 抽象边界

- **D-07:** Segmenter 与 ModerationGuard 拆成两个独立 class,各自单测。

  ```
  StreamSegmenter
    - feed(delta: string): string[]   // 返回这次喂入产生的完整 segments(0 或多个)
    - flushTail(): string | null      // 收尾时强制吐出残余 buffer
  
  StreamModerationGuard
    - check(segment: string): { allowed: boolean; reason?: string; code?: string }
    - 内部维护 16 字滑动尾窗,把上次尾 + 当前段一并扫描
  ```

  *Why 不合并:* segment 切分纯字符串处理,无审核逻辑;guard 用关键词列表查询。两层分开 → 后续加 LLM 段审/正则规则不需要动 segmenter。

- **D-08:** 关键词列表来源**复用** `lib/moderation/moderate.ts` 的 `BLOCKED_KEYWORDS`,不复制。
  把 `localKeywordCheck` 函数(currently module-private)**导出**或拆成 `getBlockedKeywords(): RegExp[]` + `matchBlockedKeywords(text): MatchResult` 两个 API,供 guard 复用。
  这样将来扩词表只动 moderate.ts 一处。

### Failure-mode 一致性

- **D-09:** 本地关键词检查是确定性的,**不**走 `MODERATION_FAILURE_MODE` 的 allow/block/review 三态——只有 LLM moderation 才有"服务异常"概念。本地命中即拒绝。
  这与现有 `localKeywordCheck` 行为一致(`moderate.ts:60` 的注释「Local keywords are ALWAYS a hard block, regardless of failure mode」),保持语义对齐。

### 测试边界

- **D-10:** Unit 测试覆盖三个层:

  - `StreamSegmenter`:边界字符、200 字硬截、空 delta、连续标点、跨 delta 拆字符。
  - `StreamModerationGuard`:命中、不命中、跨段(滑窗)、关键词大小写无关。
  - `extractBlockedKeywords` / `matchBlockedKeywords`:确保从 moderate.ts 拆出的 helper 行为与 `localKeywordCheck` 一致(导入原函数对比输出,作为回归基线)。

- **D-11:** 集成测试用 **LlmMock**:`lib/llm/client.ts` 已有 `isLlmMockEnabled()` 路径 + `mockChatCompletion`,但 streaming 版本需要 mock streaming delta。
  最低成本:直接对 `streamChatCompletionWithRetry` 做 vi.mock,人工触发 `onDelta("xx 制作炸弹 xx")`,断言 → `failDraftSession` 被调用 + SSE 收到 error event。
  路由级 e2e(真起 server)不在本期范围,留给后续 Playwright spec 单独补。

### Claude's Discretion

以下交给 planner / executor 决定,无需再问用户:

- Segmenter / Guard 放哪个目录:`lib/agent/`(与 `draftSession.ts` 同栏)还是 `lib/moderation/`(语义)。推荐 `lib/moderation/streamGuard.ts` + `lib/agent/streamSegmenter.ts`——切分是 stream 通用工具,审核是 moderation 一族。
- ModerationBlockError 的位置:`lib/moderation/errors.ts`(新文件,export 自定义 Error 类)。
- `abortSignal` 参数名:与 fetch / AbortController 生态一致用 `signal`。
- `sseEncode("error", ...)` payload:沿用现有 `{ code, message, retryable: false, sessionId }` 形状,只是 code 换成 `MODERATION_BLOCKED_INLINE`。
- ErrorCode 命名:服务器端 `MODERATION_BLOCKED_INLINE`(区别于现有 `MODERATION_BLOCKED` 全文审核命中,便于日志归类);客户端可一并归到 `MODERATION_BLOCKED` 的 banner 文案(用户视角不区分)。
- 是否做 ENV `MODERATION_INLINE_ENABLED`:不做。功能默认开,关掉要改代码,避免长期遗留双轨。

---

## 3. Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 现有审核机制
- `lib/moderation/moderate.ts` — `moderateContent` / `localKeywordCheck`(导出对象) / `BLOCKED_KEYWORDS` / `stringifyForModeration`
- `app/api/novels/[id]/chapters/draft/route.ts` — 当前的 input/output moderation 调用点(L86-98 input;L200-223 output)
- `app/api/chapters/[id]/route.ts:79-93` — 章节 PATCH 的 manual save / publishing moderation,作为「整体审核」的另一个调用范例

### LLM 流式基础设施
- `lib/llm/client.ts:217-302` — `streamChatCompletion` 内部循环、AbortController 用法、`onDelta` await 语义
- `lib/llm/client.ts:331-340` — `streamChatCompletionWithRetry` 重试条件(首 delta 后拒绝重试,这条规则需保留——moderation 命中后重试无意义)

### Draft session 生命周期
- `lib/agent/draftSession.ts` — `createDraftSession` / `createDraftBufferFlusher` / `completeDraftSession` / `failDraftSession` / `getResumableDraftSession`(后者已在 P0-5 加 TTL 懒扫,本期不动)
- `prisma/schema.prisma:277-297` — DraftSession 表,status/error_code/error_message 已就位,无需 migration

### 客户端 SSE 消费
- `app/(app)/editor/[novelId]/useChapterEditor.ts` — `draftChapter` 函数(SSE 解析、chapter_delta / done / error 事件处理、buffer accumulation)
- 现有 `MODERATION_BLOCKED` 客户端展示路径(grep `MODERATION_BLOCKED` in `app/(app)/editor/[novelId]/`)

### 测试参考
- `lib/agent/draftSession.test.ts` — 本期 segmenter/guard 的测试结构、mock 风格、`vi.useFakeTimers()` 用法
- `lib/moderation/moderate.test.ts` — `moderateContent` 8 个测试,本地关键词路径已覆盖,可作为 guard 行为对照
- `app/api/novels/[id]/chapters/draft/resume/route.test.ts` — 路由级 SSE 不易测;本期路由端集成可以选择「mock streamChatCompletionWithRetry 注入 delta」这一更轻的方案

---

## 4. Existing Code Insights

### Reusable Assets
- `BLOCKED_KEYWORDS`(`lib/moderation/moderate.ts:36`)— 5 条正则,直接复用。
- `stringifyForModeration` — 末段全文审核仍用它,本期不动。
- `failDraftSession` — 命中后写 DB,签名已经够用(buffer + code + message)。
- `sseEncode` / `sseHeartbeat` — error 事件编码沿用。

### Established Patterns
- "本地关键词永远 hard block,无视 failure mode" — `moderate.ts:58-60`,本期段落级检查同此原则。
- 错误码命名:UPPER_SNAKE_CASE,前缀按业务域(`MODERATION_*` / `CHAPTER_*` / `LLM_*`),本期新增 `MODERATION_BLOCKED_INLINE`。
- 决策注释:`// P0-N: ...` 行间引用 PR/phase 编号(参见 P0-3 ~ P0-7 已 ship 的 commit 注释风格)。
- 防御性 try/catch + 单行 console.warn 兜底:见 `draftSession.ts:96-105`,本期 guard 内的 DB 写也沿用。

### Integration Points
- **`lib/llm/client.ts:ChatCompletionOptions`**:需要扩展加 `signal?: AbortSignal`。这是新增字段,默认 undefined → 不影响现有 30+ 调用点。
- **`route.ts:177-199`(`streamChatCompletionWithRetry` 调用)**:传入新建的 `AbortController.signal`,onDelta 内部 throw 时同步调 `controller.abort()`。注意 `streamChatCompletionWithRetry` 的重试逻辑:若 emitted 后失败,**不重试**(client.ts:340),与本期需求一致(moderation 命中是 emitted 后的 throw)。
- **`useChapterEditor.ts:draftChapter` 的 error 分支**:已经支持 `error.code`,新增 `MODERATION_BLOCKED_INLINE` 后客户端**不需要专门 case**,沿用 `MODERATION_BLOCKED` 文案分支(在该函数内 grep 一下当前 banner 渲染条件,确认 code 前缀匹配而非精确匹配)。

---

## 5. Specific Ideas

- **P0-8 的真正价值在「关键词命中即停」**:LLM 还在 yield,我们能 abort fetch → 直接节省真金白银的 token 成本(违规章节越长省得越多)。这是 fix 的核心收益,在 PR 描述里要明确写出来。
- **滑动窗口 16 字**这个细节请保留(D-02)。如果初版省掉它,基本能用本地构造 case 直接打穿(如 `制作` + 立即换行 + `炸弹`),回归测试一加就暴露。
- **关键词列表外置**:虽然 D-08 说复用现有 5 条,但建议把 `BLOCKED_KEYWORDS` 数组从代码搬到 `lib/moderation/keywords.ts`(只挪位置,不改内容),为后续扩词表(可能改成 env 或 DB-driven)铺路。这条非必须,planner 可斟酌。
- **monitoring 钩子**:命中事件最好通过 `lib/metrics/prometheus.ts` 加一个 counter(`moderation_inline_blocks_total{code}`),便于线上观测真实命中频率。Phase B 的 `/api/metrics` 已就绪,加一个 counter 是 5 行代码。
- **TS strict + zero-any 红线**:全仓没有 any/ts-ignore(HEALTH §四),本期所有新增类型必须显式标注,包括 segmenter 的 emit 数组、guard 的返回 union。

---

## 6. Deferred Ideas

- **段落级 LLM moderation(方案 A)** — 每段一次 LLM 审核,catch 关键词漏网。代价 = 长章节 cost × N 段;收益 = 兜底关键词外的违规模式。决定要不要做,先看本期上线后**末段全文审核**的命中率——如果末段总是命中说明关键词不够,扩词表(D-08)优于加 LLM 段审。
- **BLOCKED_KEYWORDS 扩词** — 业务/法务决定,不是工程决定。本期工程上把列表外置即可,内容增删走另一个 PR。
- **审核日志/人工复核** — 没有后台没人看,做了 sunk cost。如果将来上多人版本/合规要求才做。
- **Bible 字段的注入污染防御** — P0-4 已经做了整体 moderation 拦"违规内容",但**结构化注入**(用户在 `personality` 填 "Ignore previous instructions")仍然会被拼进 prompt。这是 Phase B 之外的独立威胁,**不在本期 P0-8 范围**,需要单独的 input sanitization phase。
- **客户端段间动画衔接** — per-delta → per-segment 后打字机会变成「短句一次跳出」,如果体感太突兀可加 30ms 的 typing transition。先上线观察,UX polish 单独做。
- **`MODERATION_INLINE_ENABLED` 灰度开关** — D-09 已决定不做。若上线后想紧急关掉,回滚 commit 即可。

---

## 7. Verification Criteria(Phase 验收条件)

完成本期需同时满足:

1. **关键词命中即停**:构造 case `xxxxx 制作炸弹 yyyyyy`(任一关键词),Mock LLM 注入 delta 后:
   - 客户端 SSE 接到 `error` event,code = `MODERATION_BLOCKED_INLINE`
   - DraftSession 表 status = `failed`,error_code 同上
   - `AbortController.abort()` 被调用(可用 spy 验证)
   - 关键词之**后**的 delta 不再被客户端接收

2. **跨段关键词命中**:Mock 注入 `["x 制", "作炸", "弹 y"]` 三个 delta,segmenter 滑窗能拼出 `制作炸弹` 并触发 block。

3. **干净内容流过**:Mock 注入正常内容 delta 序列,segment 全过 → 流到 `done`,DraftSession `completed`,buffer 完整。

4. **段尾残余 flush**:LLM 停在 `xxx` 无标点结尾时,`flushTail()` 仍能产出最后一段并审核。

5. **测试基线**:vitest 全绿,新增 ≥10 个 unit + ≥2 个路由集成,覆盖率不下降。

6. **诊断可见**(可选,建议做):Prometheus `moderation_inline_blocks_total{code="MODERATION_BLOCKED_INLINE"}` 计数器随命中递增。

---

## 8. Task Breakdown(粗粒度,executor 可细化)

| # | Task | 类别 | 复杂度 |
|---|---|---|---|
| 1 | 把 `lib/moderation/moderate.ts` 的 `BLOCKED_KEYWORDS` + `localKeywordCheck` 提取为可复用 API(`matchBlockedKeywords`),保留原签名向后兼容 | refactor | S |
| 2 | 新建 `lib/agent/streamSegmenter.ts` + 单测(覆盖 D-01/D-02 所有边界) | feat | S |
| 3 | 新建 `lib/moderation/streamGuard.ts` + 单测(用 #1 的 API,实现 D-07 接口) | feat | S |
| 4 | 新建 `lib/moderation/errors.ts` `ModerationBlockError` class | feat | XS |
| 5 | 扩展 `lib/llm/client.ts` `ChatCompletionOptions` 加 `signal?: AbortSignal`,内部 controller 把外部 signal 串联(`addEventListener("abort", ...)`)+ 单测 | feat | S |
| 6 | 重构 `app/api/novels/[id]/chapters/draft/route.ts` 的 SSE handler:接入 segmenter/guard、onDelta throw 时 abort、catch 分支识别 ModerationBlockError、跳过末段全文审核 | feat | M |
| 7 | route 级集成测试:mock `streamChatCompletionWithRetry` 注入合法/违规 delta,断言完整行为 | test | M |
| 8 | (可选)`lib/metrics/prometheus.ts` 加 `moderation_inline_blocks_total` counter + 单测 | obs | XS |
| 9 | 更新 `docs/HEALTH.md`(最近更新 + 测试数 + 「P0-8 完成」勾选)+ docs-check 重跑 | docs | XS |

预估总工时:**M 复杂度,单 phase 一次执行约 90-150 分钟**(含测试)。

---

*Phase: P0-8-segment-moderation*
*Context gathered: 2026-05-12*
*Parent reference: `docs/PROJECT_REVIEW_REPORT.md` line 419 / `docs/HEALTH.md` §三*
