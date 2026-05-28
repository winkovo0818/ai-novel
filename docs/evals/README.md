# AI 质量评估

这个目录保存 `npm run eval:ai` 生成的评估报告。评估脚本读取 `scripts/fixtures/eval-novels/` 与 `scripts/fixtures/eval-chapters/`，在 `LLM_MOCK=1` 下也必须能跑通。

## Fixture 格式

`eval-novels/*.json` 描述一部作品的稳定输入：

- `id`：稳定标识，被章节 fixture 引用。
- `profile`、`logline`、`answers`：Bible 生成输入。
- `bible`：已校验的 `BibleDraft`，用于 Writer/Critic/StateDiff 回归。

`eval-chapters/*.json` 描述一个章节评估样例：

- `novel_fixture`：引用的作品 fixture id。
- `chapter_index`、`chapter_title`、`existing_content`：Writer 输入。
- `previous_chapters`：前文上下文，可带 `summary`。
- `retrieved_memories`：模拟 RAG 输入。
- `expected`：轻量断言，例如必须出现的文本、预期 critic issue 类型、state diff 最少事件数。

## 运行

```bash
LLM_MOCK=1 npm run eval:ai
```

脚本会生成：

- `docs/evals/latest.json`
- `docs/evals/latest.md`
- `docs/evals/YYYY-MM-DD.md`

后续新增真实模型评估时，不要覆盖 fixture 的语义；新增样例优先补 fixture，再根据报告调 prompt。

## 连续小说质量测评

结构回归评估只能证明 Writer / Critic / StateDiff 管线没有断，不能充分回答“连续不连续、逻辑是否顺、是否有 AI 味”。需要做读者体验层面的测评时运行：

```bash
npm run eval:novel-quality
```

脚本会优先在配置了真实 `DEEPSEEK_API_KEY` 且未开启 `LLM_MOCK` 时连续生成 4 章；否则使用固定样本验证评测管线。输出：

- `docs/evals/novel-quality-latest.json`
- `docs/evals/novel-quality-latest.md`

评分维度：

- 连续性：相邻章节是否复用前文关键人物、地点、线索，是否与大纲对齐。
- 因果逻辑：是否有目标、行动、结果和因果/转折提示，是否存在无动机跳转。
- 人物一致性：主角目标、动机、禁忌行为和核心角色覆盖。
- 剧情推进：每章是否产生可记录状态变化，而不是原地氛围描写。
- 世界规则：是否触及 Bible 世界规则，并避免硬冲突。
- AI 味控制：模板化结尾、高频套话、段落均匀度、短句比例。
- 正文可读性：平均句长、对白、具体物象、摘要腔词汇。

注意：如果报告中的模式是 `mock_pipeline` 或 `fixture_fallback`，结论只代表评测管线和样本质量，不能代表真实模型最终效果。要评估商业可读性，至少应使用真实模型连续生成 5 章以上，每章 2000 字以上，并保留人工盲评。

## 多题材 / 多模型 / 修订对比矩阵

当单一题材样本已经稳定后，使用矩阵测评观察质量是否能跨题材、跨模型、跨修订轮次稳定：

```bash
npm run eval:novel-quality:matrix
```

默认不会调用真实 LLM，而是使用 `fixture_fallback` 快速验证矩阵管线，覆盖：

- `xuanhuan-seed`
- `urban-suspense`
- `scifi-hard`
- `history-conservative`

输出：

- `docs/evals/novel-quality-matrix-latest.json`
- `docs/evals/novel-quality-matrix-latest.md`

常用环境变量：

- `EVAL_NOVEL_MATRIX_FIXTURES=all` 或逗号列表，例如 `xuanhuan-seed,urban-suspense`
- `EVAL_NOVEL_MATRIX_MODELS=mimo-v2.5-pro,deepseek-chat`
- `EVAL_NOVEL_MATRIX_CHAPTERS=3`
- `EVAL_NOVEL_MATRIX_REVISION_ROUNDS=1`
- `EVAL_NOVEL_MATRIX_REAL=1` 才会调用真实 LLM

示例：

```bash
EVAL_NOVEL_MATRIX_REAL=1 \
EVAL_NOVEL_MATRIX_FIXTURES=xuanhuan-seed,urban-suspense \
EVAL_NOVEL_MATRIX_MODELS=mimo-v2.5-pro \
EVAL_NOVEL_MATRIX_CHAPTERS=3 \
EVAL_NOVEL_MATRIX_REVISION_ROUNDS=1 \
npm run eval:novel-quality:matrix
```

报告中的“草稿”是 Writer 直接生成结果，“修订后”是经过配置轮数 Critic/Reviser 或本地清洗后的结果；矩阵报告会显示平均分、变化幅度、最好/最弱组合和 AI 痕迹 Top。

## Mock 边界场景

`LLM_MOCK=1` 时可通过 `LLM_MOCK_SCENARIO` 复现异常路径，便于单测或 E2E 固定故障形态：

- `normal`：默认稳定输出。
- `stream-empty`：流式调用成功但不产出任何 delta。
- `stream-timeout-before-delta`：首个 delta 前抛出超时错误，可验证无内容重试路径。
- `stream-timeout-after-delta`：产出一个 delta 后中断，可验证不中途拼接重试。
- `stream-moderation-block`：章节流里包含本地审核关键词，可验证 inline moderation 阻断。
- `stream-slow`：按小块慢速吐 token，可配合 `LLM_MOCK_TOKEN_DELAY_MS` 调整每块延迟。
- `chat-moderation-block`：非流式 moderation 调用返回 `allowed:false`。
- `retrieval-error`：RAG 检索返回 `status:error`，生成链路应降级继续。

示例：

```bash
LLM_MOCK=1 LLM_MOCK_SCENARIO=stream-moderation-block npm run test:e2e -- tests/e2e/editor-candidate.spec.ts
```
