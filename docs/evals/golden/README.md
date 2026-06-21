# 人工标注黄金集

用于回答一个 `eval:check` 回答不了的问题：**评分器本身准不准？** `eval:check` 只保证自动分相对历史基线不漂移，无法验证「91 分的章节人类是否真觉得好」。这个黄金集通过比对自动分与人工分的相关性，给评分器提供外部裁判。

## 目录结构

```
docs/evals/golden/
  manifest.json                       # 样本索引（引用 bibleFixture + 章节/标注文件）
  samples/
    {id}.chapters.json                # 该滑窗的章节正文
    {id}.labels.json                  # 人工逐维度打分
```

Bible 复用 `scripts/fixtures/eval-novels/{fixture}.json`，不在这里重复存放——`manifest.json` 的 `bibleFixture` 字段指向它。

## 怎么跑

```bash
npm run eval:golden
```

脚本（`scripts/eval-golden-correlation.ts`）会对每个样本跑 `evaluateNovelQuality`，与 `labels.json` 的人工分按维度计算 **Spearman 秩相关**（关注排序一致性）和 **MAE**（平均绝对误差），输出报告并标出自动分与人工分差异最大的样本。

只统计 `status: "annotated"` 的样本；`status: "seed"` 的种子样本（占位示意分）默认跳过，加 `--include-seed` 才纳入。

## 怎么加样本

1. 选一个 `scripts/fixtures/eval-novels/` 下的 Bible（或新增一本），把它的 id 填进 `bibleFixture`。
2. 写 `samples/{id}.chapters.json`：连续若干章正文（建议 3 章一窗，与质量门的滑窗口径一致）。
3. 写 `samples/{id}.labels.json`：逐维度 0-10 打分，`overall` 是综合体感，`status` 填 `annotated`，`annotator` 填标注者标识。**打分口径见 [ANNOTATION_GUIDE.md](ANNOTATION_GUIDE.md)。**
4. 在 `manifest.json` 的 `samples` 数组里登记。

规模建议：起步 20-30 个滑窗，覆盖至少 2-3 个题材。

> 标注现有样本（玄幻/科幻/历史/都市四个题材的正文已就绪，labels 为占位）请直接参照 **[ANNOTATION_GUIDE.md](ANNOTATION_GUIDE.md)** 打分。

## 怎么用结果

这是黄金集的真正价值：改动任何评分维度后（清洗拆分、统计特征、logic 权重…），跑 `eval:golden` 看相关性升降——**相关性升 = 改对了，降 = 改错了**。它让评分改动有客观裁判，而不是只看基线没漂移。

低于阈值（默认 Spearman 0.5）的维度会在报告里标出，提示该维度的评分逻辑需要调整。
